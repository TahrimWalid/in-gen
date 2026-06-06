'use client';

import React from 'react';
import { useStore } from '../app/store';
import { Sparkles, AlertTriangle, X } from 'lucide-react';

export default function DiagramConfirmModal({ generation, onConfirm, onCancel }) {
  const nodeCount = useStore(state => state.nodes.length);
  const hasExisting = nodeCount > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-md rounded-xl shadow-2xl flex flex-col border border-border overflow-hidden">

        <div className="p-5 border-b border-border flex items-center justify-between">
          <div className="flex items-center gap-2.5">
            <Sparkles className="w-5 h-5 text-purple-500" />
            <h2 className="font-bold text-primary text-base">Generate Architecture</h2>
          </div>
          <button onClick={onCancel} className="text-muted hover:text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4">
          <p className="text-secondary text-sm leading-relaxed">{generation.description}</p>
          <div className="text-xs text-muted bg-surface-alt border border-border rounded-lg px-3 py-2.5">
            {generation.nodes.length} nodes · {generation.edges.length} edges
          </div>

          {hasExisting && (
            <div className="flex items-start gap-2.5 bg-amber-50 border border-amber-200 rounded-lg p-3 text-xs text-amber-900">
              <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0 mt-0.5" />
              <span>Replace will clear your current diagram. This is undoable with Ctrl+Z.</span>
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex items-stretch gap-3">
          {hasExisting ? (
            <>
              <button
                onClick={() => onConfirm(true)}
                className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-md font-semibold text-sm hover:bg-purple-500 transition-colors whitespace-nowrap flex items-center justify-center"
              >
                Replace Canvas
              </button>
              <button
                onClick={() => onConfirm(false)}
                className="flex-1 px-4 py-2.5 border border-border text-secondary rounded-md font-semibold text-sm hover:bg-surface-hover transition-colors whitespace-nowrap flex items-center justify-center"
              >
                Merge with Existing
              </button>
            </>
          ) : (
            <button
              onClick={() => onConfirm(true)}
              className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-md font-semibold text-sm hover:bg-purple-500 transition-colors flex items-center justify-center"
            >
              Generate
            </button>
          )}
          <button
            onClick={onCancel}
            className="px-4 py-2.5 text-muted text-sm hover:text-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
