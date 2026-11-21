import React, { useState } from 'react';
import { Token, TokenType } from '../compiler/types';
import { Search } from 'lucide-react';

interface TokensViewProps {
  tokens: Token[];
}

export const TokensView: React.FC<TokensViewProps> = ({ tokens }) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [filterType, setFilterType] = useState<string>('ALL');

  const filtered = tokens.filter((t) => {
    if (filterType !== 'ALL' && t.type !== filterType) return false;
    if (searchTerm) {
      const v = String(t.value).toLowerCase();
      const type = t.type.toLowerCase();
      const q = searchTerm.toLowerCase();
      return v.includes(q) || type.includes(q);
    }
    return true;
  });

  const tokenTypes = Array.from(new Set(tokens.map((t) => t.type)));

  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-4">
      {/* Header and Filter Controls */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
            Lexical Token Stream (Phase 1)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 tabular-nums">
            Total Recognized Tokens: {tokens.length}
          </p>
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-2">
          {/* Search box */}
          <div className="relative flex-1 sm:flex-initial">
            <Search className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-2.5" />
            <input
              type="text"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              placeholder="Search value or type..."
              className="w-full sm:w-48 pl-8 pr-3 py-1.5 min-h-[34px] text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-1 focus:ring-indigo-500"
            />
          </div>

          {/* Filter dropdown */}
          <select
            value={filterType}
            onChange={(e) => setFilterType(e.target.value)}
            className="text-xs rounded-md border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 px-2.5 py-1.5 min-h-[34px] text-slate-700 dark:text-slate-200 focus:outline-none"
          >
            <option value="ALL">All Token Types</option>
            {tokenTypes.map((type) => (
              <option key={type} value={type}>
                {type}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Tokens Table */}
      <div className="flex-1 overflow-auto rounded-lg border border-slate-200 dark:border-slate-800 max-h-[65vh]">
        <table className="w-full min-w-[460px] text-left font-mono text-xs divide-y divide-slate-200 dark:divide-slate-800">
          <thead className="bg-slate-50 dark:bg-slate-800/80 sticky top-0 text-slate-600 dark:text-slate-400">
            <tr>
              <th className="py-2.5 px-2.5 sm:px-3 font-semibold">#</th>
              <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Token Type</th>
              <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Lexeme / Value</th>
              <th className="py-2.5 px-2.5 sm:px-3 font-semibold">Position</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800/60 bg-white dark:bg-slate-900">
            {filtered.map((t, idx) => {
              const isIllegal = t.type === TokenType.ILLEGAL;
              const isKeyword = [
                TokenType.VAR,
                TokenType.INT,
                TokenType.FLOAT,
                TokenType.STRING,
                TokenType.BOOL,
                TokenType.IF,
                TokenType.ELSE,
                TokenType.WHILE,
                TokenType.PRINT
              ].includes(t.type);

              return (
                <tr
                  key={idx}
                  className={`hover:bg-slate-50 dark:hover:bg-slate-800/40 transition-colors ${
                    isIllegal ? 'bg-rose-50/70 dark:bg-rose-950/30' : ''
                  }`}
                >
                  <td className="py-2 px-2.5 sm:px-3 text-slate-400 tabular-nums">{idx + 1}</td>
                  <td className="py-2 px-2.5 sm:px-3 whitespace-nowrap">
                    <span
                      className={`px-2 py-0.5 rounded font-bold text-xs ${
                        isIllegal
                          ? 'bg-rose-100 text-rose-800 dark:bg-rose-950 dark:text-rose-300'
                          : isKeyword
                          ? 'bg-indigo-100 text-indigo-800 dark:bg-indigo-950 dark:text-indigo-300'
                          : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300'
                      }`}
                    >
                      {t.type}
                    </span>
                  </td>
                  <td className="py-2 px-2.5 sm:px-3 text-slate-800 dark:text-slate-200 font-semibold max-w-[200px] sm:max-w-xs truncate">
                    {t.type === TokenType.STRING_LITERAL ? `"${t.value}"` : String(t.value)}
                  </td>
                  <td className="py-2 px-2.5 sm:px-3 text-slate-500 dark:text-slate-400 whitespace-nowrap tabular-nums">
                    L{t.line}:C{t.column}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
};
