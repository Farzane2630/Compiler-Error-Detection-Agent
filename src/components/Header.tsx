import React from 'react';
import { Play, Sparkles /*, BookOpen */ } from 'lucide-react';

export type ActiveTab = 'editor' | 'input-check' | 'tokens' | 'ast' | 'symbols'; // | 'python'

interface HeaderProps {
  activeTab: ActiveTab;
  setActiveTab: (tab: ActiveTab) => void;
  onRunAnalysis: () => void;
  onAutoCorrect: () => void;
  errorCount: number;
  justAnalyzed?: boolean;
}

const NAV_ITEMS: { id: ActiveTab; label: string; mobileLabel: string }[] = [
  { id: 'editor', label: 'Diagnostics & Editor', mobileLabel: 'Editor' },
  { id: 'input-check', label: 'Input Type Check', mobileLabel: 'Type Check' },
  { id: 'tokens', label: 'Lexical Tokens', mobileLabel: 'Tokens' },
  { id: 'ast', label: 'Syntax AST Tree', mobileLabel: 'AST' },
  { id: 'symbols', label: 'Symbol Table', mobileLabel: 'Symbols' }
];

export const Header: React.FC<HeaderProps> = ({
  activeTab,
  setActiveTab,
  onRunAnalysis,
  onAutoCorrect,
  errorCount,
  justAnalyzed = false
}) => {
  return (
    <header className="border-b border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 md:sticky md:top-0 z-30 transition-colors">
      <div className="max-w-7xl mx-auto px-3 sm:px-6 lg:px-8 h-14 sm:h-16 flex items-center justify-between gap-2 sm:gap-6 lg:gap-8">
        {/* Zone 1: Single text wordmark */}
        <div className="flex items-center gap-2.5 min-w-0 shrink-0">
          <div className="w-8 h-8 rounded-lg bg-indigo-600 flex items-center justify-center text-white font-bold text-sm tracking-wider shadow-sm shrink-0">
            μC
          </div>
          <span className="text-base sm:text-lg font-bold tracking-tight text-slate-900 dark:text-slate-100 whitespace-nowrap truncate">
            <span className="sm:hidden">Py/C++ Agent</span>
            <span className="hidden sm:inline">Python &amp; C++ Compiler Agent</span>
          </span>
        </div>

        {/* Zone 2: Desktop Navigation Links */}
        <nav className="hidden lg:flex items-center gap-6 text-sm font-medium text-slate-600 dark:text-slate-300">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`whitespace-nowrap shrink-0 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400 cursor-pointer ${
                activeTab === item.id
                  ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                  : ''
              }`}
            >
              {item.label}
            </button>
          ))}

          {/*
          <button
            onClick={() => setActiveTab('python')}
            className={`whitespace-nowrap shrink-0 flex items-center gap-1.5 transition-colors hover:text-indigo-600 dark:hover:text-indigo-400 ${
              activeTab === 'python'
                ? 'text-indigo-600 dark:text-indigo-400 font-semibold'
                : ''
            }`}
          >
            <BookOpen className="w-4 h-4 text-emerald-600 dark:text-emerald-400" />
            Python Script &amp; Defense Guide
          </button>
          */}
        </nav>

        {/* Zone 3: Primary Action Group */}
        <div className="flex items-center gap-2 sm:gap-3 shrink-0">
          {errorCount > 0 && (
            <button
              type="button"
              onClick={onAutoCorrect}
              className="inline-flex items-center gap-1.5 px-2.5 sm:px-3 py-1.5 sm:py-2 min-h-[36px] text-xs font-medium text-amber-900 bg-amber-100 hover:bg-amber-200 dark:bg-amber-950/60 dark:text-amber-200 dark:hover:bg-amber-900/60 rounded-lg transition-colors whitespace-nowrap shrink-0 cursor-pointer"
              title="Apply deterministic rule-based corrections"
            >
              <Sparkles className="w-3.5 h-3.5 shrink-0" />
              <span className="sm:hidden">Fix ({errorCount})</span>
              <span className="hidden sm:inline">Auto-Correct ({errorCount})</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRunAnalysis}
            className={`inline-flex items-center gap-1.5 px-3 sm:px-4 py-1.5 sm:py-2 min-h-[36px] text-xs font-semibold text-white rounded-lg shadow-sm transition-all whitespace-nowrap shrink-0 cursor-pointer active:scale-95 ${
              justAnalyzed
                ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/50'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            <Play className="w-3.5 h-3.5 fill-current shrink-0" />
            <span className="sm:hidden">{justAnalyzed ? 'Done!' : 'Analyze'}</span>
            <span className="hidden sm:inline">{justAnalyzed ? 'Analyzed!' : 'Analyze Code'}</span>
          </button>
        </div>
      </div>

      {/* Mobile & Tablet Navigation Strip (< lg) */}
      <nav
        aria-label="Compiler views"
        className="lg:hidden border-t border-slate-100 dark:border-slate-800 bg-slate-50/70 dark:bg-slate-900/80 px-3 sm:px-6 overflow-x-auto"
      >
        <div className="flex items-center gap-1 sm:gap-2 py-1.5 min-w-max">
          {NAV_ITEMS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveTab(item.id)}
              className={`px-3 py-1.5 min-h-[36px] text-xs font-medium rounded-md whitespace-nowrap shrink-0 transition-colors cursor-pointer ${
                activeTab === item.id
                  ? 'bg-white dark:bg-slate-800 text-indigo-600 dark:text-indigo-400 font-semibold shadow-xs border border-slate-200/80 dark:border-slate-700'
                  : 'text-slate-600 dark:text-slate-400 hover:text-slate-900 dark:hover:text-slate-100'
              }`}
            >
              <span className="sm:hidden">{item.mobileLabel}</span>
              <span className="hidden sm:inline">{item.label}</span>
            </button>
          ))}
        </div>
      </nav>
    </header>
  );
};
