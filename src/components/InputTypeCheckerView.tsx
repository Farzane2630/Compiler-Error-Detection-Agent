import React, { useState } from 'react';
import { DetectedDataType, TargetLanguage } from '../compiler/types';
import { checkInputAgainstType } from '../compiler/inputTypeChecker';
import { CheckCircle2, AlertTriangle, Sparkles, Terminal, ShieldCheck } from 'lucide-react';

interface InputTypeCheckerViewProps {
  language: TargetLanguage;
}

const SAMPLE_INPUTS: { label: string; value: string; expected: DetectedDataType | 'auto' }[] = [
  { label: '42 (int)', value: '42', expected: 'int' },
  { label: '3.14 (float)', value: '3.14', expected: 'float' },
  { label: 'True (bool)', value: 'True', expected: 'bool' },
  { label: 'Hello (str)', value: 'Hello', expected: 'str' },
  { label: '"abc" as int (Error)', value: 'abc', expected: 'int' },
  { label: '12.34.56 (Malformed)', value: '12.34.56', expected: 'float' },
  { label: '123abc (Mixed)', value: '123abc', expected: 'int' }
];

export const InputTypeCheckerView: React.FC<InputTypeCheckerViewProps> = ({ language }) => {
  const [rawInput, setRawInput] = useState('42');
  const [expectedType, setExpectedType] = useState<DetectedDataType | 'auto'>('int');

  const checkResult = checkInputAgainstType(rawInput, expectedType);

  const typeBadgeStyle = (t: DetectedDataType) => {
    switch (t) {
      case 'int':
        return 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300';
      case 'float':
        return 'bg-cyan-100 text-cyan-800 dark:bg-cyan-950 dark:text-cyan-300';
      case 'bool':
        return 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300';
      case 'str':
        return 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300';
      case 'empty':
        return 'bg-slate-200 text-slate-700 dark:bg-slate-800 dark:text-slate-300';
    }
  };

  return (
    <div className="bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-4 sm:p-6 space-y-6 shadow-sm">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pb-4 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h2 className="text-base sm:text-lg font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <ShieldCheck className="w-5 h-5 text-indigo-600 dark:text-indigo-400 shrink-0" />
            Deterministic Input Type Checker (str, int, float, bool)
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Rule-based lexical &amp; type recognizer that verifies whether user input matches the expected data type (no AI).
          </p>
        </div>

        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-md text-xs font-mono font-semibold bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 self-start sm:self-auto">
          <Terminal className="w-3.5 h-3.5 text-indigo-500" />
          Target: {language === 'python' ? 'Python 3' : 'C++17'}
        </span>
      </div>

      {/* Controls */}
      <div className="grid grid-cols-1 md:grid-cols-12 gap-4">
        <div className="md:col-span-7 space-y-1.5">
          <label
            htmlFor="input-type-value"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Enter Input Value to Inspect
          </label>
          <input
            id="input-type-value"
            type="text"
            value={rawInput}
            onChange={(e) => setRawInput(e.target.value)}
            placeholder="e.g. 42, 3.14, True, hello world, 123abc..."
            className="w-full px-3.5 py-2.5 min-h-[42px] text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-slate-50 dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
        </div>

        <div className="md:col-span-5 space-y-1.5">
          <label
            htmlFor="expected-type-select"
            className="block text-xs font-semibold text-slate-700 dark:text-slate-300"
          >
            Expected Type Constraint
          </label>
          <select
            id="expected-type-select"
            value={expectedType}
            onChange={(e) => setExpectedType(e.target.value as DetectedDataType | 'auto')}
            className="w-full px-3 py-2.5 min-h-[42px] text-sm font-mono rounded-lg border border-slate-300 dark:border-slate-700 bg-white dark:bg-slate-950 text-slate-900 dark:text-slate-100 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          >
            <option value="auto">Auto-Detect Only</option>
            <option value="int">int (Integer)</option>
            <option value="float">float / double (Decimal)</option>
            <option value="bool">bool (Boolean)</option>
            <option value="str">str / string (Text)</option>
          </select>
        </div>
      </div>

      {/* Quick Samples */}
      <div className="space-y-2">
        <span className="text-xs font-semibold text-slate-500 dark:text-slate-400">
          Quick Test Cases:
        </span>
        <div className="flex flex-wrap gap-2">
          {SAMPLE_INPUTS.map((sample) => (
            <button
              key={sample.label}
              type="button"
              onClick={() => {
                setRawInput(sample.value);
                setExpectedType(sample.expected);
              }}
              className="px-2.5 py-1.5 text-xs font-mono rounded-md border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800/60 hover:bg-indigo-50 hover:border-indigo-300 dark:hover:bg-indigo-950/40 text-slate-700 dark:text-slate-300 transition-colors cursor-pointer"
            >
              {sample.label}
            </button>
          ))}
        </div>
      </div>

      {/* Verdict Card */}
      <div
        className={`p-4 sm:p-5 rounded-xl border transition-all ${
          checkResult.isValidForExpected
            ? 'bg-emerald-50/70 border-emerald-200 dark:bg-emerald-950/20 dark:border-emerald-800'
            : 'bg-rose-50/70 border-rose-200 dark:bg-rose-950/20 dark:border-rose-800'
        }`}
      >
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            {checkResult.isValidForExpected ? (
              <CheckCircle2 className="w-6 h-6 text-emerald-600 dark:text-emerald-400 shrink-0" />
            ) : (
              <AlertTriangle className="w-6 h-6 text-rose-600 dark:text-rose-400 shrink-0" />
            )}
            <div>
              <h3 className="text-sm sm:text-base font-bold text-slate-900 dark:text-slate-100">
                {checkResult.isValidForExpected
                  ? expectedType === 'auto'
                    ? `Detected Type: ${checkResult.detectedType}`
                    : `Valid! Input matches expected type '${expectedType}'`
                  : checkResult.errorMessage}
              </h3>
              <p className="text-xs text-slate-600 dark:text-slate-300 mt-0.5">
                {checkResult.ruleExplanation}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-2">
            <span className="text-xs text-slate-500 dark:text-slate-400">Detected:</span>
            <span
              className={`px-2.5 py-1 rounded-md font-mono text-xs font-bold ${typeBadgeStyle(
                checkResult.detectedType
              )}`}
            >
              {checkResult.detectedType}
            </span>
          </div>
        </div>

        {/* Compatible types */}
        <div className="mt-4 pt-3 border-t border-slate-200/70 dark:border-slate-700/60 flex flex-wrap items-center gap-2 text-xs">
          <span className="font-semibold text-slate-600 dark:text-slate-300">
            Compatible Types:
          </span>
          {checkResult.compatibleTypes.map((ct) => (
            <span
              key={ct}
              className={`px-2 py-0.5 rounded font-mono font-semibold ${typeBadgeStyle(ct)}`}
            >
              {ct}
            </span>
          ))}
        </div>

        {/* Suggested fix on mismatch */}
        {checkResult.suggestedFix && (
          <div className="mt-3 p-3 rounded-lg bg-white/90 dark:bg-slate-900/90 border border-rose-200 dark:border-rose-800/70 flex items-start gap-2 text-xs text-slate-700 dark:text-slate-200">
            <Sparkles className="w-4 h-4 text-indigo-600 dark:text-indigo-400 shrink-0 mt-0.5" />
            <span>
              <strong>Suggested Fix:</strong> {checkResult.suggestedFix}
            </span>
          </div>
        )}
      </div>

      {/* Python & C++ Usage Hints */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            Python 3 Input Handling
          </div>
          <pre className="p-2.5 rounded-lg bg-slate-950 text-emerald-300 font-mono text-xs overflow-x-auto leading-5">
            {checkResult.pythonCastHint}
          </pre>
        </div>

        <div className="p-3.5 rounded-xl border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-950/60 space-y-2">
          <div className="text-xs font-bold text-slate-700 dark:text-slate-200">
            C++17 Input Handling
          </div>
          <pre className="p-2.5 rounded-lg bg-slate-950 text-sky-300 font-mono text-xs overflow-x-auto leading-5">
            {checkResult.cppTypeHint}
          </pre>
        </div>
      </div>
    </div>
  );
};
