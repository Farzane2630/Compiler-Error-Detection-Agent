import { ASTNode, CompilerError, ErrorPhase, SymbolEntry, TargetLanguage } from './types';
import { findClosestMatch, levenshteinDistance } from './levenshtein';
import { detectInputType } from './inputTypeChecker';

interface InternalSymbol {
  name: string;
  type: string;
  lineDeclared: number;
  isInitialized: boolean;
  scope: string;
  isConst?: boolean;
  fromInput?: boolean;
}

class Scope {
  public symbols: Map<string, InternalSymbol> = new Map();
  constructor(public parent: Scope | null = null, public name: string = 'global') {}

  insert(sym: InternalSymbol): boolean {
    if (this.symbols.has(sym.name)) return false;
    this.symbols.set(sym.name, sym);
    return true;
  }

  lookup(name: string): InternalSymbol | null {
    if (this.symbols.has(name)) return this.symbols.get(name)!;
    if (this.parent) return this.parent.lookup(name);
    return null;
  }

  allKnownNames(): string[] {
    const set = new Set<string>();
    let curr: Scope | null = this;
    while (curr) {
      for (const name of curr.symbols.keys()) set.add(name);
      curr = curr.parent;
    }
    return Array.from(set);
  }
}

export class SemanticAnalyzer {
  private language: TargetLanguage;
  private currentScope = new Scope(null, 'global');
  private allScopes: Scope[] = [this.currentScope];
  public errors: CompilerError[] = [];
  public collectedSymbols: SymbolEntry[] = [];
  private hasIostream = false;

  constructor(language: TargetLanguage = 'python') {
    this.language = language;
  }

  private enterScope(name = 'block'): Scope {
    const s = new Scope(this.currentScope, name);
    this.currentScope = s;
    this.allScopes.push(s);
    return s;
  }

  private exitScope() {
    if (this.currentScope.parent) {
      this.currentScope = this.currentScope.parent;
    }
  }

  public analyze(ast: ASTNode): { symbols: SymbolEntry[]; errors: CompilerError[] } {
    if (ast && ast.statements && Array.isArray(ast.statements)) {
      for (const stmt of ast.statements) {
        this.visitStatement(stmt);
      }
    }

    for (const sc of this.allScopes) {
      for (const sym of sc.symbols.values()) {
        this.collectedSymbols.push({
          name: sym.name,
          type: sym.type,
          lineDeclared: sym.lineDeclared,
          isInitialized: sym.isInitialized,
          scope: sym.scope
        });
      }
    }

    return { symbols: this.collectedSymbols, errors: this.errors };
  }

  private visitStatement(node: ASTNode) {
    if (!node) return;

    switch (node.kind) {
      case 'Preprocessor':
        if (typeof node.directive === 'string' && node.directive.includes('<iostream>')) {
          this.hasIostream = true;
        }
        break;
      case 'UsingNamespace':
        break;
      case 'FunctionDef':
        this.visitFunctionDef(node);
        break;
      case 'VarDecl':
        this.visitVarDecl(node);
        break;
      case 'Assignment':
        this.visitAssignment(node);
        break;
      case 'IfStatement':
        this.visitIf(node);
        break;
      case 'WhileStatement':
        this.visitWhile(node);
        break;
      case 'ForStatement':
        this.visitFor(node);
        break;
      case 'PrintStatement':
        if (this.language === 'cpp' && node.usedIostream && !this.hasIostream) {
          this.errors.push({
            id: `sem-cpp-iostream-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: "'cout' used without '#include <iostream>'",
            line: node.line,
            column: node.column,
            offendingText: 'cout',
            ruleViolated: 'C++ Header Resolution Rule: Standard I/O streams require <iostream>',
            explanation: 'Identifier cout is declared in the <iostream> header.',
            suggestedFix: 'Add #include <iostream> at top of file'
          });
        }
        if (Array.isArray(node.expressions)) {
          for (const e of node.expressions) this.checkExpression(e);
        } else if (node.expression) {
          this.checkExpression(node.expression);
        }
        break;
      case 'InputStatement':
        this.visitCppCin(node);
        break;
      case 'ReturnStatement':
        if (node.expression) this.checkExpression(node.expression);
        break;
      case 'ExprStatement':
        this.checkExpression(node.expression);
        break;
      case 'Block':
        if (this.language === 'cpp') {
          this.enterScope('block');
          if (Array.isArray(node.statements)) {
            for (const s of node.statements) this.visitStatement(s);
          }
          this.exitScope();
        } else {
          // Python blocks (if/while/for) share enclosing function/module scope
          if (Array.isArray(node.statements)) {
            for (const s of node.statements) this.visitStatement(s);
          }
        }
        break;
    }
  }

  private visitFunctionDef(node: ASTNode) {
    this.currentScope.insert({
      name: node.name,
      type: `fn -> ${node.returnType || 'None'}`,
      lineDeclared: node.line,
      isInitialized: true,
      scope: this.currentScope.name
    });

    this.enterScope(node.name);
    if (Array.isArray(node.params)) {
      for (const p of node.params) {
        this.currentScope.insert({
          name: p.name,
          type: p.type === 'any' ? 'int' : p.type,
          lineDeclared: node.line,
          isInitialized: true,
          scope: node.name
        });
      }
    }
    if (node.body && Array.isArray(node.body.statements)) {
      for (const s of node.body.statements) {
        this.visitStatement(s);
      }
    }
    this.exitScope();
  }

  private visitFor(node: ASTNode) {
    if (this.language === 'python') {
      const iterType = this.checkExpression(node.iterable);
      if (!['range', 'str', 'list', 'iterable'].includes(iterType)) {
        this.errors.push({
          id: `sem-py-for-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `TypeError: '${iterType}' object is not iterable in for loop`,
          line: node.line,
          column: node.column,
          ruleViolated: 'Python Iteration Rule: for target must iterate over range/str/sequence',
          explanation: `Cannot iterate over scalar type '${iterType}'.`,
          suggestedFix: 'Use range(...) or a string/iterable sequence'
        });
      }
      this.currentScope.insert({
        name: node.varName,
        type: iterType === 'str' ? 'str' : 'int',
        lineDeclared: node.line,
        isInitialized: true,
        scope: this.currentScope.name
      });
      this.visitStatement(node.body);
    } else {
      this.enterScope('for');
      if (node.init) this.visitStatement(node.init);
      if (node.condition) this.checkExpression(node.condition);
      if (node.step) {
        if (node.step.kind === 'Assignment') this.visitAssignment(node.step);
        else this.checkExpression(node.step);
      }
      if (node.body && Array.isArray(node.body.statements)) {
        for (const s of node.body.statements) this.visitStatement(s);
      } else if (node.body) {
        this.visitStatement(node.body);
      }
      this.exitScope();
    }
  }

  private visitCppCin(node: ASTNode) {
    if (!this.hasIostream) {
      this.errors.push({
        id: `sem-cpp-cin-iostream-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: "'cin' used without '#include <iostream>'",
        line: node.line,
        column: node.column,
        offendingText: 'cin',
        ruleViolated: 'C++ Header Resolution Rule: Standard input stream requires <iostream>',
        explanation: 'cin is declared in <iostream>.',
        suggestedFix: 'Add #include <iostream> at top of file'
      });
    }

    if (Array.isArray(node.targets)) {
      for (const target of node.targets) {
        const sym = this.currentScope.lookup(target.name);
        if (!sym) {
          const known = this.currentScope.allKnownNames().filter((n) => n !== target.name);
          const closest = findClosestMatch(target.name, known, 2);
          this.errors.push({
            id: `sem-cpp-cin-undec-${target.line}-${target.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Undeclared input target '${target.name}' in 'cin >> ${target.name}'`,
            line: target.line,
            column: target.column,
            offendingText: target.name,
            ruleViolated: 'C++ Scope Rule: Variable must be declared before reading input with cin',
            explanation: `Cannot store user input into undeclared variable '${target.name}'.`,
            suggestedFix: closest
              ? `Did you mean '${closest}'?`
              : `Declare variable before cin (e.g. 'int ${target.name};' or 'string ${target.name};')`,
            closestMatch: closest || undefined
          });
        } else {
          if (sym.isConst) {
            this.errors.push({
              id: `sem-cpp-cin-const-${target.line}-${target.column}`,
              phase: ErrorPhase.SEMANTIC,
              message: `Cannot read 'cin >> ${target.name}' into const variable`,
              line: target.line,
              column: target.column,
              offendingText: target.name,
              ruleViolated: 'C++ Const Rule: const variables cannot be modified by input stream',
              explanation: `'${target.name}' was declared const.`,
              suggestedFix: `Remove 'const' from declaration of '${target.name}'`
            });
          }
          sym.isInitialized = true;
        }
      }
    }
  }

  private visitVarDecl(node: ASTNode) {
    const name = node.name;

    if (this.language === 'cpp' && this.currentScope.symbols.has(name)) {
      const prev = this.currentScope.symbols.get(name)!;
      this.errors.push({
        id: `sem-dup-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `Duplicate declaration of C++ variable '${name}' (already declared at line ${prev.lineDeclared})`,
        line: node.line,
        column: node.column,
        offendingText: name,
        ruleViolated: 'C++ Scope Rule: Redefinition of variable in the same scope',
        explanation: `Variable '${name}' is already declared in scope '${this.currentScope.name}'.`,
        suggestedFix: `Remove duplicate type keyword (assign '${name} = ...;') or rename variable`
      });
      return;
    }

    let inferredType = node.varType || (this.language === 'python' ? 'str' : 'int');
    let isInit = false;
    let fromInput = false;

    if (node.initializer) {
      const initType = this.checkExpression(node.initializer);
      isInit = true;
      fromInput = node.initializer.kind === 'CallExpr' && node.initializer.callee === 'input';

      if (node.varType) {
        if (!this.areTypesCompatible(node.varType, initType)) {
          const isInputStr =
            this.language === 'python' &&
            fromInput &&
            ['int', 'float', 'bool'].includes(node.varType);

          this.errors.push({
            id: `sem-type-decl-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: isInputStr
              ? `Input Type Error: input() returns 'str', cannot assign directly to '${name}: ${node.varType}'`
              : `Type Mismatch: Cannot assign '${initType}' to '${name}' of type '${node.varType}'`,
            line: node.line,
            column: node.column,
            offendingText: `${name}: ${node.varType}`,
            ruleViolated: isInputStr
              ? 'Python Input Type Rule: input() always produces str; cast explicitly'
              : 'Semantic Type Rule: Initializer type must match declared variable type',
            explanation: isInputStr
              ? `Python's input() always returns a string (str), not ${node.varType}.`
              : `Value of type '${initType}' is incompatible with declared type '${node.varType}'.`,
            suggestedFix: isInputStr
              ? `Wrap input() with ${node.varType}(input(...))`
              : `Change type annotation to '${initType}' or provide a ${node.varType} value`
          });
        }
      } else {
        inferredType = initType;
      }
    }

    const existing = this.currentScope.symbols.get(name);
    if (existing && this.language === 'python') {
      existing.type = node.varType || inferredType;
      existing.isInitialized = existing.isInitialized || isInit;
      existing.fromInput = fromInput;
      return;
    }

    this.currentScope.insert({
      name,
      type: inferredType,
      lineDeclared: node.line,
      isInitialized: isInit,
      scope: this.currentScope.name,
      isConst: Boolean(node.isConst),
      fromInput
    });
  }

  private visitAssignment(node: ASTNode) {
    const name = node.name;
    const sym = this.currentScope.lookup(name);
    const exprType = this.checkExpression(node.valueExpr);
    const isFromInput = node.valueExpr?.kind === 'CallExpr' && node.valueExpr.callee === 'input';

    if (!sym) {
      if (this.language === 'python' && node.operator === '=') {
        // In Python, bare `x = expr` declares x in current scope, UNLESS a longer variable looks like a typo of an existing variable!
        const known = this.currentScope.allKnownNames().filter((n) => n !== name && n.length >= 3);
        const closest = name.length >= 3 ? findClosestMatch(name, known, 1) : null;
        const exprUsesClosest =
          closest && this.exprReferencesIdent(node.valueExpr, closest);

        if (closest && !exprUsesClosest) {
          const dist = levenshteinDistance(name, closest);
          this.errors.push({
            id: `sem-py-typo-assign-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Possible misspelled variable '${name}' (assigns new variable instead of '${closest}')`,
            line: node.line,
            column: node.column,
            offendingText: name,
            ruleViolated: 'Python Variable Consistency Rule: Assignment creates new variable on typo',
            explanation: `'${name}' is very similar to declared variable '${closest}' (edit distance: ${dist}).`,
            suggestedFix: `Did you mean '${closest}'?`,
            closestMatch: closest
          });
        }

        this.currentScope.insert({
          name,
          type: exprType,
          lineDeclared: node.line,
          isInitialized: true,
          scope: this.currentScope.name,
          fromInput: isFromInput
        });
        return;
      }

      // C++ undeclared variable OR Python compound assignment `balnce += 1`
      const known = this.currentScope.allKnownNames().filter((n) => n !== name);
      const closest = findClosestMatch(name, known, 2);

      let fix =
        this.language === 'cpp'
          ? `Declare variable first (e.g. '${exprType === 'string' ? 'string' : exprType} ${name};')`
          : `Initialize '${name} = 0' before using '${node.operator}'`;

      if (closest) {
        const dist = levenshteinDistance(name, closest);
        fix = `Did you mean '${closest}'? (Edit distance: ${dist})`;
      }

      this.errors.push({
        id: `sem-undeclared-assign-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `Undeclared identifier '${name}': variable used before declaration`,
        line: node.line,
        column: node.column,
        offendingText: name,
        ruleViolated: 'Semantic Scope Rule: Variables must be declared prior to assignment',
        explanation: `'${name}' does not exist in active or enclosing scopes.`,
        suggestedFix: fix,
        closestMatch: closest || undefined
      });

      this.currentScope.insert({
        name,
        type: exprType,
        lineDeclared: node.line,
        isInitialized: true,
        scope: this.currentScope.name
      });
      return;
    }

    if (sym.isConst && this.language === 'cpp') {
      this.errors.push({
        id: `sem-cpp-const-assign-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `Cannot reassign const variable '${name}'`,
        line: node.line,
        column: node.column,
        offendingText: name,
        ruleViolated: 'C++ Const Rule: Read-only variable cannot be modified',
        explanation: `'${name}' was declared with 'const'.`,
        suggestedFix: `Remove 'const' or do not reassign '${name}'`
      });
    }

    if (this.language === 'cpp' || node.operator !== '=') {
      if (!this.areTypesCompatible(sym.type, exprType)) {
        this.errors.push({
          id: `sem-type-assign-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Type Mismatch in assignment: '${name}' is '${sym.type}', assigned '${exprType}'`,
          line: node.line,
          column: node.column,
          offendingText: `${name} ${node.operator} ${exprType}`,
          ruleViolated: 'Static Type Rule: Target variable type must match assigned expression',
          explanation: `Cannot assign '${exprType}' value to variable '${name}' of type '${sym.type}'.`,
          suggestedFix: `Assign a '${sym.type}' expression or change '${name}' type to '${exprType}'`
        });
      }
    } else if (this.language === 'python') {
      sym.type = exprType;
      sym.fromInput = isFromInput;
    }

    sym.isInitialized = true;
  }

  private exprReferencesIdent(node: ASTNode, ident: string): boolean {
    if (!node) return false;
    if (node.kind === 'Identifier') return node.name === ident;
    if (node.kind === 'BinaryOp') {
      return this.exprReferencesIdent(node.left, ident) || this.exprReferencesIdent(node.right, ident);
    }
    if (node.kind === 'UnaryOp') return this.exprReferencesIdent(node.operand, ident);
    if (node.kind === 'CallExpr' && Array.isArray(node.args)) {
      return node.args.some((a: ASTNode) => this.exprReferencesIdent(a, ident));
    }
    return false;
  }

  private visitIf(node: ASTNode) {
    const condType = this.checkExpression(node.condition);
    if (this.language === 'cpp' && !['bool', 'int', 'float', 'double'].includes(condType)) {
      this.errors.push({
        id: `sem-if-cond-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `If condition must be boolean or numeric in C++, got '${condType}'`,
        line: node.line,
        column: node.column,
        ruleViolated: 'C++ Control Flow Type Rule: Condition must convert to bool',
        explanation: `Type '${condType}' cannot be evaluated directly as a condition.`,
        suggestedFix: 'Use a comparison operator (==, !=, <, >)'
      });
    }
    this.visitStatement(node.thenBranch);
    if (node.elseBranch) this.visitStatement(node.elseBranch);
  }

  private visitWhile(node: ASTNode) {
    const condType = this.checkExpression(node.condition);
    if (this.language === 'cpp' && !['bool', 'int', 'float', 'double'].includes(condType)) {
      this.errors.push({
        id: `sem-while-cond-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `While condition must be boolean or numeric in C++, got '${condType}'`,
        line: node.line,
        column: node.column,
        ruleViolated: 'C++ Loop Condition Rule: Condition must convert to bool',
        explanation: `Type '${condType}' cannot be used directly as while condition.`,
        suggestedFix: 'Use a boolean comparison (e.g. x > 0)'
      });
    }
    this.visitStatement(node.body);
  }

  private checkExpression(node: ASTNode): string {
    if (!node) return 'int';

    if (node.kind === 'Literal') {
      return node.literalType;
    }

    if (node.kind === 'Identifier') {
      const sym = this.currentScope.lookup(node.name);
      if (!sym) {
        const known = this.currentScope.allKnownNames().filter((n) => n !== node.name);
        const closest = findClosestMatch(node.name, known, 2);

        let fix =
          this.language === 'python'
            ? `Define '${node.name} = ...' before referencing it`
            : `Declare 'int ${node.name} = 0;' before using it`;
        if (closest) {
          fix = `Did you mean '${closest}'? (Edit distance: ${levenshteinDistance(node.name, closest)})`;
        }

        this.errors.push({
          id: `sem-undeclared-expr-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Undeclared identifier '${node.name}' in expression`,
          line: node.line,
          column: node.column,
          offendingText: node.name,
          ruleViolated: 'Semantic Scope Rule: Variable must be defined before use',
          explanation: `Identifier '${node.name}' is not present in the symbol table.`,
          suggestedFix: fix,
          closestMatch: closest || undefined
        });
        return 'int';
      }
      return sym.type;
    }

    if (node.kind === 'CallExpr') {
      const callee = node.callee;
      const argTypes = Array.isArray(node.args)
        ? node.args.map((a: ASTNode) => this.checkExpression(a))
        : [];

      if (this.language === 'python') {
        if (callee === 'input') {
          return 'str';
        }
        if (callee === 'int' || callee === 'float') {
          if (node.args?.[0]?.kind === 'Literal' && node.args[0].literalType === 'str') {
            const rawVal = String(node.args[0].value);
            const detected = detectInputType(rawVal);
            if (!detected.compatibleTypes.includes(callee)) {
              this.errors.push({
                id: `sem-py-cast-${node.line}-${node.column}`,
                phase: ErrorPhase.SEMANTIC,
                message: `ValueError: invalid literal for ${callee}(): "${rawVal}" is '${detected.detectedType}', not '${callee}'`,
                line: node.line,
                column: node.column,
                offendingText: `${callee}("${rawVal}")`,
                ruleViolated: `Python Input/Cast Type Rule: ${callee}() requires valid ${callee} characters`,
                explanation: `String "${rawVal}" cannot be parsed into ${callee}. ${detected.ruleExplanation}`,
                suggestedFix:
                  callee === 'int'
                    ? `Pass a valid integer string like "42" or use str`
                    : `Pass a valid numeric string like "3.14"`
              });
            }
          }
          return callee;
        }
        if (callee === 'str') return 'str';
        if (callee === 'bool') return 'bool';
        if (callee === 'len') return 'int';
        if (callee === 'range') {
          for (let i = 0; i < argTypes.length; i++) {
            if (argTypes[i] !== 'int') {
              this.errors.push({
                id: `sem-py-range-${node.line}-${node.column}`,
                phase: ErrorPhase.SEMANTIC,
                message: `TypeError: range() argument must be 'int', got '${argTypes[i]}'`,
                line: node.line,
                column: node.column,
                ruleViolated: 'Python Built-in Rule: range() requires integer bounds',
                explanation: `Received '${argTypes[i]}' instead of 'int'.`,
                suggestedFix: 'Pass integer values or convert with int(...)'
              });
            }
          }
          return 'range';
        }
      }

      const fnSym = this.currentScope.lookup(callee);
      if (fnSym && fnSym.type.startsWith('fn -> ')) {
        return fnSym.type.replace('fn -> ', '');
      }
      return 'int';
    }

    if (node.kind === 'UnaryOp') {
      const subType = this.checkExpression(node.operand);
      if (node.operator === '-') {
        if (!['int', 'float', 'double'].includes(subType)) {
          this.errors.push({
            id: `sem-unary-neg-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Unary '-' cannot be applied to type '${subType}'`,
            line: node.line,
            column: node.column,
            ruleViolated: "Type Constraint: Unary '-' requires numeric type",
            explanation: 'Negation is only valid on numbers.',
            suggestedFix: "Apply '-' only to numeric expressions"
          });
        }
        return subType;
      }
      if (node.operator === '!' || node.operator === 'not') {
        return 'bool';
      }
    }

    if (node.kind === 'BinaryOp') {
      const leftT = this.checkExpression(node.left);
      const rightT = this.checkExpression(node.right);
      const op = node.operator;

      // Division / modulo by zero
      if ((op === '/' || op === '//' || op === '%') && node.right?.kind === 'Literal' && node.right.value === 0) {
        this.errors.push({
          id: `sem-div-zero-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: 'Division by constant zero detected at compile time',
          line: node.line,
          column: node.column,
          offendingText: `${op} 0`,
          ruleViolated: 'Semantic Invariant: Division/modulo denominator cannot be 0',
          explanation: 'Dividing by zero triggers ZeroDivisionError (Python) / undefined behavior (C++).',
          suggestedFix: "Replace '0' denominator with a non-zero number"
        });
      }

      const leftIsStr = leftT === 'str' || leftT === 'string';
      const rightIsStr = rightT === 'str' || rightT === 'string';

      if (op === '+') {
        if (leftIsStr && rightIsStr) return leftT;
        if (leftIsStr || rightIsStr) {
          const leftFromInput =
            node.left?.kind === 'Identifier' && this.currentScope.lookup(node.left.name)?.fromInput;
          const rightFromInput =
            node.right?.kind === 'Identifier' && this.currentScope.lookup(node.right.name)?.fromInput;

          const inputNote =
            leftFromInput || rightFromInput
              ? ' (input() returns str — wrap with int(...) for math or str(...) for text)'
              : '';

          this.errors.push({
            id: `sem-str-plus-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Type Mismatch: Cannot add '${leftT}' and '${rightT}' with '+'${inputNote}`,
            line: node.line,
            column: node.column,
            offendingText: `${leftT} + ${rightT}`,
            ruleViolated: "Semantic Type Rule: '+' cannot mix string and numeric types implicitly",
            explanation: `Both Python and C++ reject adding '${leftT}' and '${rightT}' without explicit conversion.`,
            suggestedFix:
              leftFromInput || rightFromInput
                ? 'Convert input variable with int(...) for arithmetic or str(...) for concatenation'
                : 'Convert operands to matching types (str()/to_string() or int())'
          });
          return leftT;
        }
      }

      // Python allows str * int
      if (op === '*' && this.language === 'python' && ((leftIsStr && rightT === 'int') || (leftT === 'int' && rightIsStr))) {
        return 'str';
      }

      if (['+', '-', '*', '/', '//', '%', '**'].includes(op)) {
        const numeric = ['int', 'float', 'double'];
        if (numeric.includes(leftT) && numeric.includes(rightT)) {
          if (op === '/' && this.language === 'python') return 'float';
          if (leftT === 'double' || rightT === 'double') return 'double';
          if (leftT === 'float' || rightT === 'float') return 'float';
          return 'int';
        }

        const involvesInput =
          (node.left?.kind === 'Identifier' && this.currentScope.lookup(node.left.name)?.fromInput) ||
          (node.right?.kind === 'Identifier' && this.currentScope.lookup(node.right.name)?.fromInput);

        this.errors.push({
          id: `sem-arith-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Invalid arithmetic operand types: '${leftT}' ${op} '${rightT}'`,
          line: node.line,
          column: node.column,
          offendingText: `${leftT} ${op} ${rightT}`,
          ruleViolated: 'Semantic Type Rule: Arithmetic requires numeric types',
          explanation: `Operator '${op}' is undefined for '${leftT}' and '${rightT}'.${
            involvesInput ? ' Note: Python input() returns str, not int.' : ''
          }`,
          suggestedFix: involvesInput
            ? 'Convert input() result using int(...) or float(...)'
            : 'Use numeric operands (int / float / double)'
        });
        return 'int';
      }

      if (['<', '<=', '>', '>='].includes(op)) {
        const numeric = ['int', 'float', 'double'];
        if ((numeric.includes(leftT) && numeric.includes(rightT)) || (leftIsStr && rightIsStr)) {
          return 'bool';
        }
        const involvesInput =
          (node.left?.kind === 'Identifier' && this.currentScope.lookup(node.left.name)?.fromInput) ||
          (node.right?.kind === 'Identifier' && this.currentScope.lookup(node.right.name)?.fromInput);

        this.errors.push({
          id: `sem-rel-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Cannot compare '${leftT}' ${op} '${rightT}'`,
          line: node.line,
          column: node.column,
          ruleViolated: 'Semantic Type Rule: Relational comparison requires compatible types',
          explanation: `Cannot compare '${leftT}' with '${rightT}'.${
            involvesInput ? ' Python input() returns str.' : ''
          }`,
          suggestedFix: involvesInput
            ? 'Wrap input() with int(input(...)) before numeric comparisons'
            : 'Compare values of compatible types'
        });
        return 'bool';
      }

      if (op === '==' || op === '!=') {
        if (this.areTypesCompatible(leftT, rightT) || this.areTypesCompatible(rightT, leftT)) {
          return 'bool';
        }
        this.errors.push({
          id: `sem-eq-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Comparison between incompatible types: '${leftT}' ${op} '${rightT}'`,
          line: node.line,
          column: node.column,
          ruleViolated: 'Semantic Type Rule: Equality operands should have compatible types',
          explanation: `Comparing '${leftT}' and '${rightT}' indicates a type bug.`,
          suggestedFix: 'Convert operands to the same type before comparing'
        });
        return 'bool';
      }

      if (['&&', '||', 'and', 'or'].includes(op)) {
        return 'bool';
      }
    }

    return 'int';
  }

  private areTypesCompatible(target: string, source: string): boolean {
    if (target === source) return true;
    if ((target === 'str' || target === 'string') && (source === 'str' || source === 'string')) return true;
    if ((target === 'float' || target === 'double') && ['int', 'float', 'double'].includes(source)) return true;
    if (target === 'int' && source === 'bool' && this.language === 'cpp') return true;
    return false;
  }
}
