import { CompilerError, ErrorPhase, TargetLanguage, Token, TokenType } from './types';

const PYTHON_KEYWORDS: Record<string, TokenType> = {
  def: TokenType.DEF,
  return: TokenType.RETURN,
  if: TokenType.IF,
  elif: TokenType.ELIF,
  else: TokenType.ELSE,
  while: TokenType.WHILE,
  for: TokenType.FOR,
  in: TokenType.IN,
  print: TokenType.PRINT,
  input: TokenType.INPUT,
  int: TokenType.INT,
  float: TokenType.FLOAT,
  str: TokenType.STR,
  bool: TokenType.BOOL,
  True: TokenType.TRUE,
  False: TokenType.FALSE,
  None: TokenType.NONE,
  and: TokenType.AND,
  or: TokenType.OR,
  not: TokenType.NOT
};

const CPP_KEYWORDS: Record<string, TokenType> = {
  int: TokenType.INT,
  float: TokenType.FLOAT,
  double: TokenType.DOUBLE,
  string: TokenType.STRING,
  char: TokenType.CHAR,
  bool: TokenType.BOOL,
  void: TokenType.VOID,
  const: TokenType.CONST,
  if: TokenType.IF,
  else: TokenType.ELSE,
  while: TokenType.WHILE,
  for: TokenType.FOR,
  return: TokenType.RETURN,
  using: TokenType.USING,
  namespace: TokenType.NAMESPACE,
  std: TokenType.STD,
  cout: TokenType.COUT,
  cin: TokenType.CIN,
  endl: TokenType.ENDL,
  true: TokenType.TRUE,
  false: TokenType.FALSE
};

export class Lexer {
  private source: string;
  private language: TargetLanguage;
  private length: number;
  private pos = 0;
  private line = 1;
  private column = 1;
  public errors: CompilerError[] = [];

  constructor(source: string, language: TargetLanguage = 'python') {
    this.source = source;
    this.language = language;
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

  private readString(quoteChar: string): Token {
    const startLine = this.line;
    const startCol = this.column;
    this.advance(); // consume opening quote
    const chars: string[] = [];

    while (this.current() !== null && this.current() !== quoteChar) {
      if (this.current() === '\n') {
        this.errors.push({
          id: `lex-str-${startLine}-${startCol}`,
          phase: ErrorPhase.LEXICAL,
          message: `Unterminated ${quoteChar === "'" && this.language === 'cpp' ? 'char' : 'string'} literal: missing closing ${quoteChar}`,
          line: startLine,
          column: startCol,
          offendingText: quoteChar + chars.join(''),
          ruleViolated: 'Lexical Rule: String/char literals cannot span lines without closing quote',
          explanation: `Literal opened with ${quoteChar} reached end of line before closing quotation mark.`,
          suggestedFix: `Add closing ${quoteChar} before end of line`
        });
        return {
          type:
            quoteChar === "'" && this.language === 'cpp'
              ? TokenType.CHAR_LITERAL
              : TokenType.STRING_LITERAL,
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
      this.advance();
      if (quoteChar === "'" && this.language === 'cpp' && chars.length > 1) {
        this.errors.push({
          id: `lex-char-len-${startLine}-${startCol}`,
          phase: ErrorPhase.LEXICAL,
          message: `Multi-character char literal '${chars.join('')}' in C++`,
          line: startLine,
          column: startCol,
          offendingText: `'${chars.join('')}'`,
          ruleViolated: "C++ Lexical Rule: Single quotes '' represent a single char; use \"\" for strings",
          explanation: 'In C++, string literals must use double quotes ("...") instead of single quotes.',
          suggestedFix: `Replace single quotes with double quotes: "${chars.join('')}"`
        });
      }
      return {
        type:
          quoteChar === "'" && this.language === 'cpp'
            ? TokenType.CHAR_LITERAL
            : TokenType.STRING_LITERAL,
        value: chars.join(''),
        line: startLine,
        column: startCol
      };
    }

    this.errors.push({
      id: `lex-str-eof-${startLine}-${startCol}`,
      phase: ErrorPhase.LEXICAL,
      message: 'Unterminated string literal at end of input',
      line: startLine,
      column: startCol,
      offendingText: quoteChar + chars.join(''),
      ruleViolated: 'Lexical Rule: String literal must end with matching quotation mark',
      explanation: 'Reached end of file without closing quote.',
      suggestedFix: `Add closing ${quoteChar} at end of string`
    });
    return {
      type:
        quoteChar === "'" && this.language === 'cpp'
          ? TokenType.CHAR_LITERAL
          : TokenType.STRING_LITERAL,
      value: chars.join(''),
      line: startLine,
      column: startCol
    };
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
            explanation: 'A floating-point literal cannot contain more than one decimal separator.',
            suggestedFix: 'Remove the extra decimal point'
          });
          while (this.current() !== null && (/\d/.test(this.current()!) || this.current() === '.')) {
            this.advance();
          }
          break;
        }
        hasDot = true;
      }
      numStr += this.advance();
    }

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
        ruleViolated: 'Lexical Rule: Identifiers [a-zA-Z_][a-zA-Z0-9_]* cannot begin with a digit',
        explanation: `Both Python and C++ require variable names to begin with a letter or '_'.`,
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

    const table = this.language === 'python' ? PYTHON_KEYWORDS : CPP_KEYWORDS;
    const type = table[ident] || TokenType.IDENTIFIER;
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
    if (this.language === 'python') {
      return this.tokenizePython();
    }
    return this.tokenizeCpp();
  }

  private tokenizePython(): { tokens: Token[]; errors: CompilerError[] } {
    const tokens: Token[] = [];
    const indentStack: number[] = [0];
    let atLineStart = true;
    let parenDepth = 0;

    while (this.current() !== null) {
      if (atLineStart) {
        let spaces = 0;
        let hasTab = false;
        let hasSpace = false;
        const lineStartCol = this.column;

        while (this.current() === ' ' || this.current() === '\t') {
          const ws = this.advance();
          if (ws === ' ') {
            spaces++;
            hasSpace = true;
          } else {
            spaces += 4;
            hasTab = true;
          }
        }

        if (hasTab && hasSpace) {
          this.errors.push({
            id: `lex-py-tabspace-${this.line}-${lineStartCol}`,
            phase: ErrorPhase.LEXICAL,
            message: 'Inconsistent use of tabs and spaces in indentation',
            line: this.line,
            column: lineStartCol,
            ruleViolated: 'Python Lexical Rule: Do not mix tabs and spaces in indentation',
            explanation: 'Python 3 rejects mixed tabs and spaces (TabError).',
            suggestedFix: 'Use 4 spaces consistently for each indentation level'
          });
        }

        // Skip blank lines or comment-only lines without emitting INDENT/DEDENT
        if (this.current() === '\n') {
          this.advance();
          continue;
        }
        if (this.current() === '\r') {
          this.advance();
          if (this.current() === '\n') this.advance();
          continue;
        }
        if (this.current() === '#') {
          while (this.current() !== null && this.current() !== '\n') {
            this.advance();
          }
          if (this.current() === '\n') this.advance();
          continue;
        }
        if (this.current() === null) break;

        if (parenDepth === 0) {
          const top = indentStack[indentStack.length - 1];
          if (spaces > top) {
            indentStack.push(spaces);
            tokens.push({ type: TokenType.INDENT, value: spaces, line: this.line, column: 1 });
          } else if (spaces < top) {
            while (indentStack.length > 1 && spaces < indentStack[indentStack.length - 1]) {
              indentStack.pop();
              tokens.push({ type: TokenType.DEDENT, value: spaces, line: this.line, column: 1 });
            }
            if (spaces !== indentStack[indentStack.length - 1]) {
              this.errors.push({
                id: `lex-py-dedent-${this.line}-1`,
                phase: ErrorPhase.LEXICAL,
                message: `IndentationError: unindent does not match any outer indentation level (col ${spaces + 1})`,
                line: this.line,
                column: 1,
                ruleViolated: 'Python Lexical Rule: DEDENT must align with an outer block level',
                explanation: `Indentation width (${spaces} spaces) does not match previous block indentations.`,
                suggestedFix: `Align indentation to ${indentStack[indentStack.length - 1]} spaces`
              });
            }
          }
        }
        atLineStart = false;
      }

      const ch = this.current();
      if (ch === null) break;

      if (ch === ' ' || ch === '\t' || ch === '\r') {
        this.advance();
        continue;
      }

      if (ch === '\n') {
        const nlLine = this.line;
        const nlCol = this.column;
        this.advance();
        if (parenDepth === 0) {
          const prev = tokens[tokens.length - 1];
          if (prev && prev.type !== TokenType.NEWLINE && prev.type !== TokenType.INDENT && prev.type !== TokenType.DEDENT) {
            tokens.push({ type: TokenType.NEWLINE, value: '\\n', line: nlLine, column: nlCol });
          }
        }
        atLineStart = true;
        continue;
      }

      if (ch === '#') {
        while (this.current() !== null && this.current() !== '\n') {
          this.advance();
        }
        continue;
      }

      const line = this.line;
      const col = this.column;

      if (ch === '"' || ch === "'") {
        tokens.push(this.readString(ch));
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
      } else if (two === '//') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.FLOOR_DIVIDE, value: '//', line, column: col });
      } else if (two === '**') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.POWER, value: '**', line, column: col });
      } else if (two === '+=') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.PLUS_ASSIGN, value: '+=', line, column: col });
      } else if (two === '-=') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.MINUS_ASSIGN, value: '-=', line, column: col });
      } else if (two === '->') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.ARROW, value: '->', line, column: col });
      } else if (two === '&&' || two === '||') {
        this.advance(); this.advance();
        const pyOp = two === '&&' ? 'and' : 'or';
        this.errors.push({
          id: `lex-py-logic-${line}-${col}`,
          phase: ErrorPhase.LEXICAL,
          message: `Invalid Python operator '${two}': use keyword '${pyOp}' instead`,
          line,
          column: col,
          offendingText: two,
          ruleViolated: `Python Lexical Rule: Logical operators are 'and', 'or', 'not' (not C-style '${two}')`,
          explanation: `Python does not support '${two}' for boolean logic.`,
          suggestedFix: `Replace '${two}' with '${pyOp}'`
        });
        tokens.push({
          type: two === '&&' ? TokenType.AND : TokenType.OR,
          value: two,
          line,
          column: col
        });
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
      } else if (ch === ':') {
        this.advance();
        tokens.push({ type: TokenType.COLON, value: ':', line, column: col });
      } else if (ch === ',') {
        this.advance();
        tokens.push({ type: TokenType.COMMA, value: ',', line, column: col });
      } else if (ch === '.') {
        this.advance();
        tokens.push({ type: TokenType.DOT, value: '.', line, column: col });
      } else if (ch === ';') {
        this.advance();
        tokens.push({ type: TokenType.SEMICOLON, value: ';', line, column: col });
      } else if (ch === '(') {
        this.advance();
        parenDepth++;
        tokens.push({ type: TokenType.LPAREN, value: '(', line, column: col });
      } else if (ch === ')') {
        this.advance();
        if (parenDepth > 0) parenDepth--;
        tokens.push({ type: TokenType.RPAREN, value: ')', line, column: col });
      } else if (ch === '[') {
        this.advance();
        parenDepth++;
        tokens.push({ type: TokenType.LBRACKET, value: '[', line, column: col });
      } else if (ch === ']') {
        this.advance();
        if (parenDepth > 0) parenDepth--;
        tokens.push({ type: TokenType.RBRACKET, value: ']', line, column: col });
      } else if (ch === '{') {
        this.advance();
        tokens.push({ type: TokenType.LBRACE, value: '{', line, column: col });
      } else if (ch === '}') {
        this.advance();
        tokens.push({ type: TokenType.RBRACE, value: '}', line, column: col });
      } else {
        const badChar = this.advance()!;
        let fix = `Remove illegal character '${badChar}'`;
        if (badChar === '@') fix = "Remove '@' symbol (not valid inside Python expressions)";
        else if (badChar === '$') fix = "Remove '$' symbol (not valid in Python identifiers or literals)";
        else if (badChar === '!') fix = "Replace '!' with Python 'not' or '!='";

        this.errors.push({
          id: `lex-py-illegal-${line}-${col}`,
          phase: ErrorPhase.LEXICAL,
          message: `Illegal Python character '${badChar}' (ASCII ${badChar.charCodeAt(0)})`,
          line,
          column: col,
          offendingText: badChar,
          ruleViolated: 'Python Lexical Alphabet Constraint: Unexpected token character',
          explanation: `Character '${badChar}' is not a valid Python operator, delimiter, or identifier character here.`,
          suggestedFix: fix
        });
        tokens.push({ type: TokenType.ILLEGAL, value: badChar, line, column: col });
      }
    }

    const last = tokens[tokens.length - 1];
    if (last && last.type !== TokenType.NEWLINE && last.type !== TokenType.DEDENT) {
      tokens.push({ type: TokenType.NEWLINE, value: '\\n', line: this.line, column: this.column });
    }
    while (indentStack.length > 1) {
      indentStack.pop();
      tokens.push({ type: TokenType.DEDENT, value: 0, line: this.line, column: this.column });
    }

    tokens.push({ type: TokenType.EOF, value: '', line: this.line, column: this.column });
    return { tokens, errors: this.errors };
  }

  private tokenizeCpp(): { tokens: Token[]; errors: CompilerError[] } {
    const tokens: Token[] = [];

    while (this.current() !== null) {
      const ch = this.current()!;

      if (ch === ' ' || ch === '\t' || ch === '\r' || ch === '\n') {
        this.advance();
        continue;
      }

      if (ch === '/' && this.peek() === '/') {
        while (this.current() !== null && this.current() !== '\n') {
          this.advance();
        }
        continue;
      }

      if (ch === '/' && this.peek() === '*') {
        const startLine = this.line;
        const startCol = this.column;
        this.advance();
        this.advance();
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
            id: `lex-cpp-comment-${startLine}-${startCol}`,
            phase: ErrorPhase.LEXICAL,
            message: "Unterminated C++ block comment '/*'",
            line: startLine,
            column: startCol,
            offendingText: '/*',
            ruleViolated: "C++ Lexical Rule: Block comment must end with '*/'",
            explanation: 'Reached end of source before closing block comment.',
            suggestedFix: "Add closing '*/'"
          });
        }
        continue;
      }

      const line = this.line;
      const col = this.column;

      // C++ preprocessor directive at start of directive like `#include <iostream>`
      if (ch === '#') {
        const nextChars = this.source.slice(this.pos + 1, this.pos + 15);
        if (/^(include|define|ifdef|ifndef|endif|pragma)\b/.test(nextChars)) {
          let directive = '';
          while (this.current() !== null && this.current() !== '\n') {
            directive += this.advance();
          }
          tokens.push({
            type: TokenType.PREPROCESSOR,
            value: directive.trim(),
            line,
            column: col
          });
          continue;
        } else {
          this.advance();
          this.errors.push({
            id: `lex-cpp-hash-${line}-${col}`,
            phase: ErrorPhase.LEXICAL,
            message: "Illegal '#' character outside C++ preprocessor directive",
            line,
            column: col,
            offendingText: '#',
            ruleViolated: "C++ Lexical Rule: '#' is only valid for preprocessor directives like #include",
            explanation: "Unlike Python, C++ comments use '//' and identifiers cannot contain '#'.",
            suggestedFix: "Remove '#' or replace with '//' if writing a comment"
          });
          tokens.push({ type: TokenType.ILLEGAL, value: '#', line, column: col });
          continue;
        }
      }

      if (ch === '"' || ch === "'") {
        tokens.push(this.readString(ch));
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
      } else if (two === '<<') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.SHIFT_LEFT, value: '<<', line, column: col });
      } else if (two === '>>') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.SHIFT_RIGHT, value: '>>', line, column: col });
      } else if (two === '::') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.SCOPE, value: '::', line, column: col });
      } else if (two === '++') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.INC, value: '++', line, column: col });
      } else if (two === '--') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.DEC, value: '--', line, column: col });
      } else if (two === '+=') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.PLUS_ASSIGN, value: '+=', line, column: col });
      } else if (two === '-=') {
        this.advance(); this.advance();
        tokens.push({ type: TokenType.MINUS_ASSIGN, value: '-=', line, column: col });
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
      } else if (ch === '.') {
        this.advance();
        tokens.push({ type: TokenType.DOT, value: '.', line, column: col });
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
      } else if (ch === '[') {
        this.advance();
        tokens.push({ type: TokenType.LBRACKET, value: '[', line, column: col });
      } else if (ch === ']') {
        this.advance();
        tokens.push({ type: TokenType.RBRACKET, value: ']', line, column: col });
      } else {
        const badChar = this.advance()!;
        let fix = `Remove illegal character '${badChar}'`;
        if (badChar === '@') fix = "Remove '@' symbol (not in C++ lexical alphabet)";
        else if (badChar === '$') fix = "Remove '$' symbol (not standard C++ identifier character)";

        this.errors.push({
          id: `lex-cpp-illegal-${line}-${col}`,
          phase: ErrorPhase.LEXICAL,
          message: `Illegal C++ character '${badChar}' (ASCII ${badChar.charCodeAt(0)})`,
          line,
          column: col,
          offendingText: badChar,
          ruleViolated: 'C++ Lexical Alphabet Constraint: Unexpected symbol',
          explanation: `The symbol '${badChar}' is not a valid C++ operator, delimiter, or identifier character.`,
          suggestedFix: fix
        });
        tokens.push({ type: TokenType.ILLEGAL, value: badChar, line, column: col });
      }
    }

    tokens.push({ type: TokenType.EOF, value: '', line: this.line, column: this.column });
    return { tokens, errors: this.errors };
  }
}
