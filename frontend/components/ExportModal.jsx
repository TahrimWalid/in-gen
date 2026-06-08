'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '../app/store';
import { compileToTerraform } from '../lib/compiler';
import { X, Copy, Check, ImageDown } from 'lucide-react';

export default function ExportModal({ isOpen, onClose, onExportPng, isExportingPng }) {
  const { nodes, edges } = useStore();
  const sourceHcl = useStore(state => state.sourceHcl);
  const clearSourceHcl = useStore(state => state.clearSourceHcl);
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeTab, setActiveTab] = useState('hcl');
  const [exportError, setExportError] = useState(null);

  useEffect(() => {
    if (!isOpen) return;
    setExportError(null);
    setCopied(false);
    try {
      setCode(sourceHcl || compileToTerraform(nodes, edges));
    } catch (err) {
      setExportError(err);
      setCode('');
    }
  }, [isOpen, nodes, edges, sourceHcl]);

  const handleRecompile = () => {
    setExportError(null);
    clearSourceHcl();
    try {
      setCode(compileToTerraform(nodes, edges));
    } catch (err) {
      setExportError(err);
      setCode('');
    }
  };

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-slate-900 w-full max-w-4xl max-h-[80vh] rounded-xl shadow-2xl flex flex-col border border-slate-700 overflow-hidden">

        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-bold text-lg">Export Architecture</h2>
            <div className="flex rounded-md overflow-hidden border border-slate-700 text-xs font-semibold">
              <button
                onClick={() => setActiveTab('hcl')}
                className={`px-3 py-1.5 transition-colors ${
                  activeTab === 'hcl'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                Terraform HCL
              </button>
              <button
                onClick={() => setActiveTab('png')}
                className={`px-3 py-1.5 transition-colors ${
                  activeTab === 'png'
                    ? 'bg-purple-600 text-white'
                    : 'bg-slate-800 text-slate-400 hover:bg-slate-700'
                }`}
              >
                PNG Image
              </button>
            </div>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {activeTab === 'hcl' ? (
          <div className="relative flex-1 bg-[#1e1e1e] overflow-auto flex flex-col">
            {sourceHcl && !exportError && (
              <div className="shrink-0 flex items-center justify-between gap-4 bg-slate-800 border-b border-slate-600 px-5 py-3">
                <p className="text-slate-300 text-xs">
                  This diagram was generated from Terraform. Showing original source HCL.
                </p>
                <button
                  onClick={handleRecompile}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold whitespace-nowrap shrink-0"
                >
                  Recompile from current diagram
                </button>
              </div>
            )}
            {exportError ? (
              <div className="flex flex-col items-center justify-center flex-1 gap-4 p-8 text-center">
                <p className="text-slate-400 text-sm max-w-sm leading-relaxed">
                  Export temporarily unavailable. Try clearing the canvas and regenerating, or use the Recompile button.
                </p>
                <button
                  onClick={handleRecompile}
                  className="text-xs text-purple-400 hover:text-purple-300 font-semibold"
                >
                  Recompile from current diagram
                </button>
              </div>
            ) : (
              <div className="relative flex-1 p-6">
                <button
                  onClick={handleCopy}
                  className="absolute top-4 right-4 bg-slate-800 hover:bg-slate-700 text-slate-300 p-2 rounded-md transition-colors flex items-center gap-2 text-sm font-semibold border border-slate-700"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-400" /> : <Copy className="w-4 h-4" />}
                  {copied ? 'Copied!' : 'Copy Code'}
                </button>
                <pre className="text-sm font-mono text-emerald-400/90 leading-relaxed">
                  <code>{code}</code>
                </pre>
              </div>
            )}
          </div>
        ) : (
          <div className="flex-1 bg-[#1e1e1e] flex flex-col items-center justify-center gap-4 p-8">
            <p className="text-slate-400 text-sm text-center max-w-sm">
              Exports the full diagram as a PNG at 2× resolution. All nodes and edges are included regardless of current viewport.
            </p>
            <button
              onClick={onExportPng}
              disabled={isExportingPng}
              className="px-6 py-3 bg-purple-600 text-white rounded-md font-semibold hover:bg-purple-500 disabled:opacity-50 disabled:cursor-not-allowed transition-colors flex items-center gap-2"
            >
              <ImageDown className="w-5 h-5" />
              {isExportingPng ? 'Exporting...' : 'Download ingen-diagram.png'}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
