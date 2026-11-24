import React, { useRef } from 'react';
import { CODE_PRESETS, CodePreset } from '../compiler/presets';
import { Copy, RotateCcw, Check, Sparkles, Play } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  setCode: (code: string) => void;
  onAnalyze: () => void;
  onAutoCorrect: () => void;
  selectedPresetId: string;
  onSelectPreset: (preset: CodePreset) => void;
  errorLineNumbers: number[];
  justAnalyzed?: boolean;
}

export const CodeEditor: React.FC<CodeEditorProps> = ({
  code,
  setCode,
  onAnalyze,
  onAutoCorrect,
  selectedPresetId,
  onSelectPreset,
  errorLineNumbers,
  justAnalyzed = false
}) => {
  const [copied, setCopied] = React.useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const lineNumbersRef = useRef<HTMLDivElement>(null);

  const lines = code.split('\n');

  const handleCopy = async () => {
    await navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleScroll = () => {
    if (textareaRef.current && lineNumbersRef.current) {
      lineNumbersRef.current.scrollTop = textareaRef.current.scrollTop;
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    // Handle tab key for 4-space indentation
    if (e.key === 'Tab') {
      e.preventDefault();
      const target = e.currentTarget;
      const start = target.selectionStart;
      const end = target.selectionEnd;

      const newCode = code.substring(0, start) + '    ' + code.substring(end);
      setCode(newCode);

      setTimeout(() => {
        if (textareaRef.current) {
          textareaRef.current.selectionStart = textareaRef.current.selectionEnd = start + 4;
        }
      }, 0);
    }
  };

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 overflow-hidden shadow-sm">
      {/* Editor Toolbar */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5 px-3 sm:px-4 py-2.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
        <div className="flex items-center gap-2 min-w-0 flex-1">
          <label
            htmlFor="preset-select"
            className="text-xs font-semibold text-slate-500 dark:text-slate-400 shrink-0"
          >
            Preset:
          </label>
          <select
            id="preset-select"
            value={selectedPresetId}
            onChange={(e) => {
              const p = CODE_PRESETS.find((x) => x.id === e.target.value);
              if (p) onSelectPreset(p);
            }}
            className="w-full sm:w-auto min-w-0 max-w-full truncate text-xs bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-700 rounded-md px-2.5 py-1.5 min-h-[34px] text-slate-800 dark:text-slate-200 font-medium focus:outline-none focus:ring-1 focus:ring-indigo-500"
          >
            {CODE_PRESETS.map((p) => (
              <option key={p.id} value={p.id}>
                [{p.category}] {p.title}
              </option>
            ))}
          </select>
        </div>

        <div className="flex items-center gap-2 shrink-0 self-end sm:self-auto">
          <button
            type="button"
            onClick={handleCopy}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Copy source to clipboard"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            <span>{copied ? 'Copied' : 'Copy'}</span>
          </button>

          <button
            type="button"
            onClick={() => {
              const p = CODE_PRESETS.find((x) => x.id === selectedPresetId) || CODE_PRESETS[0];
              setCode(p.code);
            }}
            className="inline-flex items-center gap-1 px-2.5 py-1.5 min-h-[34px] text-xs text-slate-600 dark:text-slate-300 hover:text-slate-900 dark:hover:text-white rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            title="Reset to original preset"
          >
            <RotateCcw className="w-3.5 h-3.5" />
            <span>Reset</span>
          </button>
        </div>
      </div>

      {/* Editor Body with Line Numbers */}
      <div className="relative flex-1 flex overflow-hidden min-h-[280px] sm:min-h-[360px] bg-slate-950 font-mono text-xs sm:text-sm leading-6">
        {/* Line Numbers Column */}
        <div
          ref={lineNumbersRef}
          className="select-none py-3 px-2.5 sm:px-3 text-right bg-slate-900 text-slate-500 border-r border-slate-800 shrink-0 w-10 sm:w-12 font-mono text-xs sm:text-sm leading-6 overflow-hidden"
        >
          {lines.map((_, i) => {
            const lineNum = i + 1;
            const hasError = errorLineNumbers.includes(lineNum);
            return (
              <div
                key={i}
                className={`${
                  hasError ? 'text-rose-400 font-bold bg-rose-950/40 -mx-2.5 sm:-mx-3 px-2.5 sm:px-3' : 'text-slate-500'
                }`}
              >
                {lineNum}
              </div>
            );
          })}
        </div>

        {/* Text Area */}
        <textarea
          ref={textareaRef}
          value={code}
          onChange={(e) => setCode(e.target.value)}
          onScroll={handleScroll}
          onKeyDown={handleKeyDown}
          spellCheck={false}
          aria-label="SimpleLang Source Code Editor"
          className="flex-1 p-3 bg-transparent text-slate-100 placeholder-slate-600 resize-none focus:outline-none font-mono text-xs sm:text-sm leading-6 whitespace-pre overflow-auto"
          placeholder="// Enter or paste SimpleLang code here..."
        />
      </div>

      {/* Footer Info */}
      <div className="flex flex-wrap items-center justify-between gap-2 px-3 sm:px-4 py-2.5 bg-slate-50 dark:bg-slate-800/80 border-t border-slate-200 dark:border-slate-800 text-xs text-slate-500 dark:text-slate-400 font-mono">
        <div className="flex items-center gap-3 tabular-nums">
          <span>{lines.length} lines</span>
          <span>{code.length} chars</span>
          <span className="hidden xl:inline">SimpleLang</span>
        </div>

        <div className="flex items-center gap-2 w-full sm:w-auto justify-end">
          <button
            type="button"
            onClick={onAutoCorrect}
            className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 py-1.5 min-h-[34px] text-xs font-semibold text-amber-900 bg-amber-100 hover:bg-amber-200 dark:bg-amber-900/40 dark:text-amber-200 rounded transition-colors whitespace-nowrap cursor-pointer active:scale-95"
          >
            <Sparkles className="w-3.5 h-3.5 shrink-0" />
            <span>Auto-Correct</span>
          </button>
          <button
            type="button"
            onClick={onAnalyze}
            className={`flex-1 sm:flex-initial inline-flex items-center justify-center gap-1 px-3 py-1.5 min-h-[34px] text-xs font-semibold text-white rounded transition-all whitespace-nowrap cursor-pointer active:scale-95 ${
              justAnalyzed
                ? 'bg-emerald-600 hover:bg-emerald-700 ring-2 ring-emerald-400/50'
                : 'bg-indigo-600 hover:bg-indigo-700'
            }`}
          >
            {justAnalyzed ? (
              <Check className="w-3.5 h-3.5 shrink-0" />
            ) : (
              <Play className="w-3.5 h-3.5 fill-current shrink-0" />
            )}
            <span>{justAnalyzed ? 'Analyzed!' : 'Run Analysis'}</span>
          </button>
        </div>
      </div>
    </div>
  );
};
