'use client';

import React, { useState, useEffect } from 'react';
import { useStore } from '../app/store';
import { compileToTerraform } from '../lib/compiler';
import { X, Copy, Check } from 'lucide-react';

export default function ExportModal({ isOpen, onClose }) {
  const { nodes, edges } = useStore();
  const [code, setCode] = useState('');
  const [copied, setCopied] = useState(false);

  // Re-compile whenever the modal opens
  useEffect(() => {
    if (isOpen) {
      setCode(compileToTerraform(nodes, edges));
      setCopied(false);
    }
  }, [isOpen, nodes, edges]);

  if (!isOpen) return null;

  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-slate-900 w-full max-w-4xl max-h-[80vh] rounded-xl shadow-2xl flex flex-col border border-slate-700 overflow-hidden">
        
        {/* Header */}
        <div className="flex justify-between items-center p-4 border-b border-slate-800 bg-slate-900">
          <div className="flex items-center gap-3">
            <h2 className="text-white font-bold text-lg">Export Architecture</h2>
            <span className="bg-purple-500/20 text-purple-400 text-xs px-2 py-1 rounded font-mono font-bold border border-purple-500/30">
              Terraform (HCL)
            </span>
          </div>
          <button onClick={onClose} className="text-slate-400 hover:text-white transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Code Editor Area */}
        <div className="relative flex-1 bg-[#1e1e1e] overflow-auto p-6">
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
      </div>
    </div>
  );
}