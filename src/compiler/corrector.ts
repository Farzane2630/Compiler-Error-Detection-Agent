import { CompilerError, CorrectionAction, ErrorPhase, TargetLanguage } from './types';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semantic';
import { findClosestMatch } from './levenshtein';

function splitCodeAndComment(line: string, language: TargetLanguage): { codePart: string; commentPart: string } {
  let inQuotes: string | null = null;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (inQuotes) {
      if (ch === '\\') {
        i++;
        continue;
      }
      if (ch === inQuotes) {
        inQuotes = null;
      }
    } else {
      if (ch === '"' || ch === "'") {
        inQuotes = ch;
      } else if (language === 'python' && ch === '#') {
        return { codePart: line.slice(0, i), commentPart: line.slice(i) };
      } else if (language === 'cpp' && ch === '/' && line[i + 1] === '/') {
        return { codePart: line.slice(0, i), commentPart: line.slice(i) };
      }
    }
  }
  return { codePart: line, commentPart: '' };
}

export function autoCorrectCode(
  sourceCode: string,
  language: TargetLanguage = 'python'
): { correctedCode: string; actions: CorrectionAction[] } {
  if (language === 'python') {
    return autoCorrectPython(sourceCode);
  }
  return autoCorrectCpp(sourceCode);
}

function autoCorrectPython(sourceCode: string): { correctedCode: string; actions: CorrectionAction[] } {
  const actions: CorrectionAction[] = [];
  const newLines = sourceCode.split('\n');

  // ================= PASS 1: PYTHON LEXICAL CORRECTIONS =================
  for (let i = 0; i < newLines.length; i++) {
    let line = newLines[i];
    const { codePart, commentPart } = splitCodeAndComment(line, 'python');

    // 1.1 Unterminated string literal
    let activeQuote: string | null = null;
    let esc = false;
    for (let c = 0; c < codePart.length; c++) {
      const ch = codePart[c];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') esc = true;
      else if (!activeQuote && (ch === '"' || ch === "'")) activeQuote = ch;
      else if (activeQuote === ch) activeQuote = null;
    }

    if (activeQuote) {
      let repairedCode = codePart;
      if (codePart.trimEnd().endsWith(')')) {
        const idx = codePart.lastIndexOf(')');
        repairedCode = codePart.slice(0, idx) + activeQuote + codePart.slice(idx);
      } else {
        repairedCode = codePart.trimEnd() + activeQuote;
      }
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: `Closed unterminated Python string literal with ${activeQuote}`,
        originalLine: i + 1,
        beforeSnippet: codePart.trim(),
        afterSnippet: repairedCode.trim(),
        appliedHeuristic: 'Lexical String Termination Heuristic'
      });
      line = repairedCode + (commentPart ? ' ' + commentPart : '');
    }

    // 1.2 Malformed floats (e.g. 12.34.56 -> 12.3456)
    const s1 = splitCodeAndComment(line, 'python');
    const fixedNums = s1.codePart.replace(/("[^"]*"|'[^']*')|(\b\d+\.\d+(?:\.\d+)+\b)/g, (m, str, num) => {
      if (str) return str;
      const firstDot = num.indexOf('.');
      return num.slice(0, firstDot + 1) + num.slice(firstDot + 1).replace(/\./g, '');
    });
    if (fixedNums !== s1.codePart) {
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Removed redundant decimal point(s) in malformed float literal',
        originalLine: i + 1,
        beforeSnippet: s1.codePart.trim(),
        afterSnippet: fixedNums.trim(),
        appliedHeuristic: 'Numeric Format Normalization Heuristic'
      });
      line = fixedNums + s1.commentPart;
    }

    // 1.3 Replace && / || with and / or, strip illegal @$~`
    const s2 = splitCodeAndComment(line, 'python');
    let cleaned = s2.codePart.replace(/("[^"]*"|'[^']*')|([^"']+)/g, (m, str, other) => {
      if (str) return str;
      return other
        .replace(/&&/g, ' and ')
        .replace(/\|\|/g, ' or ')
        .replace(/[@$~^`]/g, '');
    });
    if (cleaned !== s2.codePart) {
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Removed illegal Python characters / normalized logical operators',
        originalLine: i + 1,
        beforeSnippet: s2.codePart.trim(),
        afterSnippet: cleaned.trim(),
        appliedHeuristic: 'Python Alphabet & Operator Normalization'
      });
      line = cleaned + s2.commentPart;
    }

    // 1.4 Digit-leading identifier (e.g. 123abc -> _123abc)
    const s3 = splitCodeAndComment(line, 'python');
    const fixedIdents = s3.codePart.replace(/("[^"]*"|'[^']*')|\b(\d+[a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m, str, bad) => {
      if (str) return str;
      return `_${bad}`;
    });
    if (fixedIdents !== s3.codePart) {
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Prefixed digit-leading Python identifier with underscore',
        originalLine: i + 1,
        beforeSnippet: s3.codePart.trim(),
        afterSnippet: fixedIdents.trim(),
        appliedHeuristic: 'Identifier Alphabet Compliance Heuristic'
      });
      line = fixedIdents + s3.commentPart;
    }

    newLines[i] = line;
  }

  // ================= PASS 2: PYTHON KEYWORD & SYNTAX CORRECTIONS =================
  const PY_KWS = ['while', 'print', 'if', 'elif', 'else', 'def', 'for', 'return', 'input'];
  for (let i = 0; i < newLines.length; i++) {
    let line = newLines[i];
    const { codePart, commentPart } = splitCodeAndComment(line, 'python');
    const leadingWs = codePart.slice(0, codePart.length - codePart.trimStart().length);
    let stripped = codePart.trim();
    if (!stripped) continue;

    // 2.1 Misspelled keyword at line start (whle -> while, prnt -> print, dfe -> def)
    const firstWordMatch = /^([a-zA-Z_]\w*)\b(.*)$/.exec(stripped);
    if (firstWordMatch) {
      const [, word, rest] = firstWordMatch;
      if (!PY_KWS.includes(word) && !['int', 'float', 'str', 'bool', 'True', 'False', 'None'].includes(word)) {
        const closest = findClosestMatch(word, PY_KWS, 1);
        if (
          closest &&
          ((closest === 'print' && rest.trim().startsWith('(')) ||
            (['while', 'if', 'def'].includes(closest) && !rest.trim().startsWith('=')))
        ) {
          const updated = closest + rest;
          actions.push({
            phase: ErrorPhase.SYNTAX,
            description: `Corrected misspelled Python keyword '${word}' -> '${closest}'`,
            originalLine: i + 1,
            beforeSnippet: stripped,
            afterSnippet: updated,
            appliedHeuristic: 'Levenshtein Keyword Distance Heuristic'
          });
          stripped = updated;
        }
      }
    }

    // 2.2 Remove C-style braces `{` `}` on Python headers
    if (stripped.endsWith('{')) {
      const withoutBrace = stripped.slice(0, -1).trimEnd();
      const updated = withoutBrace.endsWith(':') ? withoutBrace : withoutBrace + ':';
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Replaced C-style '{' with Python ':'",
        originalLine: i + 1,
        beforeSnippet: stripped,
        afterSnippet: updated,
        appliedHeuristic: 'Python Block Delimiter Heuristic'
      });
      stripped = updated;
    }
    if (stripped === '}') {
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Removed invalid C-style closing brace '}' in Python",
        originalLine: i + 1,
        beforeSnippet: '}',
        afterSnippet: '(removed)',
        appliedHeuristic: 'Python Block Delimiter Heuristic'
      });
      newLines[i] = '';
      continue;
    }

    // 2.3 Insert missing ':' on if/elif/else/while/for/def
    if (/^(if\s+.+|elif\s+.+|else|while\s+.+|for\s+.+\s+in\s+.+|def\s+\w+\s*\(.*\)(?:\s*->\s*\w+)?)$/.test(stripped) && !stripped.endsWith(':')) {
      const updated = stripped + ':';
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Inserted missing colon ':' at end of Python block header",
        originalLine: i + 1,
        beforeSnippet: stripped,
        afterSnippet: updated,
        appliedHeuristic: 'Python Header Colon Rule'
      });
      stripped = updated;
    }

    // 2.4 Close missing ')' in call/print lines
    let parenBalance = 0;
    let inStr: string | null = null;
    for (const ch of stripped) {
      if (inStr) {
        if (ch === inStr) inStr = null;
      } else {
        if (ch === '"' || ch === "'") inStr = ch;
        else if (ch === '(') parenBalance++;
        else if (ch === ')') parenBalance--;
      }
    }
    if (parenBalance > 0) {
      const colonSuffix = stripped.endsWith(':') ? ':' : '';
      const base = colonSuffix ? stripped.slice(0, -1).trimEnd() : stripped;
      const updated = base + ')'.repeat(parenBalance) + colonSuffix;
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: `Added ${parenBalance} missing closing parenthesis ')'`,
        originalLine: i + 1,
        beforeSnippet: stripped,
        afterSnippet: updated,
        appliedHeuristic: 'Parenthesis Balance Heuristic'
      });
      stripped = updated;
    }

    // 2.5 Replace `string` type annotation with `str`
    if (/^[a-zA-Z_]\w*\s*:\s*string\b/.test(stripped)) {
      const updated = stripped.replace(/^([a-zA-Z_]\w*\s*:\s*)string\b/, '$1str');
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Replaced invalid type annotation 'string' with Python 'str'",
        originalLine: i + 1,
        beforeSnippet: stripped,
        afterSnippet: updated,
        appliedHeuristic: 'Python Built-in Type Name Normalization'
      });
      stripped = updated;
    }

    newLines[i] = leadingWs + stripped + (commentPart ? ' ' + commentPart : '');
  }

  // ================= PASS 3: PYTHON SEMANTIC & INPUT TYPE CORRECTIONS =================
  const runPySemantic = (lines: string[]) => {
    const code = lines.join('\n');
    const lexer = new Lexer(code, 'python');
    const { tokens } = lexer.tokenize();
    const parser = new Parser(tokens, 'python');
    const { ast } = parser.parse();
    const analyzer = new SemanticAnalyzer('python');
    analyzer.analyze(ast);
    return analyzer;
  };

  let analyzer = runPySemantic(newLines);

  // 3.1 Fix `x: int = input(...)` -> `x: int = int(input(...))` and type annotation mismatches
  for (const err of analyzer.errors) {
    const idx = err.line - 1;
    if (idx < 0 || idx >= newLines.length) continue;
    const { codePart, commentPart } = splitCodeAndComment(newLines[idx], 'python');
    const leadingWs = codePart.slice(0, codePart.length - codePart.trimStart().length);
    const stripped = codePart.trim();

    if (err.message.includes('Input Type Error: input() returns')) {
      const m = /^([a-zA-Z_]\w*)\s*:\s*(int|float|bool)\s*=\s*(input\(.*\))$/.exec(stripped);
      if (m) {
        const [, varName, tName, call] = m;
        const updated = `${varName}: ${tName} = ${tName}(${call})`;
        newLines[idx] = leadingWs + updated + (commentPart ? ' ' + commentPart : '');
        actions.push({
          phase: ErrorPhase.SEMANTIC,
          description: `Wrapped input() in ${tName}(...) so '${varName}' receives type '${tName}'`,
          originalLine: err.line,
          beforeSnippet: stripped,
          afterSnippet: updated,
          appliedHeuristic: 'Input Type Conversion Heuristic'
        });
      }
    } else if (err.message.includes('Type Mismatch: Cannot assign')) {
      const m = /^([a-zA-Z_]\w*)\s*:\s*(int|float|str|bool)\s*=\s*(.+)$/.exec(stripped);
      if (m) {
        const [, varName, , rhs] = m;
        const rhsTrim = rhs.trim();
        let inferred = 'str';
        if (/^["'].*["']$/.test(rhsTrim)) inferred = 'str';
        else if (rhsTrim === 'True' || rhsTrim === 'False') inferred = 'bool';
        else if (/^\d+\.\d+$/.test(rhsTrim)) inferred = 'float';
        else if (/^\d+$/.test(rhsTrim)) inferred = 'int';
        const updated = `${varName}: ${inferred} = ${rhs}`;
        newLines[idx] = leadingWs + updated + (commentPart ? ' ' + commentPart : '');
        actions.push({
          phase: ErrorPhase.SEMANTIC,
          description: `Aligned Python type annotation of '${varName}' to '${inferred}'`,
          originalLine: err.line,
          beforeSnippet: stripped,
          afterSnippet: updated,
          appliedHeuristic: 'Static Type Alignment Heuristic'
        });
      }
    } else if (err.message.includes('ValueError: invalid literal for int()') || err.message.includes('ValueError: invalid literal for float()')) {
      const m = /(int|float)\((["'])(.*?)\2\)/.exec(stripped);
      if (m) {
        const updated = stripped.replace(/(int|float)\((["'])(.*?)\2\)/, '$2$3$2');
        newLines[idx] = leadingWs + updated + (commentPart ? ' ' + commentPart : '');
        actions.push({
          phase: ErrorPhase.SEMANTIC,
          description: `Removed invalid ${m[1]}() cast around non-numeric string literal "${m[3]}"`,
          originalLine: err.line,
          beforeSnippet: stripped,
          afterSnippet: updated,
          appliedHeuristic: 'Safe Literal Type Preservation Heuristic'
        });
      }
    }
  }

  // 3.2 Fix `x = input(...)` followed by `x + 5` or `x > 10` -> `x = int(input(...))`
  analyzer = runPySemantic(newLines);
  for (const err of analyzer.errors) {
    if (err.message.includes('input() returns str') || err.message.includes("Cannot add 'str'") || err.message.includes('Invalid arithmetic operand')) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const { codePart } = splitCodeAndComment(newLines[idx], 'python');
        // Find if any variable on this line was assigned input() earlier
        const idents = codePart.match(/\b[a-zA-Z_]\w*\b/g) || [];
        for (const id of idents) {
          for (let prev = idx - 1; prev >= 0; prev--) {
            const prevSplit = splitCodeAndComment(newLines[prev], 'python');
            const prevWs = prevSplit.codePart.slice(0, prevSplit.codePart.length - prevSplit.codePart.trimStart().length);
            const prevTrim = prevSplit.codePart.trim();
            const inpMatch = new RegExp(`^${id}\\s*=\\s*(input\\(.*\\))$`).exec(prevTrim);
            if (inpMatch) {
              const updated = `${id} = int(${inpMatch[1]})`;
              newLines[prev] = prevWs + updated + (prevSplit.commentPart ? ' ' + prevSplit.commentPart : '');
              actions.push({
                phase: ErrorPhase.SEMANTIC,
                description: `Converted '${id} = input(...)' to 'int(input(...))' for numeric operation on line ${err.line}`,
                originalLine: prev + 1,
                beforeSnippet: prevTrim,
                afterSnippet: updated,
                appliedHeuristic: 'Input Numeric Coercion Heuristic'
              });
              break;
            }
          }
        }
      }
    }
  }

  // 3.3 Fix Division by Zero
  analyzer = runPySemantic(newLines);
  for (const err of analyzer.errors) {
    if (err.message.includes('Division by constant zero') && err.line > 0) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const { codePart, commentPart } = splitCodeAndComment(newLines[idx], 'python');
        const rep = codePart.replace(/(\/\/\s*|\/\s*|%\s*)0\b/g, '$11');
        if (rep !== codePart) {
          newLines[idx] = rep + commentPart;
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: 'Replaced constant zero divisor with 1',
            originalLine: err.line,
            beforeSnippet: codePart.trim(),
            afterSnippet: rep.trim(),
            appliedHeuristic: 'Division-by-Zero Guard Heuristic'
          });
        }
      }
    }
  }

  // 3.4 Resolve misspelled variables & undeclared names
  analyzer = runPySemantic(newLines);
  const declaredNames = analyzer.collectedSymbols
    .filter((s) => s.lineDeclared > 0 && !analyzer.errors.some((e) => e.offendingText === s.name))
    .map((s) => s.name);

  const undeclaredToInit: string[] = [];
  for (const err of analyzer.errors) {
    if (
      (err.message.includes('Undeclared identifier') || err.message.includes('Possible misspelled variable')) &&
      err.offendingText
    ) {
      const ident = err.offendingText;
      const closest = err.closestMatch || findClosestMatch(ident, declaredNames.filter((n) => n !== ident), 2);
      const idx = err.line - 1;
      if (closest && idx >= 0 && idx < newLines.length) {
        const { codePart, commentPart } = splitCodeAndComment(newLines[idx], 'python');
        const regex = new RegExp(`\\b${ident}\\b`, 'g');
        const rep = codePart.replace(regex, closest);
        if (rep !== codePart) {
          newLines[idx] = rep + commentPart;
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: `Replaced misspelled identifier '${ident}' -> '${closest}'`,
            originalLine: err.line,
            beforeSnippet: codePart.trim(),
            afterSnippet: rep.trim(),
            appliedHeuristic: 'Levenshtein Identifier Distance Resolution'
          });
        }
      } else if (!closest && !undeclaredToInit.includes(ident)) {
        undeclaredToInit.push(ident);
      }
    }
  }

  if (undeclaredToInit.length > 0) {
    const decls = undeclaredToInit.map((v) => {
      const stmt = `${v} = 0`;
      actions.push({
        phase: ErrorPhase.SEMANTIC,
        description: `Initialized undeclared Python variable '${v}' to 0`,
        originalLine: 1,
        beforeSnippet: `${v} (undefined)`,
        afterSnippet: stmt,
        appliedHeuristic: 'Scope Hoisting Heuristic'
      });
      return stmt;
    });
    newLines.unshift(...decls, '');
  }

  return { correctedCode: newLines.join('\n'), actions };
}

function autoCorrectCpp(sourceCode: string): { correctedCode: string; actions: CorrectionAction[] } {
  const actions: CorrectionAction[] = [];
  const newLines = sourceCode.split('\n');

  // ================= PASS 1: C++ LEXICAL CORRECTIONS =================
  for (let i = 0; i < newLines.length; i++) {
    let line = newLines[i];

    // 1.1 Unterminated string literal
    let quoteCount = 0;
    let esc = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (esc) {
        esc = false;
        continue;
      }
      if (ch === '\\') esc = true;
      else if (ch === '"') quoteCount++;
    }
    if (quoteCount % 2 !== 0) {
      let repaired = line;
      if (line.includes(');')) {
        const idx = line.lastIndexOf(');');
        repaired = line.slice(0, idx) + '"' + line.slice(idx);
      } else if (line.includes(';')) {
        const idx = line.lastIndexOf(';');
        repaired = line.slice(0, idx) + '"' + line.slice(idx);
      } else {
        repaired = line + '"';
      }
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Closed unterminated C++ string literal with \'"\'',
        originalLine: i + 1,
        beforeSnippet: line.trim(),
        afterSnippet: repaired.trim(),
        appliedHeuristic: 'Lexical String Termination Heuristic'
      });
      line = repaired;
    }

    // 1.2 Malformed float literals
    const s1 = splitCodeAndComment(line, 'cpp');
    const fixedNums = s1.codePart.replace(/("[^"]*")|(\b\d+\.\d+(?:\.\d+)+\b)/g, (m, str, num) => {
      if (str) return str;
      const firstDot = num.indexOf('.');
      return num.slice(0, firstDot + 1) + num.slice(firstDot + 1).replace(/\./g, '');
    });
    if (fixedNums !== s1.codePart) {
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Removed extra decimal point(s) in malformed float literal',
        originalLine: i + 1,
        beforeSnippet: s1.codePart.trim(),
        afterSnippet: fixedNums.trim(),
        appliedHeuristic: 'Numeric Format Normalization Heuristic'
      });
      line = fixedNums + s1.commentPart;
    }

    // 1.3 Strip illegal characters outside preprocessor directives & strings
    const s2 = splitCodeAndComment(line, 'cpp');
    const isPreproc = /^\s*#(include|define|ifdef|ifndef|endif|pragma)\b/.test(s2.codePart);
    if (!isPreproc) {
      const cleaned = s2.codePart.replace(/("[^"]*")|([^"]+)/g, (m, str, other) => {
        if (str) return str;
        return other.replace(/[@$#~^`]/g, '');
      });
      if (cleaned !== s2.codePart) {
        actions.push({
          phase: ErrorPhase.LEXICAL,
          description: 'Removed illegal C++ characters (@, $, #, ~, ^)',
          originalLine: i + 1,
          beforeSnippet: s2.codePart.trim(),
          afterSnippet: cleaned.trim(),
          appliedHeuristic: 'Alphabet Filtering Heuristic'
        });
        line = cleaned + s2.commentPart;
      }
    }

    // 1.4 Fix digit-leading identifiers
    const s3 = splitCodeAndComment(line, 'cpp');
    const fixedIdents = s3.codePart.replace(/("[^"]*")|\b(\d+[a-zA-Z_][a-zA-Z0-9_]*)\b/g, (m, str, bad) => {
      if (str) return str;
      return `_${bad}`;
    });
    if (fixedIdents !== s3.codePart) {
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Prefixed invalid digit-leading C++ identifier with underscore',
        originalLine: i + 1,
        beforeSnippet: s3.codePart.trim(),
        afterSnippet: fixedIdents.trim(),
        appliedHeuristic: 'Identifier Alphabet Compliance Heuristic'
      });
      line = fixedIdents + s3.commentPart;
    }

    newLines[i] = line;
  }

  // ================= PASS 2: C++ SYNTAX CORRECTIONS =================
  const CPP_KWS = ['while', 'if', 'else', 'cout', 'cin', 'return', 'int', 'float', 'double', 'string', 'bool'];
  for (let i = 0; i < newLines.length; i++) {
    let line = newLines[i];
    const { codePart, commentPart } = splitCodeAndComment(line, 'cpp');
    const leadingWs = codePart.slice(0, codePart.length - codePart.trimStart().length);
    let stripped = codePart.trim();
    if (!stripped || stripped.startsWith('#') || stripped.startsWith('/*')) continue;

    // 2.1 Replace `str x` -> `string x`
    if (/^str\s+[a-zA-Z_]\w*/.test(stripped)) {
      const updated = stripped.replace(/^str\b/, 'string');
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Replaced Python type 'str' with C++ 'string'",
        originalLine: i + 1,
        beforeSnippet: stripped,
        afterSnippet: updated,
        appliedHeuristic: 'C++ Type Keyword Normalization'
      });
      stripped = updated;
    }

    // 2.2 Keyword typo fix
    const firstWord = /^([a-zA-Z_]\w*)\b/.exec(stripped)?.[1];
    if (firstWord && !CPP_KWS.includes(firstWord)) {
      const closest = findClosestMatch(firstWord, ['while', 'if', 'cout', 'cin', 'return'], 1);
      if (
        closest &&
        ((['while', 'if'].includes(closest) && stripped.includes('(')) ||
          (closest === 'cout' && (stripped.includes('<<') || stripped.includes('>>'))) ||
          (closest === 'cin' && (stripped.includes('>>') || stripped.includes('<<'))))
      ) {
        const updated = stripped.replace(new RegExp(`^${firstWord}\\b`), closest);
        actions.push({
          phase: ErrorPhase.SYNTAX,
          description: `Corrected misspelled C++ keyword '${firstWord}' -> '${closest}'`,
          originalLine: i + 1,
          beforeSnippet: stripped,
          afterSnippet: updated,
          appliedHeuristic: 'Levenshtein Keyword Distance Heuristic'
        });
        stripped = updated;
      }
    }

    // 2.3 Fix reversed stream operators on cout / cin
    if (/^(?:std::)?cout\b/.test(stripped) && stripped.includes('>>')) {
      const updated = stripped.replace(/>>/g, '<<');
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Corrected 'cout >>' stream direction to 'cout <<'",
        originalLine: i + 1,
        beforeSnippet: stripped,
        afterSnippet: updated,
        appliedHeuristic: 'C++ Stream Operator Direction Rule'
      });
      stripped = updated;
    }
    if (/^(?:std::)?cin\b/.test(stripped) && stripped.includes('<<')) {
      const updated = stripped.replace(/<</g, '>>');
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Corrected 'cin <<' stream direction to 'cin >>'",
        originalLine: i + 1,
        beforeSnippet: stripped,
        afterSnippet: updated,
        appliedHeuristic: 'C++ Stream Operator Direction Rule'
      });
      stripped = updated;
    }

    // 2.4 Semicolon insertion
    if (!stripped.endsWith(';') && !stripped.endsWith('{') && !stripped.endsWith('}')) {
      const isDecl = /^(?:const\s+)?(?:int|float|double|string|std::string|char|bool)\s+[a-zA-Z_]\w*(?:\s*=.*)?$/.test(stripped);
      const isAssign = /^[a-zA-Z_]\w*(?:\s*(?:=|\+=|-=).*|\+\+|--)$/.test(stripped);
      const isStreamOrReturn = /^(?:using\s+namespace\s+\w+|(?:std::)?cout\s*<<.*|(?:std::)?cin\s*>>.*|return\b.*)$/.test(stripped);

      if (isDecl || isAssign || isStreamOrReturn) {
        const updated = stripped + ';';
        actions.push({
          phase: ErrorPhase.SYNTAX,
          description: "Inserted missing terminating semicolon ';'",
          originalLine: i + 1,
          beforeSnippet: stripped,
          afterSnippet: updated,
          appliedHeuristic: 'Grammar Statement Termination Heuristic'
        });
        stripped = updated;
      }
    }

    // 2.5 Regularize parentheses on `if` and `while`
    const ctrlMatch = /^(if|while)\b(.*)$/.exec(stripped);
    if (ctrlMatch) {
      const kw = ctrlMatch[1];
      const rest = ctrlMatch[2].trim();
      if (rest.startsWith('(')) {
        let depth = 0;
        let closedAt = -1;
        for (let idx = 0; idx < rest.length; idx++) {
          if (rest[idx] === '(') depth++;
          else if (rest[idx] === ')') {
            depth--;
            if (depth === 0) {
              closedAt = idx;
              break;
            }
          }
        }
        if (closedAt === -1) {
          const bracePos = rest.indexOf('{');
          const updated =
            bracePos !== -1
              ? `${kw} (${rest.slice(1, bracePos).trim()}) ${rest.slice(bracePos)}`
              : `${kw} (${rest.slice(1).trim()})`;
          actions.push({
            phase: ErrorPhase.SYNTAX,
            description: `Closed missing ')' in '${kw}' condition`,
            originalLine: i + 1,
            beforeSnippet: stripped,
            afterSnippet: updated,
            appliedHeuristic: 'Grammar Control Structure Regularization'
          });
          stripped = updated;
        }
      } else if (rest.length > 0) {
        const bracePos = rest.indexOf('{');
        const updated =
          bracePos !== -1
            ? `${kw} (${rest.slice(0, bracePos).trim()}) ${rest.slice(bracePos)}`
            : `${kw} (${rest})`;
        actions.push({
          phase: ErrorPhase.SYNTAX,
          description: `Wrapped '${kw}' condition in required parentheses '( )'`,
          originalLine: i + 1,
          beforeSnippet: stripped,
          afterSnippet: updated,
          appliedHeuristic: 'Grammar Control Structure Regularization'
        });
        stripped = updated;
      }
    }

    newLines[i] = leadingWs + stripped + (commentPart ? ' ' + commentPart : '');
  }

  // 2.6 Close unterminated block comment & unclosed braces
  const joinedComments = newLines.join('\n');
  if ((joinedComments.match(/\/\*/g) || []).length > (joinedComments.match(/\*\//g) || []).length) {
    newLines[newLines.length - 1] += ' */';
    actions.push({
      phase: ErrorPhase.LEXICAL,
      description: "Closed unterminated C++ block comment with '*/'",
      originalLine: newLines.length,
      beforeSnippet: '/* ...',
      afterSnippet: '... */',
      appliedHeuristic: 'Block Comment Termination Heuristic'
    });
  }

  let opens = 0;
  let closes = 0;
  for (const l of newLines) {
    const clean = splitCodeAndComment(l, 'cpp').codePart.replace(/"[^"]*"/g, '');
    opens += (clean.match(/\{/g) || []).length;
    closes += (clean.match(/\}/g) || []).length;
  }
  if (opens > closes) {
    for (let k = 0; k < opens - closes; k++) {
      newLines.push('}');
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Appended missing closing brace '}'",
        originalLine: newLines.length,
        beforeSnippet: '<EOF>',
        afterSnippet: '}',
        appliedHeuristic: 'Bracket Balance Conservation Heuristic'
      });
    }
  }

  // ================= PASS 3: C++ SEMANTIC CORRECTIONS =================
  const runCppSemantic = (lines: string[]) => {
    const code = lines.join('\n');
    const lexer = new Lexer(code, 'cpp');
    const { tokens } = lexer.tokenize();
    const parser = new Parser(tokens, 'cpp');
    const { ast } = parser.parse();
    const analyzer = new SemanticAnalyzer('cpp');
    analyzer.analyze(ast);
    return analyzer;
  };

  let analyzer = runCppSemantic(newLines);

  // 3.1 Add missing #include <iostream> if cout/cin used
  if (analyzer.errors.some((e) => e.message.includes('#include <iostream>'))) {
    newLines.unshift('#include <iostream>', 'using namespace std;', '');
    actions.push({
      phase: ErrorPhase.SEMANTIC,
      description: 'Added missing #include <iostream> header for standard I/O',
      originalLine: 1,
      beforeSnippet: '(missing <iostream>)',
      afterSnippet: '#include <iostream>',
      appliedHeuristic: 'C++ Header Inclusion Heuristic'
    });
  }

  // 3.2 Fix duplicate declarations (`int x = 10;` -> `x = 10;`)
  analyzer = runCppSemantic(newLines);
  for (const err of analyzer.errors) {
    if (err.message.includes('Duplicate declaration') && err.line > 0) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const { codePart, commentPart } = splitCodeAndComment(newLines[idx], 'cpp');
        const ws = codePart.slice(0, codePart.length - codePart.trimStart().length);
        const stripped = codePart.trim();
        const dup = /^(?:const\s+)?(?:int|float|double|string|std::string|char|bool)\s+([a-zA-Z_]\w*)\s*=\s*(.+);$/.exec(stripped);
        if (dup) {
          const rep = `${dup[1]} = ${dup[2]};`;
          newLines[idx] = ws + rep + (commentPart ? ' ' + commentPart : '');
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: `Converted duplicate declaration of '${dup[1]}' into reassignment`,
            originalLine: err.line,
            beforeSnippet: stripped,
            afterSnippet: rep,
            appliedHeuristic: 'Duplicate Symbol Reassignment Heuristic'
          });
        }
      }
    }
  }

  // 3.3 Fix declaration type mismatch (`int s = "text";` -> `string s = "text";`)
  analyzer = runCppSemantic(newLines);
  for (const err of analyzer.errors) {
    if (err.message.includes('Type Mismatch: Cannot assign') && err.line > 0) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const { codePart, commentPart } = splitCodeAndComment(newLines[idx], 'cpp');
        const ws = codePart.slice(0, codePart.length - codePart.trimStart().length);
        const stripped = codePart.trim();
        const decl = /^(int|float|double|string|char|bool)\s+([a-zA-Z_]\w*)\s*=\s*(.+);$/.exec(stripped);
        if (decl) {
          const [, , varName, rhs] = decl;
          const rhsTrim = rhs.trim();
          let inferred = 'string';
          if (/^".*"$/.test(rhsTrim)) inferred = 'string';
          else if (/^'.'$/.test(rhsTrim)) inferred = 'char';
          else if (rhsTrim === 'true' || rhsTrim === 'false') inferred = 'bool';
          else if (/^\d+\.\d+$/.test(rhsTrim)) inferred = 'double';
          else if (/^\d+$/.test(rhsTrim)) inferred = 'int';

          const rep = `${inferred} ${varName} = ${rhs};`;
          newLines[idx] = ws + rep + (commentPart ? ' ' + commentPart : '');
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: `Aligned C++ variable '${varName}' type to '${inferred}'`,
            originalLine: err.line,
            beforeSnippet: stripped,
            afterSnippet: rep,
            appliedHeuristic: 'Static Type Alignment Heuristic'
          });
        }
      }
    }
  }

  // 3.4 Division by zero
  analyzer = runCppSemantic(newLines);
  for (const err of analyzer.errors) {
    if (err.message.includes('Division by constant zero') && err.line > 0) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const { codePart, commentPart } = splitCodeAndComment(newLines[idx], 'cpp');
        const rep = codePart.replace(/([/%]\s*)0\b/g, '$11');
        if (rep !== codePart) {
          newLines[idx] = rep + commentPart;
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: 'Replaced constant zero divisor with 1',
            originalLine: err.line,
            beforeSnippet: codePart.trim(),
            afterSnippet: rep.trim(),
            appliedHeuristic: 'Division-by-Zero Guard Heuristic'
          });
        }
      }
    }
  }

  // 3.5 Undeclared or misspelled identifiers
  analyzer = runCppSemantic(newLines);
  const declaredNames = analyzer.collectedSymbols
    .filter((s) => s.lineDeclared > 0 && !analyzer.errors.some((e) => e.offendingText === s.name))
    .map((s) => s.name);

  const undeclared = new Map<string, number>();
  for (const err of analyzer.errors) {
    if ((err.message.includes('Undeclared identifier') || err.message.includes('Undeclared input target')) && err.offendingText) {
      const ident = err.offendingText;
      const closest = err.closestMatch || findClosestMatch(ident, declaredNames.filter((n) => n !== ident), 2);
      if (closest) {
        for (let idx = 0; idx < newLines.length; idx++) {
          const { codePart, commentPart } = splitCodeAndComment(newLines[idx], 'cpp');
          const regex = new RegExp(`\\b${ident}\\b`, 'g');
          if (regex.test(codePart)) {
            const rep = codePart.replace(regex, closest);
            newLines[idx] = rep + commentPart;
            actions.push({
              phase: ErrorPhase.SEMANTIC,
              description: `Replaced misspelled identifier '${ident}' -> '${closest}'`,
              originalLine: idx + 1,
              beforeSnippet: codePart.trim(),
              afterSnippet: rep.trim(),
              appliedHeuristic: 'Levenshtein Identifier Distance Resolution'
            });
          }
        }
      } else {
        undeclared.set(ident, err.line);
      }
    }
  }

  if (undeclared.size > 0) {
    // Insert undeclared vars either right inside `main()` or at top if no `main()`
    const mainIdx = newLines.findIndex((l) => /\bint\s+main\s*\(/.test(l));
    const decls: string[] = [];
    undeclared.forEach((line, name) => {
      const stmt = (mainIdx !== -1 ? '    ' : '') + `int ${name} = 0;`;
      decls.push(stmt);
      actions.push({
        phase: ErrorPhase.SEMANTIC,
        description: `Declared missing C++ variable '${name}' as 'int'`,
        originalLine: line,
        beforeSnippet: `${name} (undeclared)`,
        afterSnippet: stmt.trim(),
        appliedHeuristic: 'Static Scope Hoisting Heuristic'
      });
    });
    if (mainIdx !== -1) {
      newLines.splice(mainIdx + 1, 0, ...decls);
    } else {
      newLines.unshift(...decls, '');
    }
  }

  return { correctedCode: newLines.join('\n'), actions };
}

/**
 * Targeted single-error repair for clicking "Fix" on an individual diagnostic card.
 */
export function applySingleErrorFix(
  sourceCode: string,
  err: CompilerError,
  language: TargetLanguage = 'python'
): string {
  const lines = sourceCode.split('\n');
  const idx = err.line - 1;

  if (err.message.includes("missing closing brace '}'")) {
    return sourceCode + '\n}';
  }

  if (idx >= 0 && idx < lines.length) {
    const line = lines[idx];
    const { codePart, commentPart } = splitCodeAndComment(line, language);
    const ws = codePart.slice(0, codePart.length - codePart.trimStart().length);
    const stripped = codePart.trim();

    if (err.closestMatch && err.offendingText) {
      const escaped = err.offendingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      if (['<<', '>>'].includes(err.offendingText)) {
        lines[idx] = codePart.replace(err.offendingText, err.closestMatch) + commentPart;
      } else {
        lines[idx] = codePart.replace(new RegExp(`\\b${escaped}\\b`, 'g'), err.closestMatch) + commentPart;
      }
      return lines.join('\n');
    }

    if (language === 'python' && err.message.includes('Input Type Error: input() returns')) {
      const m = /^([a-zA-Z_]\w*)\s*:\s*(int|float|bool)\s*=\s*(input\(.*\))$/.exec(stripped);
      if (m) {
        lines[idx] = ws + `${m[1]}: ${m[2]} = ${m[2]}(${m[3]})` + (commentPart ? ' ' + commentPart : '');
        return lines.join('\n');
      }
    }

    if (language === 'python' && err.message.includes("Missing colon ':'")) {
      if (stripped && !stripped.endsWith(':')) {
        lines[idx] = ws + stripped + ':' + (commentPart ? ' ' + commentPart : '');
        return lines.join('\n');
      }
    }

    if (language === 'cpp' && (err.message.includes("Missing terminating semicolon ';'") || err.message.includes("Missing ';'"))) {
      let targetIdx = idx;
      if (!stripped || stripped.startsWith('}') || stripped.startsWith('if') || stripped.startsWith('while')) {
        for (let prev = idx - 1; prev >= 0; prev--) {
          const prevCode = splitCodeAndComment(lines[prev], 'cpp').codePart.trim();
          if (prevCode && !prevCode.endsWith(';') && !prevCode.endsWith('{') && !prevCode.endsWith('}')) {
            targetIdx = prev;
            break;
          }
        }
      }
      const target = splitCodeAndComment(lines[targetIdx], 'cpp');
      const tWs = target.codePart.slice(0, target.codePart.length - target.codePart.trimStart().length);
      const tStripped = target.codePart.trim();
      if (tStripped && !tStripped.endsWith(';')) {
        lines[targetIdx] = tWs + tStripped + ';' + (target.commentPart ? ' ' + target.commentPart : '');
        return lines.join('\n');
      }
    }

    if (err.message.includes('Unterminated') && err.message.includes('literal')) {
      const q = err.offendingText?.[0] || '"';
      if (codePart.trimEnd().endsWith(');')) {
        const qIdx = codePart.lastIndexOf(');');
        lines[idx] = codePart.slice(0, qIdx) + q + codePart.slice(qIdx) + commentPart;
      } else if (codePart.trimEnd().endsWith(')')) {
        const qIdx = codePart.lastIndexOf(')');
        lines[idx] = codePart.slice(0, qIdx) + q + codePart.slice(qIdx) + commentPart;
      } else {
        lines[idx] = codePart.trimEnd() + q + (commentPart ? ' ' + commentPart : '');
      }
      return lines.join('\n');
    }

    if (err.phase === ErrorPhase.LEXICAL && err.offendingText && err.offendingText.length === 1) {
      const escaped = err.offendingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      lines[idx] = codePart.replace(new RegExp(escaped, 'g'), '') + commentPart;
      return lines.join('\n');
    }

    if (language === 'cpp' && (err.message.includes("parenthesis '('") || err.message.includes("parenthesis ')'"))) {
      const ctrlMatch = /^(if|while)\s+(.+)$/.exec(stripped);
      if (ctrlMatch) {
        const kw = ctrlMatch[1];
        let rest = ctrlMatch[2].trim();
        const hasBrace = rest.endsWith('{');
        if (hasBrace) rest = rest.slice(0, -1).trim();
        if (rest.startsWith('(')) rest = rest.slice(1).trim();
        if (rest.endsWith(')')) rest = rest.slice(0, -1).trim();
        lines[idx] = ws + `${kw} (${rest})` + (hasBrace ? ' {' : '') + (commentPart ? ' ' + commentPart : '');
        return lines.join('\n');
      }
    }
  }

  return autoCorrectCode(sourceCode, language).correctedCode;
}
