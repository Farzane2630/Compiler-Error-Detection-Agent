import React, { useState } from 'react';
import { CompilerError, ErrorPhase } from '../compiler/types';
import {
  CheckCircle2,
  FileCode,
  Layers,
  Wrench,
  Search,
  Sparkles,
  ArrowRight
} from 'lucide-react';

interface DiagnosticsListProps {
  errors: CompilerError[];
  sourceCode: string;
  onApplySingleFix?: (error: CompilerError) => void;
  onAutoCorrectAll: () => void;
  lastAnalyzedAt?: string | null;
  justAnalyzed?: boolean;
}

export const DiagnosticsList: React.FC<DiagnosticsListProps> = ({
  errors,
  sourceCode,
  onApplySingleFix,
  onAutoCorrectAll,
  lastAnalyzedAt = null,
  justAnalyzed = false
}) => {
  const [selectedPhase, setSelectedPhase] = useState<'ALL' | ErrorPhase>('ALL');

  const lines = sourceCode.split('\n');

  const lexicalErrors = errors.filter((e) => e.phase === ErrorPhase.LEXICAL);
  const syntaxErrors = errors.filter((e) => e.phase === ErrorPhase.SYNTAX);
  const semanticErrors = errors.filter((e) => e.phase === ErrorPhase.SEMANTIC);

  const filteredErrors =
    selectedPhase === 'ALL' ? errors : errors.filter((e) => e.phase === selectedPhase);

  const togglePhase = (phase: ErrorPhase) => {
    setSelectedPhase((prev) => (prev === phase ? 'ALL' : phase));
  };

  const getPhaseStyles = (phase: ErrorPhase) => {
    switch (phase) {
      case ErrorPhase.LEXICAL:
        return {
          bg: 'bg-amber-50 dark:bg-amber-950/30',
          border: 'border-amber-200 dark:border-amber-800',
          badge: 'text-amber-800 bg-amber-100 dark:bg-amber-900/50 dark:text-amber-300',
          icon: 'text-amber-600 dark:text-amber-400'
        };
      case ErrorPhase.SYNTAX:
        return {
          bg: 'bg-indigo-50 dark:bg-indigo-950/30',
          border: 'border-indigo-200 dark:border-indigo-800',
          badge: 'text-indigo-800 bg-indigo-100 dark:bg-indigo-900/50 dark:text-indigo-300',
          icon: 'text-indigo-600 dark:text-indigo-400'
        };
      case ErrorPhase.SEMANTIC:
        return {
          bg: 'bg-rose-50 dark:bg-rose-950/30',
          border: 'border-rose-200 dark:border-rose-800',
          badge: 'text-rose-800 bg-rose-100 dark:bg-rose-900/50 dark:text-rose-300',
          icon: 'text-rose-600 dark:text-rose-400'
        };
    }
  };

  return (
    <div className="flex flex-col h-full space-y-4">
      {/* Analysis Run Status Banner */}
      <div
        className={`flex flex-wrap items-center justify-between gap-2 px-3 py-2 rounded-lg border text-xs transition-all ${
          justAnalyzed
            ? 'bg-emerald-50 border-emerald-300 text-emerald-900 dark:bg-emerald-950/40 dark:border-emerald-700 dark:text-emerald-200 ring-2 ring-emerald-400/40'
            : 'bg-white border-slate-200 text-slate-600 dark:bg-slate-900 dark:border-slate-800 dark:text-slate-300'
        }`}
      >
        <div className="flex items-center gap-2 font-medium">
          <span
            className={`w-2 h-2 rounded-full shrink-0 ${
              errors.length === 0 ? 'bg-emerald-500' : 'bg-amber-500'
            }`}
          />
          <span>
            {errors.length === 0
              ? 'Analysis complete · 0 errors'
              : `Analysis complete · ${errors.length} ${errors.length === 1 ? 'error' : 'errors'} detected`}
          </span>
        </div>
        {lastAnalyzedAt && (
          <span className="font-mono text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Last run: {lastAnalyzedAt}
          </span>
        )}
      </div>

      {/* 3-Phase Pipeline Status Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 sm:gap-3">
        {/* Phase 1: Lexical */}
        <button
          type="button"
          onClick={() => togglePhase(ErrorPhase.LEXICAL)}
          className={`text-left cursor-pointer p-3 rounded-lg border transition-all ${
            selectedPhase === ErrorPhase.LEXICAL
              ? 'ring-2 ring-amber-500 border-amber-300 bg-amber-50/70 dark:bg-amber-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap">
              <FileCode className="w-3.5 h-3.5 text-amber-500 shrink-0" />
              1. Lexical
            </span>
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap tabular-nums ${
                lexicalErrors.length === 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 font-bold'
              }`}
            >
              {lexicalErrors.length === 0 ? 'Passed (0)' : `${lexicalErrors.length} Err`}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            Tokens &amp; alphabet rules
          </p>
        </button>

        {/* Phase 2: Syntax */}
        <button
          type="button"
          onClick={() => togglePhase(ErrorPhase.SYNTAX)}
          className={`text-left cursor-pointer p-3 rounded-lg border transition-all ${
            selectedPhase === ErrorPhase.SYNTAX
              ? 'ring-2 ring-indigo-500 border-indigo-300 bg-indigo-50/70 dark:bg-indigo-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap">
              <Layers className="w-3.5 h-3.5 text-indigo-500 shrink-0" />
              2. Syntax
            </span>
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap tabular-nums ${
                syntaxErrors.length === 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 font-bold'
              }`}
            >
              {syntaxErrors.length === 0 ? 'Passed (0)' : `${syntaxErrors.length} Err`}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            CFG grammar &amp; AST structure
          </p>
        </button>

        {/* Phase 3: Semantic */}
        <button
          type="button"
          onClick={() => togglePhase(ErrorPhase.SEMANTIC)}
          className={`text-left cursor-pointer p-3 rounded-lg border transition-all ${
            selectedPhase === ErrorPhase.SEMANTIC
              ? 'ring-2 ring-rose-500 border-rose-300 bg-rose-50/70 dark:bg-rose-950/40'
              : 'border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 hover:border-slate-300 dark:hover:border-slate-700'
          }`}
        >
          <div className="flex items-center justify-between gap-2 text-xs">
            <span className="font-semibold text-slate-700 dark:text-slate-300 flex items-center gap-1.5 whitespace-nowrap">
              <Wrench className="w-3.5 h-3.5 text-rose-500 shrink-0" />
              3. Semantic
            </span>
            <span
              className={`font-mono text-xs px-2 py-0.5 rounded whitespace-nowrap tabular-nums ${
                semanticErrors.length === 0
                  ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                  : 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300 font-bold'
              }`}
            >
              {semanticErrors.length === 0 ? 'Passed (0)' : `${semanticErrors.length} Err`}
            </span>
          </div>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400 truncate">
            Symbol table &amp; type rules
          </p>
        </button>
      </div>

      {/* Filter Tabs & Auto-Correct CTA */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 pt-1 border-b border-slate-200 dark:border-slate-800 pb-2">
        <div className="flex items-center gap-1 overflow-x-auto pb-1 sm:pb-0">
          <button
            type="button"
            onClick={() => setSelectedPhase('ALL')}
            className={`px-2.5 py-1.5 text-xs rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedPhase === 'ALL'
                ? 'bg-slate-900 text-white dark:bg-slate-100 dark:text-slate-900'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            All ({errors.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedPhase(ErrorPhase.LEXICAL)}
            className={`px-2.5 py-1.5 text-xs rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedPhase === ErrorPhase.LEXICAL
                ? 'bg-amber-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Lexical ({lexicalErrors.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedPhase(ErrorPhase.SYNTAX)}
            className={`px-2.5 py-1.5 text-xs rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedPhase === ErrorPhase.SYNTAX
                ? 'bg-indigo-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Syntax ({syntaxErrors.length})
          </button>
          <button
            type="button"
            onClick={() => setSelectedPhase(ErrorPhase.SEMANTIC)}
            className={`px-2.5 py-1.5 text-xs rounded-md font-medium whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
              selectedPhase === ErrorPhase.SEMANTIC
                ? 'bg-rose-600 text-white'
                : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-white'
            }`}
          >
            Semantic ({semanticErrors.length})
          </button>
        </div>

        {errors.length > 0 && (
          <button
            type="button"
            onClick={onAutoCorrectAll}
            className="inline-flex items-center justify-center gap-1.5 px-3 py-1.5 text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/70 dark:text-amber-200 rounded-md transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            Auto-Fix All ({errors.length})
          </button>
        )}
      </div>

      {/* Diagnostics List Container */}
      <div className="lg:flex-1 lg:overflow-y-auto space-y-3 lg:pr-1">
        {errors.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-6 sm:p-8 bg-emerald-50/50 dark:bg-emerald-950/20 border border-emerald-200 dark:border-emerald-800 rounded-xl text-center">
            <CheckCircle2 className="w-10 h-10 sm:w-12 sm:h-12 text-emerald-600 dark:text-emerald-400 mb-3" />
            <h3 className="text-base font-bold text-emerald-900 dark:text-emerald-200">
              Zero Compilation Errors
            </h3>
            <p className="text-xs text-emerald-700 dark:text-emerald-300 max-w-md mt-1">
              The source code successfully completed Lexical Analysis, Syntax Parsing, and Static Semantic Type Checking!
            </p>
            <div className="mt-4 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
              <span>Inspect the generated Tokens, AST Tree, and Symbol Table via the navigation tabs.</span>
            </div>
          </div>
        ) : filteredErrors.length === 0 ? (
          <div className="p-6 text-center rounded-xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 text-xs text-slate-500">
            No {selectedPhase.toLowerCase()}s found. Select &quot;All&quot; to inspect errors from other phases.
          </div>
        ) : (
          filteredErrors.map((err, idx) => {
            const styles = getPhaseStyles(err.phase);
            const lineText = lines[err.line - 1] || '';
            const caretPadding = ' '.repeat(Math.max(0, err.column - 1));

            return (
              <div
                key={err.id || idx}
                className={`p-3.5 sm:p-4 rounded-xl border ${styles.bg} ${styles.border} transition-all shadow-xs`}
              >
                {/* Header row */}
                <div className="flex items-start justify-between gap-2 flex-wrap">
                  <div className="flex items-center gap-2 flex-wrap">
                    <span
                      className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-bold tracking-wide whitespace-nowrap ${styles.badge}`}
                    >
                      {err.phase}
                    </span>
                    <span className="text-xs font-mono font-medium text-slate-600 dark:text-slate-300 tabular-nums">
                      Line {err.line}, Column {err.column}
                    </span>
                  </div>

                  {err.closestMatch && (
                    <span className="text-xs font-semibold px-2 py-0.5 rounded bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300 inline-flex items-center gap-1">
                      <Search className="w-3 h-3 shrink-0" />
                      Did you mean &apos;{err.closestMatch}&apos;?
                    </span>
                  )}
                </div>

                {/* Main Message */}
                <h4 className="text-sm font-semibold text-slate-900 dark:text-slate-100 mt-2 break-words">
                  {err.message}
                </h4>

                {/* Code Snippet with Caret pointer */}
                {lineText && (
                  <div className="mt-2.5 p-2.5 rounded-lg bg-slate-950 text-slate-100 font-mono text-xs overflow-x-auto leading-5">
                    <div className="text-slate-500 select-none">
                      Line {err.line}:
                    </div>
                    <div className="text-slate-200 whitespace-pre">
                      {lineText}
                    </div>
                    <div className="text-amber-400 font-bold whitespace-pre select-none">
                      {caretPadding}^
                    </div>
                  </div>
                )}

                {/* Academic Context & Explanation */}
                <div className="mt-3 space-y-1 text-xs break-words">
                  <div className="text-slate-600 dark:text-slate-400">
                    <strong className="text-slate-700 dark:text-slate-200">Theory Rule: </strong>
                    <span className="font-mono text-xs">{err.ruleViolated}</span>
                  </div>
                  {err.explanation && (
                    <div className="text-slate-600 dark:text-slate-400">
                      <strong className="text-slate-700 dark:text-slate-200">Formal Reason: </strong>
                      {err.explanation}
                    </div>
                  )}
                </div>

                {/* Suggested Fix Box */}
                {err.suggestedFix && (
                  <div className="mt-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 p-2.5 rounded-lg bg-white/80 dark:bg-slate-900/80 border border-slate-200 dark:border-slate-800">
                    <div className="flex items-start sm:items-center gap-2 text-xs min-w-0">
                      <Sparkles className="w-3.5 h-3.5 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5 sm:mt-0" />
                      <span className="text-slate-700 dark:text-slate-300 break-words">
                        <strong>Suggested Fix:</strong> {err.suggestedFix}
                      </span>
                    </div>

                    {onApplySingleFix && (
                      <button
                        type="button"
                        onClick={() => onApplySingleFix(err)}
                        className="inline-flex items-center justify-center gap-1 px-3 py-1.5 text-xs font-medium text-indigo-700 bg-indigo-50 hover:bg-indigo-100 dark:bg-indigo-950 dark:text-indigo-300 dark:hover:bg-indigo-900 rounded shrink-0 transition-colors cursor-pointer self-end sm:self-auto"
                      >
                        Fix <ArrowRight className="w-3 h-3" />
                      </button>
                    )}
                  </div>
                )}
              </div>
            );
          })
        )}
      </div>
    </div>
  );
};
