/**
 * Core types for the Python & C++ 3-Phase Compiler Analyzer and Error Correction Agent
 */

export type TargetLanguage = 'python' | 'cpp';

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
  // Common Keywords & Types
  INT = 'INT',
  FLOAT = 'FLOAT',
  DOUBLE = 'DOUBLE',
  STR = 'STR',
  STRING = 'STRING',
  CHAR = 'CHAR',
  BOOL = 'BOOL',
  VOID = 'VOID',
  CONST = 'CONST',
  IF = 'IF',
  ELIF = 'ELIF',
  ELSE = 'ELSE',
  WHILE = 'WHILE',
  FOR = 'FOR',
  IN = 'IN',
  DEF = 'DEF',
  RETURN = 'RETURN',
  PRINT = 'PRINT',
  INPUT = 'INPUT',
  TRUE = 'TRUE',
  FALSE = 'FALSE',
  NONE = 'NONE',

  // C++ Specific Keywords
  PREPROCESSOR = 'PREPROCESSOR',
  USING = 'USING',
  NAMESPACE = 'NAMESPACE',
  STD = 'STD',
  COUT = 'COUT',
  CIN = 'CIN',
  ENDL = 'ENDL',

  // Literals & Identifiers
  IDENTIFIER = 'IDENTIFIER',
  INT_LITERAL = 'INT_LITERAL',
  FLOAT_LITERAL = 'FLOAT_LITERAL',
  STRING_LITERAL = 'STRING_LITERAL',
  CHAR_LITERAL = 'CHAR_LITERAL',

  // Operators
  ASSIGN = '=',
  PLUS_ASSIGN = '+=',
  MINUS_ASSIGN = '-=',
  PLUS = '+',
  MINUS = '-',
  MULTIPLY = '*',
  DIVIDE = '/',
  FLOOR_DIVIDE = '//',
  MODULO = '%',
  POWER = '**',
  INC = '++',
  DEC = '--',
  EQ = '==',
  NEQ = '!=',
  LT = '<',
  LTE = '<=',
  GT = '>',
  GTE = '>=',
  AND = 'AND',
  OR = 'OR',
  NOT = 'NOT',
  SHIFT_LEFT = '<<',
  SHIFT_RIGHT = '>>',
  SCOPE = '::',
  ARROW = '->',

  // Delimiters & Structure
  SEMICOLON = ';',
  COLON = ':',
  LPAREN = '(',
  RPAREN = ')',
  LBRACE = '{',
  RBRACE = '}',
  LBRACKET = '[',
  RBRACKET = ']',
  COMMA = ',',
  DOT = '.',
  NEWLINE = 'NEWLINE',
  INDENT = 'INDENT',
  DEDENT = 'DEDENT',

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
  language: TargetLanguage;
  isValid: boolean;
  tokens: Token[];
  lexicalErrors: CompilerError[];
  syntaxErrors: CompilerError[];
  semanticErrors: CompilerError[];
  allErrors: CompilerError[];
  ast: ASTNode | null;
  symbols: SymbolEntry[];
}

export type DetectedDataType = 'int' | 'float' | 'bool' | 'str' | 'empty';

export interface InputTypeCheckResult {
  rawInput: string;
  detectedType: DetectedDataType;
  expectedType: DetectedDataType | 'auto';
  isValidForExpected: boolean;
  compatibleTypes: DetectedDataType[];
  ruleExplanation: string;
  pythonCastHint: string;
  cppTypeHint: string;
  errorMessage?: string;
  suggestedFix?: string;
}
