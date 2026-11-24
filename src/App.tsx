/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Header, ActiveTab } from './components/Header';
import { CodeEditor } from './components/CodeEditor';
import { DiagnosticsList } from './components/DiagnosticsList';
import { InputTypeCheckerView } from './components/InputTypeCheckerView';
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
import { CompilationResult, CompilerError, CorrectionAction, TargetLanguage } from './compiler/types';

export default function App() {
  const [language, setLanguage] = useState<TargetLanguage>(CODE_PRESETS[0].language);
  const [code, setCode] = useState<string>(CODE_PRESETS[0].code);
  const [selectedPresetId, setSelectedPresetId] = useState<string>(CODE_PRESETS[0].id);
  const [activeTab, setActiveTab] = useState<ActiveTab>('editor');

  const [result, setResult] = useState<CompilationResult>({
    language: CODE_PRESETS[0].language,
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
  const [lastAnalyzedAt, setLastAnalyzedAt] = useState<string | null>(null);
  const [justAnalyzed, setJustAnalyzed] = useState(false);
  const analyzeTimerRef = useRef<number | null>(null);

  // 3-Phase Compiler Analysis Pipeline for Python & C++
  const runAnalysis = useCallback((source: string, targetLang: TargetLanguage) => {
    // 1. Lexical Analysis
    const lexer = new Lexer(source, targetLang);
    const { tokens, errors: lexErrors } = lexer.tokenize();

    // 2. Syntax Analysis
    const parser = new Parser(tokens, targetLang);
    const { ast, errors: synErrors } = parser.parse();

    // 3. Semantic Analysis
    const analyzer = new SemanticAnalyzer(targetLang);
    const { symbols, errors: semErrors } = analyzer.analyze(ast);

    const allErrors: CompilerError[] = [...lexErrors, ...synErrors, ...semErrors];
    const isValid = allErrors.length === 0;

    setResult({
      language: targetLang,
      isValid,
      tokens,
      lexicalErrors: lexErrors,
      syntaxErrors: synErrors,
      semanticErrors: semErrors,
      allErrors,
      ast,
      symbols
    });

    setLastAnalyzedAt(
      new Date().toLocaleTimeString([], {
        hour: '2-digit',
        minute: '2-digit',
        second: '2-digit'
      })
    );
  }, []);

  // Run on mount or when code/language changes
  useEffect(() => {
    runAnalysis(code, language);
  }, [code, language, runAnalysis]);

  useEffect(() => {
    return () => {
      if (analyzeTimerRef.current !== null) {
        window.clearTimeout(analyzeTimerRef.current);
      }
    };
  }, []);

  const handleManualAnalyze = useCallback(() => {
    runAnalysis(code, language);

    if (activeTab !== 'editor') {
      setActiveTab('editor');
    }

    setJustAnalyzed(true);
    if (analyzeTimerRef.current !== null) {
      window.clearTimeout(analyzeTimerRef.current);
    }
    analyzeTimerRef.current = window.setTimeout(() => {
      setJustAnalyzed(false);
      analyzeTimerRef.current = null;
    }, 1500);

    window.setTimeout(() => {
      if (typeof window !== 'undefined' && window.innerWidth < 1024) {
        const panel = document.getElementById('diagnostics-panel');
        if (panel) {
          panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
      }
    }, 60);
  }, [activeTab, code, language, runAnalysis]);

  const handleSelectLanguage = (newLang: TargetLanguage) => {
    if (newLang === language) return;
    setLanguage(newLang);
    const firstPreset = CODE_PRESETS.find((p) => p.language === newLang);
    if (firstPreset) {
      setSelectedPresetId(firstPreset.id);
      setCode(firstPreset.code);
    }
  };

  const handleSelectPreset = (preset: CodePreset) => {
    setLanguage(preset.language);
    setSelectedPresetId(preset.id);
    setCode(preset.code);
  };

  const handleOpenAutoCorrect = () => {
    const { correctedCode: rep, actions } = autoCorrectCode(code, language);
    setCorrectedCode(rep);
    setCorrectionActions(actions);
    setIsAutoCorrectOpen(true);
  };

  const handleApplyFixes = () => {
    setCode(correctedCode);
    runAnalysis(correctedCode, language);
  };

  const handleApplySingleFix = (err: CompilerError) => {
    const repaired = applySingleErrorFix(code, err, language);
    setCode(repaired);
    runAnalysis(repaired, language);
  };

  const errorLineNumbers = Array.from(new Set(result.allErrors.map((e) => e.line)));

  return (
    <div className="min-h-screen bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 flex flex-col font-sans transition-colors">
      <Header
        activeTab={activeTab}
        setActiveTab={setActiveTab}
        onRunAnalysis={handleManualAnalyze}
        onAutoCorrect={handleOpenAutoCorrect}
        errorCount={result.allErrors.length}
        justAnalyzed={justAnalyzed}
      />

      <main className="flex-1 max-w-7xl w-full mx-auto p-3 sm:p-6 lg:p-8">
        {/* Editor & Diagnostics Split View */}
        {activeTab === 'editor' && (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 sm:gap-6 items-start">
            <div className="lg:col-span-6 h-[430px] sm:h-[520px] lg:h-[calc(100vh-11rem)] lg:min-h-[540px] lg:max-h-[760px] flex flex-col">
              <CodeEditor
                code={code}
                setCode={setCode}
                language={language}
                onSelectLanguage={handleSelectLanguage}
                onAnalyze={handleManualAnalyze}
                onAutoCorrect={handleOpenAutoCorrect}
                selectedPresetId={selectedPresetId}
                onSelectPreset={handleSelectPreset}
                errorLineNumbers={errorLineNumbers}
                justAnalyzed={justAnalyzed}
              />
            </div>

            <div
              id="diagnostics-panel"
              className="lg:col-span-6 h-auto lg:h-[calc(100vh-11rem)] lg:min-h-[540px] lg:max-h-[760px] flex flex-col scroll-mt-4"
            >
              <DiagnosticsList
                errors={result.allErrors}
                sourceCode={code}
                language={language}
                onApplySingleFix={handleApplySingleFix}
                onAutoCorrectAll={handleOpenAutoCorrect}
                lastAnalyzedAt={lastAnalyzedAt}
                justAnalyzed={justAnalyzed}
              />
            </div>
          </div>
        )}

        {/* Interactive Input Type Checker */}
        {activeTab === 'input-check' && (
          <div className="max-w-4xl mx-auto">
            <InputTypeCheckerView language={language} />
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
