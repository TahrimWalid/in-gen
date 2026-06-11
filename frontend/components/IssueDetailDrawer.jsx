'use client';

import React from 'react';
import { useStore } from '../app/store';
import { ExternalLink, Wand2, Sparkles } from 'lucide-react';
import { applyDeterministicFix } from '../lib/fixHandler';

export default function IssueDetailDrawer({ issue, rule, onClose }) {
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const applyPropertyUpdates = useStore(state => state.applyPropertyUpdates);
  const takeSnapshot = useStore(state => state.takeSnapshot);
  const runValidation = useStore(state => state.runValidation);
  const scheduleAutoSave = useStore(state => state.scheduleAutoSave);

  if (!rule) return null;

  const isError = issue.severity === 'error';
  const fix = rule.fix;
  const showFixButton = fix && (fix.type === 'property' || fix.type === 'structural');
  const fixLabel = fix?.type === 'structural' ? 'Fix with AI' : 'Fix automatically';
  const FixIcon = fix?.type === 'structural' ? Sparkles : Wand2;

  const handleFix = () => {
    const store = { applyPropertyUpdates, takeSnapshot, runValidation, scheduleAutoSave };
    const applied = applyDeterministicFix(issue, rule, nodes, edges, store);
    if (applied && fix?.type === 'property') {
      onClose();
    }
  };

  return (
    <div className="rounded-md border border-border bg-surface-hover/60 overflow-hidden">
      <div className="flex items-center justify-between px-4 py-2.5 border-b border-border">
        <div className="flex items-center gap-2">
          <span className={`text-[10px] font-bold uppercase tracking-wide px-2 py-0.5 rounded-full ${
            isError ? 'bg-red-500 text-white' : 'bg-amber-500 text-white'
          }`}>
            {issue.severity}
          </span>
          <h4 className="text-sm font-bold text-primary">{rule.name}</h4>
        </div>
        <button
          onClick={onClose}
          aria-label="Close"
          className="text-muted hover:text-primary transition-colors text-lg leading-none px-1"
        >
          ×
        </button>
      </div>

      <div className="px-4 py-3 border-b border-border">
        <p className="text-sm text-secondary leading-relaxed">{issue.message}</p>
      </div>

      <div className="px-4 py-3 border-b border-border flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">Why this matters</span>
        <p className="text-sm text-primary leading-relaxed">{rule.explanation}</p>
      </div>

      <div className="px-4 py-3 border-b border-border flex flex-col gap-1.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">What happens if ignored</span>
        <p className="text-sm text-primary leading-relaxed">{rule.consequence}</p>
      </div>

      <div className="px-4 py-3 flex flex-col gap-2.5">
        <span className="text-[11px] font-bold uppercase tracking-wide text-muted">How to fix</span>

        {showFixButton && (
          <button
            onClick={handleFix}
            className="w-full flex items-center justify-center gap-2 px-4 py-2.5 rounded-lg bg-purple-600 hover:bg-purple-500 text-white text-sm font-semibold transition-colors"
          >
            <FixIcon className="w-4 h-4" />
            {fixLabel}
          </button>
        )}

        <a
          href={rule.awsDocsUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="self-end flex items-center gap-1 text-xs text-muted hover:text-primary transition-colors"
        >
          AWS Docs
          <ExternalLink className="w-3 h-3" />
        </a>
      </div>
    </div>
  );
}
