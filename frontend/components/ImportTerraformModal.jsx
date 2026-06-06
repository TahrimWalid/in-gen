'use client';

import React, { useState, useRef } from 'react';
import { X, Upload, FileCode2 } from 'lucide-react';

const PLACEHOLDER = `resource "aws_lambda_function" "handler" {
  function_name = "my-function"
  runtime       = "nodejs20.x"
  timeout       = 30
}

resource "aws_sqs_queue" "queue" {
  name                       = "work-queue"
  visibility_timeout_seconds = 180
}`;

export default function ImportTerraformModal({ isOpen, onClose, onParsed }) {
  const [hclInput, setHclInput] = useState('');
  const [loading, setLoading] = useState(false);
  const [errors, setErrors] = useState([]);
  const [warnings, setWarnings] = useState([]);
  const fileInputRef = useRef(null);

  if (!isOpen) return null;

  const handleFileUpload = (e) => {
    const file = e.target.files[0];
    if (!file) return;
    if (!file.name.endsWith('.tf')) {
      setErrors(['Please upload a .tf file']);
      return;
    }
    const reader = new FileReader();
    reader.onload = (ev) => {
      setHclInput(ev.target.result);
      setErrors([]);
      setWarnings([]);
    };
    reader.readAsText(file);
    // Reset input so the same file can be re-selected
    e.target.value = '';
  };

  const handleImport = async () => {
    if (!hclInput.trim()) return;
    setLoading(true);
    setErrors([]);
    setWarnings([]);

    let result;
    try {
      const res = await fetch('/api/parse-hcl', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hcl: hclInput }),
      });
      result = await res.json();
    } catch (err) {
      setErrors([`Network error: ${err.message}`]);
      setLoading(false);
      return;
    }

    setLoading(false);
    const { nodes, edges, errors: parseErrors } = result;

    if (parseErrors?.length > 0 && (!nodes || nodes.length === 0)) {
      setErrors(parseErrors);
      return;
    }

    if (parseErrors?.length > 0) {
      setWarnings(parseErrors);
    }

    onParsed({ nodes, edges, hcl: hclInput });
    onClose();
  };

  const handleClose = () => {
    setHclInput('');
    setErrors([]);
    setWarnings([]);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-surface w-full max-w-2xl rounded-xl shadow-2xl flex flex-col border border-border overflow-hidden">

        <div className="p-5 border-b border-border flex items-center justify-between shrink-0">
          <div className="flex items-center gap-2.5">
            <FileCode2 className="w-5 h-5 text-purple-500" />
            <div>
              <h2 className="font-bold text-primary text-base">Import Terraform</h2>
              <p className="text-muted text-xs mt-0.5">
                Paste your existing .tf file to visualise and validate your infrastructure in InGen.
              </p>
            </div>
          </div>
          <button onClick={handleClose} className="text-muted hover:text-primary transition-colors">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="p-5 flex flex-col gap-4 overflow-y-auto">
          <textarea
            value={hclInput}
            onChange={(e) => { setHclInput(e.target.value); setErrors([]); setWarnings([]); }}
            placeholder={PLACEHOLDER}
            className="w-full font-mono text-xs bg-input-bg text-input-text border border-border-input rounded-lg p-4 resize-none focus:outline-none focus:ring-2 focus:ring-purple-500 placeholder:text-muted"
            style={{ minHeight: '200px', maxHeight: '340px' }}
            spellCheck={false}
          />

          <div className="flex items-center gap-3">
            <div className="flex-1 h-px bg-border" />
            <span className="text-xs text-muted shrink-0">— or —</span>
            <div className="flex-1 h-px bg-border" />
          </div>

          <div>
            <input
              ref={fileInputRef}
              type="file"
              accept=".tf"
              onChange={handleFileUpload}
              className="hidden"
            />
            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex items-center gap-2 px-4 py-2 border border-border rounded-lg text-sm text-secondary hover:bg-surface-hover hover:border-purple-400 transition-all"
            >
              <Upload className="w-4 h-4" />
              Upload .tf file
            </button>
          </div>

          {errors.length > 0 && (
            <div className="flex flex-col gap-1">
              {errors.map((e, i) => (
                <div key={i} className="text-xs text-red-600 bg-red-50 border border-red-200 rounded-md px-3 py-2">
                  {e}
                </div>
              ))}
            </div>
          )}

          {warnings.length > 0 && (
            <div className="flex flex-col gap-1">
              {warnings.map((w, i) => (
                <div key={i} className="text-xs text-amber-700 bg-amber-50 border border-amber-200 rounded-md px-3 py-2">
                  Warning: {w}
                </div>
              ))}
            </div>
          )}
        </div>

        <div className="px-5 pb-5 flex items-center gap-3 shrink-0 border-t border-border pt-4">
          <button
            onClick={handleImport}
            disabled={!hclInput.trim() || loading}
            className="flex-1 px-4 py-2.5 bg-purple-600 text-white rounded-md font-semibold text-sm hover:bg-purple-500 disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
          >
            {loading ? 'Parsing...' : 'Visualise Architecture'}
          </button>
          <button
            onClick={handleClose}
            className="px-4 py-2.5 text-muted text-sm hover:text-secondary transition-colors"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}
