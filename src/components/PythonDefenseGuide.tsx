import React, { useState, useEffect } from 'react';
import { DEFENSE_QUESTIONS, PYTHON_SOURCE_CODE } from '../data/pythonSource';
import { Download, Copy, Check, Terminal, GraduationCap, ChevronDown, ChevronRight, HelpCircle } from 'lucide-react';

export const PythonDefenseGuide: React.FC = () => {
  const [copied, setCopied] = useState(false);
  const [pythonCode, setPythonCode] = useState(PYTHON_SOURCE_CODE);
  const [openFaqIndex, setOpenFaqIndex] = useState<number | null>(0);

  // Fetch latest public compiler_agent.py on mount to ensure 100% exact file synchronization
  useEffect(() => {
    fetch('/compiler_agent.py')
      .then((res) => {
        if (res.ok) return res.text();
        throw new Error('Failed to fetch file');
      })
      .then((text) => setPythonCode(text))
      .catch(() => {
        // Fallback to embedded source
      });
  }, []);

  const handleCopy = async () => {
    await navigator.clipboard.writeText(pythonCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleDownload = () => {
    const blob = new Blob([pythonCode], { type: 'text/x-python;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'compiler_agent.py';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      {/* Top Banner & Quick Actions */}
      <div className="p-6 rounded-2xl bg-gradient-to-r from-indigo-900 to-slate-900 text-white border border-indigo-800 shadow-sm flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <div className="flex items-center gap-2 text-indigo-300 text-xs font-semibold uppercase tracking-wider mb-1">
            <GraduationCap className="w-4 h-4 text-indigo-400" />
            University Coursework Project File
          </div>
          <h2 className="text-xl font-bold tracking-tight">
            compiler_agent.py (Standalone Python Script)
          </h2>
          <p className="text-xs text-indigo-200 mt-1 max-w-2xl leading-relaxed">
            100% pure standard Python (zero pip dependencies required). Implements Lexical, Syntax, and Semantic analyzers, Levenshtein distance spell-checking, and rule-based error correction.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-2 px-3.5 py-2 text-xs font-semibold rounded-lg bg-white/10 hover:bg-white/20 text-white border border-white/20 transition-colors"
          >
            {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
            {copied ? 'Copied' : 'Copy Python Code'}
          </button>

          <button
            onClick={handleDownload}
            className="inline-flex items-center gap-2 px-4 py-2 text-xs font-bold rounded-lg bg-indigo-500 hover:bg-indigo-400 text-white shadow-sm transition-colors"
          >
            <Download className="w-4 h-4" />
            Download compiler_agent.py
          </button>
        </div>
      </div>

      {/* Terminal Command Quick-Run */}
      <div className="p-4 rounded-xl bg-slate-950 text-slate-200 border border-slate-800 font-mono text-xs">
        <div className="flex items-center gap-2 text-slate-400 mb-2 font-sans font-semibold">
          <Terminal className="w-4 h-4 text-indigo-400" />
          How to run from your terminal / command prompt:
        </div>
        <div className="space-y-1.5 text-slate-300">
          <div>
            <span className="text-emerald-400 select-none">$ </span>
            <span>python3 compiler_agent.py</span>
            <span className="text-slate-500 ml-4 font-sans select-none"># Runs the built-in 3-phase demonstration</span>
          </div>
          <div>
            <span className="text-emerald-400 select-none">$ </span>
            <span>python3 compiler_agent.py test_program.txt</span>
            <span className="text-slate-500 ml-4 font-sans select-none"># Analyzes any custom source file</span>
          </div>
        </div>
      </div>

      {/* University Oral Defense & Viva Questions */}
      <div className="p-6 rounded-2xl bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 shadow-sm space-y-4">
        <div className="flex items-center gap-2">
          <HelpCircle className="w-5 h-5 text-indigo-600 dark:text-indigo-400" />
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-slate-100">
              Professor Defense Guide &amp; Viva Questions
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Clear, academic explanations to ace your project presentation and oral examination
            </p>
          </div>
        </div>

        <div className="divide-y divide-slate-100 dark:divide-slate-800 border-t border-slate-100 dark:border-slate-800 pt-2">
          {DEFENSE_QUESTIONS.map((faq, idx) => {
            const isOpen = openFaqIndex === idx;
            return (
              <div key={idx} className="py-3">
                <button
                  onClick={() => setOpenFaqIndex(isOpen ? null : idx)}
                  className="w-full flex items-center justify-between text-left text-xs font-semibold text-slate-800 dark:text-slate-200 hover:text-indigo-600 dark:hover:text-indigo-400 transition-colors"
                >
                  <span className="flex items-center gap-2">
                    <span className="text-indigo-600 dark:text-indigo-400 font-mono font-bold">
                      Q{idx + 1}:
                    </span>
                    {faq.question}
                  </span>
                  {isOpen ? (
                    <ChevronDown className="w-4 h-4 text-slate-400 shrink-0" />
                  ) : (
                    <ChevronRight className="w-4 h-4 text-slate-400 shrink-0" />
                  )}
                </button>

                {isOpen && (
                  <p className="mt-2 text-xs text-slate-600 dark:text-slate-300 pl-6 leading-relaxed bg-slate-50 dark:bg-slate-800/40 p-3 rounded-lg border border-slate-100 dark:border-slate-800">
                    {faq.answer}
                  </p>
                )}
              </div>
            );
          })}
        </div>
      </div>

      {/* Python Source Code Preview */}
      <div className="rounded-2xl border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-900 overflow-hidden shadow-sm">
        <div className="flex items-center justify-between px-6 py-3.5 bg-slate-50 dark:bg-slate-800/60 border-b border-slate-200 dark:border-slate-800">
          <div className="flex items-center gap-2">
            <span className="font-mono text-xs font-bold text-slate-700 dark:text-slate-200">
              compiler_agent.py
            </span>
            <span className="text-xs text-slate-500">
              ({pythonCode.split('\n').length} lines · Clean Student Implementation)
            </span>
          </div>

          <button
            onClick={handleCopy}
            className="inline-flex items-center gap-1.5 px-3 py-1 text-xs font-medium rounded border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-800 hover:bg-slate-50 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 transition-colors"
          >
            {copied ? <Check className="w-3.5 h-3.5 text-emerald-600" /> : <Copy className="w-3.5 h-3.5" />}
            {copied ? 'Copied' : 'Copy Script'}
          </button>
        </div>

        <div className="p-4 bg-slate-950 overflow-x-auto max-h-[600px]">
          <pre className="font-mono text-xs text-slate-200 leading-5">
            {pythonCode}
          </pre>
        </div>
      </div>
    </div>
  );
};
