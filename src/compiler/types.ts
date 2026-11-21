/**
 * Core types for the Compiler Design 3-Phase Analyzer and Error Correction Agent
 */

export enum ErrorPhase {
  LEXICAL = 'Lexical Error',
  SYNTAX = 'Syntax Error',
  SEMANTIC = 'Semantic Error'
}

export interface CompilerError {
  id: string;
  phase: ErrorPhase;
  message: string;
  line: number;
  column: number;
  offendingText?: string;
  ruleViolated: string;
  explanation: string;
  suggestedFix: string;
  closestMatch?: string;
}

export enum TokenType {
  // Keywords
  VAR = 'VAR',
  INT = 'INT',
  FLOAT = 'FLOAT',
  STRING = 'STRING',
  BOOL = 'BOOL',
  IF = 'IF',
  ELSE = 'ELSE',
  WHILE = 'WHILE',
  PRINT = 'PRINT',
  TRUE = 'TRUE',
  FALSE = 'FALSE',

  // Literals & Identifiers
  IDENTIFIER = 'IDENTIFIER',
  INT_LITERAL = 'INT_LITERAL',
  FLOAT_LITERAL = 'FLOAT_LITERAL',
  STRING_LITERAL = 'STRING_LITERAL',

  // Operators
  ASSIGN = '=',
  PLUS = '+',
  MINUS = '-',
  MULTIPLY = '*',
  DIVIDE = '/',
  MODULO = '%',
  EQ = '==',
  NEQ = '!=',
  LT = '<',
  LTE = '<=',
  GT = '>',
  GTE = '>=',
  AND = '&&',
  OR = '||',
  NOT = '!',

  // Delimiters
  SEMICOLON = ';',
  COLON = ':',
  LPAREN = '(',
  RPAREN = ')',
  LBRACE = '{',
  RBRACE = '}',
  COMMA = ',',

  EOF = 'EOF',
  ILLEGAL = 'ILLEGAL'
}

export interface Token {
  type: TokenType;
  value: string | number | boolean;
  line: number;
  column: number;
}

export interface ASTNode {
  kind: string;
  line: number;
  column: number;
  [key: string]: any;
}

export interface SymbolEntry {
  name: string;
  type: string;
  lineDeclared: number;
  isInitialized: boolean;
  scope: string;
}

export interface CorrectionAction {
  phase: ErrorPhase;
  description: string;
  originalLine: number;
  beforeSnippet: string;
  afterSnippet: string;
  appliedHeuristic: string;
}

export interface CompilationResult {
  isValid: boolean;
  tokens: Token[];
  lexicalErrors: CompilerError[];
  syntaxErrors: CompilerError[];
  semanticErrors: CompilerError[];
  allErrors: CompilerError[];
  ast: ASTNode | null;
  symbols: SymbolEntry[];
}
