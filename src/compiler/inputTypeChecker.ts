import { DetectedDataType, InputTypeCheckResult } from './types';

/**
 * Deterministic rule-based Input Type Checker (No AI).
 * Classifies a raw string input into int, float, bool, str, or empty
 * and validates whether it satisfies an expected target type.
 */
export function detectInputType(raw: string): {
  detectedType: DetectedDataType;
  compatibleTypes: DetectedDataType[];
  ruleExplanation: string;
} {
  const trimmed = raw.trim();

  if (trimmed.length === 0) {
    return {
      detectedType: 'empty',
      compatibleTypes: ['str'],
      ruleExplanation:
        'Input is empty or whitespace-only. Python input() returns an empty str ""; numeric parsers (int/float) fail with ValueError.'
    };
  }

  // 1. Boolean grammar check (Python: True/False, C++: true/false)
  if (trimmed === 'True' || trimmed === 'False' || trimmed === 'true' || trimmed === 'false') {
    return {
      detectedType: 'bool',
      compatibleTypes: ['bool', 'str'],
      ruleExplanation: `Matched Boolean keyword grammar ('${trimmed}'). Recognized as bool (and valid as raw str).`
    };
  }

  // 2. Integer grammar check: optional sign followed strictly by digits
  if (/^[+-]?\d+$/.test(trimmed)) {
    return {
      detectedType: 'int',
      compatibleTypes: ['int', 'float', 'str'],
      ruleExplanation: `Matched Integer lexical pattern ^[+-]?\\d+$ ('${trimmed}'). Safely convertible to int, float, or str.`
    };
  }

  // 3. Floating-point grammar check: digits with single decimal point (or scientific notation)
  if (/^[+-]?(?:\d+\.\d+|\d+\.|\.\d+)(?:[eE][+-]?\d+)?$/.test(trimmed)) {
    return {
      detectedType: 'float',
      compatibleTypes: ['float', 'str'],
      ruleExplanation: `Matched Floating-Point lexical pattern ('${trimmed}'). Valid as float and str, but truncates/fails strict int() parsing.`
    };
  }

  // 4. Malformed numeric-looking string (e.g. "12.34.56" or "123abc")
  if (/^[+-]?\d+\.\d+(?:\.\d+)+$/.test(trimmed)) {
    return {
      detectedType: 'str',
      compatibleTypes: ['str'],
      ruleExplanation: `Contains multiple decimal points ('${trimmed}'), violating numeric grammar. Classified strictly as str (cannot parse as int or float).`
    };
  }

  if (/^[+-]?\d+[a-zA-Z_]+/.test(trimmed)) {
    return {
      detectedType: 'str',
      compatibleTypes: ['str'],
      ruleExplanation: `Starts with digits followed by letters ('${trimmed}'). Not a valid numeric literal; only valid as str.`
    };
  }

  // 5. Fallback: String
  return {
    detectedType: 'str',
    compatibleTypes: ['str'],
    ruleExplanation: `Contains non-numeric text characters ('${trimmed}'). Classified as string (str / std::string).`
  };
}

export function checkInputAgainstType(
  rawInput: string,
  expectedType: DetectedDataType | 'auto'
): InputTypeCheckResult {
  const { detectedType, compatibleTypes, ruleExplanation } = detectInputType(rawInput);
  const trimmed = rawInput.trim();

  const isValidForExpected =
    expectedType === 'auto'
      ? detectedType !== 'empty'
      : compatibleTypes.includes(expectedType) && (expectedType === 'str' || detectedType !== 'empty');

  let pythonCastHint = `val = input("Enter value: ")  # returns str`;
  let cppTypeHint = `std::string val;\nstd::cin >> val;`;

  if (detectedType === 'int') {
    pythonCastHint = `val = int(input("Enter integer: "))  # converts '${trimmed}' -> int`;
    cppTypeHint = `int val;\nstd::cin >> val;  // extracts integer ${trimmed}`;
  } else if (detectedType === 'float') {
    pythonCastHint = `val = float(input("Enter float: "))  # converts '${trimmed}' -> float`;
    cppTypeHint = `double val;  // or float\nstd::cin >> val;`;
  } else if (detectedType === 'bool') {
    pythonCastHint = `val = input("Enter bool: ").strip().lower() == "true"`;
    cppTypeHint = `bool val;\nstd::cin >> std::boolalpha >> val;`;
  }

  let errorMessage: string | undefined;
  let suggestedFix: string | undefined;

  if (!isValidForExpected && expectedType !== 'auto') {
    if (detectedType === 'empty') {
      errorMessage = `Type Check Error: Expected '${expectedType}', but input is empty.`;
      suggestedFix =
        expectedType === 'int'
          ? 'Enter digits such as 42 or -7'
          : expectedType === 'float'
          ? 'Enter a decimal number such as 3.14'
          : expectedType === 'bool'
          ? 'Enter True/False (Python) or true/false (C++)'
          : 'Enter a non-empty value';
    } else {
      errorMessage = `Type Mismatch: Expected '${expectedType}', but input '${rawInput}' has type '${detectedType}'.`;
      if (expectedType === 'int') {
        if (detectedType === 'float') {
          suggestedFix = `Remove decimal part (e.g. '${Math.trunc(Number(trimmed))}') or change expected type to 'float'.`;
        } else {
          suggestedFix = `Provide integer digits only (e.g. '42'), or treat input as '${detectedType}'.`;
        }
      } else if (expectedType === 'float') {
        suggestedFix = `Provide a valid numeric value like '3.14' or '10'.`;
      } else if (expectedType === 'bool') {
        suggestedFix = `Use 'True' / 'False' (Python) or 'true' / 'false' (C++).`;
      }
    }
  }

  return {
    rawInput,
    detectedType,
    expectedType,
    isValidForExpected,
    compatibleTypes,
    ruleExplanation,
    pythonCastHint,
    cppTypeHint,
    errorMessage,
    suggestedFix
  };
}
