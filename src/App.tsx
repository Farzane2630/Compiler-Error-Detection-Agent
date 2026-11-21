/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Header, ActiveTab } from './components/Header';
import { CodeEditor } from './components/CodeEditor';
import { DiagnosticsList } from './components/DiagnosticsList';
import { TokensView } from './components/TokensView';
import { AstVisualizer } from './components/AstVisualizer';
import { SymbolTableView } from './components/SymbolTableView';
// import { PythonDefenseGuide } from './components/PythonDefenseGuide';
import { AutoCorrectModal } from './components/AutoCorrectModal';

import { CODE_PRESETS, CodePreset } from './compiler/presets';
import { Lexer } from './compiler/lexer';
import { Parser } from './compiler/parser';
import { SemanticAnalyzer } from './compiler/semantic';
import { autoCorrectCode, applySingleErrorFix } from './compiler/corrector';
import { CompilationResult, CompilerError, CorrectionAction } from './compiler/types';

export default function App() {
  const [code, setCode] = useState<string>(CODE_PRESETS[0].code);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CODE_PRESETS[0].id);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');

  const [result, setResult] = useState<CompilationResult>({
    isValid: false,
    tokens: [],
    lexicalErrors: [],
    syntaxErrors: [],
    semanticErrors: [],
    allErrors: [],
    ast: null,
    symbols: []
  });

  const [isAutoCorrectOpen, setIsAutoCorrectOpen] = useState(false);
  const [correctedCode, setCorrectedCode] = useState('');
  const [correctionActions, setCorrectionActions] = useState<CorrectionAction[]>([]);

  // Compiler Analysis Pipeline
  const runAnalysis = useCallback((source: string) => {
    // 1. Lexical Analysis
    const lexer = new Lexer(source);
    const { tokens, errors: lexErrors } = lexer.tokenize();

    // 2. Syntax Analysis
    const parser = new Parser(tokens);
    const { ast, errors: synErrors } = parser.parse();

    // 3. Semantic Analysis
    const analyzer = new SemanticAnalyzer();
    const { symbols, errors: semErrors } = analyzer.analyze(ast);

    const allErrors: CompilerError[] = [...lexErrors, ...synErrors, ...semErrors];
    const isValid = allErrors.length === 0;

    setResult({
      isValid,
      tokens,
      lexicalErrors: lexErrors,
      syntaxErrors: synErrors,
      semanticErrors: semErrors,
      allErrors,
      ast,
      symbols
    });
  }, []);

  // Run on mount or when code changes
  useEffect(() => {
    runAnalysis(code);
  }, [code, runAnalysis]);

  const handleSelectPreset = (preset: CodePreset) => {
    setSelectedPresetId(preset.id);
    setCode(preset.code);
  };

  const handleOpenAutoCorrect = () => {
    const { correctedCode: rep, actions } = autoCorrectCode(code);
    setCorrectedCode(rep);
    setCorrectionActions(actions);
    setIsAutoCorrectOpen(true);
  };

  const handleApplyFixes = () => {
    setCode(correctedCode);
    runAnalysis(correctedCode);
  };

  const handleApplySingleFix = (err: CompilerError) => {
    const repaired = applySingleErrorFix(code, err);
    setCode(repaired);
    runAnalysis(repaired);
  };

  const errorLineNumbers = Array.from(new Set(result.allErrors.map((e) => e.line)));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRunAnalysis={() => runAnalysis(code)}
        onAutoCorrect={handleOpenAutoCorrect}
        errorCount={result.allErrors.length}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8">
        {/* Editor & Diagnostics Split View */}
        {activeTab === 'editor' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
            <div className="lg:col-span-6 h-[430px] sm:h-[520px] lg:h-[calc(100vh-11rem)] lg:min-h-[540px] lg:max-h-[760px] flex flex-col">
              <CodeEditor
                code={code}
                setCode={setCode}
                onAnalyze={() => runAnalysis(code)}
                onAutoCorrect={handleOpenAutoCorrect}
                selectedPresetId={selectedPresetId}
                onSelectPreset={handleSelectPreset}
                errorLineNumbers={errorLineNumbers}
              />
            </div>

            <div className="lg:col-span-6 h-auto lg:h-[calc(100vh-11rem)] lg:min-h-[540px] lg:max-h-[760px] flex flex-col">
              <DiagnosticsList
                errors={result.allErrors}
                sourceCode={code}
                onApplySingleFix={handleApplySingleFix}
                onAutoCorrectAll={handleOpenAutoCorrect}
              />
            </div>
          </div>
        )}

        {/* Phase 1: Tokens View */}
        {activeTab === 'tokens' && (
          <div className="max-w-5xl mx-auto">
            <TokensView tokens={result.tokens} />
          </div>
        )}

        {/* Phase 2: AST Tree View */}
        {activeTab === 'ast' && (
          <div className="max-w-5xl mx-auto">
            <AstVisualizer ast={result.ast} />
          </div>
        )}

        {/* Phase 3: Symbol Table View */}
        {activeTab === 'symbols' && (
          <div className="max-w-5xl mx-auto">
            <SymbolTableView symbols={result.symbols} />
          </div>
        )}

        {/*
        {activeTab === 'python' && (
          <div className="max-w-5xl mx-auto">
            <PythonDefenseGuide />
          </div>
        )}
        */}
      </main>

      {/* Auto-Correction Preview & Diff Modal */}
      <AutoCorrectModal
        isOpen={isAutoCorrectOpen}
        onClose={() => setIsAutoCorrectOpen(false)}
        originalCode={code}
        correctedCode={correctedCode}
        actions={correctionActions}
        onApply={handleApplyFixes}
      />
    </div>
  );
}
