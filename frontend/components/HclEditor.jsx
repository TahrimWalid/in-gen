'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '../app/store';
import { compileToTerraform } from '../lib/compiler';
import { useTheme } from '../app/useTheme';
import { X, Copy, Check } from 'lucide-react';

const MonacoEditor = dynamic(
  () => import('@monaco-editor/react'),
  { ssr: false, loading: () => (
    <div className="w-full h-full flex items-center justify-center bg-[#1e1e1e]">
      <span className="text-slate-500 text-sm">Loading editor...</span>
    </div>
  )}
);

const STARTER_TEMPLATE = `# Start designing your AWS architecture
# Drag components onto the canvas, or type Terraform here
# Changes sync automatically in both directions

provider "aws" {
  region = "us-east-1"
}
`;

export default function HclEditor({ onClose }) {
  const { theme } = useTheme();
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const sourceHcl = useStore(state => state.sourceHcl);

  const [hclContent, setHclContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [secondsSince, setSecondsSince] = useState(0);

  const initializedRef = useRef(false);

  // Set initial content once on mount
  useEffect(() => {
    if (initializedRef.current) return;
    initializedRef.current = true;

    if (sourceHcl) {
      setHclContent(sourceHcl);
    } else if (nodes.length > 0) {
      try {
        setHclContent(compileToTerraform(nodes, edges));
      } catch {
        setHclContent(STARTER_TEMPLATE);
      }
    } else {
      setHclContent(STARTER_TEMPLATE);
    }
    setLastSyncedAt(new Date());
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Tick "last synced" label every second
  useEffect(() => {
    const id = setInterval(() => {
      if (lastSyncedAt) {
        setSecondsSince(Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  const handleCopy = useCallback(() => {
    navigator.clipboard.writeText(hclContent);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }, [hclContent]);

  const syncLabel = secondsSince === 0 ? 'just now' : `${secondsSince}s ago`;

  return (
    <div className="w-full h-full flex flex-col bg-[#1e1e1e] border-l border-border">

      {/* Header */}
      <div className="shrink-0 h-12 bg-surface border-b border-border px-3 flex items-center gap-2">
        <span className="font-bold text-sm text-primary">HCL Editor</span>
        <div className="flex-1" />
        <button
          onClick={handleCopy}
          title="Copy HCL"
          className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-primary transition-colors"
        >
          {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
        </button>
        <button
          onClick={onClose}
          title="Close HCL Editor (Ctrl+E)"
          className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-primary transition-colors"
        >
          <X className="w-4 h-4" />
        </button>
      </div>

      {/* Monaco Editor */}
      <div className="flex-1 min-h-0">
        <MonacoEditor
          height="100%"
          language="hcl"
          theme={theme === 'dark' ? 'vs-dark' : 'vs'}
          value={hclContent}
          onChange={(value) => setHclContent(value ?? '')}
          onMount={(_editor, monaco) => {
            monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
          }}
          options={{
            minimap: { enabled: false },
            fontSize: 13,
            lineNumbers: 'on',
            scrollBeyondLastLine: false,
            wordWrap: 'on',
            automaticLayout: true,
            tabSize: 2,
            formatOnPaste: true,
          }}
        />
      </div>

      {/* Status bar */}
      <div className="shrink-0 h-7 bg-slate-900 border-t border-slate-700 px-3 flex items-center gap-3 text-[11px] select-none">
        <span className="flex items-center gap-1.5">
          <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
          <span className="text-slate-400">Valid HCL</span>
        </span>
        <span className="text-slate-600">|</span>
        <span className="text-slate-500">Last synced: {syncLabel}</span>
      </div>
    </div>
  );
}
