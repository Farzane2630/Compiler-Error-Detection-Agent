import React from 'react';
import { SymbolEntry } from '../compiler/types';
import { Database, CheckCircle, AlertCircle } from 'lucide-react';

interface SymbolTableViewProps {
  symbols: SymbolEntry[];
}

export const SymbolTableView: React.FC<SymbolTableViewProps> = ({ symbols }) => {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Database className="w-4 h-4 text-rose-500 shrink-0" />
            Static Semantic Symbol Table (Phase 3)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Scoped compile-time variable directory with synthesized static types and initialization tracking
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-[65vh]">
        {symbols.length === 0 ? (
          <div className="text-center py-12 text-slate-400 text-xs font-mono">
            No variables declared yet in active symbol scopes.
          </div>
        ) : (
          <table className="w-full min-w-[500px] text-left font-mono text-xs divide-y divide-slate-200 dark:divide-slate-800">
            <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-600 dark:text-slate-400">
              <tr>
                <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Identifier</th>
                <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Scope Level</th>
                <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Synthesized Type</th>
                <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Initialized</th>
                <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Declared Line</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
              {symbols.map((sym, idx) => (
                <tr key={idx} className="hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors">
                  <td className="py-2 px-2.5 sm:px-3 font-bold text-slate-900 dark:text-slate-100 whitespace-nowrap">
                    {sym.name}
                  </td>
                  <td className="py-2 px-2.5 sm:px-3 text-slate-600 dark:text-slate-400 whitespace-nowrap">
                    <span className="px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300">
                      {sym.scope}
                    </span>
                  </td>
                  <td className="py-2 px-2.5 sm:px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded font-bold ${
                        sym.type === 'int'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300'
                          : sym.type === 'float'
                          ? 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300'
                          : sym.type === 'string'
                          ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300'
                          : 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                      }`}
                    >
                      {sym.type}
                    </span>
                  </td>
                  <td className="py-2 px-2.5 sm:px-3 whitespace-nowrap">
                    {sym.isInitialized ? (
                      <span className="inline-flex items-center gap-1 text-emerald-600 dark:text-emerald-400">
                        <CheckCircle className="w-3.5 h-3.5" />
                        Yes
                      </span>
                    ) : (
                      <span className="inline-flex items-center gap-1 text-amber-500 dark:text-amber-400">
                        <AlertCircle className="w-3.5 h-3.5" />
                        Uninit
                      </span>
                    )}
                  </td>
                  <td className="py-2 px-2.5 sm:px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    Line {sym.lineDeclared}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
};
