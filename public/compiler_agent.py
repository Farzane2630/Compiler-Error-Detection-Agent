#!/usr/bin/env python3
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
        return "\n".join(output)


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
        if ch == '\n':
            self.line += 1
            self.column = 1
        else:
            self.column += 1
        return ch

    def skip_whitespace_and_comments(self):
        while self.current_char() is not None:
            ch = self.current_char()
            # Whitespace
            if ch in ' \t\r\n':
                self.advance()
            # Single-line comment //
            elif ch == '/' and self.peek_char() == '/':
                while self.current_char() is not None and self.current_char() != '\n':
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
            if self.current_char() == '\n':
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
            if self.current_char() == '\\':
                self.advance()
                esc = self.current_char()
                if esc == 'n': chars.append('\n')
                elif esc == 't': chars.append('\t')
                elif esc == '\\': chars.append('\\')
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
                # Unrecognized character not in language alphabet Σ
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


# ==============================================================================
# 3. PHASE 2: SYNTAX ANALYSIS (PARSER & AST)
# ==============================================================================

class ASTNode:
    pass

@dataclass
class ProgramNode(ASTNode):
    statements: List[ASTNode] = field(default_factory=list)

@dataclass
class VarDeclNode(ASTNode):
    name: str
    var_type: Optional[str]
    initializer: Optional[ASTNode]
    line: int
    column: int

@dataclass
class AssignmentNode(ASTNode):
    name: str
    value_expr: ASTNode
    line: int
    column: int

@dataclass
class IfStatementNode(ASTNode):
    condition: ASTNode
    then_branch: ASTNode
    else_branch: Optional[ASTNode]
    line: int
    column: int

@dataclass
class WhileStatementNode(ASTNode):
    condition: ASTNode
    body: ASTNode
    line: int
    column: int

@dataclass
class BlockNode(ASTNode):
    statements: List[ASTNode]
    line: int
    column: int

@dataclass
class PrintStatementNode(ASTNode):
    expression: ASTNode
    line: int
    column: int

@dataclass
class BinaryOpNode(ASTNode):
    left: ASTNode
    operator: str
    right: ASTNode
    line: int
    column: int

@dataclass
class UnaryOpNode(ASTNode):
    operator: str
    operand: ASTNode
    line: int
    column: int

@dataclass
class LiteralNode(ASTNode):
    value: Any
    literal_type: str # 'int', 'float', 'string', 'bool'
    line: int
    column: int

@dataclass
class IdentifierNode(ASTNode):
    name: str
    line: int
    column: int


class Parser:
    """
    Syntax Analyzer: Recursive Descent Parser.
    Constructs an Abstract Syntax Tree (AST) following context-free grammar G.
    Equipped with intelligent error suggestions (e.g. suggesting adding missing semicolons
    or identifying misspelled keywords).
    """

    def __init__(self, tokens: List[Token]):
        self.tokens = tokens
        self.pos = 0
        self.errors: List[CompilerError] = []

    def current_token(self) -> Token:
        if self.pos >= len(self.tokens):
            return self.tokens[-1]
        return self.tokens[self.pos]

    def peek_token(self) -> Token:
        if self.pos + 1 >= len(self.tokens):
            return self.tokens[-1]
        return self.tokens[self.pos + 1]

    def advance(self) -> Token:
        tok = self.current_token()
        if self.pos < len(self.tokens) - 1:
            self.pos += 1
        return tok

    def match(self, *expected_types: TokenType) -> bool:
        if self.current_token().type in expected_types:
            self.advance()
            return True
        return False

    def expect(self, expected_type: TokenType, error_msg: str, rule: str = "", fix: str = "") -> Optional[Token]:
        tok = self.current_token()
        if tok.type == expected_type:
            return self.advance()
        
        # Smart fix generation
        if not fix:
            if expected_type == TokenType.SEMICOLON:
                fix = f"Add missing semicolon ';' at line {tok.line}, column {tok.column}"
            elif expected_type == TokenType.RPAREN:
                fix = f"Add missing closing parenthesis ')' before '{tok.value}'"
            elif expected_type == TokenType.LPAREN:
                fix = f"Add missing opening parenthesis '(' after keyword"
            elif expected_type == TokenType.RBRACE:
                fix = "Add missing closing brace '}' at end of block"
            else:
                fix = f"Insert '{expected_type.value}' here"

        self.errors.append(CompilerError(
            error_type=ErrorType.SYNTAX,
            message=f"{error_msg} (found '{tok.value}' [{tok.type.name}])",
            line=tok.line,
            column=tok.column,
            offending_text=str(tok.value),
            rule_violated=rule or f"Grammar Rule: Expected token '{expected_type.name}'",
            explanation=f"Grammar expected {expected_type.name} to continue production.",
            suggested_fix=fix
        ))
        return None

    def synchronize(self):
        """Panic-mode recovery: advance until statement boundary."""
        self.advance()
        while self.current_token().type != TokenType.EOF:
            if self.tokens[self.pos - 1].type == TokenType.SEMICOLON:
                return
            if self.current_token().type in (
                TokenType.VAR, TokenType.IF, TokenType.WHILE,
                TokenType.PRINT, TokenType.RBRACE, TokenType.LBRACE
            ):
                return
            self.advance()

    def parse(self) -> Tuple[ProgramNode, List[CompilerError]]:
        program = ProgramNode(statements=[])
        while self.current_token().type != TokenType.EOF:
            if self.current_token().type == TokenType.ILLEGAL:
                self.advance()
                continue
            stmt = self.parse_statement()
            if stmt:
                program.statements.append(stmt)
        return program, self.errors

    def parse_statement(self) -> Optional[ASTNode]:
        tok = self.current_token()

        try:
            if tok.type == TokenType.VAR:
                return self.parse_var_declaration()
            elif tok.type == TokenType.IF:
                return self.parse_if_statement()
            elif tok.type == TokenType.WHILE:
                return self.parse_while_statement()
            elif tok.type == TokenType.PRINT:
                return self.parse_print_statement()
            elif tok.type == TokenType.LBRACE:
                return self.parse_block()
            elif tok.type == TokenType.IDENTIFIER:
                # Could be assignment OR misspelled keyword like `whle` or `prnt` or `vbr`
                closest_kw = find_closest_match(tok.value, list(KEYWORDS.keys()), max_dist=2)
                next_tok = self.peek_token()

                # If followed by '(' or identifier, likely a misspelled keyword!
                if closest_kw in ("if", "while", "print") and next_tok.type == TokenType.LPAREN:
                    self.errors.append(CompilerError(
                        error_type=ErrorType.SYNTAX,
                        message=f"Unknown statement keyword '{tok.value}'",
                        line=tok.line,
                        column=tok.column,
                        offending_text=tok.value,
                        rule_violated="Grammar: Keyword recognition",
                        explanation=f"'{tok.value}' is not a valid control flow keyword.",
                        suggested_fix=f"Did you mean keyword '{closest_kw}'?",
                        closest_match=closest_kw
                    ))
                    # Recover by treating it as that keyword
                    self.advance() # consume misspelled token
                    if closest_kw == "while":
                        return self.parse_while_statement_body(tok.line, tok.column)
                    elif closest_kw == "if":
                        return self.parse_if_statement_body(tok.line, tok.column)
                    elif closest_kw == "print":
                        return self.parse_print_statement_body(tok.line, tok.column)

                return self.parse_assignment()
            elif tok.type == TokenType.SEMICOLON:
                self.advance()
                return None
            else:
                self.errors.append(CompilerError(
                    error_type=ErrorType.SYNTAX,
                    message=f"Unexpected token '{tok.value}' at beginning of statement",
                    line=tok.line,
                    column=tok.column,
                    offending_text=str(tok.value),
                    rule_violated="Grammar: Statement -> VarDecl | Assignment | IfStmt | WhileStmt | PrintStmt | Block",
                    explanation=f"A statement cannot begin with token '{tok.value}'.",
                    suggested_fix="Check statement keyword or syntax."
                ))
                self.synchronize()
                return None
        except Exception:
            self.synchronize()
            return None

    def parse_var_declaration(self) -> Optional[VarDeclNode]:
        var_tok = self.advance()
        line = var_tok.line
        col = var_tok.column

        name_tok = self.current_token()
        if name_tok.type != TokenType.IDENTIFIER:
            self.errors.append(CompilerError(
                error_type=ErrorType.SYNTAX,
                message="Expected identifier name after 'var'",
                line=name_tok.line,
                column=name_tok.column,
                offending_text=str(name_tok.value),
                rule_violated="Grammar: VarDecl -> 'var' IDENTIFIER (':' Type)? ('=' Expr)? ';'",
                suggested_fix="Provide a variable name like 'var count = 0;'"
            ))
            self.synchronize()
            return None
        self.advance()
        name = name_tok.value

        var_type: Optional[str] = None
        if self.match(TokenType.COLON):
            type_tok = self.current_token()
            if type_tok.type in (TokenType.INT, TokenType.FLOAT, TokenType.STRING, TokenType.BOOL):
                var_type = type_tok.value
                self.advance()
            else:
                # Check for misspelled type
                closest_t = find_closest_match(str(type_tok.value), ["int", "float", "string", "bool"], max_dist=2)
                suggestion = f"Did you mean type '{closest_t}'?" if closest_t else "Specify a valid type: int, float, string, or bool."
                self.errors.append(CompilerError(
                    error_type=ErrorType.SYNTAX,
                    message=f"Expected type specifier after ':', found '{type_tok.value}'",
                    line=type_tok.line,
                    column=type_tok.column,
                    offending_text=str(type_tok.value),
                    rule_violated="Grammar: Type -> 'int' | 'float' | 'string' | 'bool'",
                    suggested_fix=suggestion,
                    closest_match=closest_t
                ))
                self.advance()

        initializer: Optional[ASTNode] = None
        if self.match(TokenType.ASSIGN):
            initializer = self.parse_expression()

        self.expect(
            TokenType.SEMICOLON,
            "Missing terminating semicolon ';' at end of variable declaration",
            rule="Grammar: Declaration statement must end with ';'",
            fix=f"Add semicolon ';' at end of line {line}"
        )

        return VarDeclNode(name=name, var_type=var_type, initializer=initializer, line=line, column=col)

    def parse_assignment(self) -> Optional[AssignmentNode]:
        id_tok = self.advance()
        line = id_tok.line
        col = id_tok.column

        if not self.match(TokenType.ASSIGN):
            self.errors.append(CompilerError(
                error_type=ErrorType.SYNTAX,
                message=f"Expected '=' assignment operator after identifier '{id_tok.value}'",
                line=self.current_token().line,
                column=self.current_token().column,
                offending_text=str(self.current_token().value),
                rule_violated="Grammar: Assignment -> IDENTIFIER '=' Expression ';'",
                suggested_fix=f"Add '=' after '{id_tok.value}' to assign a value"
            ))
            self.synchronize()
            return None

        val_expr = self.parse_expression()
        self.expect(
            TokenType.SEMICOLON,
            "Missing terminating semicolon ';' at end of assignment statement",
            rule="Grammar: Assignment statement must end with ';'",
            fix=f"Add ';' at the end of line {line}"
        )
        return AssignmentNode(name=id_tok.value, value_expr=val_expr, line=line, column=col)

    def parse_if_statement(self) -> Optional[IfStatementNode]:
        if_tok = self.advance()
        return self.parse_if_statement_body(if_tok.line, if_tok.column)

    def parse_if_statement_body(self, line: int, col: int) -> Optional[IfStatementNode]:
        if not self.match(TokenType.LPAREN):
            self.errors.append(CompilerError(
                error_type=ErrorType.SYNTAX,
                message="Missing opening parenthesis '(' for 'if' condition",
                line=self.current_token().line,
                column=self.current_token().column,
                rule_violated="Grammar: IfStmt -> 'if' '(' Expr ')' Statement",
                suggested_fix="Wrap condition in parentheses: 'if (condition)'"
            ))
        
        condition = self.parse_expression()

        if not self.match(TokenType.RPAREN):
            self.errors.append(CompilerError(
                error_type=ErrorType.SYNTAX,
                message="Missing closing parenthesis ')' after 'if' condition",
                line=self.current_token().line,
                column=self.current_token().column,
                rule_violated="Grammar: Unclosed condition parenthesis",
                suggested_fix="Add ')' after condition expression"
            ))

        then_branch = self.parse_statement() or BlockNode([], line, col)
        else_branch: Optional[ASTNode] = None

        if self.match(TokenType.ELSE):
            else_branch = self.parse_statement()

        return IfStatementNode(condition=condition, then_branch=then_branch, else_branch=else_branch, line=line, column=col)

    def parse_while_statement(self) -> Optional[WhileStatementNode]:
        while_tok = self.advance()
        return self.parse_while_statement_body(while_tok.line, while_tok.column)

    def parse_while_statement_body(self, line: int, col: int) -> Optional[WhileStatementNode]:
        if not self.match(TokenType.LPAREN):
            self.errors.append(CompilerError(
                error_type=ErrorType.SYNTAX,
                message="Missing opening parenthesis '(' for 'while' condition",
                line=self.current_token().line,
                column=self.current_token().column,
                rule_violated="Grammar: WhileStmt -> 'while' '(' Expr ')' Statement",
                suggested_fix="Wrap condition in parentheses: 'while (condition)'"
            ))

        condition = self.parse_expression()

        if not self.match(TokenType.RPAREN):
            self.errors.append(CompilerError(
                error_type=ErrorType.SYNTAX,
                message="Missing closing parenthesis ')' after 'while' condition",
                line=self.current_token().line,
                column=self.current_token().column,
                rule_violated="Grammar: Unclosed while condition parenthesis",
                suggested_fix="Add ')' after condition"
            ))

        body = self.parse_statement() or BlockNode([], line, col)
        return WhileStatementNode(condition=condition, body=body, line=line, column=col)

    def parse_print_statement(self) -> Optional[PrintStatementNode]:
        print_tok = self.advance()
        return self.parse_print_statement_body(print_tok.line, print_tok.column)

    def parse_print_statement_body(self, line: int, col: int) -> Optional[PrintStatementNode]:
        self.expect(TokenType.LPAREN, "Expected '(' after 'print'", fix="Add '(' before print argument")
        expr = self.parse_expression()
        self.expect(TokenType.RPAREN, "Expected ')' after print expression", fix="Add ')' to close print argument")
        self.expect(TokenType.SEMICOLON, "Missing ';' after print statement", fix="Add ';' at the end of statement")
        return PrintStatementNode(expression=expr, line=line, column=col)

    def parse_block(self) -> BlockNode:
        brace_tok = self.advance()
        line = brace_tok.line
        col = brace_tok.column
        stmts: List[ASTNode] = []

        while self.current_token().type not in (TokenType.RBRACE, TokenType.EOF):
            s = self.parse_statement()
            if s: stmts.append(s)

        if not self.match(TokenType.RBRACE):
            self.errors.append(CompilerError(
                error_type=ErrorType.SYNTAX,
                message="Unclosed block: missing closing brace '}'",
                line=self.current_token().line,
                column=self.current_token().column,
                rule_violated="Grammar: Block -> '{' Statement* '}'",
                suggested_fix="Add '}' to close block"
            ))

        return BlockNode(statements=stmts, line=line, column=col)

    # Precedence Climbing for Expressions
    def parse_expression(self) -> ASTNode:
        return self.parse_logical_or()

    def parse_logical_or(self) -> ASTNode:
        expr = self.parse_logical_and()
        while self.match(TokenType.OR):
            op = "||"
            line = self.tokens[self.pos - 1].line
            col = self.tokens[self.pos - 1].column
            right = self.parse_logical_and()
            expr = BinaryOpNode(left=expr, operator=op, right=right, line=line, column=col)
        return expr

    def parse_logical_and(self) -> ASTNode:
        expr = self.parse_equality()
        while self.match(TokenType.AND):
            op = "&&"
            line = self.tokens[self.pos - 1].line
            col = self.tokens[self.pos - 1].column
            right = self.parse_equality()
            expr = BinaryOpNode(left=expr, operator=op, right=right, line=line, column=col)
        return expr

    def parse_equality(self) -> ASTNode:
        expr = self.parse_relational()
        while self.current_token().type in (TokenType.EQ, TokenType.NEQ):
            op_tok = self.advance()
            right = self.parse_relational()
            expr = BinaryOpNode(left=expr, operator=op_tok.value, right=right, line=op_tok.line, column=op_tok.column)
        return expr

    def parse_relational(self) -> ASTNode:
        expr = self.parse_additive()
        while self.current_token().type in (TokenType.LT, TokenType.LTE, TokenType.GT, TokenType.GTE):
            op_tok = self.advance()
            right = self.parse_additive()
            expr = BinaryOpNode(left=expr, operator=op_tok.value, right=right, line=op_tok.line, column=op_tok.column)
        return expr

    def parse_additive(self) -> ASTNode:
        expr = self.parse_multiplicative()
        while self.current_token().type in (TokenType.PLUS, TokenType.MINUS):
            op_tok = self.advance()
            right = self.parse_multiplicative()
            expr = BinaryOpNode(left=expr, operator=op_tok.value, right=right, line=op_tok.line, column=op_tok.column)
        return expr

    def parse_multiplicative(self) -> ASTNode:
        expr = self.parse_unary()
        while self.current_token().type in (TokenType.MULTIPLY, TokenType.DIVIDE, TokenType.MODULO):
            op_tok = self.advance()
            right = self.parse_unary()
            expr = BinaryOpNode(left=expr, operator=op_tok.value, right=right, line=op_tok.line, column=op_tok.column)
        return expr

    def parse_unary(self) -> ASTNode:
        if self.current_token().type in (TokenType.MINUS, TokenType.NOT):
            op_tok = self.advance()
            operand = self.parse_unary()
            return UnaryOpNode(operator=op_tok.value, operand=operand, line=op_tok.line, column=op_tok.column)
        return self.parse_primary()

    def parse_primary(self) -> ASTNode:
        tok = self.current_token()

        if tok.type == TokenType.INT_LITERAL:
            self.advance()
            return LiteralNode(value=tok.value, literal_type="int", line=tok.line, column=tok.column)

        if tok.type == TokenType.FLOAT_LITERAL:
            self.advance()
            return LiteralNode(value=tok.value, literal_type="float", line=tok.line, column=tok.column)

        if tok.type == TokenType.STRING_LITERAL:
            self.advance()
            return LiteralNode(value=tok.value, literal_type="string", line=tok.line, column=tok.column)

        if tok.type in (TokenType.TRUE, TokenType.FALSE):
            self.advance()
            return LiteralNode(value=tok.value, literal_type="bool", line=tok.line, column=tok.column)

        if tok.type == TokenType.IDENTIFIER:
            self.advance()
            return IdentifierNode(name=tok.value, line=tok.line, column=tok.column)

        if self.match(TokenType.LPAREN):
            expr = self.parse_expression()
            if not self.match(TokenType.RPAREN):
                self.errors.append(CompilerError(
                    error_type=ErrorType.SYNTAX,
                    message="Missing closing parenthesis ')' in expression",
                    line=self.current_token().line,
                    column=self.current_token().column,
                    rule_violated="Grammar: Primary -> '(' Expr ')'",
                    suggested_fix="Add ')' to close grouped expression"
                ))
            return expr

        # Fallback for dangling operator
        self.errors.append(CompilerError(
            error_type=ErrorType.SYNTAX,
            message=f"Expected expression operand, found '{tok.value}' [{tok.type.name}]",
            line=tok.line,
            column=tok.column,
            offending_text=str(tok.value),
            rule_violated="Grammar: Expression must evaluate to a valid value",
            explanation="Encountered an operator or delimiter where a value or variable was expected.",
            suggested_fix="Provide a literal value or variable name"
        ))
        self.advance()
        return LiteralNode(value=0, literal_type="int", line=tok.line, column=tok.column)


# ==============================================================================
# 4. PHASE 3: SEMANTIC ANALYSIS (SYMBOL TABLE & TYPE CHECKER)
# ==============================================================================

@dataclass
class Symbol:
    name: str
    symbol_type: str # 'int', 'float', 'string', 'bool'
    line_declared: int
    is_initialized: bool = False

class SymbolTable:
    """Scoped Symbol Table for compile-time variable lookup and scope tracking."""
    def __init__(self, parent: Optional['SymbolTable'] = None, scope_name: str = "global"):
        self.parent = parent
        self.scope_name = scope_name
        self.symbols: Dict[str, Symbol] = {}

    def insert(self, symbol: Symbol) -> bool:
        if symbol.name in self.symbols:
            return False
        self.symbols[symbol.name] = symbol
        return True

    def lookup(self, name: str) -> Optional[Symbol]:
        if name in self.symbols:
            return self.symbols[name]
        if self.parent:
            return self.parent.lookup(name)
        return None

    def exists_in_current_scope(self, name: str) -> bool:
        return name in self.symbols

    def all_known_identifiers(self) -> List[str]:
        names = list(self.symbols.keys())
        if self.parent:
            names.extend(self.parent.all_known_identifiers())
        return list(set(names))


class SemanticAnalyzer:
    """
    Semantic Analyzer: Validates static semantics.
    Enforces rules beyond Context-Free Grammars:
      1. Variable declared before usage (with Levenshtein spell-check suggestions!)
      2. No duplicate declarations in identical scope
      3. Strict Type Compatibility in expressions and assignments
      4. Constant division-by-zero detection
    """

    def __init__(self):
        self.current_scope = SymbolTable(scope_name="global")
        self.all_scopes: List[SymbolTable] = [self.current_scope]
        self.errors: List[CompilerError] = []

    def enter_scope(self, name: str = "block") -> SymbolTable:
        new_scope = SymbolTable(parent=self.current_scope, scope_name=name)
        self.current_scope = new_scope
        self.all_scopes.append(new_scope)
        return new_scope

    def exit_scope(self):
        if self.current_scope.parent:
            self.current_scope = self.current_scope.parent

    def analyze(self, ast: ProgramNode) -> Tuple[SymbolTable, List[CompilerError]]:
        for stmt in ast.statements:
            self.visit_statement(stmt)
        return self.current_scope, self.errors

    def visit_statement(self, node: ASTNode):
        if isinstance(node, VarDeclNode):
            self.visit_var_decl(node)
        elif isinstance(node, AssignmentNode):
            self.visit_assignment(node)
        elif isinstance(node, IfStatementNode):
            self.visit_if(node)
        elif isinstance(node, WhileStatementNode):
            self.visit_while(node)
        elif isinstance(node, PrintStatementNode):
            self.visit_print(node)
        elif isinstance(node, BlockNode):
            self.enter_scope("block")
            for s in node.statements:
                self.visit_statement(s)
            self.exit_scope()

    def visit_var_decl(self, node: VarDeclNode):
        # 1. Duplicate declaration check in current scope
        if self.current_scope.exists_in_current_scope(node.name):
            prev = self.current_scope.symbols[node.name]
            self.errors.append(CompilerError(
                error_type=ErrorType.SEMANTIC,
                message=f"Duplicate declaration of variable '{node.name}' (already declared at line {prev.line_declared})",
                line=node.line,
                column=node.column,
                offending_text=node.name,
                rule_violated="Semantic Scope Rule: Identifiers must be unique within their local scope",
                explanation=f"Variable '{node.name}' was already defined in the current block at line {prev.line_declared}.",
                suggested_fix=f"Remove duplicate declaration 'var {node.name}' or rename variable to '{node.name}_2'"
            ))
            return

        inferred_type = node.var_type or "int"
        is_init = False

        if node.initializer:
            init_type = self.check_expression(node.initializer)
            is_init = True
            if node.var_type:
                # Type compatibility check
                if not self.are_types_compatible(node.var_type, init_type):
                    self.errors.append(CompilerError(
                        error_type=ErrorType.SEMANTIC,
                        message=f"Type Mismatch in declaration: Cannot assign type '{init_type}' to variable '{node.name}' of type '{node.var_type}'",
                        line=node.line,
                        column=node.column,
                        offending_text=f"{node.name}: {node.var_type} = {init_type}",
                        rule_violated="Semantic Type Rule: Declared type must match initializer expression type",
                        explanation=f"Cannot implicitly convert '{init_type}' to '{node.var_type}'.",
                        suggested_fix=f"Change variable type to '{init_type}' (var {node.name}: {init_type}) or initialize with a {node.var_type} value."
                    ))
            else:
                inferred_type = init_type

        sym = Symbol(
            name=node.name,
            symbol_type=inferred_type,
            line_declared=node.line,
            is_initialized=is_init
        )
        self.current_scope.insert(sym)

    def visit_assignment(self, node: AssignmentNode):
        sym = self.current_scope.lookup(node.name)
        if not sym:
            # Misspelled variable spell checking!
            known_ids = self.current_scope.all_known_identifiers()
            closest = find_closest_match(node.name, known_ids, max_dist=3)
            
            if closest:
                fix = f"Did you mean '{closest}'? (Edit distance: {levenshtein_distance(node.name, closest)})"
            else:
                fix = f"Declare variable first with 'var {node.name}: int = 0;' before assigning to it"

            self.errors.append(CompilerError(
                error_type=ErrorType.SEMANTIC,
                message=f"Undeclared identifier '{node.name}': Variable used before declaration",
                line=node.line,
                column=node.column,
                offending_text=node.name,
                rule_violated="Semantic Scope Rule: Variables must be declared in symbol table before assignment",
                explanation=f"Identifier '{node.name}' does not exist in the active symbol table scopes.",
                suggested_fix=fix,
                closest_match=closest
            ))
            # Register dummy symbol to suppress cascade
            dummy_type = self.check_expression(node.value_expr)
            self.current_scope.insert(Symbol(name=node.name, symbol_type=dummy_type, line_declared=node.line, is_initialized=True))
            return

        expr_type = self.check_expression(node.value_expr)
        if not self.are_types_compatible(sym.symbol_type, expr_type):
            self.errors.append(CompilerError(
                error_type=ErrorType.SEMANTIC,
                message=f"Type Mismatch in assignment: Variable '{node.name}' has type '{sym.symbol_type}', but assigned expression has type '{expr_type}'",
                line=node.line,
                column=node.column,
                offending_text=f"{node.name} = {expr_type}",
                rule_violated="Semantic Type Rule: Target variable type must match assigned value type",
                explanation=f"Cannot assign '{expr_type}' to a variable declared as '{sym.symbol_type}'.",
                suggested_fix=f"Change assigned value to type '{sym.symbol_type}' or re-declare '{node.name}' as '{expr_type}'"
            ))

        sym.is_initialized = True

    def visit_if(self, node: IfStatementNode):
        cond_type = self.check_expression(node.condition)
        if cond_type not in ("bool", "int"):
            self.errors.append(CompilerError(
                error_type=ErrorType.SEMANTIC,
                message=f"Condition expression must evaluate to boolean or numeric, got '{cond_type}'",
                line=node.line,
                column=node.column,
                rule_violated="Semantic Rule: Condition must be boolean expression",
                suggested_fix="Use a comparison operator like '==' or '>' to produce boolean."
            ))
        self.visit_statement(node.then_branch)
        if node.else_branch:
            self.visit_statement(node.else_branch)

    def visit_while(self, node: WhileStatementNode):
        cond_type = self.check_expression(node.condition)
        if cond_type not in ("bool", "int"):
            self.errors.append(CompilerError(
                error_type=ErrorType.SEMANTIC,
                message=f"While condition must evaluate to boolean, got '{cond_type}'",
                line=node.line,
                column=node.column,
                rule_violated="Semantic Rule: While loop condition must be boolean expression",
                suggested_fix="Wrap expression with a comparison like 'while (x > 0)'."
            ))
        self.visit_statement(node.body)

    def visit_print(self, node: PrintStatementNode):
        self.check_expression(node.expression)

    def check_expression(self, node: ASTNode) -> str:
        """Type synthesization for expressions."""
        if isinstance(node, LiteralNode):
            return node.literal_type

        if isinstance(node, IdentifierNode):
            sym = self.current_scope.lookup(node.name)
            if not sym:
                known_ids = self.current_scope.all_known_identifiers()
                closest = find_closest_match(node.name, known_ids, max_dist=3)
                if closest:
                    fix = f"Did you mean identifier '{closest}'?"
                else:
                    fix = f"Declare 'var {node.name}' before using it in expressions"

                self.errors.append(CompilerError(
                    error_type=ErrorType.SEMANTIC,
                    message=f"Undeclared identifier '{node.name}' used in expression",
                    line=node.line,
                    column=node.column,
                    offending_text=node.name,
                    rule_violated="Semantic Scope Rule: Variable must be declared prior to evaluation",
                    explanation=f"Identifier '{node.name}' has not been declared in any active scope.",
                    suggested_fix=fix,
                    closest_match=closest
                ))
                return "int"
            return sym.symbol_type

        if isinstance(node, UnaryOpNode):
            sub_type = self.check_expression(node.operand)
            if node.operator == '-':
                if sub_type not in ("int", "float"):
                    self.errors.append(CompilerError(
                        error_type=ErrorType.SEMANTIC,
                        message=f"Unary negation '-' cannot be applied to type '{sub_type}'",
                        line=node.line,
                        column=node.column,
                        rule_violated="Type Constraint: Unary '-' requires numeric type",
                        suggested_fix="Apply '-' only to numbers (int or float)."
                    ))
                return sub_type
            elif node.operator == '!':
                if sub_type != "bool":
                    self.errors.append(CompilerError(
                        error_type=ErrorType.SEMANTIC,
                        message=f"Logical NOT '!' requires boolean operand, got '{sub_type}'",
                        line=node.line,
                        column=node.column,
                        rule_violated="Type Constraint: Unary '!' requires boolean operand",
                        suggested_fix="Ensure operand evaluates to true or false."
                    ))
                return "bool"

        if isinstance(node, BinaryOpNode):
            left_t = self.check_expression(node.left)
            right_t = self.check_expression(node.right)
            op = node.operator

            # Division by literal zero check
            if op in ('/', '%') and isinstance(node.right, LiteralNode) and node.right.value == 0:
                self.errors.append(CompilerError(
                    error_type=ErrorType.SEMANTIC,
                    message="Division by constant zero detected at compile time",
                    line=node.line,
                    column=node.column,
                    offending_text=f"{op} 0",
                    rule_violated="Semantic Invariant: Denominator in division cannot be zero",
                    explanation="Dividing by zero is an undefined mathematical operation that crashes at runtime.",
                    suggested_fix="Replace '0' denominator with non-zero value or add check."
                ))

            # String concatenation (+)
            if op == '+':
                if left_t == "string" or right_t == "string":
                    return "string"

            # Arithmetic operators: +, -, *, /, %
            if op in ('+', '-', '*', '/', '%'):
                if left_t in ("int", "float") and right_t in ("int", "float"):
                    if left_t == "float" or right_t == "float":
                        return "float"
                    return "int"
                else:
                    self.errors.append(CompilerError(
                        error_type=ErrorType.SEMANTIC,
                        message=f"Invalid arithmetic operand types: '{left_t}' {op} '{right_t}'",
                        line=node.line,
                        column=node.column,
                        offending_text=f"{left_t} {op} {right_t}",
                        rule_violated="Semantic Type Rule: Arithmetic operations are only defined on numeric types",
                        explanation=f"Cannot apply '{op}' between '{left_t}' and '{right_t}'.",
                        suggested_fix="Convert operands to numbers or use matching numeric types."
                    ))
                    return "int"

            # Relational: <, <=, >, >=
            if op in ('<', '<=', '>', '>='):
                if left_t in ("int", "float") and right_t in ("int", "float"):
                    return "bool"
                self.errors.append(CompilerError(
                    error_type=ErrorType.SEMANTIC,
                    message=f"Relational operator '{op}' requires numeric operands, got '{left_t}' and '{right_t}'",
                    line=node.line,
                    column=node.column,
                    rule_violated="Semantic Rule: Order comparisons require numbers",
                    suggested_fix="Compare numbers only."
                ))
                return "bool"

            # Equality: ==, !=
            if op in ('==', '!='):
                if self.are_types_compatible(left_t, right_t):
                    return "bool"
                self.errors.append(CompilerError(
                    error_type=ErrorType.SEMANTIC,
                    message=f"Comparison between incomparable types: '{left_t}' {op} '{right_t}'",
                    line=node.line,
                    column=node.column,
                    rule_violated="Semantic Rule: Equality operands must share compatible types",
                    suggested_fix="Compare identical types."
                ))
                return "bool"

            # Logical: &&, ||
            if op in ('&&', '||'):
                if left_t == "bool" and right_t == "bool":
                    return "bool"
                self.errors.append(CompilerError(
                    error_type=ErrorType.SEMANTIC,
                    message=f"Logical operator '{op}' requires boolean operands, got '{left_t}' and '{right_t}'",
                    line=node.line,
                    column=node.column,
                    rule_violated="Semantic Rule: Logical operations require booleans",
                    suggested_fix="Use boolean conditions."
                ))
                return "bool"

        return "int"

    def are_types_compatible(self, target: str, source: str) -> bool:
        if target == source:
            return True
        if target == "float" and source == "int":
            return True
        return False


# ==============================================================================
# 5. PHASE 4: DETERMINISTIC HEURISTIC AUTO-CORRECTION (NO AI)
# ==============================================================================

@dataclass
class CorrectionAction:
    phase: ErrorType
    description: str
    original_line: int
    before_snippet: str
    after_snippet: str
    applied_heuristic: str

def auto_correct_code(source_code: str) -> Tuple[str, List[CorrectionAction]]:
    """
    Rule-Based Auto-Correction Algorithm (Deterministic, No AI Models):
    Executes a multi-pass heuristic repair pipeline:
      Pass 1: Lexical sanitization (removes illegal alphabet chars, closes unterminated strings)
      Pass 2: Identifier and keyword typo correction (Levenshtein distance matching)
      Pass 3: Syntax completion (inserts missing semicolons, balances braces/parens, repairs control flow)
      Pass 4: Semantic repair (auto-declares undeclared variables with type synthesis, fixes type mismatches)
    """
    actions: List[CorrectionAction] = []
    lines = source_code.split('\n')
    new_lines = list(lines)

    # ---------------- PASS 1: LEXICAL CORRECTIONS ----------------
    for i, line in enumerate(new_lines):
        # 1.1 Unterminated string literal check
        quote_count = 0
        in_escape = False
        for ch in line:
            if in_escape:
                in_escape = False
                continue
            if ch == '\\':
                in_escape = True
            elif ch == '"':
                quote_count += 1
        if quote_count % 2 != 0:
            if ');' in line:
                idx = line.rfind(');')
                repaired = line[:idx] + '"' + line[idx:]
            elif ';' in line:
                idx = line.rfind(';')
                repaired = line[:idx] + '"' + line[idx:]
            else:
                repaired = line + '"'
            actions.append(CorrectionAction(
                phase=ErrorType.LEXICAL,
                description="Closed unterminated string literal with matching '\"'",
                original_line=i + 1,
                before_snippet=line.strip(),
                after_snippet=repaired.strip(),
                applied_heuristic="Lexical String Termination Heuristic"
            ))
            line = repaired

        # 1.2 Illegal characters (e.g., @, $, ~, ^, #) outside quotes
        def strip_illegal(match):
            text = match.group(0)
            if text.startswith('"'):
                return text
            cleaned = re.sub(r'[@$#~^`]', '', text)
            return cleaned

        repaired_chars = re.sub(r'("[^"]*")|([^"]+)', strip_illegal, line)
        if repaired_chars != line:
            actions.append(CorrectionAction(
                phase=ErrorType.LEXICAL,
                description="Stripped illegal alphabet characters (@, $, #, ~, ^)",
                original_line=i + 1,
                before_snippet=line.strip(),
                after_snippet=repaired_chars.strip(),
                applied_heuristic="Alphabet Filtering Heuristic"
            ))
            line = repaired_chars

        new_lines[i] = line

    # ---------------- PASS 2: KEYWORD TYPO CORRECTIONS ----------------
    for i, line in enumerate(new_lines):
        words = re.findall(r'\b[a-zA-Z_]\w*\b', line)
        for w in words:
            if w not in KEYWORDS:
                closest_kw = find_closest_match(w, ["while", "print", "var", "int", "string", "bool", "float", "if", "else"], max_dist=1)
                # If followed by '(' it's strongly suspected to be while/if/print
                if closest_kw in ("while", "print", "if") and f"{w}(" in line.replace(" ", ""):
                    repaired_line = re.sub(r'\b' + re.escape(w) + r'\b', closest_kw, line)
                    actions.append(CorrectionAction(
                        phase=ErrorType.SYNTAX,
                        description=f"Corrected misspelled keyword '{w}' -> '{closest_kw}'",
                        original_line=i + 1,
                        before_snippet=line.strip(),
                        after_snippet=repaired_line.strip(),
                        applied_heuristic="Levenshtein Keyword Distance Heuristic"
                    ))
                    new_lines[i] = repaired_line
                    line = repaired_line

    # ---------------- PASS 3: SYNTAX CORRECTIONS ----------------
    for i, line in enumerate(new_lines):
        # Separate inline comment if present
        code_part = line
        comment_part = ""
        if "//" in line:
            c_idx = line.find("//")
            code_part = line[:c_idx]
            comment_part = line[c_idx:]

        # Skip blank lines and comments
        stripped = code_part.strip()
        if not stripped or stripped.startswith('/*'):
            continue

        # Semicolon insertion on missing statements
        if not (stripped.endswith(';') or stripped.endswith('{') or stripped.endswith('}')):
            is_var = re.match(r'^(var\s+[a-zA-Z_]\w*(\s*:\s*\w+)?(\s*=.*)?)$', stripped)
            is_assign = re.match(r'^([a-zA-Z_]\w*\s*=.*)$', stripped)
            is_print = re.match(r'^(print\s*\(.*\))$', stripped)

            if is_var or is_assign or is_print:
                # Check for dangling operators like `x = 5 +`
                repaired = stripped
                dangling_op = re.search(r'([+\-*/%<>=!&|])\s*$', repaired)
                if dangling_op:
                    repaired = repaired[:dangling_op.start()].rstrip()

                repaired_code = code_part.rstrip() + ';'
                repaired_line = repaired_code + (" " + comment_part if comment_part else "")
                actions.append(CorrectionAction(
                    phase=ErrorType.SYNTAX,
                    description="Inserted missing terminating semicolon ';'",
                    original_line=i + 1,
                    before_snippet=stripped,
                    after_snippet=repaired_line.strip(),
                    applied_heuristic="Grammar Statement Termination Heuristic"
                ))
                new_lines[i] = repaired_line
                code_part = repaired_code
                stripped = code_part.strip()

        # Control flow parentheses: if count > 5 { -> if (count > 5) {
        if stripped.startswith("if ") and not stripped.startswith("if ("):
            has_brace = stripped.endswith("{")
            inner = stripped[3:].strip()
            if has_brace:
                inner = inner[:-1].strip()
            repaired_stmt = f"if ({inner})" + (" {" if has_brace else "")
            leading_ws = len(code_part) - len(code_part.lstrip())
            new_lines[i] = (" " * leading_ws) + repaired_stmt + (" " + comment_part if comment_part else "")
            actions.append(CorrectionAction(
                phase=ErrorType.SYNTAX,
                description="Wrapped 'if' condition in required parentheses '( )'",
                original_line=i + 1,
                before_snippet=stripped,
                after_snippet=repaired_stmt,
                applied_heuristic="Grammar Control Structure Regularization"
            ))

    # Balance unclosed braces (ignoring braces inside comments or string literals)
    def count_code_braces(line_str: str) -> Tuple[int, int]:
        c = line_str.find("//")
        if c != -1:
            line_str = line_str[:c]
        # remove strings
        line_str = re.sub(r'"[^"]*"', '', line_str)
        return line_str.count('{'), line_str.count('}')

    open_braces = sum(count_code_braces(l)[0] for l in new_lines)
    close_braces = sum(count_code_braces(l)[1] for l in new_lines)
    if open_braces > close_braces:
        for _ in range(open_braces - close_braces):
            new_lines.append("}")
            actions.append(CorrectionAction(
                phase=ErrorType.SYNTAX,
                description="Appended missing closing brace '}' at end of block",
                original_line=len(new_lines),
                before_snippet="<EOF>",
                after_snippet="}",
                applied_heuristic="Bracket Balance Conservation Heuristic"
            ))

    # ---------------- PASS 4: SEMANTIC CORRECTIONS ----------------
    intermediate_code = "\n".join(new_lines)
    lex = Lexer(intermediate_code)
    toks, _ = lex.tokenize()
    parser = Parser(toks)
    ast, _ = parser.parse()
    analyzer = SemanticAnalyzer()
    analyzer.analyze(ast)

    # Collect undeclared variables and check if they are typos of declared variables
    # Only pick variables that were declared explicitly via var
    declared_names = [name for name, sym in analyzer.current_scope.symbols.items() if sym.line_declared > 0 and sym.name not in [e.offending_text for e in analyzer.errors]]
    undeclared_vars: Dict[str, Tuple[str, int]] = {}

    for err in analyzer.errors:
        if "Undeclared identifier" in err.message:
            ident = err.offending_text
            candidates = [c for c in declared_names if c != ident]
            closest = find_closest_match(ident, candidates, max_dist=2)
            if closest:
                # Replace typo with closest declared identifier!
                for idx, ln in enumerate(new_lines):
                    if re.search(r'\b' + re.escape(ident) + r'\b', ln):
                        rep = re.sub(r'\b' + re.escape(ident) + r'\b', closest, ln)
                        actions.append(CorrectionAction(
                            phase=ErrorType.SEMANTIC,
                            description=f"Replaced misspelled variable '{ident}' with closest declared identifier '{closest}'",
                            original_line=idx + 1,
                            before_snippet=ln.strip(),
                            after_snippet=rep.strip(),
                            applied_heuristic="Levenshtein Identifier Distance Resolution"
                        ))
                        new_lines[idx] = rep
            else:
                undeclared_vars[ident] = ("int", err.line)

    # Auto-declare missing variables that weren't typos
    if undeclared_vars:
        decl_lines = []
        for var_name, (inferred_type, original_line) in undeclared_vars.items():
            decl_stmt = f"var {var_name}: {inferred_type} = 0;"
            decl_lines.append(decl_stmt)
            actions.append(CorrectionAction(
                phase=ErrorType.SEMANTIC,
                description=f"Auto-declared missing identifier '{var_name}' with inferred type '{inferred_type}'",
                original_line=original_line,
                before_snippet=f"{var_name} (undeclared)",
                after_snippet=decl_stmt,
                applied_heuristic="Static Scope Hoisting & Type Synthesis Heuristic"
            ))
        new_lines = decl_lines + [""] + new_lines

    final_code = "\n".join(new_lines)
    return final_code, actions


# ==============================================================================
# 6. MASTER COMPILER AGENT PIPELINE
# ==============================================================================

@dataclass
class CompilationReport:
    is_valid: bool
    lexical_errors: List[CompilerError]
    syntax_errors: List[CompilerError]
    semantic_errors: List[CompilerError]
    all_errors: List[CompilerError]
    tokens: List[Token]
    ast: Optional[ProgramNode]
    symbol_table: Optional[SymbolTable]

    def summary(self) -> str:
        if self.is_valid:
            return "SUCCESS: Code passed Lexical, Syntax, and Semantic analysis with 0 errors!"
        return (
            f"FAILED: Found {len(self.all_errors)} error(s): "
            f"{len(self.lexical_errors)} Lexical, "
            f"{len(self.syntax_errors)} Syntax, "
            f"{len(self.semantic_errors)} Semantic."
        )


class CompilerAgent:
    """Master Compiler Agent unifying all 3 phases and error correction."""

    def analyze(self, source_code: str) -> CompilationReport:
        # Phase 1: Lexical
        lexer = Lexer(source_code)
        tokens, lex_errors = lexer.tokenize()

        # Phase 2: Syntax
        parser = Parser(tokens)
        ast, syn_errors = parser.parse()

        # Phase 3: Semantic
        analyzer = SemanticAnalyzer()
        sym_tab, sem_errors = analyzer.analyze(ast)

        all_errors = lex_errors + syn_errors + sem_errors
        is_valid = len(all_errors) == 0

        return CompilationReport(
            is_valid=is_valid,
            lexical_errors=lex_errors,
            syntax_errors=syn_errors,
            semantic_errors=sem_errors,
            all_errors=all_errors,
            tokens=tokens,
            ast=ast,
            symbol_table=sym_tab
        )

    def correct(self, source_code: str) -> Tuple[str, List[CorrectionAction], CompilationReport]:
        repaired_code, actions = auto_correct_code(source_code)
        post_report = self.analyze(repaired_code)
        return repaired_code, actions, post_report


# ==============================================================================
# 7. CLI DEMONSTRATION & TEST CASES
# ==============================================================================

SAMPLE_ERROR_CODE = """\
// UNIVERSITY COURSEWORK DEMO: Intentional 3-Phase Errors
var count = 10;
var total: int = 100;
cnt = count + 5;                // Semantic Error: Misspelled identifier 'cnt' (Did you mean 'count'?)
var price = 99@.50;             // Lexical Error: Illegal character '@'
if count > 5 {                  // Syntax Error: Missing parentheses '(count > 5)'
    print("Unclosed string);    // Lexical Error: Unterminated string
    var rate: int = 15          // Syntax Error: Missing semicolon ';'
// Syntax Error: Missing closing brace '}'
"""

def run_cli():
    print("=" * 75)
    print("  COMPILER DESIGN 3-PHASE ANALYZER & ERROR CORRECTION AGENT")
    print("  Target Language: SimpleLang | Deterministic Rule-Based Engine")
    print("=" * 75)

    agent = CompilerAgent()

    if len(sys.argv) > 1 and sys.argv[1] != "--demo":
        filename = sys.argv[1]
        try:
            with open(filename, 'r') as f:
                code = f.read()
            print(f"\n[+] Loaded source file: {filename}\n")
        except Exception as e:
            print(f"Error loading file: {e}")
            return
    else:
        print("\n[+] Running analysis on University Sample Program with intentional errors:\n")
        code = SAMPLE_ERROR_CODE

    source_lines = code.split('\n')
    report = agent.analyze(code)

    print(report.summary())
    print("-" * 75)

    if not report.is_valid:
        print("\n=== DETAILED ERROR EXPLORATION WITH SMART SUGGESTIONS ===\n")
        for err in report.all_errors:
            print(err.format_diagnostic(source_lines))
            print("." * 75)

        print("\n" + "=" * 75)
        print(">>> AUTO-CORRECTION AGENT INVOKED (Attempting Code Repair)...")
        print("=" * 75)

        repaired, actions, post_rep = agent.correct(code)

        print(f"\n[+] Applied {len(actions)} Deterministic Repair Actions:")
        for idx, act in enumerate(actions, 1):
            print(f"  {idx}. [{act.phase.value}] Line {act.original_line}: {act.description}")
            print(f"     Heuristic: {act.applied_heuristic}")
            print(f"     Before: {act.before_snippet}")
            print(f"     After:  {act.after_snippet}\n")

        print("=" * 75)
        print("=== REPAIRED SOURCE CODE ===")
        print("=" * 75)
        print(repaired)
        print("=" * 75)
        print(f"Post-Repair Analysis: {post_rep.summary()}")
    else:
        print("\nAll tokens recognized successfully:")
        for tok in report.tokens:
            print(f"  {tok}")

if __name__ == "__main__":
    run_cli()
