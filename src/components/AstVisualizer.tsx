import React, { useState } from 'react';
import { ASTNode } from '../compiler/types';
import { ChevronDown, ChevronRight, Code2 } from 'lucide-react';

interface AstVisualizerProps {
  ast: ASTNode | null;
}

const TreeNode: React.FC<{ node: ASTNode; label?: string; depth?: number }> = ({
  node,
  label,
  depth = 0
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (!node) return null;

  const isObject = typeof node === 'object' && node !== null;
  const isArray = Array.isArray(node);

  if (isArray) {
    return (
      <div className="pl-3 sm:pl-4 border-l border-slate-200 dark:border-slate-800 my-1 font-mono text-xs">
        {label && <span className="text-slate-500 font-medium">{label}: </span>}
        <div className="space-y-1">
          {node.map((item, idx) => (
            <TreeNode key={idx} node={item} label={`[${idx}]`} depth={depth + 1} />
          ))}
        </div>
      </div>
    );
  }

  if (isObject) {
    const kind = node.kind || (label ? label : 'Node');
    const keys = Object.keys(node).filter(
      (k) => !['kind', 'line', 'column'].includes(k)
    );

    return (
      <div className="font-mono text-xs my-1 select-none">
        <div
          onClick={() => setIsOpen(!isOpen)}
          className="inline-flex items-center gap-1.5 px-2 py-1 rounded hover:bg-slate-100 dark:hover:bg-slate-800 cursor-pointer transition-colors whitespace-nowrap"
        >
          {keys.length > 0 ? (
            isOpen ? (
              <ChevronDown className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            ) : (
              <ChevronRight className="w-3.5 h-3.5 text-slate-400 shrink-0" />
            )
          ) : (
            <span className="w-3.5 inline-block text-slate-300 shrink-0">·</span>
          )}

          {label && <span className="text-slate-500 font-medium">{label}:</span>}

          <span className="px-1.5 py-0.5 rounded bg-indigo-50 text-indigo-700 dark:bg-indigo-950 dark:text-indigo-300 font-bold">
            {kind}
          </span>

          {node.line && (
            <span className="text-[11px] text-slate-400 tabular-nums">
              (L{node.line}:C{node.column})
            </span>
          )}

          {node.name && (
            <span className="text-emerald-600 dark:text-emerald-400 font-semibold">
              name=&quot;{node.name}&quot;
            </span>
          )}

          {node.operator && (
            <span className="text-amber-600 dark:text-amber-400 font-bold">
              op=&apos;{node.operator}&apos;
            </span>
          )}

          {node.value !== undefined && (
            <span className="text-blue-600 dark:text-blue-400 font-semibold">
              val={JSON.stringify(node.value)}
            </span>
          )}

          {node.varType && (
            <span className="text-purple-600 dark:text-purple-400">
              type={node.varType}
            </span>
          )}
        </div>

        {isOpen && keys.length > 0 && (
          <div className="pl-3 sm:pl-4 ml-1.5 border-l border-slate-200 dark:border-slate-800 space-y-1">
            {keys.map((k) => {
              const val = node[k];
              if (typeof val === 'object' && val !== null) {
                return <TreeNode key={k} node={val} label={k} depth={depth + 1} />;
              }
              return (
                <div key={k} className="pl-3 sm:pl-4 text-slate-600 dark:text-slate-300 py-0.5 whitespace-nowrap">
                  <span className="text-slate-400 font-medium">{k}: </span>
                  <span className="font-semibold text-slate-800 dark:text-slate-100">
                    {String(val)}
                  </span>
                </div>
              );
            })}
          </div>
        )}
      </div>
    );
  }

  return (
    <div className="font-mono text-xs pl-3 sm:pl-4 text-slate-600 dark:text-slate-300 whitespace-nowrap">
      {label && <span className="text-slate-400">{label}: </span>}
      <span>{String(node)}</span>
    </div>
  );
};

export const AstVisualizer: React.FC<AstVisualizerProps> = ({ ast }) => {
  return (
    <div className="flex flex-col h-full bg-white dark:bg-slate-900 rounded-xl border border-slate-200 dark:border-slate-800 p-3 sm:p-4 space-y-4">
      <div className="flex items-center justify-between pb-3 border-b border-slate-200 dark:border-slate-800">
        <div>
          <h3 className="text-base font-bold text-slate-900 dark:text-slate-100 flex items-center gap-2">
            <Code2 className="w-4 h-4 text-indigo-600 shrink-0" />
            Abstract Syntax Tree (AST - Phase 2)
          </h3>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
            Hierarchical representation of language grammar productions &amp; operator precedence
          </p>
        </div>
      </div>

      <div className="flex-1 overflow-auto bg-slate-50 dark:bg-slate-950 p-3 sm:p-4 rounded-lg border border-slate-200 dark:border-slate-800 max-h-[65vh]">
        {ast ? (
          <div className="min-w-max">
            <TreeNode node={ast} label="Root" />
          </div>
        ) : (
          <div className="text-center py-12 text-slate-400 text-xs font-mono">
            No valid AST generated. Please fix syntax errors and re-analyze.
          </div>
        )}
      </div>
    </div>
  );
};
