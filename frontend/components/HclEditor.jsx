'use client';

import React, { useState, useEffect, useRef, useCallback } from 'react';
import dynamic from 'next/dynamic';
import { useStore } from '../app/store';
import { compileToTerraform } from '../lib/compiler';
import { useTheme } from '../app/useTheme';
import { buildErrorMarkers, registerHclCompletions, registerHclFormatter } from '../lib/hclMonaco';
import { X, Copy, Check, AlignLeft, AlertCircle } from 'lucide-react';

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

function structuralFingerprint(nodes, edges) {
  const n = nodes.map(nd => `${nd.id}|${nd.type}|${JSON.stringify(nd.data)}`).join('~');
  const e = edges.map(ed => `${ed.id}|${ed.source}|${ed.target}|${JSON.stringify(ed.data)}`).join('~');
  return n + '@@' + e;
}

export default function HclEditor({ onClose }) {
  const { theme } = useTheme();
  const nodes = useStore(state => state.nodes);
  const edges = useStore(state => state.edges);
  const sourceHcl = useStore(state => state.sourceHcl);
  const applyParsedHcl = useStore(state => state.applyParsedHcl);

  const [hclContent, setHclContent] = useState('');
  const [copied, setCopied] = useState(false);
  const [copyFailed, setCopyFailed] = useState(false);
  const [lastSyncedAt, setLastSyncedAt] = useState(null);
  const [secondsSince, setSecondsSince] = useState(0);
  const [parseStatus, setParseStatus] = useState('idle'); // 'idle' | 'parsing' | 'error'
  const [parseError, setParseError] = useState('');

  const prevFingerprintRef = useRef(null);
  const syncTimerRef = useRef(null);
  const isFirstRef = useRef(true);
  const userTypingRef = useRef(false);
  const parseTimerRef = useRef(null);
  const parseAbortRef = useRef(null);
  const editorRef = useRef(null);
  const monacoRef = useRef(null);

  const setParserMarkers = useCallback((errors) => {
    const editor = editorRef.current;
    const monaco = monacoRef.current;
    if (!editor || !monaco) return;
    const model = editor.getModel();
    if (!model) return;
    monaco.editor.setModelMarkers(model, 'hcl-parser', buildErrorMarkers(monaco, errors));
  }, []);

  // Canvas → HCL sync: fires on mount (immediate) and on structural changes (debounced 500ms)
  // Skipped while user is actively typing in Monaco
  useEffect(() => {
    if (userTypingRef.current) return;

    const isFirst = isFirstRef.current;
    isFirstRef.current = false;

    if (sourceHcl) {
      clearTimeout(syncTimerRef.current);
      setHclContent(sourceHcl);
      setLastSyncedAt(new Date());
      setParserMarkers([]);
      prevFingerprintRef.current = null;
      return;
    }

    if (nodes.length === 0) {
      if (isFirst) {
        setHclContent(STARTER_TEMPLATE);
        setLastSyncedAt(new Date());
        setParserMarkers([]);
      } else {
        clearTimeout(syncTimerRef.current);
        syncTimerRef.current = setTimeout(() => {
          setHclContent(STARTER_TEMPLATE);
          setLastSyncedAt(new Date());
          setParserMarkers([]);
        }, 500);
      }
      prevFingerprintRef.current = null;
      return;
    }

    const fp = structuralFingerprint(nodes, edges);
    if (!isFirst && fp === prevFingerprintRef.current) return;
    prevFingerprintRef.current = fp;

    const compile = () => {
      try {
        setHclContent(compileToTerraform(nodes, edges));
        setLastSyncedAt(new Date());
        setParserMarkers([]);
      } catch { /* keep existing content on compile error */ }
    };

    if (isFirst) {
      compile();
    } else {
      clearTimeout(syncTimerRef.current);
      syncTimerRef.current = setTimeout(compile, 500);
    }

    return () => clearTimeout(syncTimerRef.current);
  }, [nodes, edges, sourceHcl, setParserMarkers]);

  // HCL → Canvas sync: debounced 1.5s after user stops typing
  const handleEditorChange = useCallback((value) => {
    const text = value ?? '';
    setHclContent(text);
    userTypingRef.current = true;
    setParserMarkers([]);

    // Cancel pending parse + abort in-flight request
    clearTimeout(parseTimerRef.current);
    if (parseAbortRef.current) {
      parseAbortRef.current.abort();
      parseAbortRef.current = null;
    }

    parseTimerRef.current = setTimeout(async () => {
      if (text.trim() === '' || text === STARTER_TEMPLATE) {
        userTypingRef.current = false;
        setParseStatus('idle');
        return;
      }

      const ctrl = new AbortController();
      parseAbortRef.current = ctrl;
      setParseStatus('parsing');

      try {
        const res = await fetch('/api/parse-hcl', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ hcl: text }),
          signal: ctrl.signal,
        });
        const data = await res.json();
        parseAbortRef.current = null;

        if (data.nodes?.length > 0) {
          applyParsedHcl(data.nodes, data.edges || [], text);
          setLastSyncedAt(new Date());
          setParseStatus('idle');
          setParserMarkers(data.errors || []);
        } else if (data.errors?.length > 0) {
          setParseStatus('error');
          setParseError(data.errors[0]);
          setParserMarkers(data.errors);
        } else {
          setParseStatus('idle');
        }
        userTypingRef.current = false;
      } catch (err) {
        if (err.name === 'AbortError') return;
        parseAbortRef.current = null;
        setParseStatus('error');
        setParseError('Parse request failed');
        userTypingRef.current = false;
      }
    }, 1500);
  }, [applyParsedHcl, setParserMarkers]);

  // Tick "last synced" label every second
  useEffect(() => {
    const id = setInterval(() => {
      if (lastSyncedAt) {
        setSecondsSince(Math.floor((Date.now() - lastSyncedAt.getTime()) / 1000));
      }
    }, 1000);
    return () => clearInterval(id);
  }, [lastSyncedAt]);

  const handleCopy = useCallback(async () => {
    try {
      if (navigator.clipboard && window.isSecureContext) {
        await navigator.clipboard.writeText(hclContent);
      } else {
        const textarea = document.createElement('textarea');
        textarea.value = hclContent;
        textarea.style.position = 'fixed';
        textarea.style.opacity = '0';
        document.body.appendChild(textarea);
        textarea.select();
        document.execCommand('copy');
        document.body.removeChild(textarea);
      }
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopyFailed(true);
      setTimeout(() => setCopyFailed(false), 2000);
    }
  }, [hclContent]);

  const handleFormat = useCallback(() => {
    editorRef.current?.getAction('editor.action.formatDocument')?.run();
  }, []);

  const syncLabel = secondsSince === 0 ? 'just now' : `${secondsSince}s ago`;

  return (
    <div className="w-full h-full flex flex-col bg-[#1e1e1e] border-l border-border">

      {/* Header */}
      <div className="shrink-0 h-12 bg-surface border-b border-border px-3 flex items-center gap-2">
        <span className="font-bold text-sm text-primary">HCL Editor</span>
        <div className="flex-1" />
        <button
          onClick={handleFormat}
          title="Format document (Shift+Alt+F)"
          className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-primary transition-colors"
        >
          <AlignLeft className="w-4 h-4" />
        </button>
        <button
          onClick={handleCopy}
          title="Copy HCL"
          className="w-7 h-7 flex items-center justify-center rounded text-muted hover:text-primary transition-colors"
        >
          {copyFailed ? <AlertCircle className="w-4 h-4 text-red-400" />
            : copied ? <Check className="w-4 h-4 text-emerald-400" />
            : <Copy className="w-4 h-4" />}
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
          onChange={handleEditorChange}
          onMount={(editor, monaco) => {
            editorRef.current = editor;
            monacoRef.current = monaco;
            monaco.editor.setTheme(theme === 'dark' ? 'vs-dark' : 'vs');
            registerHclCompletions(monaco);
            registerHclFormatter(monaco);
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
        {parseStatus === 'parsing' && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-amber-400 shrink-0 animate-pulse" />
            <span className="text-slate-400">Parsing...</span>
          </span>
        )}
        {parseStatus === 'error' && (
          <span className="flex items-center gap-1.5">
            <span className="w-2 h-2 rounded-full bg-red-400 shrink-0" />
            <span className="text-red-400 truncate max-w-xs" title={parseError}>{parseError}</span>
          </span>
        )}
        {parseStatus === 'idle' && (
          <>
            <span className="flex items-center gap-1.5">
              <span className="w-2 h-2 rounded-full bg-emerald-400 shrink-0" />
              <span className="text-slate-400">Valid HCL</span>
            </span>
            <span className="text-slate-600">|</span>
            <span className="text-slate-500">Last synced: {syncLabel}</span>
          </>
        )}
      </div>
    </div>
  );
}
