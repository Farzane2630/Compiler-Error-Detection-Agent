import { ASTNode, CompilerError, ErrorPhase, SymbolEntry } from './types';
import { findClosestMatch, levenshteinDistance } from './levenshtein';

interface InternalSymbol {
  name: string;
  type: string;
  lineDeclared: number;
  isInitialized: boolean;
  scope: string;
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
  private currentScope = new Scope(null, 'global');
  private allScopes: Scope[] = [this.currentScope];
  public errors: CompilerError[] = [];
  public collectedSymbols: SymbolEntry[] = [];

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

    // Flatten symbols for UI inspection
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
      case 'PrintStatement':
        this.checkExpression(node.expression);
        break;
      case 'Block':
        this.enterScope('block');
        if (Array.isArray(node.statements)) {
          for (const s of node.statements) this.visitStatement(s);
        }
        this.exitScope();
        break;
    }
  }

  private visitVarDecl(node: ASTNode) {
    const name = node.name;

    // Check duplicate declaration in same scope
    if (this.currentScope.symbols.has(name)) {
      const prev = this.currentScope.symbols.get(name)!;
      this.errors.push({
        id: `sem-dup-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `Duplicate declaration of variable '${name}' (already declared at line ${prev.lineDeclared})`,
        line: node.line,
        column: node.column,
        offendingText: name,
        ruleViolated: 'Semantic Scope Rule: Identifiers must be unique within their local block scope',
        explanation: `Variable '${name}' was already declared in the current '${this.currentScope.name}' scope.`,
        suggestedFix: `Remove redundant 'var ${name}' or rename to '${name}_2'`
      });
      return;
    }

    let inferredType = node.varType || 'int';
    let isInit = false;

    if (node.initializer) {
      const initType = this.checkExpression(node.initializer);
      isInit = true;
      if (node.varType) {
        if (!this.areTypesCompatible(node.varType, initType)) {
          this.errors.push({
            id: `sem-type-decl-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Type Mismatch: Cannot assign type '${initType}' to variable '${name}' of type '${node.varType}'`,
            line: node.line,
            column: node.column,
            offendingText: `${name}: ${node.varType} = ${initType}`,
            ruleViolated: 'Semantic Type Rule: Declared type must match initializer expression type',
            explanation: `Type '${initType}' is incompatible with declared target type '${node.varType}'.`,
            suggestedFix: `Change variable type to '${initType}' or initialize with a ${node.varType} value`
          });
        }
      } else {
        inferredType = initType;
      }
    }

    const sym: InternalSymbol = {
      name,
      type: inferredType,
      lineDeclared: node.line,
      isInitialized: isInit,
      scope: this.currentScope.name
    };
    this.currentScope.insert(sym);
  }

  private visitAssignment(node: ASTNode) {
    const name = node.name;
    const sym = this.currentScope.lookup(name);

    if (!sym) {
      // Spell check against known declared variables!
      const known = this.currentScope.allKnownNames().filter((n) => n !== name);
      const closest = findClosestMatch(name, known, 2);

      let fix = `Declare variable first with 'var ${name}: int = 0;' before assignment`;
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
        ruleViolated: 'Semantic Scope Rule: Variables must be declared before assignment',
        explanation: `Identifier '${name}' does not exist in the current or enclosing symbol tables.`,
        suggestedFix: fix,
        closestMatch: closest || undefined
      });

      // Insert dummy symbol to prevent cascaded errors
      const exprType = this.checkExpression(node.valueExpr);
      this.currentScope.insert({
        name,
        type: exprType,
        lineDeclared: node.line,
        isInitialized: true,
        scope: this.currentScope.name
      });
      return;
    }

    const exprType = this.checkExpression(node.valueExpr);
    if (!this.areTypesCompatible(sym.type, exprType)) {
      this.errors.push({
        id: `sem-type-assign-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `Type Mismatch in assignment: Variable '${name}' is type '${sym.type}', but assigned '${exprType}'`,
        line: node.line,
        column: node.column,
        offendingText: `${name} = ${exprType}`,
        ruleViolated: 'Semantic Type Rule: Target variable type must match assigned expression type',
        explanation: `Cannot assign value of type '${exprType}' to variable declared as '${sym.type}'.`,
        suggestedFix: `Assign an expression of type '${sym.type}' or declare '${name}' as '${exprType}'`
      });
    }

    sym.isInitialized = true;
  }

  private visitIf(node: ASTNode) {
    const condType = this.checkExpression(node.condition);
    if (!['bool', 'int'].includes(condType)) {
      this.errors.push({
        id: `sem-if-cond-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `If condition must evaluate to boolean or numeric, got '${condType}'`,
        line: node.line,
        column: node.column,
        ruleViolated: 'Semantic Rule: Condition must be boolean expression',
        explanation: 'Control flow branches require a boolean condition.',
        suggestedFix: "Use comparison operator (e.g. '>') to produce boolean"
      });
    }
    this.visitStatement(node.thenBranch);
    if (node.elseBranch) this.visitStatement(node.elseBranch);
  }

  private visitWhile(node: ASTNode) {
    const condType = this.checkExpression(node.condition);
    if (!['bool', 'int'].includes(condType)) {
      this.errors.push({
        id: `sem-while-cond-${node.line}-${node.column}`,
        phase: ErrorPhase.SEMANTIC,
        message: `While condition must evaluate to boolean, got '${condType}'`,
        line: node.line,
        column: node.column,
        ruleViolated: 'Semantic Rule: While loop condition must evaluate to boolean',
        explanation: 'Loop iteration requires a boolean condition.',
        suggestedFix: "Wrap expression with comparison (e.g. 'while (x > 0)')"
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

        let fix = `Declare 'var ${node.name}' before using it in expressions`;
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
          ruleViolated: 'Semantic Scope Rule: Variable must be declared prior to evaluation',
          explanation: `Identifier '${node.name}' is referenced before declaration in symbol table.`,
          suggestedFix: fix,
          closestMatch: closest || undefined
        });
        return 'int';
      }
      return sym.type;
    }

    if (node.kind === 'UnaryOp') {
      const subType = this.checkExpression(node.operand);
      if (node.operator === '-') {
        if (!['int', 'float'].includes(subType)) {
          this.errors.push({
            id: `sem-unary-neg-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Unary negation '-' cannot be applied to type '${subType}'`,
            line: node.line,
            column: node.column,
            ruleViolated: "Type Constraint: Unary '-' requires numeric type",
            explanation: 'Negation is only defined for numbers.',
            suggestedFix: "Apply '-' only to numbers"
          });
        }
        return subType;
      }
      if (node.operator === '!') {
        if (subType !== 'bool') {
          this.errors.push({
            id: `sem-unary-not-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Logical NOT '!' requires boolean operand, got '${subType}'`,
            line: node.line,
            column: node.column,
            ruleViolated: "Type Constraint: Unary '!' requires boolean operand",
            explanation: 'Logical negation requires a truth value.',
            suggestedFix: 'Ensure operand evaluates to true or false'
          });
        }
        return 'bool';
      }
    }

    if (node.kind === 'BinaryOp') {
      const leftT = this.checkExpression(node.left);
      const rightT = this.checkExpression(node.right);
      const op = node.operator;

      // Division by literal zero check
      if ((op === '/' || op === '%') && node.right?.kind === 'Literal' && node.right.value === 0) {
        this.errors.push({
          id: `sem-div-zero-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: 'Division by constant zero detected at compile time',
          line: node.line,
          column: node.column,
          offendingText: `${op} 0`,
          ruleViolated: 'Semantic Invariant: Denominator in division cannot be literal zero',
          explanation: 'Dividing by zero is an undefined mathematical operation that causes a fatal runtime error.',
          suggestedFix: "Change denominator '0' to non-zero number or guard with if"
        });
      }

      // String concatenation
      if (op === '+') {
        if (leftT === 'string' || rightT === 'string') return 'string';
      }

      // Arithmetic: +, -, *, /, %
      if (['+', '-', '*', '/', '%'].includes(op)) {
        if (['int', 'float'].includes(leftT) && ['int', 'float'].includes(rightT)) {
          if (leftT === 'float' || rightT === 'float') return 'float';
          return 'int';
        } else {
          this.errors.push({
            id: `sem-arith-${node.line}-${node.column}`,
            phase: ErrorPhase.SEMANTIC,
            message: `Invalid arithmetic operand types: '${leftT}' ${op} '${rightT}'`,
            line: node.line,
            column: node.column,
            offendingText: `${leftT} ${op} ${rightT}`,
            ruleViolated: 'Semantic Type Rule: Arithmetic operations are only defined on numeric types',
            explanation: `Operator '${op}' cannot be applied between '${leftT}' and '${rightT}'.`,
            suggestedFix: 'Convert operands to numbers or use matching numeric types'
          });
          return 'int';
        }
      }

      // Relational: <, <=, >, >=
      if (['<', '<=', '>', '>='].includes(op)) {
        if (['int', 'float'].includes(leftT) && ['int', 'float'].includes(rightT)) return 'bool';
        this.errors.push({
          id: `sem-relational-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Relational operator '${op}' requires numeric operands, got '${leftT}' and '${rightT}'`,
          line: node.line,
          column: node.column,
          ruleViolated: 'Semantic Rule: Order comparisons require numbers',
          explanation: 'Cannot compare order of non-numeric values.',
          suggestedFix: 'Compare numbers only'
        });
        return 'bool';
      }

      // Equality: ==, !=
      if (op === '==' || op === '!=') {
        if (this.areTypesCompatible(leftT, rightT)) return 'bool';
        this.errors.push({
          id: `sem-eq-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Comparison between incomparable types: '${leftT}' ${op} '${rightT}'`,
          line: node.line,
          column: node.column,
          ruleViolated: 'Semantic Rule: Equality operands must share compatible types',
          explanation: `Cannot test equality between '${leftT}' and '${rightT}'.`,
          suggestedFix: 'Compare values of the same type'
        });
        return 'bool';
      }

      // Logical: &&, ||
      if (op === '&&' || op === '||') {
        if (leftT === 'bool' && rightT === 'bool') return 'bool';
        this.errors.push({
          id: `sem-logic-${node.line}-${node.column}`,
          phase: ErrorPhase.SEMANTIC,
          message: `Logical operator '${op}' requires boolean operands, got '${leftT}' and '${rightT}'`,
          line: node.line,
          column: node.column,
          ruleViolated: 'Semantic Rule: Logical operations require booleans',
          explanation: `Logical operator '${op}' only operates on boolean values.`,
          suggestedFix: 'Use boolean operands'
        });
        return 'bool';
      }
    }

    return 'int';
  }

  private areTypesCompatible(target: string, source: string): boolean {
    if (target === source) return true;
    if (target === 'float' && source === 'int') return true;
    return false;
  }
}
