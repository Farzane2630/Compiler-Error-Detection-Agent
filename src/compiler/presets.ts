import { TargetLanguage } from './types';

export interface CodePreset {
  id: string;
  language: TargetLanguage;
  title: string;
  category: 'Benchmark' | 'Lexical' | 'Syntax' | 'Semantic' | 'Valid';
  description: string;
  code: string;
}

export const CODE_PRESETS: CodePreset[] = [
  // ================= PYTHON PRESETS =================
  {
    id: 'py-benchmark',
    language: 'python',
    title: 'Python Benchmark (All 3 Phases + Input Type)',
    category: 'Benchmark',
    description: 'Tests Python lexical, syntax, and semantic checks including input() str-vs-int type checking.',
    code: `# PYTHON COURSEWORK BENCHMARK
count = 10
age: int = input("Enter your age: ")   # Semantic: input() returns str, needs int(input(...))
cnt = count + 5                        # Semantic: Misspelled 'cnt' -> did you mean 'count'?
price = 99@.50                         # Lexical: Illegal '@' character
if count > 5                           # Syntax: Missing colon ':'
    print("Unclosed string)            # Lexical: Unterminated string`
  },
  {
    id: 'py-lexical',
    language: 'python',
    title: 'Python Lexical Errors',
    category: 'Lexical',
    description: 'Tests Python lexer against illegal symbols, bad numbers, digit-leading variables, and unclosed strings.',
    code: `# PYTHON LEXICAL ANALYSIS ERRORS
valid_name = 100
$currency = 50                 # Lexical: Illegal '$' symbol
discount = 12.34.56            # Lexical: Multiple decimal points
123item = 42                   # Lexical: Identifier cannot start with digit
message = "Hello Python        # Lexical: Missing closing quote
print(valid_name)`
  },
  {
    id: 'py-syntax',
    language: 'python',
    title: 'Python Syntax Errors',
    category: 'Syntax',
    description: 'Tests Python parser on missing colons, keyword typos, missing parentheses, and invalid C-style braces.',
    code: `# PYTHON SYNTAX ANALYSIS ERRORS
a = 10
b = 20

if a < b                       # Syntax: Missing ':' after if condition
    prnt(a)                    # Syntax: Misspelled keyword 'prnt' -> 'print'
    b = a + 5

whle b > 0:                    # Syntax: Misspelled keyword 'whle' -> 'while'
    b = b - 1`
  },
  {
    id: 'py-semantic',
    language: 'python',
    title: 'Python Semantic & Input Type Checking',
    category: 'Semantic',
    description: 'Tests input() str-to-int validation, type annotations, invalid int("abc") cast, and division by zero.',
    code: `# PYTHON SEMANTIC & INPUT TYPE CHECKING
user_age = input("Enter age: ")
next_year = user_age + 1               # Semantic: str + int (input() returns str!)
score: int = "ninety"                  # Semantic: Type mismatch (str assigned to int)
parsed = int("hello")                  # Semantic: ValueError - "hello" is str, not int
ratio = 100 / 0                        # Semantic: Division by zero`
  },
  {
    id: 'py-valid',
    language: 'python',
    title: 'Valid Python Program (0 Errors)',
    category: 'Valid',
    description: 'Clean Python 3 code with typed input conversion, loop, conditional, and zero compilation errors.',
    code: `# VALID PYTHON PROGRAM
n: int = int(input("Enter positive integer: "))
factorial: int = 1
counter: int = 1
message: str = "Factorial computation complete!"

while counter <= n:
    factorial = factorial * counter
    counter = counter + 1

if factorial > 100:
    print("Factorial is greater than 100")
else:
    print("Factorial is 100 or less")

print(factorial)
print(message)`
  },

  // ================= C++ PRESETS =================
  {
    id: 'cpp-benchmark',
    language: 'cpp',
    title: 'C++ Benchmark (All 3 Phases)',
    category: 'Benchmark',
    description: 'Tests C++ lexical, syntax, and semantic analysis inside int main().',
    code: `#include <iostream>
using namespace std;

int main() {
    int count = 10;
    int total = 100;
    cnt = count + 5;               // Semantic: Misspelled 'cnt' -> did you mean 'count'?
    float price = 99@.50;          // Lexical: Illegal '@' character
    if count > 5 {                 // Syntax: Missing parentheses '(count > 5)'
        cout << "Done"             // Syntax: Missing semicolon ';'
    return 0;
// Syntax: Missing closing brace '}'`
  },
  {
    id: 'cpp-lexical',
    language: 'cpp',
    title: 'C++ Lexical Errors',
    category: 'Lexical',
    description: 'Tests C++ scanner against illegal $, #, multiple decimal points, and unclosed strings.',
    code: `#include <iostream>
using namespace std;

int main() {
    int valid_name = 100;
    int $currency = 50;            // Lexical: Illegal '$' symbol
    float discount = 12.34.56;     // Lexical: Multiple decimal points
    string msg = "Hello C++;       // Lexical: Unterminated string literal
    cout << valid_name;
    return 0;
}`
  },
  {
    id: 'cpp-syntax',
    language: 'cpp',
    title: 'C++ Syntax Errors',
    category: 'Syntax',
    description: 'Tests C++ parser on missing semicolons, wrong cout/cin stream arrows, and unclosed parentheses.',
    code: `#include <iostream>
using namespace std;

int main() {
    int a = 10
    int b = 20;
    cout >> a;                     // Syntax: Wrong stream operator '>>' with cout
    while (b > 0 {                 // Syntax: Missing closing ')'
        b = b - 1;
    }
    return 0;
}`
  },
  {
    id: 'cpp-semantic',
    language: 'cpp',
    title: 'C++ Semantic & Type Checking',
    category: 'Semantic',
    description: 'Tests C++ duplicate declarations, static type mismatches, misspelled vars, and division by zero.',
    code: `#include <iostream>
using namespace std;

int main() {
    int balance = 500;
    string status = "active";
    int balance = 900;             // Semantic: Duplicate declaration
    balnce = balance - 50;         // Semantic: Misspelled 'balnce' -> 'balance'
    int invalidAssign = "text";    // Semantic: Cannot assign string to int
    int calc = 100 / 0;            // Semantic: Division by zero
    return 0;
}`
  },
  {
    id: 'cpp-valid',
    language: 'cpp',
    title: 'Valid C++ Program (0 Errors)',
    category: 'Valid',
    description: 'Clean C++17 program using <iostream>, cin input, typed variables, while loop, and if/else.',
    code: `#include <iostream>
using namespace std;

int main() {
    int n = 5;
    int factorial = 1;
    int counter = 1;
    string message = "Factorial computation complete!";

    cin >> n;

    while (counter <= n) {
        factorial = factorial * counter;
        counter = counter + 1;
    }

    if (factorial > 100) {
        cout << "Factorial is greater than 100" << endl;
    } else {
        cout << "Factorial is 100 or less" << endl;
    }

    cout << factorial << endl;
    cout << message << endl;
    return 0;
}`
  }
];
