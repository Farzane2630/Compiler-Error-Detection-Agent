# Compiler Design Project: 3-Phase Code Analyzer & Error Correction Agent

**Course:** Compiler Design (University Coursework)  
**Target Language:** SimpleLang (Statically-typed procedural language)  
**Implementation:** Pure Standard Python 3 (zero third-party `pip` dependencies)  
**Constraint Verification:** 100% deterministic programming algorithms — **NO AI or LLM models used**.

---

## 1. Architecture Overview

This project implements the classical front-end of a language compiler along with an automated error-recovery and heuristic correction system:

```
[ Raw Source Code ]
        │
        ▼
[ Phase 1: Lexical Analyzer (Scanner) ] ──────> Tokens Stream + Lexical Errors
        │
        ▼
[ Phase 2: Syntax Analyzer (Parser) ]   ──────> Abstract Syntax Tree (AST) + Syntax Errors
        │
        ▼
[ Phase 3: Semantic Analyzer (Checker) ]──────> Scoped Symbol Table + Semantic Errors
        │
        ▼
[ Deterministic Auto-Correction Agent ] ──────> Repaired Valid Source Code
```

---

## 2. The Three Compiler Phases

### Phase 1: Lexical Analysis (Scanner)
- **Role:** Converts the character stream into a sequence of classified `Token` objects (Keywords, Identifiers, Numbers, Operators, Delimiters).
- **Error Detection:**
  1. Characters not in the language alphabet $\Sigma$ (e.g., `@`, `$`, `~`, `^`).
  2. Unterminated string literals (unclosed `"` reaching newline or EOF).
  3. Malformed number literals (multiple decimal points `12.34.56` or identifiers starting with digits `123abc`).
- **Correction Suggestions:**
  - Suggests removing illegal characters or replacing keyboard typos.
  - Suggests closing quotation marks at the appropriate column.

### Phase 2: Syntax Analysis (Parser)
- **Role:** Implements a top-down **Recursive Descent Parser** following an unambiguous Context-Free Grammar (CFG) in EBNF format, with operator precedence climbing for arithmetic and logical expressions.
- **Error Detection:**
  1. Missing statement terminators (semicolons `;`).
  2. Missing conditional parentheses in `if` and `while` structures (`if (condition)`).
  3. Unclosed blocks or unmatched delimiters (`{ ... }`, `( ... )`).
  4. Misspelled control keywords (e.g., `whle`, `prnt`).
  5. Dangling operators or unexpected tokens at statement start.
- **Correction Suggestions:**
  - Suggests exact semicolon insertions (`Add missing semicolon ';' at line L, col C`).
  - Suggests wrapping condition expressions in `( ... )`.
  - Suggests closest keyword using Levenshtein distance $\le 2$ (e.g., `whle` $\to$ `while`).

### Phase 3: Semantic Analysis (Type & Scope Checker)
- **Role:** Operates on the AST to verify context-sensitive rules using a scoped hierarchical **Symbol Table**.
- **Error Detection:**
  1. **Undeclared Variables:** Identifier used without prior `var` declaration.
  2. **Duplicate Declarations:** Re-declaring a variable within the same local block scope.
  3. **Static Type Incompatibilities:** Assigning a string literal to an integer variable, or performing arithmetic between incompatible types.
  4. **Compile-Time Division by Zero:** Detects literal zero denominators (`x = 10 / 0`).
- **Intelligent Spell-Check Correction:**
  - Uses dynamic programming **Levenshtein Distance** to search active symbol tables.
  - If a variable `cnt` is used and `count` exists with edit distance $\le 2$, the agent suggests:
    `"Did you mean 'count'? (Edit distance: 2)"` and automatically resolves the typo!

---

## 3. How Error Auto-Correction Works Without AI

All repairs follow deterministic, explainable compiler theory heuristics:
1. **Alphabet Filtering:** Sanitizes illegal symbols not belonging to alphabet $\Sigma$.
2. **Levenshtein Spell Resolution:** Replaces misspelled identifiers and control keywords with their closest known counterparts.
3. **Statement Regularization:** Appends terminating semicolons to statements lacking them before comments or newlines.
4. **Bracket Balance Conservation:** Counts unescaped braces outside comments and appends missing closing braces `}` at EOF.
5. **Scope Hoisting:** Automatically declares any remaining missing variables at top-level with synthesized types based on their usage.

---

## 4. How to Run

### Run built-in university coursework demonstration:
```bash
python3 compiler_agent.py
```

### Analyze any custom source file:
```bash
python3 compiler_agent.py my_code.txt
```

---

## 5. Sample Viva / Oral Defense Questions

1. **Q: Why is your parser recursive descent instead of shift-reduce / LR?**  
   *A:* Recursive descent is intuitive, modular, has $O(n)$ time complexity for $LL(1)$ grammars, and produces clear, precise error diagnostics with line/column coordinates.
2. **Q: How does your symbol table handle nested scopes?**  
   *A:* Each block (`{ ... }`) creates a new `SymbolTable` that holds a pointer to its parent enclosing scope. Variable resolution climbs upward from current scope to global.
3. **Q: How can you prove no AI models were used?**  
   *A:* The code relies exclusively on standard Python data structures, regular expression state scanners, recursive descent parse functions, dynamic programming Levenshtein distance matrices, and deterministic AST traversal.
