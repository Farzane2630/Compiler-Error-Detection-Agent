import React from 'react';
import { CorrectionAction } from '../compiler/types';
import { Sparkles, ArrowRight, Check, X } from 'lucide-react';

interface AutoCorrectModalProps {
  isOpen: boolean;
  onClose: () => void;
  originalCode: string;
  correctedCode: string;
  actions: CorrectionAction[];
  onApply: () => void;
}

export const AutoCorrectModal: React.FC<AutoCorrectModalProps> = ({
  isOpen,
  onClose,
  originalCode,
  correctedCode,
  actions,
  onApply
}) => {
  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-2 sm:p-4 bg-black/60 backdrop-blur-xs">
      <div className="bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-2xl w-full max-w-4xl max-h-[92vh] flex flex-col shadow-2xl overflow-hidden">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 px-4 sm:px-6 py-3.5 sm:py-4 border-b border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <div className="flex items-center gap-2.5 min-w-0">
            <div className="p-2 rounded-lg bg-amber-100 dark:bg-amber-950 text-amber-800 dark:text-amber-200 shrink-0">
              <Sparkles className="w-5 h-5" />
            </div>
            <div className="min-w-0">
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100 truncate">
                Rule-Based Error Correction Review
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                Deterministic heuristic repairs ({actions.length} actions)
              </p>
            </div>
          </div>

          <button
            onClick={onClose}
            aria-label="Close modal"
            className="p-1.5 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 rounded-lg hover:bg-slate-100 dark:hover:bg-slate-800 shrink-0 cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Content body */}
        <div className="flex-1 overflow-y-auto p-4 sm:p-6 space-y-6">
          {/* Actions Breakdown */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
              Applied Compiler Repair Actions
            </h4>

            {actions.length === 0 ? (
              <p className="text-xs text-slate-500 italic">No automated actions required.</p>
            ) : (
              <div className="space-y-2.5">
                {actions.map((act, idx) => (
                  <div
                    key={idx}
                    className="p-3 rounded-lg border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/40 text-xs font-mono"
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2 mb-1.5">
                      <span className="font-semibold text-slate-900 dark:text-slate-100 font-sans">
                        {idx + 1}. {act.description}
                      </span>
                      <span className="px-2 py-0.5 rounded text-[11px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 whitespace-nowrap">
                        {act.phase}
                      </span>
                    </div>

                    <div className="text-[11px] text-slate-500 mb-2 font-sans">
                      <strong>Heuristic:</strong> {act.appliedHeuristic} · Line {act.originalLine}
                    </div>

                    <div className="grid grid-cols-1 md:grid-cols-2 gap-2 text-xs">
                      <div className="p-2 rounded bg-rose-50 dark:bg-rose-950/40 text-rose-800 dark:text-rose-300 border border-rose-200 dark:border-rose-900 overflow-x-auto whitespace-pre">
                        <span className="block text-[10px] uppercase text-rose-500 font-sans font-bold mb-0.5">
                          Before:
                        </span>
                        {act.beforeSnippet}
                      </div>
                      <div className="p-2 rounded bg-emerald-50 dark:bg-emerald-950/40 text-emerald-800 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-900 overflow-x-auto whitespace-pre">
                        <span className="block text-[10px] uppercase text-emerald-500 font-sans font-bold mb-0.5">
                          After:
                        </span>
                        {act.afterSnippet}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Side by Side Preview */}
          <div>
            <h4 className="text-xs font-semibold text-slate-500 dark:text-slate-400 mb-3">
              Source Code Comparison
            </h4>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
              <div className="min-w-0">
                <span className="text-xs font-medium text-slate-500 mb-1 block">
                  Original Source:
                </span>
                <pre className="p-3 bg-slate-950 text-slate-300 rounded-lg text-xs font-mono overflow-auto max-h-56 leading-5">
                  {originalCode}
                </pre>
              </div>

              <div className="min-w-0">
                <span className="text-xs font-medium text-emerald-600 dark:text-emerald-400 mb-1 flex items-center gap-1 font-semibold">
                  <Check className="w-3.5 h-3.5" />
                  Repaired Source:
                </span>
                <pre className="p-3 bg-slate-950 text-emerald-300 rounded-lg text-xs font-mono overflow-auto max-h-56 leading-5 border border-emerald-900/50">
                  {correctedCode}
                </pre>
              </div>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-col-reverse sm:flex-row items-stretch sm:items-center justify-between gap-2 px-4 sm:px-6 py-3.5 sm:py-4 border-t border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/60">
          <button
            onClick={onClose}
            className="px-4 py-2 min-h-[38px] text-xs font-medium text-slate-700 dark:text-slate-300 hover:text-slate-900 rounded-lg transition-colors cursor-pointer"
          >
            Cancel
          </button>

          <button
            onClick={() => {
              onApply();
              onClose();
            }}
            className="inline-flex items-center justify-center gap-2 px-5 py-2 min-h-[38px] text-xs font-bold text-white bg-indigo-600 hover:bg-indigo-700 rounded-lg shadow-sm transition-colors cursor-pointer"
          >
            Apply Fixes to Editor &amp; Re-Analyze
            <ArrowRight className="w-4 h-4" />
          </button>
        </div>
      </div>
    </div>
  );
};
