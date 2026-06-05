'use client';

import React, { useEffect } from 'react';
import { useStore } from '../app/store';
import { AlertCircle, AlertTriangle, CheckCircle2 } from 'lucide-react';

export default function IssuesPanel() {
  const { issues, nodes, runValidation } = useStore();

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  if (nodes.length === 0) return null;

  const errors   = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-surface border border-border rounded-lg shadow-2xl overflow-hidden z-10 flex flex-col max-h-64">

      <div className="bg-header-bg px-5 py-3.5 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-header-text text-sm tracking-wide">
          Validation Engine
        </h3>
        <div className="flex items-center gap-1.5">
          {errors.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-red-500 text-white">
              {errors.length} Error{errors.length !== 1 ? 's' : ''}
            </span>
          )}
          {warnings.length > 0 && (
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-amber-500 text-white">
              {warnings.length} Warning{warnings.length !== 1 ? 's' : ''}
            </span>
          )}
          {issues.length === 0 && (
            <span className="text-xs font-bold px-2.5 py-0.5 rounded-full bg-emerald-500 text-white">
              All Clear
            </span>
          )}
        </div>
      </div>

      <div className="overflow-y-auto p-4 flex flex-col gap-3 bg-surface-alt">
        {issues.length === 0 ? (
          <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm p-2">
            <CheckCircle2 className="w-5 h-5" />
            <span>All deterministic checks passed. Architecture is valid.</span>
          </div>
        ) : (
          issues.map((issue, idx) => (
            <div
              key={idx}
              className={`flex items-start gap-3 p-3 rounded-md border border-l-[3px] shadow-sm ${
                issue.severity === 'error'
                  ? 'bg-red-50 border-red-200 border-l-red-500 text-red-900'
                  : 'bg-amber-50 border-amber-200 border-l-amber-500 text-amber-900'
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
