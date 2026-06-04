'use client';

import React, { useEffect } from 'react';
import { useStore } from '../app/store';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function IssuesPanel() {
  const { issues, nodes, runValidation } = useStore();

  // Run validation once on initial load so we check the default hardcoded nodes
  useEffect(() => {
    runValidation();
  }, [runValidation]);

  // 👇 THE FIX: If there are no nodes on the canvas, don't render the panel at all!
  if (nodes.length === 0) return null;

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-white border border-slate-200 rounded-lg shadow-2xl overflow-hidden z-10 flex flex-col max-h-64">
      
      {/* Header */}
      <div className="bg-slate-800 px-4 py-3 flex justify-between items-center">
        <h3 className="font-bold text-white flex items-center gap-2">
          Validation Engine
        </h3>
        <span className={`text-xs font-bold px-2 py-1 rounded-full ${issues.length === 0 ? 'bg-emerald-500 text-white' : 'bg-red-500 text-white'}`}>
          {issues.length} {issues.length === 1 ? 'Issue' : 'Issues'}
        </span>
      </div>

      {/* Issues List */}
      <div className="overflow-y-auto p-4 flex flex-col gap-3 bg-slate-50">
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm p-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>All deterministic checks passed. Architecture is valid.</span>
          </div>
        ) : (
          issues.map((issue, idx) => (
            <div 
              key={idx} 
              className={`flex items-start gap-3 p-3 rounded-md border shadow-sm ${
                issue.severity === 'error' 
                  ? 'bg-red-50 border-red-200 text-red-900' 
                  : 'bg-amber-50 border-amber-200 text-amber-900'
              }`}
            >
              {issue.severity === 'error' ? (
                <AlertCircle className="w-5 h-5 shrink-0 mt-0.5 text-red-600" />
              ) : (
                <AlertTriangle className="w-5 h-5 shrink-0 mt-0.5 text-amber-600" />
              )}
              <div>
                <h4 className="font-bold text-sm">{issue.name}</h4>
                <p className="text-xs mt-1 opacity-90 leading-relaxed">{issue.message}</p>
              </div>
            </div>
          ))
        )}
      </div>
    </div>
  );
}