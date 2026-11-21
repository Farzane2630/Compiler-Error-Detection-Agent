import { CompilerError, CorrectionAction, ErrorPhase } from './types';
import { Lexer } from './lexer';
import { Parser } from './parser';
import { SemanticAnalyzer } from './semantic';
import { findClosestMatch } from './levenshtein';

function splitCodeAndComment(line: string): { codePart: string; commentPart: string } {
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
      } else if (ch === '/' && line[i + 1] === '/') {
        return {
          codePart: line.slice(0, i),
          commentPart: line.slice(i)
        };
      }
    }
  }
  return { codePart: line, commentPart: '' };
}

export function autoCorrectCode(sourceCode: string): { correctedCode: string; actions: CorrectionAction[] } {
  const actions: CorrectionAction[] = [];
  const lines = sourceCode.split('\n');
  const newLines = [...lines];

  // ================= PASS 1: LEXICAL CORRECTIONS =================
  for (let i = 0; i < newLines.length; i++) {
    let line = newLines[i];

    // 1.1 Unterminated string literal check (before inline comment if any)
    let quoteCount = 0;
    let inEscape = false;
    for (let c = 0; c < line.length; c++) {
      const ch = line[c];
      if (inEscape) {
        inEscape = false;
        continue;
      }
      if (ch === '\\') inEscape = true;
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
        description: 'Closed unterminated string literal with matching \'"\'',
        originalLine: i + 1,
        beforeSnippet: line.trim(),
        afterSnippet: repaired.trim(),
        appliedHeuristic: 'Lexical String Termination Heuristic'
      });
      line = repaired;
    }

    // 1.2 Fix malformed numbers with multiple decimal points outside strings/comments (e.g. 12.34.56 -> 12.3456)
    const { codePart: cPart1, commentPart: cmPart1 } = splitCodeAndComment(line);
    const fixedNums = cPart1.replace(/("[^"]*")|(\b\d+\.\d+(?:\.\d+)+\b)/g, (match, str, num) => {
      if (str) return str;
      const firstDot = num.indexOf('.');
      return num.slice(0, firstDot + 1) + num.slice(firstDot + 1).replace(/\./g, '');
    });
    if (fixedNums !== cPart1) {
      const repairedLine = fixedNums + cmPart1;
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Removed redundant decimal point(s) in malformed floating-point literal',
        originalLine: i + 1,
        beforeSnippet: cPart1.trim(),
        afterSnippet: fixedNums.trim(),
        appliedHeuristic: 'Numeric Format Normalization Heuristic'
      });
      line = repairedLine;
    }

    // 1.3 Strip illegal alphabet characters outside strings and comments
    const { codePart: cPart2, commentPart: cmPart2 } = splitCodeAndComment(line);
    const stripIllegal = (match: string) => {
      if (match.startsWith('"')) return match;
      return match.replace(/[@$#~^`]/g, '');
    };
    const cleanedCode = cPart2.replace(/("[^"]*")|([^"]+)/g, stripIllegal);
    if (cleanedCode !== cPart2) {
      const repairedLine = cleanedCode + cmPart2;
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Stripped illegal characters (@, $, #, ~, ^) not in alphabet Σ',
        originalLine: i + 1,
        beforeSnippet: cPart2.trim(),
        afterSnippet: cleanedCode.trim(),
        appliedHeuristic: 'Alphabet Filtering Heuristic'
      });
      line = repairedLine;
    }

    // 1.4 Fix identifiers starting with digits outside strings/comments (e.g. 123abc -> _123abc)
    const { codePart: cPart3, commentPart: cmPart3 } = splitCodeAndComment(line);
    const fixedBadIdents = cPart3.replace(/("[^"]*")|\b(\d+[a-zA-Z_][a-zA-Z0-9_]*)\b/g, (match, str, badIdent) => {
      if (str) return str;
      return `_${badIdent}`;
    });
    if (fixedBadIdents !== cPart3) {
      const repairedLine = fixedBadIdents + cmPart3;
      actions.push({
        phase: ErrorPhase.LEXICAL,
        description: 'Prefixed invalid digit-leading identifier with underscore',
        originalLine: i + 1,
        beforeSnippet: cPart3.trim(),
        afterSnippet: fixedBadIdents.trim(),
        appliedHeuristic: 'Identifier Alphabet Compliance Heuristic'
      });
      line = repairedLine;
    }

    newLines[i] = line;
  }

  // ================= PASS 2: KEYWORD TYPO CORRECTIONS =================
  const ALL_KEYWORDS = ['while', 'print', 'var', 'int', 'string', 'bool', 'float', 'if', 'else'];
  for (let i = 0; i < newLines.length; i++) {
    let line = newLines[i];
    const { codePart, commentPart } = splitCodeAndComment(line);
    const words = codePart.match(/\b[a-zA-Z_]\w*\b/g) || [];
    let updatedCode = codePart;
    for (const w of words) {
      if (!ALL_KEYWORDS.includes(w)) {
        const closest = findClosestMatch(w, ALL_KEYWORDS, 1);
        if (closest && ['while', 'print', 'if'].includes(closest) && updatedCode.replace(/\s+/g, '').includes(`${w}(`)) {
          const repCode = updatedCode.replace(new RegExp(`\\b${w}\\b`, 'g'), closest);
          actions.push({
            phase: ErrorPhase.SYNTAX,
            description: `Corrected misspelled keyword '${w}' -> '${closest}'`,
            originalLine: i + 1,
            beforeSnippet: updatedCode.trim(),
            afterSnippet: repCode.trim(),
            appliedHeuristic: 'Levenshtein Keyword Distance Heuristic'
          });
          updatedCode = repCode;
          line = updatedCode + commentPart;
          newLines[i] = line;
        }
      }
    }
  }

  // ================= PASS 3: SYNTAX CORRECTIONS =================
  for (let i = 0; i < newLines.length; i++) {
    const line = newLines[i];
    const { codePart, commentPart } = splitCodeAndComment(line);
    const leadingWs = codePart.slice(0, codePart.length - codePart.trimStart().length);
    let stripped = codePart.trim();

    if (!stripped || stripped.startsWith('/*')) continue;

    // 3.1 Semicolon insertion
    if (!stripped.endsWith(';') && !stripped.endsWith('{') && !stripped.endsWith('}')) {
      const isVar = /^var\s+[a-zA-Z_]\w*(\s*:\s*\w+)?(\s*=.*)?$/.test(stripped);
      const isAssign = /^[a-zA-Z_]\w*\s*=.*$/.test(stripped);
      const isPrint = /^print\s*\(.*\)$/.test(stripped);

      if (isVar || isAssign || isPrint) {
        let repaired = stripped;
        const dangling = /[+\-*/%<>=!&|]\s*$/.exec(repaired);
        if (dangling) {
          repaired = repaired.slice(0, dangling.index).trimEnd();
        }
        const repairedCode = leadingWs + repaired + ';';
        const repairedLine = repairedCode + (commentPart ? ' ' + commentPart : '');
        actions.push({
          phase: ErrorPhase.SYNTAX,
          description: "Inserted missing terminating semicolon ';'",
          originalLine: i + 1,
          beforeSnippet: stripped,
          afterSnippet: repaired + ';',
          appliedHeuristic: 'Grammar Statement Termination Heuristic'
        });
        newLines[i] = repairedLine;
        stripped = repaired + ';';
      }
    }

    // 3.2 Control flow condition parentheses regularization for both `if` and `while`
    const ctrlMatch = /^(if|while)\b(.*)$/.exec(stripped);
    if (ctrlMatch) {
      const kw = ctrlMatch[1];
      let rest = ctrlMatch[2].trim();
      if (rest.startsWith('(')) {
        // Walk from the opening '(' to check if it closes properly
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
          // Missing closing ')' before '{' or end of condition
          const bracePos = rest.indexOf('{');
          let repairedStmt = '';
          if (bracePos !== -1) {
            const condInner = rest.slice(1, bracePos).trim();
            const trailing = rest.slice(bracePos);
            repairedStmt = `${kw} (${condInner}) ${trailing}`;
          } else {
            const condInner = rest.slice(1).trim();
            repairedStmt = `${kw} (${condInner})`;
          }
          const repairedLine = leadingWs + repairedStmt + (commentPart ? ' ' + commentPart : '');
          actions.push({
            phase: ErrorPhase.SYNTAX,
            description: `Closed missing parenthesis ')' in '${kw}' condition`,
            originalLine: i + 1,
            beforeSnippet: stripped,
            afterSnippet: repairedStmt,
            appliedHeuristic: 'Grammar Control Structure Regularization'
          });
          newLines[i] = repairedLine;
        }
      } else if (rest.length > 0) {
        // Missing both '(' and ')' around condition (e.g. if count > 5 {)
        const bracePos = rest.indexOf('{');
        let repairedStmt = '';
        if (bracePos !== -1) {
          const condInner = rest.slice(0, bracePos).trim();
          const trailing = rest.slice(bracePos);
          repairedStmt = `${kw} (${condInner}) ${trailing}`;
        } else {
          repairedStmt = `${kw} (${rest})`;
        }
        const repairedLine = leadingWs + repairedStmt + (commentPart ? ' ' + commentPart : '');
        actions.push({
          phase: ErrorPhase.SYNTAX,
          description: `Normalized '${kw}' condition with required parentheses '( )'`,
          originalLine: i + 1,
          beforeSnippet: stripped,
          afterSnippet: repairedStmt,
          appliedHeuristic: 'Grammar Control Structure Regularization'
        });
        newLines[i] = repairedLine;
      }
    }
  }

  // 3.3 Close unterminated block comments /* ... */
  const joinedForComments = newLines.join('\n');
  const openBlockComments = (joinedForComments.match(/\/\*/g) || []).length;
  const closeBlockComments = (joinedForComments.match(/\*\//g) || []).length;
  if (openBlockComments > closeBlockComments) {
    newLines[newLines.length - 1] = newLines[newLines.length - 1] + ' */';
    actions.push({
      phase: ErrorPhase.LEXICAL,
      description: "Closed unterminated block comment with '*/'",
      originalLine: newLines.length,
      beforeSnippet: '/* ...',
      afterSnippet: '... */',
      appliedHeuristic: 'Block Comment Termination Heuristic'
    });
  }

  // 3.3 Balance unclosed braces outside comments and strings
  const countCodeBraces = (l: string): [number, number] => {
    const { codePart } = splitCodeAndComment(l);
    const clean = codePart.replace(/"[^"]*"/g, '');
    const opens = (clean.match(/\{/g) || []).length;
    const closes = (clean.match(/\}/g) || []).length;
    return [opens, closes];
  };

  let totalOpens = 0;
  let totalCloses = 0;
  for (const l of newLines) {
    const [o, c] = countCodeBraces(l);
    totalOpens += o;
    totalCloses += c;
  }

  if (totalOpens > totalCloses) {
    const diff = totalOpens - totalCloses;
    for (let k = 0; k < diff; k++) {
      newLines.push('}');
      actions.push({
        phase: ErrorPhase.SYNTAX,
        description: "Appended missing closing brace '}' at end of block",
        originalLine: newLines.length,
        beforeSnippet: '<EOF>',
        afterSnippet: '}',
        appliedHeuristic: 'Bracket Balance Conservation Heuristic'
      });
    }
  }

  // ================= PASS 4: SEMANTIC CORRECTIONS =================
  const runSemanticPass = (currentLines: string[]) => {
    const code = currentLines.join('\n');
    const lexer = new Lexer(code);
    const { tokens } = lexer.tokenize();
    const parser = new Parser(tokens);
    const { ast } = parser.parse();
    const analyzer = new SemanticAnalyzer();
    analyzer.analyze(ast);
    return analyzer;
  };

  let analyzer = runSemanticPass(newLines);

  // 4.1 Fix Duplicate Declarations (convert redundant `var x: type = expr;` -> `x = expr;`)
  for (const err of analyzer.errors) {
    if (err.message.includes('Duplicate declaration of variable') && err.offendingText) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const line = newLines[idx];
        const { codePart, commentPart } = splitCodeAndComment(line);
        const leadingWs = codePart.slice(0, codePart.length - codePart.trimStart().length);
        const stripped = codePart.trim();
        const dupMatch = /^var\s+([a-zA-Z_]\w*)(?:\s*:\s*\w+)?\s*=\s*(.+);$/.exec(stripped);
        if (dupMatch) {
          const repairedStmt = `${dupMatch[1]} = ${dupMatch[2]};`;
          newLines[idx] = leadingWs + repairedStmt + (commentPart ? ' ' + commentPart : '');
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: `Converted duplicate declaration 'var ${dupMatch[1]}' into reassignment`,
            originalLine: err.line,
            beforeSnippet: stripped,
            afterSnippet: repairedStmt,
            appliedHeuristic: 'Duplicate Symbol Reassignment Heuristic'
          });
        }
      }
    }
  }

  // 4.2 Fix Type Mismatch in Variable Declarations (`var x: int = "text";` -> `var x: string = "text";`)
  analyzer = runSemanticPass(newLines);
  for (const err of analyzer.errors) {
    if (err.message.includes('Type Mismatch:') && err.line > 0) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const line = newLines[idx];
        const { codePart, commentPart } = splitCodeAndComment(line);
        const leadingWs = codePart.slice(0, codePart.length - codePart.trimStart().length);
        const stripped = codePart.trim();
        const declMatch = /^var\s+([a-zA-Z_]\w*)\s*:\s*(int|float|string|bool)\s*=\s*(.+);$/.exec(stripped);
        if (declMatch) {
          const [, varName, , rhs] = declMatch;
          let inferredType = 'string';
          const rhsTrim = rhs.trim();
          if (/^".*"$/.test(rhsTrim)) inferredType = 'string';
          else if (rhsTrim === 'true' || rhsTrim === 'false') inferredType = 'bool';
          else if (/^\d+\.\d+$/.test(rhsTrim)) inferredType = 'float';
          else if (/^\d+$/.test(rhsTrim)) inferredType = 'int';

          const repairedStmt = `var ${varName}: ${inferredType} = ${rhs};`;
          newLines[idx] = leadingWs + repairedStmt + (commentPart ? ' ' + commentPart : '');
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: `Aligned variable '${varName}' declared type to '${inferredType}' matching initializer`,
            originalLine: err.line,
            beforeSnippet: stripped,
            afterSnippet: repairedStmt,
            appliedHeuristic: 'Static Type Alignment Heuristic'
          });
        }
      }
    }
  }

  // 4.3 Fix Compile-Time Constant Division by Zero (`/ 0` or `% 0` -> `/ 1`)
  analyzer = runSemanticPass(newLines);
  for (const err of analyzer.errors) {
    if (err.message.includes('Division by constant zero') && err.line > 0) {
      const idx = err.line - 1;
      if (idx >= 0 && idx < newLines.length) {
        const line = newLines[idx];
        const { codePart, commentPart } = splitCodeAndComment(line);
        const repairedCode = codePart.replace(/([/%]\s*)0\b/g, '$11');
        if (repairedCode !== codePart) {
          newLines[idx] = repairedCode + commentPart;
          actions.push({
            phase: ErrorPhase.SEMANTIC,
            description: 'Replaced constant zero denominator with safe non-zero divisor (1)',
            originalLine: err.line,
            beforeSnippet: codePart.trim(),
            afterSnippet: repairedCode.trim(),
            appliedHeuristic: 'Division-by-Zero Guard Heuristic'
          });
        }
      }
    }
  }

  // 4.4 Resolve Misspelled or Undeclared Identifiers
  analyzer = runSemanticPass(newLines);
  const declaredNames = analyzer.collectedSymbols
    .filter((s) => s.lineDeclared > 0 && !analyzer.errors.some((e) => e.offendingText === s.name))
    .map((s) => s.name);

  const undeclaredVars = new Map<string, number>();

  for (const err of analyzer.errors) {
    if (err.message.includes('Undeclared identifier') && err.offendingText) {
      const ident = err.offendingText;
      const candidates = declaredNames.filter((c) => c !== ident);
      const closest = findClosestMatch(ident, candidates, 2);

      if (closest) {
        for (let idx = 0; idx < newLines.length; idx++) {
          const ln = newLines[idx];
          const { codePart, commentPart } = splitCodeAndComment(ln);
          const regex = new RegExp(`\\b${ident}\\b`, 'g');
          if (regex.test(codePart)) {
            const repCode = codePart.replace(regex, closest);
            actions.push({
              phase: ErrorPhase.SEMANTIC,
              description: `Replaced misspelled variable '${ident}' with closest declared identifier '${closest}'`,
              originalLine: idx + 1,
              beforeSnippet: codePart.trim(),
              afterSnippet: repCode.trim(),
              appliedHeuristic: 'Levenshtein Identifier Distance Resolution'
            });
            newLines[idx] = repCode + commentPart;
          }
        }
      } else {
        undeclaredVars.set(ident, err.line);
      }
    }
  }

  // Auto-declare remaining missing variables that weren't typos
  if (undeclaredVars.size > 0) {
    const decls: string[] = [];
    undeclaredVars.forEach((line, varName) => {
      const stmt = `var ${varName}: int = 0;`;
      decls.push(stmt);
      actions.push({
        phase: ErrorPhase.SEMANTIC,
        description: `Auto-declared missing identifier '${varName}' with inferred type 'int'`,
        originalLine: line,
        beforeSnippet: `${varName} (undeclared)`,
        afterSnippet: stmt,
        appliedHeuristic: 'Static Scope Hoisting & Type Synthesis Heuristic'
      });
    });
    newLines.unshift(...decls, '');
  }

  return {
    correctedCode: newLines.join('\n'),
    actions
  };
}

/**
 * Targeted single-error repair for clicking "Fix" on an individual diagnostic card.
 */
export function applySingleErrorFix(sourceCode: string, err: CompilerError): string {
  const lines = sourceCode.split('\n');
  const idx = err.line - 1;

  // Handle EOF missing closing brace
  if (err.message.includes("missing closing brace '}'")) {
    return sourceCode + '\n}';
  }

  if (idx >= 0 && idx < lines.length) {
    const line = lines[idx];
    const { codePart, commentPart } = splitCodeAndComment(line);
    const leadingWs = codePart.slice(0, codePart.length - codePart.trimStart().length);
    const stripped = codePart.trim();

    // 1. Misspelled identifier or keyword with closestMatch
    if (err.closestMatch && err.offendingText) {
      const regex = new RegExp(`\\b${err.offendingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\b`, 'g');
      lines[idx] = codePart.replace(regex, err.closestMatch) + commentPart;
      return lines.join('\n');
    }

    // 2. Missing semicolon
    if (err.message.includes("Missing terminating semicolon ';'") || err.message.includes("Missing ';'")) {
      // Check if previous non-empty line is the one missing ';' (parser often reports missing ';' on next token's line)
      let targetIdx = idx;
      if (!stripped || stripped.startsWith('}') || stripped.startsWith('if') || stripped.startsWith('while')) {
        for (let prev = idx - 1; prev >= 0; prev--) {
          const prevCode = splitCodeAndComment(lines[prev]).codePart.trim();
          if (prevCode && !prevCode.endsWith(';') && !prevCode.endsWith('{') && !prevCode.endsWith('}')) {
            targetIdx = prev;
            break;
          }
        }
      }
      const target = splitCodeAndComment(lines[targetIdx]);
      const tWs = target.codePart.slice(0, target.codePart.length - target.codePart.trimStart().length);
      const tStripped = target.codePart.trim();
      if (tStripped && !tStripped.endsWith(';')) {
        lines[targetIdx] = tWs + tStripped + ';' + (target.commentPart ? ' ' + target.commentPart : '');
        return lines.join('\n');
      }
    }

    // 3. Unterminated string literal
    if (err.message.includes('Unterminated string literal')) {
      if (line.includes(');')) {
        const qIdx = line.lastIndexOf(');');
        lines[idx] = line.slice(0, qIdx) + '"' + line.slice(qIdx);
      } else if (line.includes(';')) {
        const qIdx = line.lastIndexOf(';');
        lines[idx] = line.slice(0, qIdx) + '"' + line.slice(qIdx);
      } else {
        lines[idx] = line + '"';
      }
      return lines.join('\n');
    }

    // 4. Illegal character
    if (err.phase === ErrorPhase.LEXICAL && err.offendingText && err.offendingText.length === 1) {
      const escaped = err.offendingText.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      lines[idx] = codePart.replace(new RegExp(escaped, 'g'), '') + commentPart;
      return lines.join('\n');
    }

    // 5. Missing parentheses on if/while
    if (err.message.includes("parenthesis '('") || err.message.includes("parenthesis ')'")) {
      const ctrlMatch = /^(if|while)\s+(.+)$/.exec(stripped);
      if (ctrlMatch) {
        const kw = ctrlMatch[1];
        let rest = ctrlMatch[2].trim();
        const hasBrace = rest.endsWith('{');
        if (hasBrace) rest = rest.slice(0, -1).trim();
        if (rest.startsWith('(')) rest = rest.slice(1).trim();
        if (rest.endsWith(')')) rest = rest.slice(0, -1).trim();
        lines[idx] = leadingWs + `${kw} (${rest})` + (hasBrace ? ' {' : '') + (commentPart ? ' ' + commentPart : '');
        return lines.join('\n');
      }
    }

    // 6. Undeclared variable without close match -> hoist declaration at top
    if (err.message.includes('Undeclared identifier') && err.offendingText && !err.closestMatch) {
      return `var ${err.offendingText}: int = 0;\n` + sourceCode;
    }
  }

  // Fallback to full rule-based repair
  return autoCorrectCode(sourceCode).correctedCode;
}
