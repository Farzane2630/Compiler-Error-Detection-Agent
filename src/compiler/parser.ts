import { ASTNode, CompilerError, ErrorPhase, TargetLanguage, Token, TokenType } from './types';
import { findClosestMatch } from './levenshtein';

const PYTHON_KEYWORDS = ['def', 'return', 'if', 'elif', 'else', 'while', 'for', 'in', 'print', 'input', 'int', 'float', 'str', 'bool', 'True', 'False', 'None', 'and', 'or', 'not'];
const CPP_KEYWORDS = ['int', 'float', 'double', 'string', 'char', 'bool', 'void', 'const', 'if', 'else', 'while', 'for', 'return', 'using', 'namespace', 'std', 'cout', 'cin', 'endl', 'true', 'false'];
const CPP_TYPES = [TokenType.INT, TokenType.FLOAT, TokenType.DOUBLE, TokenType.STRING, TokenType.CHAR, TokenType.BOOL, TokenType.VOID];

export class Parser {
  private tokens: Token[];
  private language: TargetLanguage;
  private pos = 0;
  public errors: CompilerError[] = [];

  constructor(tokens: Token[], language: TargetLanguage = 'python') {
    this.tokens = tokens;
    this.language = language;
  }

  private current(): Token {
    if (this.pos >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[this.pos];
  }

  private peek(offset = 1): Token {
    const idx = this.pos + offset;
    if (idx >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[idx];
  }

  private advance(): Token {
    const tok = this.current();
    if (this.pos < this.tokens.length - 1) this.pos++;
    return tok;
  }

  private match(...types: TokenType[]): boolean {
    if (types.includes(this.current().type)) {
      this.advance();
      return true;
    }
    return false;
  }

  private expect(expectedType: TokenType, errorMsg: string, rule = '', fix = ''): Token | null {
    const tok = this.current();
    if (tok.type === expectedType) {
      return this.advance();
    }

    let smartFix = fix;
    if (!smartFix) {
      if (expectedType === TokenType.SEMICOLON) {
        smartFix = `Add missing semicolon ';' at line ${tok.line}`;
      } else if (expectedType === TokenType.COLON) {
        smartFix = `Add missing colon ':' at end of header`;
      } else if (expectedType === TokenType.RPAREN) {
        smartFix = `Add closing parenthesis ')'`;
      } else if (expectedType === TokenType.LPAREN) {
        smartFix = `Add opening parenthesis '('`;
      } else if (expectedType === TokenType.RBRACE) {
        smartFix = `Add closing brace '}'`;
      } else {
        smartFix = `Insert '${expectedType}' here`;
      }
    }

    this.errors.push({
      id: `syn-expect-${tok.line}-${tok.column}-${expectedType}`,
      phase: ErrorPhase.SYNTAX,
      message: `${errorMsg} (found '${tok.value || tok.type}' [${tok.type}])`,
      line: tok.line,
      column: tok.column,
      offendingText: String(tok.value),
      ruleViolated: rule || `Grammar Rule: Expected '${expectedType}'`,
      explanation: `Language syntax grammar requires '${expectedType}' at this position.`,
      suggestedFix: smartFix
    });
    return null;
  }

  public parse(): { ast: ASTNode; errors: CompilerError[] } {
    if (this.language === 'python') {
      return this.parsePythonProgram();
    }
    return this.parseCppProgram();
  }

  // =========================================================================
  // PYTHON PARSER
  // =========================================================================
  private skipPythonNewlines() {
    while (this.current().type === TokenType.NEWLINE || this.current().type === TokenType.SEMICOLON) {
      this.advance();
    }
  }

  private syncPythonToNextLine() {
    while (
      this.current().type !== TokenType.NEWLINE &&
      this.current().type !== TokenType.DEDENT &&
      this.current().type !== TokenType.EOF
    ) {
      this.advance();
    }
    if (this.current().type === TokenType.NEWLINE) this.advance();
  }

  private parsePythonProgram(): { ast: ASTNode; errors: CompilerError[] } {
    const statements: ASTNode[] = [];
    while (this.current().type !== TokenType.EOF) {
      this.skipPythonNewlines();
      if (this.current().type === TokenType.EOF) break;
      if (this.current().type === TokenType.ILLEGAL) {
        this.advance();
        continue;
      }
      if (this.current().type === TokenType.DEDENT) {
        this.advance();
        continue;
      }
      const stmt = this.parsePythonStatement();
      if (stmt) statements.push(stmt);
    }
    return {
      ast: { kind: 'Program', language: 'python', statements, line: 1, column: 1 },
      errors: this.errors
    };
  }

  private parsePythonStatement(): ASTNode | null {
    this.skipPythonNewlines();
    const tok = this.current();

    if (tok.type === TokenType.EOF || tok.type === TokenType.DEDENT) return null;

    if (tok.type === TokenType.INDENT) {
      this.errors.push({
        id: `syn-py-unexpected-indent-${tok.line}-${tok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: 'IndentationError: unexpected indent',
        line: tok.line,
        column: tok.column,
        ruleViolated: 'Python Syntax Rule: Indentation only allowed after block header (:)',
        explanation: 'Line is indented without a preceding if, while, for, or def statement.',
        suggestedFix: 'Remove leading indentation on this line'
      });
      this.advance();
      return this.parsePythonStatement();
    }

    if (tok.type === TokenType.DEF) return this.parsePythonDef();
    if (tok.type === TokenType.IF) return this.parsePythonIf();
    if (tok.type === TokenType.WHILE) return this.parsePythonWhile();
    if (tok.type === TokenType.FOR) return this.parsePythonFor();
    if (tok.type === TokenType.RETURN) return this.parsePythonReturn();
    if (tok.type === TokenType.PRINT) return this.parsePythonPrint(tok.line, tok.column);

    if (tok.type === TokenType.LBRACE || tok.type === TokenType.RBRACE) {
      this.errors.push({
        id: `syn-py-brace-${tok.line}-${tok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: `Unexpected brace '${tok.value}' in Python (Python uses ':' and indentation)`,
        line: tok.line,
        column: tok.column,
        offendingText: String(tok.value),
        ruleViolated: "Python Grammar: Blocks are delimited by ':' and INDENT/DEDENT, not '{ }'",
        explanation: 'Curly braces are C/C++ block syntax, not Python block delimiters.',
        suggestedFix: tok.type === TokenType.LBRACE ? "Replace '{' with ':' and indent block" : "Remove '}'"
      });
      this.advance();
      return null;
    }

    if (tok.type === TokenType.IDENTIFIER) {
      const word = String(tok.value);
      const next = this.peek();

      // Detect misspelled Python keywords like `whle`, `prnt`, `dfe`
      const closestKw = findClosestMatch(word, PYTHON_KEYWORDS, 2);
      if (
        closestKw &&
        ((closestKw === 'print' && (next.type === TokenType.LPAREN || next.type === TokenType.STRING_LITERAL)) ||
          (closestKw === 'while' && next.type !== TokenType.ASSIGN && next.type !== TokenType.COLON) ||
          (closestKw === 'if' && next.type !== TokenType.ASSIGN && next.type !== TokenType.COLON) ||
          (closestKw === 'def' && next.type === TokenType.IDENTIFIER))
      ) {
        this.errors.push({
          id: `syn-py-kw-${tok.line}-${tok.column}`,
          phase: ErrorPhase.SYNTAX,
          message: `Unrecognized Python keyword '${word}'`,
          line: tok.line,
          column: tok.column,
          offendingText: word,
          ruleViolated: 'Python Keyword Spelling Rule',
          explanation: `'${word}' looks like a misspelled Python keyword.`,
          suggestedFix: `Did you mean '${closestKw}'?`,
          closestMatch: closestKw
        });
        this.advance();
        if (closestKw === 'print') return this.parsePythonPrintBody(tok.line, tok.column);
        if (closestKw === 'while') return this.parsePythonWhileBody(tok.line, tok.column);
        if (closestKw === 'if') return this.parsePythonIfBody(tok.line, tok.column);
        if (closestKw === 'def') return this.parsePythonDefBody(tok.line, tok.column);
      }

      // Annotated variable: `x: int = 10`
      if (next.type === TokenType.COLON) {
        return this.parsePythonAnnotatedOrAssign();
      }
      // Assignment: `x = expr`, `x += expr`, `x -= expr`
      if ([TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN].includes(next.type)) {
        return this.parsePythonAnnotatedOrAssign();
      }
      // Function call or bare expression statement
      const expr = this.parsePythonExpression();
      this.consumePythonLineEnd();
      return { kind: 'ExprStatement', expression: expr, line: tok.line, column: tok.column };
    }

    // Fallback: expression statement or invalid token
    if ([TokenType.INPUT, TokenType.INT, TokenType.FLOAT, TokenType.STR, TokenType.BOOL].includes(tok.type)) {
      const expr = this.parsePythonExpression();
      this.consumePythonLineEnd();
      return { kind: 'ExprStatement', expression: expr, line: tok.line, column: tok.column };
    }

    this.errors.push({
      id: `syn-py-unexpected-${tok.line}-${tok.column}`,
      phase: ErrorPhase.SYNTAX,
      message: `Unexpected token '${tok.value || tok.type}' at start of Python statement`,
      line: tok.line,
      column: tok.column,
      offendingText: String(tok.value),
      ruleViolated: 'Python Grammar: Statement -> Assign | If | While | For | Def | Print | Return | Expr',
      explanation: `A valid Python statement cannot start with '${tok.value || tok.type}'.`,
      suggestedFix: 'Check syntax or remove unexpected symbol'
    });
    this.syncPythonToNextLine();
    return null;
  }

  private consumePythonLineEnd() {
    while (this.current().type === TokenType.SEMICOLON) this.advance();
    if (this.current().type === TokenType.NEWLINE) {
      this.advance();
    } else if (
      this.current().type !== TokenType.EOF &&
      this.current().type !== TokenType.DEDENT
    ) {
      const tok = this.current();
      this.errors.push({
        id: `syn-py-eol-${tok.line}-${tok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: `Unexpected trailing token '${tok.value}' on statement line`,
        line: tok.line,
        column: tok.column,
        offendingText: String(tok.value),
        ruleViolated: 'Python Grammar: Expected newline at end of statement',
        explanation: 'A single line contains extra unexpected tokens after the statement.',
        suggestedFix: `Check syntax near '${tok.value}' or split onto a new line`
      });
      this.syncPythonToNextLine();
    }
  }

  private parsePythonTypeName(): string | null {
    const tok = this.current();
    if ([TokenType.INT, TokenType.FLOAT, TokenType.STR, TokenType.BOOL].includes(tok.type)) {
      this.advance();
      return String(tok.value);
    }
    if (tok.type === TokenType.STRING) {
      this.errors.push({
        id: `syn-py-strtype-${tok.line}-${tok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Use Python type 'str' instead of 'string'",
        line: tok.line,
        column: tok.column,
        offendingText: 'string',
        ruleViolated: "Python Type Annotation Rule: String type is 'str'",
        explanation: "Python's built-in string type name is 'str', not 'string'.",
        suggestedFix: "Replace 'string' with 'str'",
        closestMatch: 'str'
      });
      this.advance();
      return 'str';
    }
    if (tok.type === TokenType.IDENTIFIER) {
      const closest = findClosestMatch(String(tok.value), ['int', 'float', 'str', 'bool'], 2);
      if (closest) {
        this.errors.push({
          id: `syn-py-badtype-${tok.line}-${tok.column}`,
          phase: ErrorPhase.SYNTAX,
          message: `Unknown Python type annotation '${tok.value}'`,
          line: tok.line,
          column: tok.column,
          offendingText: String(tok.value),
          ruleViolated: "Python Type Annotation Rule: Expected 'int' | 'float' | 'str' | 'bool'",
          explanation: `'${tok.value}' is not a recognized primitive type.`,
          suggestedFix: `Did you mean '${closest}'?`,
          closestMatch: closest
        });
        this.advance();
        return closest;
      }
      this.advance();
      return String(tok.value);
    }
    return null;
  }

  private parsePythonAnnotatedOrAssign(): ASTNode {
    const idTok = this.advance();
    const name = String(idTok.value);
    let varType: string | null = null;

    if (this.match(TokenType.COLON)) {
      varType = this.parsePythonTypeName();
    }

    if (this.match(TokenType.ASSIGN)) {
      const expr = this.parsePythonExpression();
      this.consumePythonLineEnd();
      if (varType !== null) {
        return {
          kind: 'VarDecl',
          name,
          varType,
          initializer: expr,
          line: idTok.line,
          column: idTok.column
        };
      }
      return {
        kind: 'Assignment',
        name,
        operator: '=',
        valueExpr: expr,
        line: idTok.line,
        column: idTok.column
      };
    }

    if (this.current().type === TokenType.PLUS_ASSIGN || this.current().type === TokenType.MINUS_ASSIGN) {
      const opTok = this.advance();
      const expr = this.parsePythonExpression();
      this.consumePythonLineEnd();
      return {
        kind: 'Assignment',
        name,
        operator: String(opTok.value),
        valueExpr: expr,
        line: idTok.line,
        column: idTok.column
      };
    }

    // Type-only annotation `x: int`
    this.consumePythonLineEnd();
    return {
      kind: 'VarDecl',
      name,
      varType: varType || 'int',
      initializer: null,
      line: idTok.line,
      column: idTok.column
    };
  }

  private parsePythonBlock(headerLine: number): ASTNode {
    if (this.current().type === TokenType.LBRACE) {
      this.errors.push({
        id: `syn-py-lbrace-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Python uses indentation instead of '{'",
        line: this.current().line,
        column: this.current().column,
        offendingText: '{',
        ruleViolated: 'Python Block Syntax: Remove curly braces and indent body',
        explanation: 'Braces are not valid block delimiters in Python.',
        suggestedFix: "Remove '{' and indent block lines by 4 spaces"
      });
      this.advance();
    }

    this.skipPythonNewlines();
    const statements: ASTNode[] = [];

    if (this.current().type !== TokenType.INDENT) {
      this.errors.push({
        id: `syn-py-indent-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: 'IndentationError: expected an indented block after header',
        line: this.current().line || headerLine + 1,
        column: this.current().column || 1,
        ruleViolated: "Python Grammar: Header ending in ':' must be followed by an indented block",
        explanation: 'Statements inside if, while, for, or def must be indented (e.g. 4 spaces).',
        suggestedFix: 'Indent the body lines under this statement by 4 spaces'
      });
      return { kind: 'Block', statements, line: headerLine, column: 1 };
    }

    const indentTok = this.advance();
    while (this.current().type !== TokenType.DEDENT && this.current().type !== TokenType.EOF) {
      this.skipPythonNewlines();
      if (this.current().type === TokenType.DEDENT || this.current().type === TokenType.EOF) break;
      if (this.current().type === TokenType.RBRACE) {
        this.advance();
        continue;
      }
      const s = this.parsePythonStatement();
      if (s) statements.push(s);
    }
    this.match(TokenType.DEDENT);
    return { kind: 'Block', statements, line: indentTok.line, column: indentTok.column };
  }

  private parsePythonIf(): ASTNode {
    const tok = this.advance();
    return this.parsePythonIfBody(tok.line, tok.column);
  }

  private parsePythonIfBody(line: number, column: number): ASTNode {
    const condition = this.parsePythonExpression();
    this.expect(
      TokenType.COLON,
      "Missing colon ':' after 'if' condition",
      "Python Grammar: IfStmt -> 'if' Expr ':' NEWLINE INDENT Block",
      `Add ':' at end of line ${line}`
    );
    const thenBranch = this.parsePythonBlock(line);
    this.skipPythonNewlines();

    let elseBranch: ASTNode | null = null;
    if (this.current().type === TokenType.ELIF) {
      const elifTok = this.advance();
      elseBranch = this.parsePythonIfBody(elifTok.line, elifTok.column);
    } else if (this.current().type === TokenType.ELSE) {
      const elseTok = this.advance();
      this.expect(
        TokenType.COLON,
        "Missing colon ':' after 'else'",
        "Python Grammar: ElseClause -> 'else' ':' NEWLINE INDENT Block",
        `Add ':' after 'else'`
      );
      elseBranch = this.parsePythonBlock(elseTok.line);
    }

    return {
      kind: 'IfStatement',
      condition,
      thenBranch,
      elseBranch,
      line,
      column
    };
  }

  private parsePythonWhile(): ASTNode {
    const tok = this.advance();
    return this.parsePythonWhileBody(tok.line, tok.column);
  }

  private parsePythonWhileBody(line: number, column: number): ASTNode {
    const condition = this.parsePythonExpression();
    this.expect(
      TokenType.COLON,
      "Missing colon ':' after 'while' condition",
      "Python Grammar: WhileStmt -> 'while' Expr ':' NEWLINE INDENT Block",
      `Add ':' at end of line ${line}`
    );
    const body = this.parsePythonBlock(line);
    return { kind: 'WhileStatement', condition, body, line, column };
  }

  private parsePythonFor(): ASTNode {
    const tok = this.advance();
    const varTok = this.current();
    let varName = 'i';
    if (varTok.type === TokenType.IDENTIFIER) {
      varName = String(varTok.value);
      this.advance();
    } else {
      this.expect(TokenType.IDENTIFIER, "Expected loop variable after 'for'");
    }
    this.expect(TokenType.IN, "Expected 'in' keyword in Python 'for' loop");
    const iterable = this.parsePythonExpression();
    this.expect(TokenType.COLON, "Missing colon ':' after 'for' loop header");
    const body = this.parsePythonBlock(tok.line);
    return { kind: 'ForStatement', varName, iterable, body, line: tok.line, column: tok.column };
  }

  private parsePythonDef(): ASTNode {
    const tok = this.advance();
    return this.parsePythonDefBody(tok.line, tok.column);
  }

  private parsePythonDefBody(line: number, column: number): ASTNode {
    const nameTok = this.current();
    let name = 'func';
    if (nameTok.type === TokenType.IDENTIFIER) {
      name = String(nameTok.value);
      this.advance();
    } else {
      this.expect(TokenType.IDENTIFIER, "Expected function name after 'def'");
    }
    this.expect(TokenType.LPAREN, "Expected '(' after function name");
    const params: { name: string; type: string }[] = [];
    while (this.current().type !== TokenType.RPAREN && this.current().type !== TokenType.EOF && this.current().type !== TokenType.NEWLINE) {
      if (this.current().type === TokenType.IDENTIFIER) {
        const pName = String(this.advance().value);
        let pType = 'any';
        if (this.match(TokenType.COLON)) {
          pType = this.parsePythonTypeName() || 'any';
        }
        params.push({ name: pName, type: pType });
      } else {
        this.advance();
      }
      if (!this.match(TokenType.COMMA)) break;
    }
    this.expect(TokenType.RPAREN, "Expected ')' after function parameters");
    let returnType = 'None';
    if (this.match(TokenType.ARROW)) {
      returnType = this.parsePythonTypeName() || 'None';
    }
    this.expect(TokenType.COLON, "Missing colon ':' after 'def' signature");
    const body = this.parsePythonBlock(line);
    return { kind: 'FunctionDef', name, params, returnType, body, line, column };
  }

  private parsePythonReturn(): ASTNode {
    const tok = this.advance();
    let expression: ASTNode | null = null;
    if (this.current().type !== TokenType.NEWLINE && this.current().type !== TokenType.EOF) {
      expression = this.parsePythonExpression();
    }
    this.consumePythonLineEnd();
    return { kind: 'ReturnStatement', expression, line: tok.line, column: tok.column };
  }

  private parsePythonPrint(line: number, column: number): ASTNode {
    this.advance();
    return this.parsePythonPrintBody(line, column);
  }

  private parsePythonPrintBody(line: number, column: number): ASTNode {
    if (!this.match(TokenType.LPAREN)) {
      this.errors.push({
        id: `syn-py-print-paren-${line}-${column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Python 3 requires parentheses in 'print(...)'",
        line,
        column,
        ruleViolated: "Python 3 Syntax: PrintStmt -> 'print' '(' ArgList? ')'",
        explanation: 'Unlike Python 2, print is a function and requires ( ).',
        suggestedFix: "Wrap printed expression in parentheses: print(...)"
      });
      const arg = this.parsePythonExpression();
      this.consumePythonLineEnd();
      return { kind: 'PrintStatement', expressions: [arg], line, column };
    }

    const args: ASTNode[] = [];
    if (this.current().type !== TokenType.RPAREN) {
      args.push(this.parsePythonExpression());
      while (this.match(TokenType.COMMA)) {
        args.push(this.parsePythonExpression());
      }
    }
    this.expect(TokenType.RPAREN, "Missing closing ')' in print(...)");
    this.consumePythonLineEnd();
    return { kind: 'PrintStatement', expressions: args, line, column };
  }

  private parsePythonExpression(): ASTNode {
    return this.parsePythonOr();
  }

  private parsePythonOr(): ASTNode {
    let expr = this.parsePythonAnd();
    while (this.match(TokenType.OR)) {
      const right = this.parsePythonAnd();
      expr = { kind: 'BinaryOp', operator: 'or', left: expr, right, line: expr.line, column: expr.column };
    }
    return expr;
  }

  private parsePythonAnd(): ASTNode {
    let expr = this.parsePythonNot();
    while (this.match(TokenType.AND)) {
      const right = this.parsePythonNot();
      expr = { kind: 'BinaryOp', operator: 'and', left: expr, right, line: expr.line, column: expr.column };
    }
    return expr;
  }

  private parsePythonNot(): ASTNode {
    if (this.current().type === TokenType.NOT) {
      const tok = this.advance();
      const operand = this.parsePythonNot();
      return { kind: 'UnaryOp', operator: 'not', operand, line: tok.line, column: tok.column };
    }
    return this.parsePythonComparison();
  }

  private parsePythonComparison(): ASTNode {
    let expr = this.parsePythonAdditive();
    while ([TokenType.EQ, TokenType.NEQ, TokenType.LT, TokenType.LTE, TokenType.GT, TokenType.GTE].includes(this.current().type)) {
      const opTok = this.advance();
      const right = this.parsePythonAdditive();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parsePythonAdditive(): ASTNode {
    let expr = this.parsePythonMultiplicative();
    while (this.current().type === TokenType.PLUS || this.current().type === TokenType.MINUS) {
      const opTok = this.advance();
      const right = this.parsePythonMultiplicative();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parsePythonMultiplicative(): ASTNode {
    let expr = this.parsePythonUnary();
    while ([TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.FLOOR_DIVIDE, TokenType.MODULO].includes(this.current().type)) {
      const opTok = this.advance();
      const right = this.parsePythonUnary();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parsePythonUnary(): ASTNode {
    if (this.current().type === TokenType.MINUS || this.current().type === TokenType.PLUS) {
      const opTok = this.advance();
      const operand = this.parsePythonUnary();
      return { kind: 'UnaryOp', operator: opTok.value, operand, line: opTok.line, column: opTok.column };
    }
    return this.parsePythonPower();
  }

  private parsePythonPower(): ASTNode {
    let expr = this.parsePythonPrimary();
    if (this.match(TokenType.POWER)) {
      const right = this.parsePythonUnary();
      expr = { kind: 'BinaryOp', operator: '**', left: expr, right, line: expr.line, column: expr.column };
    }
    return expr;
  }

  private parsePythonPrimary(): ASTNode {
    const tok = this.current();

    if (tok.type === TokenType.INT_LITERAL) {
      this.advance();
      return { kind: 'Literal', literalType: 'int', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.FLOAT_LITERAL) {
      this.advance();
      return { kind: 'Literal', literalType: 'float', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.STRING_LITERAL) {
      this.advance();
      return { kind: 'Literal', literalType: 'str', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.TRUE || tok.type === TokenType.FALSE) {
      this.advance();
      return { kind: 'Literal', literalType: 'bool', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.NONE) {
      this.advance();
      return { kind: 'Literal', literalType: 'None', value: null, line: tok.line, column: tok.column };
    }

    // Built-in call expressions like input(...), int(...), float(...), str(...), bool(...), or user functions
    if (
      [TokenType.IDENTIFIER, TokenType.INPUT, TokenType.INT, TokenType.FLOAT, TokenType.STR, TokenType.BOOL].includes(
        tok.type
      )
    ) {
      this.advance();
      const name = String(tok.value);
      if (this.match(TokenType.LPAREN)) {
        const args: ASTNode[] = [];
        if (this.current().type !== TokenType.RPAREN) {
          args.push(this.parsePythonExpression());
          while (this.match(TokenType.COMMA)) {
            args.push(this.parsePythonExpression());
          }
        }
        this.expect(TokenType.RPAREN, `Missing closing ')' in call to '${name}(...)'`);
        return { kind: 'CallExpr', callee: name, args, line: tok.line, column: tok.column };
      }
      return { kind: 'Identifier', name, line: tok.line, column: tok.column };
    }

    if (this.match(TokenType.LPAREN)) {
      const expr = this.parsePythonExpression();
      this.expect(TokenType.RPAREN, "Missing closing ')' in grouped expression");
      return expr;
    }

    this.errors.push({
      id: `syn-py-expr-${tok.line}-${tok.column}`,
      phase: ErrorPhase.SYNTAX,
      message: `Expected expression operand, found '${tok.value || tok.type}'`,
      line: tok.line,
      column: tok.column,
      offendingText: String(tok.value),
      ruleViolated: 'Python Expression Grammar: Expected literal, variable, or function call',
      explanation: 'Missing operand in expression.',
      suggestedFix: 'Provide a valid literal, variable, or expression'
    });
    if (tok.type !== TokenType.NEWLINE && tok.type !== TokenType.EOF) this.advance();
    return { kind: 'Literal', literalType: 'int', value: 0, line: tok.line, column: tok.column };
  }

  // =========================================================================
  // C++ PARSER
  // =========================================================================
  private syncCpp() {
    this.advance();
    while (this.current().type !== TokenType.EOF) {
      if (this.tokens[this.pos - 1]?.type === TokenType.SEMICOLON) return;
      if (
        [
          ...CPP_TYPES,
          TokenType.CONST,
          TokenType.IF,
          TokenType.WHILE,
          TokenType.FOR,
          TokenType.COUT,
          TokenType.CIN,
          TokenType.RETURN,
          TokenType.RBRACE,
          TokenType.LBRACE,
          TokenType.PREPROCESSOR
        ].includes(this.current().type)
      ) {
        return;
      }
      this.advance();
    }
  }

  private parseCppProgram(): { ast: ASTNode; errors: CompilerError[] } {
    const statements: ASTNode[] = [];
    while (this.current().type !== TokenType.EOF) {
      if (this.current().type === TokenType.ILLEGAL) {
        this.advance();
        continue;
      }
      const stmt = this.parseCppStatement();
      if (stmt) statements.push(stmt);
    }
    return {
      ast: { kind: 'Program', language: 'cpp', statements, line: 1, column: 1 },
      errors: this.errors
    };
  }

  private isCppTypeStart(): boolean {
    if (CPP_TYPES.includes(this.current().type)) return true;
    if (
      this.current().type === TokenType.STD &&
      this.peek(1).type === TokenType.SCOPE &&
      this.peek(2).type === TokenType.STRING
    ) {
      return true;
    }
    return false;
  }

  private parseCppTypeName(): string {
    if (this.current().type === TokenType.STD && this.peek(1).type === TokenType.SCOPE) {
      this.advance(); // std
      this.advance(); // ::
      if (this.current().type === TokenType.STRING) {
        this.advance();
        return 'string';
      }
    }
    const tok = this.advance();
    return String(tok.value);
  }

  private parseCppStatement(): ASTNode | null {
    const tok = this.current();

    try {
      if (tok.type === TokenType.PREPROCESSOR) {
        this.advance();
        return { kind: 'Preprocessor', directive: String(tok.value), line: tok.line, column: tok.column };
      }

      if (tok.type === TokenType.USING) {
        this.advance();
        this.expect(TokenType.NAMESPACE, "Expected 'namespace' after 'using'");
        if (this.current().type === TokenType.STD || this.current().type === TokenType.IDENTIFIER) {
          const ns = String(this.advance().value);
          this.expect(TokenType.SEMICOLON, "Missing ';' after 'using namespace std'");
          return { kind: 'UsingNamespace', namespace: ns, line: tok.line, column: tok.column };
        }
        this.syncCpp();
        return null;
      }

      if (tok.type === TokenType.CONST || this.isCppTypeStart()) {
        return this.parseCppDeclOrFunc();
      }

      if (tok.type === TokenType.IF) return this.parseCppIf();
      if (tok.type === TokenType.WHILE) return this.parseCppWhile();
      if (tok.type === TokenType.FOR) return this.parseCppFor();
      if (tok.type === TokenType.COUT || (tok.type === TokenType.STD && this.peek(1).type === TokenType.SCOPE && this.peek(2).type === TokenType.COUT)) {
        return this.parseCppCout();
      }
      if (tok.type === TokenType.CIN || (tok.type === TokenType.STD && this.peek(1).type === TokenType.SCOPE && this.peek(2).type === TokenType.CIN)) {
        return this.parseCppCin();
      }
      if (tok.type === TokenType.RETURN) return this.parseCppReturn();
      if (tok.type === TokenType.LBRACE) return this.parseCppBlock();
      if (tok.type === TokenType.SEMICOLON) {
        this.advance();
        return null;
      }

      if (tok.type === TokenType.IDENTIFIER) {
        const word = String(tok.value);
        // Check misspelled C++ type or keyword like `str` instead of `string`, `whle`, `cotu`, `rturn`
        if (word === 'str' && this.peek().type === TokenType.IDENTIFIER) {
          this.errors.push({
            id: `syn-cpp-str-${tok.line}-${tok.column}`,
            phase: ErrorPhase.SYNTAX,
            message: "Unknown C++ type 'str': use 'string' (from <string>)",
            line: tok.line,
            column: tok.column,
            offendingText: 'str',
            ruleViolated: "C++ Type Grammar: String type is 'string' (or std::string)",
            explanation: "'str' is Python syntax; C++ uses 'string'.",
            suggestedFix: "Replace 'str' with 'string'",
            closestMatch: 'string'
          });
          return this.parseCppDeclOrFunc(true);
        }

        const closestKw = findClosestMatch(word, CPP_KEYWORDS, 2);
        const next = this.peek();
        if (
          closestKw &&
          ((closestKw === 'while' && next.type === TokenType.LPAREN) ||
            (closestKw === 'if' && next.type === TokenType.LPAREN) ||
            (closestKw === 'cout' && (next.type === TokenType.SHIFT_LEFT || next.type === TokenType.SHIFT_RIGHT)) ||
            (closestKw === 'cin' && (next.type === TokenType.SHIFT_RIGHT || next.type === TokenType.SHIFT_LEFT)) ||
            (closestKw === 'return' && next.type !== TokenType.ASSIGN))
        ) {
          this.errors.push({
            id: `syn-cpp-kw-${tok.line}-${tok.column}`,
            phase: ErrorPhase.SYNTAX,
            message: `Unrecognized C++ keyword '${word}'`,
            line: tok.line,
            column: tok.column,
            offendingText: word,
            ruleViolated: 'C++ Keyword Spelling Rule',
            explanation: `'${word}' is not a valid C++ keyword.`,
            suggestedFix: `Did you mean '${closestKw}'?`,
            closestMatch: closestKw
          });
          this.advance();
          if (closestKw === 'while') return this.parseCppWhileBody(tok.line, tok.column);
          if (closestKw === 'if') return this.parseCppIfBody(tok.line, tok.column);
          if (closestKw === 'cout') return this.parseCppCoutBody(tok.line, tok.column);
          if (closestKw === 'cin') return this.parseCppCinBody(tok.line, tok.column);
          if (closestKw === 'return') return this.parseCppReturnBody(tok.line, tok.column);
        }

        return this.parseCppAssignment();
      }

      this.errors.push({
        id: `syn-cpp-stmt-${tok.line}-${tok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: `Unexpected token '${tok.value || tok.type}' at start of C++ statement`,
        line: tok.line,
        column: tok.column,
        offendingText: String(tok.value),
        ruleViolated: 'C++ Grammar: Expected declaration, assignment, control flow, or I/O statement',
        explanation: `A C++ statement cannot begin with '${tok.value}'.`,
        suggestedFix: 'Check statement keyword, type specifier, or delimiters'
      });
      this.syncCpp();
      return null;
    } catch {
      this.syncCpp();
      return null;
    }
  }

  private parseCppDeclOrFunc(forcedString = false): ASTNode | null {
    const startTok = this.current();
    const isConst = this.match(TokenType.CONST);
    const varType = forcedString ? (this.advance(), 'string') : this.parseCppTypeName();

    const nameTok = this.current();
    if (nameTok.type !== TokenType.IDENTIFIER) {
      this.errors.push({
        id: `syn-cpp-declname-${nameTok.line}-${nameTok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: `Expected identifier name after C++ type '${varType}'`,
        line: nameTok.line,
        column: nameTok.column,
        offendingText: String(nameTok.value),
        ruleViolated: `C++ Grammar: ${varType} IDENTIFIER ('=' Expr)? ';'`,
        explanation: 'Variable or function declaration requires a valid identifier name.',
        suggestedFix: `Provide a variable name such as '${varType} x = 0;'`
      });
      this.syncCpp();
      return null;
    }

    this.advance();
    const name = String(nameTok.value);

    // Function definition: `int main() { ... }`
    if (this.match(TokenType.LPAREN)) {
      const params: { name: string; type: string }[] = [];
      while (this.current().type !== TokenType.RPAREN && this.current().type !== TokenType.EOF) {
        if (this.isCppTypeStart()) {
          const pType = this.parseCppTypeName();
          const pName = this.current().type === TokenType.IDENTIFIER ? String(this.advance().value) : 'arg';
          params.push({ name: pName, type: pType });
        } else {
          this.advance();
        }
        if (!this.match(TokenType.COMMA)) break;
      }
      this.expect(TokenType.RPAREN, "Expected ')' after C++ function parameter list");
      const body = this.current().type === TokenType.LBRACE ? this.parseCppBlock() : { kind: 'Block', statements: [], line: startTok.line, column: startTok.column };
      return {
        kind: 'FunctionDef',
        name,
        params,
        returnType: varType,
        body,
        line: startTok.line,
        column: startTok.column
      };
    }

    // Variable declaration: `int x = 10;` or `int x;`
    let initializer: ASTNode | null = null;
    if (this.match(TokenType.ASSIGN)) {
      initializer = this.parseCppExpression();
    }

    this.expect(
      TokenType.SEMICOLON,
      "Missing terminating semicolon ';' at end of C++ declaration",
      "C++ Grammar: Declarations must terminate with ';'",
      `Add ';' at end of line ${startTok.line}`
    );

    return {
      kind: 'VarDecl',
      name,
      varType,
      isConst,
      initializer,
      line: startTok.line,
      column: startTok.column
    };
  }

  private parseCppAssignment(): ASTNode | null {
    const idTok = this.advance();
    const name = String(idTok.value);

    if (this.current().type === TokenType.INC || this.current().type === TokenType.DEC) {
      const opTok = this.advance();
      this.expect(TokenType.SEMICOLON, "Missing ';' after increment/decrement statement");
      return {
        kind: 'Assignment',
        name,
        operator: String(opTok.value),
        valueExpr: { kind: 'Literal', literalType: 'int', value: 1, line: opTok.line, column: opTok.column },
        line: idTok.line,
        column: idTok.column
      };
    }

    if ([TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN].includes(this.current().type)) {
      const opTok = this.advance();
      const valueExpr = this.parseCppExpression();
      this.expect(
        TokenType.SEMICOLON,
        "Missing terminating semicolon ';' at end of C++ assignment",
        "C++ Grammar: Assignment statement must end with ';'",
        `Add ';' at end of line ${idTok.line}`
      );
      return {
        kind: 'Assignment',
        name,
        operator: String(opTok.value),
        valueExpr,
        line: idTok.line,
        column: idTok.column
      };
    }

    // Function call statement `foo(...);`
    if (this.match(TokenType.LPAREN)) {
      const args: ASTNode[] = [];
      if (this.current().type !== TokenType.RPAREN) {
        args.push(this.parseCppExpression());
        while (this.match(TokenType.COMMA)) args.push(this.parseCppExpression());
      }
      this.expect(TokenType.RPAREN, "Expected ')' after function arguments");
      this.expect(TokenType.SEMICOLON, "Missing ';' after function call");
      return {
        kind: 'ExprStatement',
        expression: { kind: 'CallExpr', callee: name, args, line: idTok.line, column: idTok.column },
        line: idTok.line,
        column: idTok.column
      };
    }

    this.errors.push({
      id: `syn-cpp-assign-${idTok.line}-${idTok.column}`,
      phase: ErrorPhase.SYNTAX,
      message: `Expected '=', '++', or '(' after identifier '${name}'`,
      line: this.current().line,
      column: this.current().column,
      offendingText: String(this.current().value),
      ruleViolated: "C++ Grammar: Assignment -> IDENTIFIER '=' Expr ';'",
      explanation: `Statement starting with '${name}' is missing an operator.`,
      suggestedFix: `Add '=' after '${name}' or declare its C++ type (e.g. 'int ${name} = ...;')`
    });
    this.syncCpp();
    return null;
  }

  private parseCppIf(): ASTNode {
    const tok = this.advance();
    return this.parseCppIfBody(tok.line, tok.column);
  }

  private parseCppIfBody(line: number, column: number): ASTNode {
    if (!this.match(TokenType.LPAREN)) {
      this.errors.push({
        id: `syn-cpp-if-lp-${line}-${column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing opening parenthesis '(' for C++ 'if' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "C++ Grammar: 'if' '(' Expr ')' Statement",
        explanation: 'C++ requires parentheses around all if conditions.',
        suggestedFix: "Wrap condition in parentheses: 'if (condition)'"
      });
    }
    const condition = this.parseCppExpression();
    if (!this.match(TokenType.RPAREN)) {
      this.errors.push({
        id: `syn-cpp-if-rp-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing closing parenthesis ')' after 'if' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "C++ Grammar: Condition must close with ')'",
        explanation: 'Missing right parenthesis before statement body.',
        suggestedFix: "Add ')' after condition"
      });
    }

    const thenBranch = this.parseCppStatement() || { kind: 'Block', statements: [], line, column };
    let elseBranch: ASTNode | null = null;
    if (this.match(TokenType.ELSE)) {
      elseBranch = this.parseCppStatement();
    }
    return { kind: 'IfStatement', condition, thenBranch, elseBranch, line, column };
  }

  private parseCppWhile(): ASTNode {
    const tok = this.advance();
    return this.parseCppWhileBody(tok.line, tok.column);
  }

  private parseCppWhileBody(line: number, column: number): ASTNode {
    if (!this.match(TokenType.LPAREN)) {
      this.errors.push({
        id: `syn-cpp-while-lp-${line}-${column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing opening parenthesis '(' for C++ 'while' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "C++ Grammar: 'while' '(' Expr ')' Statement",
        explanation: 'C++ while loops require parentheses around the condition.',
        suggestedFix: "Wrap condition in parentheses: 'while (condition)'"
      });
    }
    const condition = this.parseCppExpression();
    if (!this.match(TokenType.RPAREN)) {
      this.errors.push({
        id: `syn-cpp-while-rp-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing closing parenthesis ')' after 'while' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "C++ Grammar: Condition must close with ')'",
        explanation: 'Missing right parenthesis after while condition.',
        suggestedFix: "Add ')' after condition"
      });
    }
    const body = this.parseCppStatement() || { kind: 'Block', statements: [], line, column };
    return { kind: 'WhileStatement', condition, body, line, column };
  }

  private parseCppFor(): ASTNode {
    const tok = this.advance();
    this.expect(TokenType.LPAREN, "Expected '(' after 'for'");
    let init: ASTNode | null = null;
    if (this.current().type !== TokenType.SEMICOLON) {
      if (this.isCppTypeStart()) {
        init = this.parseCppDeclOrFunc();
      } else {
        init = this.parseCppAssignment();
      }
    } else {
      this.advance();
    }
    let condition: ASTNode | null = null;
    if (this.current().type !== TokenType.SEMICOLON) {
      condition = this.parseCppExpression();
    }
    this.expect(TokenType.SEMICOLON, "Expected ';' after 'for' loop condition");
    let step: ASTNode | null = null;
    if (this.current().type !== TokenType.RPAREN) {
      if (this.current().type === TokenType.IDENTIFIER && [TokenType.INC, TokenType.DEC, TokenType.ASSIGN, TokenType.PLUS_ASSIGN, TokenType.MINUS_ASSIGN].includes(this.peek().type)) {
        const idTok = this.advance();
        const opTok = this.advance();
        const valExpr =
          opTok.type === TokenType.INC || opTok.type === TokenType.DEC
            ? { kind: 'Literal', literalType: 'int', value: 1, line: opTok.line, column: opTok.column }
            : this.parseCppExpression();
        step = { kind: 'Assignment', name: String(idTok.value), operator: String(opTok.value), valueExpr: valExpr, line: idTok.line, column: idTok.column };
      } else {
        step = this.parseCppExpression();
      }
    }
    this.expect(TokenType.RPAREN, "Expected ')' after 'for' header");
    const body = this.parseCppStatement() || { kind: 'Block', statements: [], line: tok.line, column: tok.column };
    return { kind: 'ForStatement', init, condition, step, body, line: tok.line, column: tok.column };
  }

  private parseCppCout(): ASTNode {
    const tok = this.current();
    if (this.current().type === TokenType.STD) {
      this.advance();
      this.advance();
    }
    this.advance(); // cout
    return this.parseCppCoutBody(tok.line, tok.column);
  }

  private parseCppCoutBody(line: number, column: number): ASTNode {
    const expressions: ASTNode[] = [];
    if (this.current().type !== TokenType.SHIFT_LEFT) {
      if (this.current().type === TokenType.SHIFT_RIGHT) {
        this.errors.push({
          id: `syn-cpp-cout-dir-${this.current().line}-${this.current().column}`,
          phase: ErrorPhase.SYNTAX,
          message: "Wrong stream operator '>>' with 'cout': use insertion operator '<<'",
          line: this.current().line,
          column: this.current().column,
          offendingText: '>>',
          ruleViolated: "C++ Stream Grammar: cout requires '<<' (not '>>')",
          explanation: "'cout' outputs values using '<<'; '>>' is for 'cin'.",
          suggestedFix: "Replace '>>' with '<<'",
          closestMatch: '<<'
        });
        this.advance();
        expressions.push(this.parseCppExpression());
      } else {
        this.expect(TokenType.SHIFT_LEFT, "Expected '<<' after 'cout'");
      }
    }

    while (this.current().type === TokenType.SHIFT_LEFT || this.current().type === TokenType.SHIFT_RIGHT) {
      if (this.current().type === TokenType.SHIFT_RIGHT) {
        this.errors.push({
          id: `syn-cpp-cout-dir2-${this.current().line}-${this.current().column}`,
          phase: ErrorPhase.SYNTAX,
          message: "Wrong stream operator '>>' with 'cout': use '<<'",
          line: this.current().line,
          column: this.current().column,
          offendingText: '>>',
          ruleViolated: "C++ Stream Grammar: cout requires '<<'",
          explanation: "Chained output operands must use '<<'.",
          suggestedFix: "Replace '>>' with '<<'",
          closestMatch: '<<'
        });
      }
      this.advance();
      if (this.current().type === TokenType.ENDL || (this.current().type === TokenType.STD && this.peek(1).type === TokenType.SCOPE && this.peek(2).type === TokenType.ENDL)) {
        if (this.current().type === TokenType.STD) {
          this.advance();
          this.advance();
        }
        const endlTok = this.advance();
        expressions.push({ kind: 'Literal', literalType: 'string', value: '\\n', line: endlTok.line, column: endlTok.column });
      } else {
        expressions.push(this.parseCppExpression());
      }
    }

    this.expect(TokenType.SEMICOLON, "Missing terminating semicolon ';' after 'cout' statement");
    return { kind: 'PrintStatement', expressions, usedIostream: true, line, column };
  }

  private parseCppCin(): ASTNode {
    const tok = this.current();
    if (this.current().type === TokenType.STD) {
      this.advance();
      this.advance();
    }
    this.advance(); // cin
    return this.parseCppCinBody(tok.line, tok.column);
  }

  private parseCppCinBody(line: number, column: number): ASTNode {
    const targets: ASTNode[] = [];
    if (this.current().type !== TokenType.SHIFT_RIGHT) {
      if (this.current().type === TokenType.SHIFT_LEFT) {
        this.errors.push({
          id: `syn-cpp-cin-dir-${this.current().line}-${this.current().column}`,
          phase: ErrorPhase.SYNTAX,
          message: "Wrong stream operator '<<' with 'cin': use extraction operator '>>'",
          line: this.current().line,
          column: this.current().column,
          offendingText: '<<',
          ruleViolated: "C++ Stream Grammar: cin requires '>>' (not '<<')",
          explanation: "'cin' reads input into variables using '>>'.",
          suggestedFix: "Replace '<<' with '>>'",
          closestMatch: '>>'
        });
        this.advance();
        if (this.current().type === TokenType.IDENTIFIER) {
          const t = this.advance();
          targets.push({ kind: 'Identifier', name: String(t.value), line: t.line, column: t.column });
        }
      } else {
        this.expect(TokenType.SHIFT_RIGHT, "Expected '>>' after 'cin'");
      }
    }

    while (this.current().type === TokenType.SHIFT_RIGHT || this.current().type === TokenType.SHIFT_LEFT) {
      if (this.current().type === TokenType.SHIFT_LEFT) {
        this.errors.push({
          id: `syn-cpp-cin-dir2-${this.current().line}-${this.current().column}`,
          phase: ErrorPhase.SYNTAX,
          message: "Wrong stream operator '<<' with 'cin': use '>>'",
          line: this.current().line,
          column: this.current().column,
          offendingText: '<<',
          ruleViolated: "C++ Stream Grammar: cin requires '>>'",
          explanation: "Chained input variables must use '>>'.",
          suggestedFix: "Replace '<<' with '>>'",
          closestMatch: '>>'
        });
      }
      this.advance();
      if (this.current().type === TokenType.IDENTIFIER) {
        const t = this.advance();
        targets.push({ kind: 'Identifier', name: String(t.value), line: t.line, column: t.column });
      } else {
        const bad = this.current();
        this.errors.push({
          id: `syn-cpp-cin-lval-${bad.line}-${bad.column}`,
          phase: ErrorPhase.SYNTAX,
          message: `Expected variable identifier after 'cin >>', found '${bad.value}'`,
          line: bad.line,
          column: bad.column,
          offendingText: String(bad.value),
          ruleViolated: 'C++ Grammar: cin >> target must be an assignable variable identifier',
          explanation: 'Cannot read input into a literal or non-variable token.',
          suggestedFix: 'Provide a declared variable name after >>'
        });
        this.advance();
      }
    }

    this.expect(TokenType.SEMICOLON, "Missing terminating semicolon ';' after 'cin' statement");
    return { kind: 'InputStatement', targets, usedIostream: true, line, column };
  }

  private parseCppReturn(): ASTNode {
    const tok = this.advance();
    return this.parseCppReturnBody(tok.line, tok.column);
  }

  private parseCppReturnBody(line: number, column: number): ASTNode {
    let expression: ASTNode | null = null;
    if (this.current().type !== TokenType.SEMICOLON) {
      expression = this.parseCppExpression();
    }
    this.expect(TokenType.SEMICOLON, "Missing terminating semicolon ';' after 'return'");
    return { kind: 'ReturnStatement', expression, line, column };
  }

  private parseCppBlock(): ASTNode {
    const braceTok = this.advance();
    const statements: ASTNode[] = [];
    while (this.current().type !== TokenType.RBRACE && this.current().type !== TokenType.EOF) {
      const s = this.parseCppStatement();
      if (s) statements.push(s);
    }
    if (!this.match(TokenType.RBRACE)) {
      this.errors.push({
        id: `syn-cpp-rbrace-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Unclosed C++ block: missing closing brace '}'",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "C++ Grammar: Block -> '{' Statement* '}'",
        explanation: 'Reached end of input without matching closing brace.',
        suggestedFix: "Add '}' to close block"
      });
    }
    return { kind: 'Block', statements, line: braceTok.line, column: braceTok.column };
  }

  private parseCppExpression(): ASTNode {
    return this.parseCppLogicalOr();
  }

  private parseCppLogicalOr(): ASTNode {
    let expr = this.parseCppLogicalAnd();
    while (this.match(TokenType.OR)) {
      const right = this.parseCppLogicalAnd();
      expr = { kind: 'BinaryOp', operator: '||', left: expr, right, line: expr.line, column: expr.column };
    }
    return expr;
  }

  private parseCppLogicalAnd(): ASTNode {
    let expr = this.parseCppEquality();
    while (this.match(TokenType.AND)) {
      const right = this.parseCppEquality();
      expr = { kind: 'BinaryOp', operator: '&&', left: expr, right, line: expr.line, column: expr.column };
    }
    return expr;
  }

  private parseCppEquality(): ASTNode {
    let expr = this.parseCppRelational();
    while (this.current().type === TokenType.EQ || this.current().type === TokenType.NEQ) {
      const opTok = this.advance();
      const right = this.parseCppRelational();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseCppRelational(): ASTNode {
    let expr = this.parseCppAdditive();
    while ([TokenType.LT, TokenType.LTE, TokenType.GT, TokenType.GTE].includes(this.current().type)) {
      const opTok = this.advance();
      const right = this.parseCppAdditive();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseCppAdditive(): ASTNode {
    let expr = this.parseCppMultiplicative();
    while (this.current().type === TokenType.PLUS || this.current().type === TokenType.MINUS) {
      const opTok = this.advance();
      const right = this.parseCppMultiplicative();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseCppMultiplicative(): ASTNode {
    let expr = this.parseCppUnary();
    while ([TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO].includes(this.current().type)) {
      const opTok = this.advance();
      const right = this.parseCppUnary();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseCppUnary(): ASTNode {
    if (this.current().type === TokenType.MINUS || this.current().type === TokenType.NOT) {
      const opTok = this.advance();
      const operand = this.parseCppUnary();
      return { kind: 'UnaryOp', operator: opTok.value, operand, line: opTok.line, column: opTok.column };
    }
    return this.parseCppPrimary();
  }

  private parseCppPrimary(): ASTNode {
    const tok = this.current();
    if (tok.type === TokenType.INT_LITERAL) {
      this.advance();
      return { kind: 'Literal', literalType: 'int', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.FLOAT_LITERAL) {
      this.advance();
      return { kind: 'Literal', literalType: 'float', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.STRING_LITERAL) {
      this.advance();
      return { kind: 'Literal', literalType: 'string', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.CHAR_LITERAL) {
      this.advance();
      return { kind: 'Literal', literalType: 'char', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.TRUE || tok.type === TokenType.FALSE) {
      this.advance();
      return { kind: 'Literal', literalType: 'bool', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      const name = String(tok.value);
      if (this.match(TokenType.LPAREN)) {
        const args: ASTNode[] = [];
        if (this.current().type !== TokenType.RPAREN) {
          args.push(this.parseCppExpression());
          while (this.match(TokenType.COMMA)) args.push(this.parseCppExpression());
        }
        this.expect(TokenType.RPAREN, `Missing closing ')' in call to '${name}(...)'`);
        return { kind: 'CallExpr', callee: name, args, line: tok.line, column: tok.column };
      }
      return { kind: 'Identifier', name, line: tok.line, column: tok.column };
    }
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseCppExpression();
      this.expect(TokenType.RPAREN, "Missing closing ')' in grouped expression");
      return expr;
    }

    this.errors.push({
      id: `syn-cpp-expr-${tok.line}-${tok.column}`,
      phase: ErrorPhase.SYNTAX,
      message: `Expected C++ expression operand, found '${tok.value || tok.type}'`,
      line: tok.line,
      column: tok.column,
      offendingText: String(tok.value),
      ruleViolated: 'C++ Expression Grammar: Expected literal, identifier, or sub-expression',
      explanation: 'Encountered unexpected token where an operand was required.',
      suggestedFix: 'Provide a valid literal value or variable name'
    });
    this.advance();
    return { kind: 'Literal', literalType: 'int', value: 0, line: tok.line, column: tok.column };
  }
}
