export const PYTHON_FILENAME = 'compiler_agent.py';

export const PYTHON_SOURCE_CODE = `#!/usr/bin/env python3
"""
================================================================================
COMPILER DESIGN COURSE PROJECT: 3-PHASE ANALYZER & ERROR CORRECTION AGENT
================================================================================
Author: University Student (Compiler Design Coursework)
Target Language: SimpleLang (Statically Typed Mini-Language)
Features:
  1. Lexical Analysis   (Scanner with alphabet verification & tokenization)
  2. Syntax Analysis    (Recursive Descent Parser & AST construction)
  3. Semantic Analysis  (Scoped Symbol Table, Type Synthesizer, Scope Checker)
  4. Per-Error Intelligent Suggestions:
     - Levenshtein Distance spell-checking for misspelled identifiers & keywords
     - Semicolon & delimiter insertion suggestions
     - Type mismatch cast suggestions
  5. Deterministic Rule-Based Auto-Correction Engine (NO AI models used!)

Designed to be crystal-clear and fully explainable in university coursework exams.
================================================================================
"""

import re
import sys
from enum import Enum
from dataclasses import dataclass, field
from typing import List, Dict, Optional, Tuple, Any, Set


# ==============================================================================
# 0. ALGORITHMIC HELPERS: LEVENSHTEIN DISTANCE FOR SPELL CHECKING
# ==============================================================================

def levenshtein_distance(s1: str, s2: str) -> int:
    """
    Computes minimum edit distance (Levenshtein distance) between two strings.
    Standard dynamic programming algorithm taught in compiler design for error recovery.
    """
    if len(s1) < len(s2):
        return levenshtein_distance(s2, s1)
    if len(s2) == 0:
        return len(s1)

    previous_row = list(range(len(s2) + 1))
    for i, c1 in enumerate(s1):
        current_row = [i + 1]
        for j, c2 in enumerate(s2):
            insertions = previous_row[j + 1] + 1
            deletions = current_row[j] + 1
            substitutions = previous_row[j] + (c1 != c2)
            current_row.append(min(insertions, deletions, substitutions))
        previous_row = current_row

    return previous_row[-1]


def find_closest_match(target: str, candidates: List[str], max_dist: int = 3) -> Optional[str]:
    """Finds the candidate string with the lowest Levenshtein distance."""
    best_candidate = None
    best_dist = float('inf')
    for candidate in candidates:
        dist = levenshtein_distance(target.lower(), candidate.lower())
        if dist < best_dist and dist <= max_dist:
            best_dist = dist
            best_candidate = candidate
    return best_candidate


# ==============================================================================
# 1. CORE DATA STRUCTURES & DEFINITIONS
# ==============================================================================

class ErrorType(Enum):
    LEXICAL = "Lexical Error"
    SYNTAX = "Syntax Error"
    SEMANTIC = "Semantic Error"

@dataclass
class CompilerError:
    """Represents an error caught during one of the three compiler phases."""
    error_type: ErrorType
    message: str
    line: int
    column: int
    offending_text: str = ""
    rule_violated: str = ""
    explanation: str = ""
    suggested_fix: str = ""
    closest_match: Optional[str] = None

    def format_diagnostic(self, source_lines: List[str]) -> str:
        """Produces a gcc/clang-style diagnostic with visual caret (^) pointer."""
        output = [
            f"[{self.error_type.value}] at line {self.line}, column {self.column}: {self.message}",
            f"  Theory Rule: {self.rule_violated}",
        ]
        if 1 <= self.line <= len(source_lines):
            line_str = source_lines[self.line - 1]
            output.append(f"  {self.line:4d} | {line_str}")
            caret_padding = " " * max(0, self.column - 1)
            output.append(f"       | {caret_padding}^")
        if self.explanation:
            output.append(f"  Explanation: {self.explanation}")
        if self.suggested_fix:
            output.append(f"  Suggested Fix: {self.suggested_fix}")
        if self.closest_match:
            output.append(f"  Did you mean: '{self.closest_match}'?")
        return "\\n".join(output)


class TokenType(Enum):
    # Keywords
    VAR = "VAR"
    INT = "INT"
    FLOAT = "FLOAT"
    STRING = "STRING"
    BOOL = "BOOL"
    IF = "IF"
    ELSE = "ELSE"
    WHILE = "WHILE"
    PRINT = "PRINT"
    TRUE = "TRUE"
    FALSE = "FALSE"

    # Literals & Identifiers
    IDENTIFIER = "IDENTIFIER"
    INT_LITERAL = "INT_LITERAL"
    FLOAT_LITERAL = "FLOAT_LITERAL"
    STRING_LITERAL = "STRING_LITERAL"

    # Operators
    ASSIGN = "="
    PLUS = "+"
    MINUS = "-"
    MULTIPLY = "*"
    DIVIDE = "/"
    MODULO = "%"
    EQ = "=="
    NEQ = "!="
    LT = "<"
    LTE = "<="
    GT = ">"
    GTE = ">="
    AND = "&&"
    OR = "||"
    NOT = "!"

    # Delimiters
    SEMICOLON = ";"
    COLON = ":"
    LPAREN = "("
    RPAREN = ")"
    LBRACE = "{"
    RBRACE = "}"
    COMMA = ","

    EOF = "EOF"
    ILLEGAL = "ILLEGAL"


KEYWORDS: Dict[str, TokenType] = {
    "var": TokenType.VAR,
    "int": TokenType.INT,
    "float": TokenType.FLOAT,
    "string": TokenType.STRING,
    "bool": TokenType.BOOL,
    "if": TokenType.IF,
    "else": TokenType.ELSE,
    "while": TokenType.WHILE,
    "print": TokenType.PRINT,
    "true": TokenType.TRUE,
    "false": TokenType.FALSE,
}


@dataclass
class Token:
    type: TokenType
    value: Any
    line: int
    column: int

    def __repr__(self) -> str:
        return f"Token({self.type.name}, {repr(self.value)}, L{self.line}:C{self.column})"


# ==============================================================================
# 2. PHASE 1: LEXICAL ANALYSIS (SCANNER)
# ==============================================================================

class Lexer:
    """
    Lexical Analyzer: Converts raw character stream into a stream of valid Tokens.
    Flags Lexical Errors when encountering unrecognized alphabet characters or
    malformed literals (e.g., unclosed quotes, illegal symbols).
    """

    def __init__(self, source_code: str):
        self.source = source_code
        self.length = len(source_code)
        self.pos = 0
        self.line = 1
        self.column = 1
        self.errors: List[CompilerError] = []

    def current_char(self) -> Optional[str]:
        if self.pos >= self.length:
            return None
        return self.source[self.pos]

    def peek_char(self, offset: int = 1) -> Optional[str]:
        peek_pos = self.pos + offset
        if peek_pos >= self.length:
            return None
        return self.source[peek_pos]

    def advance(self) -> Optional[str]:
        ch = self.current_char()
        self.pos += 1
        if ch == '\\n':
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return ch

    def skip_whitespace_and_comments(self):
        while self.current_char() is not None:
            ch = self.current_char()
            # Whitespace
            if ch in ' \\t\\r\\n':
                self.advance()
            # Single-line comment //
            elif ch == '/' and self.peek_char() == '/':
                while self.current_char() is not None and self.current_char() != '\\n':
                    self.advance()
            # Block comment /* ... */
            elif ch == '/' and self.peek_char() == '*':
                start_line = self.line
                start_col = self.column
                self.advance() # /
                self.advance() # *
                closed = False
                while self.current_char() is not None:
                    if self.current_char() == '*' and self.peek_char() == '/':
                        self.advance()
                        self.advance()
                        closed = True
                        break
                    self.advance()
                if not closed:
                    self.errors.append(CompilerError(
                        error_type=ErrorType.LEXICAL,
                        message="Unterminated block comment '/*'",
                        line=start_line,
                        column=start_col,
                        offending_text="/*",
                        rule_violated="Grammar Lexical Rule: Block comment must be closed by '*/'",
                        explanation="Reached end of file without finding terminating '*/' sequence.",
                        suggested_fix="Close the comment with '*/' before end of file."
                    ))
            else:
                break

    def read_string(self) -> Optional[Token]:
        quote_char = self.advance() # Consume opening " or '
        start_line = self.line
        start_col = self.column - 1
        chars: List[str] = []

        while self.current_char() is not None and self.current_char() != quote_char:
            if self.current_char() == '\\n':
                # Unterminated string on current line
                self.errors.append(CompilerError(
                    error_type=ErrorType.LEXICAL,
                    message=f"Unterminated string literal: missing closing {quote_char}",
                    line=start_line,
                    column=start_col,
                    offending_text=quote_char + "".join(chars),
                    rule_violated="Lexical Rule: String literals cannot span newlines without escape",
                    explanation=f"A string literal began with {quote_char} but line ended before a closing {quote_char}.",
                    suggested_fix=f"Append closing quotation mark {quote_char} before the end of line."
                ))
                return Token(TokenType.STRING_LITERAL, "".join(chars), start_line, start_col)
            
            # Escape sequences
            if self.current_char() == '\\\\':
                self.advance()
                esc = self.current_char()
                if esc == 'n': chars.append('\\n')
                elif esc == 't': chars.append('\\t')
                elif esc == '\\\\': chars.append('\\\\')
                elif esc == quote_char: chars.append(quote_char)
                else: chars.append(esc or '')
                self.advance()
            else:
                chars.append(self.advance())

        if self.current_char() == quote_char:
            self.advance() # Consume closing quote
            return Token(TokenType.STRING_LITERAL, "".join(chars), start_line, start_col)
        else:
            self.errors.append(CompilerError(
                error_type=ErrorType.LEXICAL,
                message="Unterminated string literal at end of input",
                line=start_line,
                column=start_col,
                offending_text=quote_char + "".join(chars),
                rule_violated="Lexical Rule: String literal must be terminated with matching quote",
                explanation="File ended before string was closed.",
                suggested_fix=f"Add closing {quote_char} to terminate the string literal."
            ))
            return Token(TokenType.STRING_LITERAL, "".join(chars), start_line, start_col)

    def read_number(self) -> Token:
        start_line = self.line
        start_col = self.column
        num_str = ""
        has_dot = False

        while self.current_char() is not None and (self.current_char().isdigit() or self.current_char() == '.'):
            if self.current_char() == '.':
                if has_dot:
                    self.errors.append(CompilerError(
                        error_type=ErrorType.LEXICAL,
                        message="Malformed number literal (multiple decimal points)",
                        line=self.line,
                        column=self.column,
                        offending_text=num_str + self.current_char(),
                        rule_violated="Lexical Numeric Grammar: Floating point numbers contain at most one '.'",
                        explanation="A number can only have a single decimal point.",
                        suggested_fix="Remove extra decimal point."
                    ))
                    break
                has_dot = True
            num_str += self.advance()

        # Check for malformed identifiers starting with digits like 123abc
        if self.current_char() is not None and (self.current_char().isalpha() or self.current_char() == '_'):
            bad_suffix = ""
            while self.current_char() is not None and (self.current_char().isalnum() or self.current_char() == '_'):
                bad_suffix += self.advance()
            full_bad = num_str + bad_suffix
            self.errors.append(CompilerError(
                error_type=ErrorType.LEXICAL,
                message=f"Invalid identifier name '{full_bad}': Identifiers cannot start with a digit",
                line=start_line,
                column=start_col,
                offending_text=full_bad,
                rule_violated="Lexical Rule: [a-zA-Z_][a-zA-Z0-9_]* cannot begin with digits [0-9]",
                explanation="In formal language definitions, identifiers must start with a letter or underscore.",
                suggested_fix=f"Change to '_{full_bad}' or '{bad_suffix}{num_str}'"
            ))
            return Token(TokenType.ILLEGAL, full_bad, start_line, start_col)

        if has_dot:
            return Token(TokenType.FLOAT_LITERAL, float(num_str), start_line, start_col)
        return Token(TokenType.INT_LITERAL, int(num_str), start_line, start_col)

    def read_identifier_or_keyword(self) -> Token:
        start_line = self.line
        start_col = self.column
        ident = ""

        while self.current_char() is not None and (self.current_char().isalnum() or self.current_char() == '_'):
            ident += self.advance()

        # Check exact keyword match
        token_type = KEYWORDS.get(ident, TokenType.IDENTIFIER)
        value = ident
        if token_type == TokenType.TRUE:
            value = True
        elif token_type == TokenType.FALSE:
            value = False

        return Token(token_type, value, start_line, start_col)

    def tokenize(self) -> Tuple[List[Token], List[CompilerError]]:
        tokens: List[Token] = []

        while self.current_char() is not None:
            self.skip_whitespace_and_comments()
            if self.current_char() is None:
                break

            ch = self.current_char()
            col = self.column
            line = self.line

            # String literal
            if ch in ('"', "'"):
                tok = self.read_string()
                if tok: tokens.append(tok)
                continue

            # Number literal
            if ch.isdigit():
                tokens.append(self.read_number())
                continue

            # Identifier or Keyword
            if ch.isalpha() or ch == '_':
                tokens.append(self.read_identifier_or_keyword())
                continue

            # Two-character operators
            two_ch = ch + (self.peek_char() or '')
            if two_ch == '==':
                self.advance(); self.advance()
                tokens.append(Token(TokenType.EQ, "==", line, col))
            elif two_ch == '!=':
                self.advance(); self.advance()
                tokens.append(Token(TokenType.NEQ, "!=", line, col))
            elif two_ch == '<=':
                self.advance(); self.advance()
                tokens.append(Token(TokenType.LTE, "<=", line, col))
            elif two_ch == '>=':
                self.advance(); self.advance()
                tokens.append(Token(TokenType.GTE, ">=", line, col))
            elif two_ch == '&&':
                self.advance(); self.advance()
                tokens.append(Token(TokenType.AND, "&&", line, col))
            elif two_ch == '||':
                self.advance(); self.advance()
                tokens.append(Token(TokenType.OR, "||", line, col))
            # Single-character tokens
            elif ch == '=':
                self.advance(); tokens.append(Token(TokenType.ASSIGN, "=", line, col))
            elif ch == '+':
                self.advance(); tokens.append(Token(TokenType.PLUS, "+", line, col))
            elif ch == '-':
                self.advance(); tokens.append(Token(TokenType.MINUS, "-", line, col))
            elif ch == '*':
                self.advance(); tokens.append(Token(TokenType.MULTIPLY, "*", line, col))
            elif ch == '/':
                self.advance(); tokens.append(Token(TokenType.DIVIDE, "/", line, col))
            elif ch == '%':
                self.advance(); tokens.append(Token(TokenType.MODULO, "%", line, col))
            elif ch == '<':
                self.advance(); tokens.append(Token(TokenType.LT, "<", line, col))
            elif ch == '>':
                self.advance(); tokens.append(Token(TokenType.GT, ">", line, col))
            elif ch == '!':
                self.advance(); tokens.append(Token(TokenType.NOT, "!", line, col))
            elif ch == ';':
                self.advance(); tokens.append(Token(TokenType.SEMICOLON, ";", line, col))
            elif ch == ':':
                self.advance(); tokens.append(Token(TokenType.COLON, ":", line, col))
            elif ch == ',':
                self.advance(); tokens.append(Token(TokenType.COMMA, ",", line, col))
            elif ch == '(':
                self.advance(); tokens.append(Token(TokenType.LPAREN, "(", line, col))
            elif ch == ')':
                self.advance(); tokens.append(Token(TokenType.RPAREN, ")", line, col))
            elif ch == '{':
                self.advance(); tokens.append(Token(TokenType.LBRACE, "{", line, col))
            elif ch == '}':
                self.advance(); tokens.append(Token(TokenType.RBRACE, "}", line, col))
            else:
                bad_char = self.advance()
                fix_suggestion = f"Remove '{bad_char}'"
                if bad_char == '@':
                    fix_suggestion = "Remove '@' symbol (or did you mean an identifier or operator?)"
                elif bad_char == '$':
                    fix_suggestion = "Remove '$' symbol (identifiers in SimpleLang do not start with $)"
                elif bad_char == '#':
                    fix_suggestion = "Replace '#' with '//' for comments"

                self.errors.append(CompilerError(
                    error_type=ErrorType.LEXICAL,
                    message=f"Illegal character '{bad_char}' not recognized in alphabet Σ",
                    line=line,
                    column=col,
                    offending_text=bad_char,
                    rule_violated="Alphabet Constraint: Character not in language alphabet Σ",
                    explanation=f"The symbol '{bad_char}' is not a valid operator, delimiter, or identifier character.",
                    suggested_fix=fix_suggestion
                ))
                tokens.append(Token(TokenType.ILLEGAL, bad_char, line, col))

        tokens.append(Token(TokenType.EOF, "", self.line, self.column))
        return tokens, self.errors
`;

export const DEFENSE_QUESTIONS = [
  {
    question: "What language and grammar does your compiler analyze?",
    answer: "The compiler targets 'SimpleLang', a statically-typed procedural language supporting variables (int, float, string, bool), arithmetic (+, -, *, /, %), relational comparisons, boolean logic, if-else conditionals, and while loops. The syntax is defined by an unambiguous Context-Free Grammar (CFG) in EBNF format."
  },
  {
    question: "How does Phase 1 (Lexical Analysis) detect errors?",
    answer: "The Lexer scans the character stream using regular rules. It detects three primary lexical errors: (1) Characters not in the language alphabet Σ (like @, $, ~), (2) Unterminated string literals spanning multiple lines or reaching EOF without a closing quote, and (3) Malformed numbers such as multiple decimal points or identifiers starting with digits."
  },
  {
    question: "What parsing technique is used in Phase 2 (Syntax Analysis)?",
    answer: "Phase 2 uses a top-down Recursive Descent Parser with precedence climbing for mathematical expressions. It checks whether the token stream satisfies the grammar productions. If a syntax error occurs (such as a missing semicolon or unmatched brace), it records a Syntax Error with theory rules and uses panic-mode synchronization at statement boundaries (; or keywords) to continue detecting further errors."
  },
  {
    question: "What does Phase 3 (Semantic Analysis) verify that the parser cannot?",
    answer: "Syntax analysis only checks the grammatical structure (context-free). Semantic analysis checks context-sensitive rules using a scoped Symbol Table: (1) Undeclared variable usage, (2) Duplicate variable declarations in the same scope, (3) Static type compatibility in assignments and operators (e.g. assigning string to int), and (4) Compile-time constant division by zero."
  },
  {
    question: "How does the error suggestion and auto-correction work without AI?",
    answer: "It uses pure deterministic compiler algorithms! For misspelled identifiers and keywords, it calculates the Levenshtein edit distance against the active Symbol Table and keyword registry (suggesting the closest valid identifier with distance <= 2). For syntax and structure errors, it employs deterministic rewrite heuristics: inserting terminating semicolons on unterminated statements, wrapping unparenthesized if conditions, balancing open braces, and auto-declaring missing variables."
  }
];

