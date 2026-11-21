import { ASTNode, CompilerError, ErrorPhase, Token, TokenType } from './types';
import { findClosestMatch } from './levenshtein';

const KEYWORD_NAMES = ['var', 'int', 'float', 'string', 'bool', 'if', 'else', 'while', 'print', 'true', 'false'];

export class Parser {
  private tokens: Token[];
  private pos = 0;
  public errors: CompilerError[] = [];

  constructor(tokens: Token[]) {
    this.tokens = tokens;
  }

  private current(): Token {
    if (this.pos >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[this.pos];
  }

  private peek(): Token {
    if (this.pos + 1 >= this.tokens.length) return this.tokens[this.tokens.length - 1];
    return this.tokens[this.pos + 1];
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
        smartFix = `Add missing semicolon ';' at line ${tok.line}, column ${tok.column}`;
      } else if (expectedType === TokenType.RPAREN) {
        smartFix = `Add closing parenthesis ')' before '${tok.value}'`;
      } else if (expectedType === TokenType.LPAREN) {
        smartFix = `Add opening parenthesis '('`;
      } else if (expectedType === TokenType.RBRACE) {
        smartFix = `Add closing brace '}' at end of block`;
      } else {
        smartFix = `Insert '${expectedType}' here`;
      }
    }

    this.errors.push({
      id: `syn-expect-${tok.line}-${tok.column}-${expectedType}`,
      phase: ErrorPhase.SYNTAX,
      message: `${errorMsg} (found '${tok.value}' [${tok.type}])`,
      line: tok.line,
      column: tok.column,
      offendingText: String(tok.value),
      ruleViolated: rule || `Grammar Rule: Expected token '${expectedType}'`,
      explanation: `Grammar production rule requires '${expectedType}' at this position.`,
      suggestedFix: smartFix
    });
    return null;
  }

  private synchronize() {
    this.advance();
    while (this.current().type !== TokenType.EOF) {
      if (this.tokens[this.pos - 1]?.type === TokenType.SEMICOLON) return;
      if (
        [
          TokenType.VAR,
          TokenType.IF,
          TokenType.WHILE,
          TokenType.PRINT,
          TokenType.RBRACE,
          TokenType.LBRACE
        ].includes(this.current().type)
      ) {
        return;
      }
      this.advance();
    }
  }

  public parse(): { ast: ASTNode; errors: CompilerError[] } {
    const statements: ASTNode[] = [];
    while (this.current().type !== TokenType.EOF) {
      if (this.current().type === TokenType.ILLEGAL) {
        this.advance();
        continue;
      }
      const stmt = this.parseStatement();
      if (stmt) statements.push(stmt);
    }
    return {
      ast: { kind: 'Program', statements, line: 1, column: 1 },
      errors: this.errors
    };
  }

  private parseStatement(): ASTNode | null {
    const tok = this.current();

    try {
      if (tok.type === TokenType.VAR) return this.parseVarDeclaration();
      if (tok.type === TokenType.IF) return this.parseIfStatement();
      if (tok.type === TokenType.WHILE) return this.parseWhileStatement();
      if (tok.type === TokenType.PRINT) return this.parsePrintStatement();
      if (tok.type === TokenType.LBRACE) return this.parseBlock();
      if (tok.type === TokenType.SEMICOLON) {
        this.advance();
        return null;
      }
      if (tok.type === TokenType.IDENTIFIER) {
        // Check if this identifier is a misspelled keyword like `whle` or `prnt`
        const word = String(tok.value);
        const closestKw = findClosestMatch(word, KEYWORD_NAMES, 2);
        const next = this.peek();

        if (closestKw && ['while', 'if', 'print'].includes(closestKw) && next.type === TokenType.LPAREN) {
          this.errors.push({
            id: `syn-kw-${tok.line}-${tok.column}`,
            phase: ErrorPhase.SYNTAX,
            message: `Unrecognized keyword '${tok.value}'`,
            line: tok.line,
            column: tok.column,
            offendingText: word,
            ruleViolated: 'Grammar: Control flow keyword spelling',
            explanation: `'${tok.value}' is not a valid language statement keyword.`,
            suggestedFix: `Did you mean '${closestKw}'?`,
            closestMatch: closestKw
          });
          this.advance();
          if (closestKw === 'while') return this.parseWhileBody(tok.line, tok.column);
          if (closestKw === 'if') return this.parseIfBody(tok.line, tok.column);
          if (closestKw === 'print') return this.parsePrintBody(tok.line, tok.column);
        }

        return this.parseAssignment();
      }

      this.errors.push({
        id: `syn-bad-stmt-${tok.line}-${tok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: `Unexpected token '${tok.value}' at beginning of statement`,
        line: tok.line,
        column: tok.column,
        offendingText: String(tok.value),
        ruleViolated: 'Grammar: Statement -> VarDecl | Assignment | IfStmt | WhileStmt | PrintStmt | Block',
        explanation: `A statement cannot begin with '${tok.value}'.`,
        suggestedFix: 'Check keyword or syntax structure.'
      });
      this.synchronize();
      return null;
    } catch {
      this.synchronize();
      return null;
    }
  }

  private parseVarDeclaration(): ASTNode | null {
    const varTok = this.advance();
    const nameTok = this.current();

    if (nameTok.type !== TokenType.IDENTIFIER) {
      this.errors.push({
        id: `syn-var-name-${nameTok.line}-${nameTok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Expected identifier name after 'var'",
        line: nameTok.line,
        column: nameTok.column,
        offendingText: String(nameTok.value),
        ruleViolated: "Grammar: VarDecl -> 'var' IDENTIFIER (':' Type)? ('=' Expr)? ';'",
        explanation: 'A variable declaration must supply a valid identifier name.',
        suggestedFix: "Provide a variable name like 'var x: int = 0;'"
      });
      this.synchronize();
      return null;
    }
    this.advance();
    const name = String(nameTok.value);

    let varType: string | null = null;
    if (this.match(TokenType.COLON)) {
      const typeTok = this.current();
      if ([TokenType.INT, TokenType.FLOAT, TokenType.STRING, TokenType.BOOL].includes(typeTok.type)) {
        varType = String(typeTok.value);
        this.advance();
      } else {
        const closestT = findClosestMatch(String(typeTok.value), ['int', 'float', 'string', 'bool'], 2);
        this.errors.push({
          id: `syn-var-type-${typeTok.line}-${typeTok.column}`,
          phase: ErrorPhase.SYNTAX,
          message: `Expected type specifier after ':', found '${typeTok.value}'`,
          line: typeTok.line,
          column: typeTok.column,
          offendingText: String(typeTok.value),
          ruleViolated: "Grammar: Type -> 'int' | 'float' | 'string' | 'bool'",
          explanation: 'Only primitive types (int, float, string, bool) are valid in SimpleLang.',
          suggestedFix: closestT ? `Did you mean '${closestT}'?` : 'Specify int, float, string, or bool',
          closestMatch: closestT || undefined
        });
        this.advance();
      }
    }

    let initializer: ASTNode | null = null;
    if (this.match(TokenType.ASSIGN)) {
      initializer = this.parseExpression();
    }

    this.expect(
      TokenType.SEMICOLON,
      "Missing terminating semicolon ';' at end of variable declaration",
      "Grammar: Declaration statement must end with ';'",
      `Add semicolon ';' at end of line ${varTok.line}`
    );

    return {
      kind: 'VarDecl',
      name,
      varType,
      initializer,
      line: varTok.line,
      column: varTok.column
    };
  }

  private parseAssignment(): ASTNode | null {
    const idTok = this.advance();
    if (!this.match(TokenType.ASSIGN)) {
      this.errors.push({
        id: `syn-assign-${idTok.line}-${idTok.column}`,
        phase: ErrorPhase.SYNTAX,
        message: `Expected '=' assignment operator after identifier '${idTok.value}'`,
        line: this.current().line,
        column: this.current().column,
        offendingText: String(this.current().value),
        ruleViolated: "Grammar: Assignment -> IDENTIFIER '=' Expression ';'",
        explanation: 'An identifier statement must be an assignment containing an = operator.',
        suggestedFix: `Add '=' after '${idTok.value}' to assign a value`
      });
      this.synchronize();
      return null;
    }

    const valueExpr = this.parseExpression();
    this.expect(
      TokenType.SEMICOLON,
      "Missing terminating semicolon ';' at end of assignment",
      "Grammar: Assignment statement must end with ';'",
      `Add ';' at end of line ${idTok.line}`
    );

    return {
      kind: 'Assignment',
      name: String(idTok.value),
      valueExpr,
      line: idTok.line,
      column: idTok.column
    };
  }

  private parseIfStatement(): ASTNode | null {
    const ifTok = this.advance();
    return this.parseIfBody(ifTok.line, ifTok.column);
  }

  private parseIfBody(line: number, column: number): ASTNode | null {
    if (!this.match(TokenType.LPAREN)) {
      this.errors.push({
        id: `syn-if-paren-${line}-${column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing opening parenthesis '(' for 'if' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "Grammar: IfStmt -> 'if' '(' Expr ')' Statement ('else' Statement)?",
        explanation: 'Conditions in SimpleLang must be enclosed inside parentheses.',
        suggestedFix: "Wrap condition in parentheses: 'if (condition)'"
      });
    }

    const condition = this.parseExpression();

    if (!this.match(TokenType.RPAREN)) {
      this.errors.push({
        id: `syn-if-rparen-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing closing parenthesis ')' after 'if' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: 'Grammar: Unclosed condition parenthesis',
        explanation: 'Encountered body statement before condition was closed with ).',
        suggestedFix: "Add ')' after condition expression"
      });
    }

    const thenBranch = this.parseStatement() || { kind: 'Block', statements: [], line, column };
    let elseBranch: ASTNode | null = null;
    if (this.match(TokenType.ELSE)) {
      elseBranch = this.parseStatement();
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

  private parseWhileStatement(): ASTNode | null {
    const whileTok = this.advance();
    return this.parseWhileBody(whileTok.line, whileTok.column);
  }

  private parseWhileBody(line: number, column: number): ASTNode | null {
    if (!this.match(TokenType.LPAREN)) {
      this.errors.push({
        id: `syn-while-paren-${line}-${column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing opening parenthesis '(' for 'while' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "Grammar: WhileStmt -> 'while' '(' Expr ')' Statement",
        explanation: 'While loop condition must be enclosed in parentheses.',
        suggestedFix: "Wrap condition in parentheses: 'while (condition)'"
      });
    }

    const condition = this.parseExpression();

    if (!this.match(TokenType.RPAREN)) {
      this.errors.push({
        id: `syn-while-rparen-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Missing closing parenthesis ')' after 'while' condition",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: 'Grammar: Unclosed while condition parenthesis',
        explanation: 'Condition expression must terminate with ).',
        suggestedFix: "Add ')' after condition expression"
      });
    }

    const body = this.parseStatement() || { kind: 'Block', statements: [], line, column };

    return {
      kind: 'WhileStatement',
      condition,
      body,
      line,
      column
    };
  }

  private parsePrintStatement(): ASTNode | null {
    const printTok = this.advance();
    return this.parsePrintBody(printTok.line, printTok.column);
  }

  private parsePrintBody(line: number, column: number): ASTNode | null {
    this.expect(TokenType.LPAREN, "Expected '(' after 'print'", '', "Add '(' before print argument");
    const expression = this.parseExpression();
    this.expect(TokenType.RPAREN, "Expected ')' after print expression", '', "Add ')' to close print argument");
    this.expect(TokenType.SEMICOLON, "Missing ';' after print statement", '', "Add ';' at end of statement");

    return {
      kind: 'PrintStatement',
      expression,
      line,
      column
    };
  }

  private parseBlock(): ASTNode {
    const braceTok = this.advance();
    const statements: ASTNode[] = [];

    while (this.current().type !== TokenType.RBRACE && this.current().type !== TokenType.EOF) {
      const s = this.parseStatement();
      if (s) statements.push(s);
    }

    if (!this.match(TokenType.RBRACE)) {
      this.errors.push({
        id: `syn-block-brace-${this.current().line}-${this.current().column}`,
        phase: ErrorPhase.SYNTAX,
        message: "Unclosed block: missing closing brace '}'",
        line: this.current().line,
        column: this.current().column,
        ruleViolated: "Grammar: Block -> '{' Statement* '}'",
        explanation: 'Reached end of file without closing opened block brace.',
        suggestedFix: "Add '}' to close block"
      });
    }

    return {
      kind: 'Block',
      statements,
      line: braceTok.line,
      column: braceTok.column
    };
  }

  // Precedence Climbing Expressions
  private parseExpression(): ASTNode {
    return this.parseLogicalOr();
  }

  private parseLogicalOr(): ASTNode {
    let expr = this.parseLogicalAnd();
    while (this.match(TokenType.OR)) {
      const op = '||';
      const right = this.parseLogicalAnd();
      expr = { kind: 'BinaryOp', operator: op, left: expr, right, line: expr.line, column: expr.column };
    }
    return expr;
  }

  private parseLogicalAnd(): ASTNode {
    let expr = this.parseEquality();
    while (this.match(TokenType.AND)) {
      const op = '&&';
      const right = this.parseEquality();
      expr = { kind: 'BinaryOp', operator: op, left: expr, right, line: expr.line, column: expr.column };
    }
    return expr;
  }

  private parseEquality(): ASTNode {
    let expr = this.parseRelational();
    while (this.current().type === TokenType.EQ || this.current().type === TokenType.NEQ) {
      const opTok = this.advance();
      const right = this.parseRelational();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseRelational(): ASTNode {
    let expr = this.parseAdditive();
    while ([TokenType.LT, TokenType.LTE, TokenType.GT, TokenType.GTE].includes(this.current().type)) {
      const opTok = this.advance();
      const right = this.parseAdditive();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseAdditive(): ASTNode {
    let expr = this.parseMultiplicative();
    while (this.current().type === TokenType.PLUS || this.current().type === TokenType.MINUS) {
      const opTok = this.advance();
      const right = this.parseMultiplicative();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseMultiplicative(): ASTNode {
    let expr = this.parseUnary();
    while ([TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO].includes(this.current().type)) {
      const opTok = this.advance();
      const right = this.parseUnary();
      expr = { kind: 'BinaryOp', operator: opTok.value, left: expr, right, line: opTok.line, column: opTok.column };
    }
    return expr;
  }

  private parseUnary(): ASTNode {
    if (this.current().type === TokenType.MINUS || this.current().type === TokenType.NOT) {
      const opTok = this.advance();
      const operand = this.parseUnary();
      return { kind: 'UnaryOp', operator: opTok.value, operand, line: opTok.line, column: opTok.column };
    }
    return this.parsePrimary();
  }

  private parsePrimary(): ASTNode {
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
    if (tok.type === TokenType.TRUE || tok.type === TokenType.FALSE) {
      this.advance();
      return { kind: 'Literal', literalType: 'bool', value: tok.value, line: tok.line, column: tok.column };
    }
    if (tok.type === TokenType.IDENTIFIER) {
      this.advance();
      return { kind: 'Identifier', name: String(tok.value), line: tok.line, column: tok.column };
    }
    if (this.match(TokenType.LPAREN)) {
      const expr = this.parseExpression();
      if (!this.match(TokenType.RPAREN)) {
        this.errors.push({
          id: `syn-expr-paren-${this.current().line}-${this.current().column}`,
          phase: ErrorPhase.SYNTAX,
          message: "Missing closing parenthesis ')' in expression",
          line: this.current().line,
          column: this.current().column,
          ruleViolated: "Grammar: Primary -> '(' Expr ')'",
          explanation: 'Grouped sub-expression must be terminated by a right parenthesis.',
          suggestedFix: "Add ')' to close grouped expression"
        });
      }
      return expr;
    }

    // Dangling operand or invalid expression
    this.errors.push({
      id: `syn-expr-dangling-${tok.line}-${tok.column}`,
      phase: ErrorPhase.SYNTAX,
      message: `Expected expression operand, found '${tok.value}' [${tok.type}]`,
      line: tok.line,
      column: tok.column,
      offendingText: String(tok.value),
      ruleViolated: 'Grammar: Expression must evaluate to a valid value',
      explanation: 'Encountered an operator or symbol where a numeric, string, or identifier operand was required.',
      suggestedFix: 'Provide a literal value or variable identifier'
    });
    this.advance();
    return { kind: 'Literal', literalType: 'int', value: 0, line: tok.line, column: tok.column };
  }
}
