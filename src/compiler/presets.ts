export interface CodePreset {
  id: string;
  title: string;
  category: 'Benchmark' | 'Lexical' | 'Syntax' | 'Semantic' | 'Valid';
  description: string;
  code: string;
}

export const CODE_PRESETS: CodePreset[] = [
  {
    id: 'benchmark-all',
    title: 'University Benchmark (All 3 Error Types)',
    category: 'Benchmark',
    description: 'A realistic coursework test suite with misspelled identifiers, illegal characters, missing delimiters, and unclosed braces.',
    code: `// UNIVERSITY COURSEWORK BENCHMARK
var count = 10;
var total: int = 100;
cnt = count + 5;                // Semantic: Misspelled 'cnt' -> did you mean 'count'?
var price = 99@.50;             // Lexical: Illegal character '@'
if count > 5 {                  // Syntax: Missing parentheses '(count > 5)'
    print("Unclosed string);    // Lexical: Unterminated string
    var rate: int = 15          // Syntax: Missing semicolon ';'
// Syntax: Missing closing brace '}'`
  },
  {
    id: 'lexical-errors',
    title: 'Lexical Errors Playground',
    category: 'Lexical',
    description: 'Tests lexical scanner resilience against non-alphabet characters, bad number formats, and unclosed strings.',
    code: `// LEXICAL ANALYSIS ERRORS
var valid_name = 100;
var $currency = 50;              // Lexical: Illegal '$' symbol
var discount = 12.34.56;         // Lexical: Multiple decimal points
var message = "Hello Compiler;   // Lexical: Missing terminating quotation mark
var item#tag = 42;               // Lexical: Illegal '#' symbol
print(valid_name);`
  },
  {
    id: 'syntax-errors',
    title: 'Syntax Errors Playground',
    category: 'Syntax',
    description: 'Tests recursive descent parser handling of missing semicolons, condition syntax, and dangling expressions.',
    code: `// SYNTAX ANALYSIS ERRORS
var a: int = 10
var b: int = 20;

if a < b {
    print(a);
    b = a + 5

while (b > 0 {                   // Syntax: Missing closing parenthesis ')'
    b = b - 1;
// Syntax: Missing block closing brace '}'`
  },
  {
    id: 'semantic-errors',
    title: 'Semantic Errors & Type Checking',
    category: 'Semantic',
    description: 'Tests static semantics: scoped symbol table, undeclared identifier lookup, type compatibility, and division by zero.',
    code: `// SEMANTIC ANALYSIS ERRORS
var balance: int = 500;
var status: string = "active";
var balance: int = 900;          // Semantic: Duplicate declaration in same scope

balnce = balance - 50;           // Semantic: Misspelled 'balnce' (spell-check suggests 'balance')
var invalidAssign: int = "text"; // Semantic: Type mismatch (string to int)
var calculation = 100 / 0;       // Semantic: Compile-time constant division by zero
unknownVar = 42;                 // Semantic: Completely undeclared identifier`
  },
  {
    id: 'valid-program',
    title: 'Valid Program (0 Errors Clean Compilation)',
    category: 'Valid',
    description: 'A completely correct SimpleLang program that parses through all 3 stages with zero errors and produces full AST & Symbol Table.',
    code: `// VALID SIMPLELANG PROGRAM
var n: int = 5;
var factorial: int = 1;
var counter: int = 1;
var message: string = "Factorial computation complete!";

while (counter <= n) {
    factorial = factorial * counter;
    counter = counter + 1;
}

if (factorial > 100) {
    print("Factorial is greater than 100");
} else {
    print("Factorial is 100 or less");
}

print(factorial);
print(message);`
  }
];
