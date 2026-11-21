import { CompilerError, ErrorPhase, Token, TokenType } from './types';

const KEYWORDS: Record<string, TokenType> = {
  var: TokenType.VAR,
  int: TokenType.INT,
  float: TokenType.FLOAT,
  string: TokenType.STRING,
  bool: TokenType.BOOL,
  if: TokenType.IF,
  else: TokenType.ELSE,
  while: TokenType.WHILE,
  print: TokenType.PRINT,
  true: TokenType.TRUE,
  false: TokenType.FALSE
};

export class Lexer {
  private source: string;
  private length: number;
  private pos = 0;
  private line = 1;
  private column = 1;
  public errors: CompilerError[] = [];

  constructor(source: string) {
    this.source = source;
    this.length = source.length;
  }

  private current(): string | null {
    if (this.pos >= this.length) return null;
    return this.source[this.pos];
  }

  private peek(offset = 1): string | null {
    const p = this.pos + offset;
    if (p >= this.length) return null;
    return this.source[p];
  }

  private advance(): string | null {
    const ch = this.current();
    this.pos++;
    if (ch === '\n') {
      this.line++;
      this.column = 1;
    } else {
      this.column++;
    }
    return ch;
  }

  private skipWhitespaceAndComments() {
    while (this.current() !== null) {
      const ch = this.current();
      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
      } else if (ch === '/' && this.peek() === '/') {
        // Single-line comment
        while (this.current() !== null && this.current() !== '\n') {
          this.advance();
        }
      } else if (ch === '/' && this.peek() === '*') {
        // Block comment
        const startLine = this.line;
        const startCol = this.column;
        this.advance(); // /
        this.advance(); // *
        let closed = false;
        while (this.current() !== null) {
          if (this.current() === '*' && this.peek() === '/') {
            this.advance();
            this.advance();
            closed = true;
            break;
          }
          this.advance();
        }
        if (!closed) {
          this.errors.push({
            id: `lex-comment-${startLine}-${startCol}`,
            phase: ErrorPhase.LEXICAL,
            message: "Unterminated block comment '/*'",
            line: startLine,
            column: startCol,
            offendingText: '/*',
            ruleViolated: "Grammar Lexical Rule: Block comment must terminate with '*/'",
            explanation: "Input ended before block comment was closed.",
            suggestedFix: "Close comment with '*/'"
          });
        }
      } else {
        break;
      }
    }
  }

  private readString(): Token {
    const quoteChar = this.advance()!;
    const startLine = this.line;
    const startCol = this.column - 1;
    const chars: string[] = [];

    while (this.current() !== null && this.current() !== quoteChar) {
      if (this.current() === '\n') {
        this.errors.push({
          id: `lex-str-${startLine}-${startCol}`,
          phase: ErrorPhase.LEXICAL,
          message: `Unterminated string literal: missing closing ${quoteChar}`,
          line: startLine,
          column: startCol,
          offendingText: quoteChar + chars.join(''),
          ruleViolated: 'Lexical Rule: String literals cannot span newlines without escape',
          explanation: `String literal opened with ${quoteChar} but line broke before closing quotation mark.`,
          suggestedFix: `Add closing ${quoteChar} before the newline`
        });
        return {
          type: TokenType.STRING_LITERAL,
          value: chars.join(''),
          line: startLine,
          column: startCol
        };
      }

      if (this.current() === '\\') {
        this.advance();
        const esc = this.current();
        if (esc === 'n') chars.push('\n');
        else if (esc === 't') chars.push('\t');
        else if (esc === '\\') chars.push('\\');
        else if (esc === quoteChar) chars.push(quoteChar);
        else chars.push(esc || '');
        this.advance();
      } else {
        chars.push(this.advance()!);
      }
    }

    if (this.current() === quoteChar) {
      this.advance(); // consume closing quote
      return {
        type: TokenType.STRING_LITERAL,
        value: chars.join(''),
        line: startLine,
        column: startCol
      };
    } else {
      this.errors.push({
        id: `lex-str-eof-${startLine}-${startCol}`,
        phase: ErrorPhase.LEXICAL,
        message: 'Unterminated string literal at end of input',
        line: startLine,
        column: startCol,
        offendingText: quoteChar + chars.join(''),
        ruleViolated: 'Lexical Rule: String literal must be terminated with matching quotation mark',
        explanation: 'Reached end of code without finding matching closing quote.',
        suggestedFix: `Add closing ${quoteChar} at the end of the string`
      });
      return {
        type: TokenType.STRING_LITERAL,
        value: chars.join(''),
        line: startLine,
        column: startCol
      };
    }
  }

  private readNumber(): Token {
    const startLine = this.line;
    const startCol = this.column;
    let numStr = '';
    let hasDot = false;

    while (this.current() !== null && (/\d/.test(this.current()!) || this.current() === '.')) {
      if (this.current() === '.') {
        if (hasDot) {
          this.errors.push({
            id: `lex-num-${this.line}-${this.column}`,
            phase: ErrorPhase.LEXICAL,
            message: 'Malformed number literal: multiple decimal points',
            line: this.line,
            column: this.column,
            offendingText: numStr + this.current(),
            ruleViolated: "Lexical Numeric Grammar: Real literals contain at most one '.'",
            explanation: 'A floating point number cannot possess more than one decimal separator.',
            suggestedFix: 'Remove the redundant decimal point'
          });
          // Consume trailing digits/dots of the malformed number to prevent cascading syntax errors
          while (this.current() !== null && (/\d/.test(this.current()!) || this.current() === '.')) {
            this.advance();
          }
          break;
        }
        hasDot = true;
      }
      numStr += this.advance();
    }

    // Check for bad identifiers starting with digit: 123abc
    if (this.current() !== null && /[a-zA-Z_]/.test(this.current()!)) {
      let suffix = '';
      while (this.current() !== null && /[a-zA-Z0-9_]/.test(this.current()!)) {
        suffix += this.advance();
      }
      const fullBad = numStr + suffix;
      this.errors.push({
        id: `lex-ident-${startLine}-${startCol}`,
        phase: ErrorPhase.LEXICAL,
        message: `Invalid identifier name '${fullBad}': cannot start with digit`,
        line: startLine,
        column: startCol,
        offendingText: fullBad,
        ruleViolated: 'Lexical Rule: [a-zA-Z_][a-zA-Z0-9_]* cannot begin with digits',
        explanation: 'Variable names must begin with a letter or an underscore.',
        suggestedFix: `Rename to '_${fullBad}' or '${suffix}${numStr}'`
      });
      return {
        type: TokenType.ILLEGAL,
        value: fullBad,
        line: startLine,
        column: startCol
      };
    }

    if (hasDot) {
      return {
        type: TokenType.FLOAT_LITERAL,
        value: parseFloat(numStr),
        line: startLine,
        column: startCol
      };
    }
    return {
      type: TokenType.INT_LITERAL,
      value: parseInt(numStr, 10),
      line: startLine,
      column: startCol
    };
  }

  private readIdentifierOrKeyword(): Token {
    const startLine = this.line;
    const startCol = this.column;
    let ident = '';

    while (this.current() !== null && /[a-zA-Z0-9_]/.test(this.current()!)) {
      ident += this.advance();
    }

    const type = KEYWORDS[ident] || TokenType.IDENTIFIER;
    let value: string | boolean = ident;
    if (type === TokenType.TRUE) value = true;
    if (type === TokenType.FALSE) value = false;

    return {
      type,
      value,
      line: startLine,
      column: startCol
    };
  }

  public tokenize(): { tokens: Token[]; errors: CompilerError[] } {
    const tokens: Token[] = [];

    while (this.current() !== null) {
      this.skipWhitespaceAndComments();
      if (this.current() === null) break;

      const ch = this.current()!;
      const line = this.line;
      const col = this.column;

      if (ch === '"' || ch === "'") {
        tokens.push(this.readString());
        continue;
      }

      if (/\d/.test(ch)) {
        tokens.push(this.readNumber());
        continue;
      }

      if (/[a-zA-Z_]/.test(ch)) {
        tokens.push(this.readIdentifierOrKeyword());
        continue;
      }

      // Multi-character operators
      const two = ch + (this.peek() || '');
      if (two === '==') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.EQ, value: '==', line, column: col });
      } else if (two === '!=') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.NEQ, value: '!=', line, column: col });
      } else if (two === '<=') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.LTE, value: '<=', line, column: col });
      } else if (two === '>=') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.GTE, value: '>=', line, column: col });
      } else if (two === '&&') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.AND, value: '&&', line, column: col });
      } else if (two === '||') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.OR, value: '||', line, column: col });
      } else if (ch === '=') {
        this.advance();
        tokens.push({ type: TokenType.ASSIGN, value: '=', line, column: col });
      } else if (ch === '+') {
        this.advance();
        tokens.push({ type: TokenType.PLUS, value: '+', line, column: col });
      } else if (ch === '-') {
        this.advance();
        tokens.push({ type: TokenType.MINUS, value: '-', line, column: col });
      } else if (ch === '*') {
        this.advance();
        tokens.push({ type: TokenType.MULTIPLY, value: '*', line, column: col });
      } else if (ch === '/') {
        this.advance();
        tokens.push({ type: TokenType.DIVIDE, value: '/', line, column: col });
      } else if (ch === '%') {
        this.advance();
        tokens.push({ type: TokenType.MODULO, value: '%', line, column: col });
      } else if (ch === '<') {
        this.advance();
        tokens.push({ type: TokenType.LT, value: '<', line, column: col });
      } else if (ch === '>') {
        this.advance();
        tokens.push({ type: TokenType.GT, value: '>', line, column: col });
      } else if (ch === '!') {
        this.advance();
        tokens.push({ type: TokenType.NOT, value: '!', line, column: col });
      } else if (ch === ';') {
        this.advance();
        tokens.push({ type: TokenType.SEMICOLON, value: ';', line, column: col });
      } else if (ch === ':') {
        this.advance();
        tokens.push({ type: TokenType.COLON, value: ':', line, column: col });
      } else if (ch === ',') {
        this.advance();
        tokens.push({ type: TokenType.COMMA, value: ',', line, column: col });
      } else if (ch === '(') {
        this.advance();
        tokens.push({ type: TokenType.LPAREN, value: '(', line, column: col });
      } else if (ch === ')') {
        this.advance();
        tokens.push({ type: TokenType.RPAREN, value: ')', line, column: col });
      } else if (ch === '{') {
        this.advance();
        tokens.push({ type: TokenType.LBRACE, value: '{', line, column: col });
      } else if (ch === '}') {
        this.advance();
        tokens.push({ type: TokenType.RBRACE, value: '}', line, column: col });
      } else {
        const badChar = this.advance()!;
        let fix = `Remove illegal character '${badChar}'`;
        if (badChar === '@') fix = "Remove '@' symbol (not in SimpleLang alphabet)";
        else if (badChar === '$') fix = "Remove '$' symbol";
        else if (badChar === '#') fix = "Replace '#' with '//' for comments";

        this.errors.push({
          id: `lex-illegal-${line}-${col}`,
          phase: ErrorPhase.LEXICAL,
          message: `Illegal character '${badChar}' (ASCII ${badChar.charCodeAt(0)}) not recognized in alphabet Σ`,
          line,
          column: col,
          offendingText: badChar,
          ruleViolated: 'Alphabet Constraint: Character not in formal language alphabet Σ',
          explanation: `The symbol '${badChar}' is not a valid operator, delimiter, or identifier symbol.`,
          suggestedFix: fix
        });
        tokens.push({ type: TokenType.ILLEGAL, value: badChar, line, column: col });
      }
    }

    tokens.push({ type: TokenType.EOF, value: '', line: this.line, column: this.column });
    return { tokens, errors: this.errors };
  }
}
