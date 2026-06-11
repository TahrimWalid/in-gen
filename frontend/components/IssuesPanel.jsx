'use client';

import React, { useEffect, useState } from 'react';
import { useStore } from '../app/store';
import { AlertCircle, AlertTriangle, CheckCircle2, ChevronDown, ChevronUp } from 'lucide-react';
import { rules } from '../lib/rules';
import { getScoreColor, getScoreLabel } from '../lib/architectureScorer';
import IssueDetailDrawer from './IssueDetailDrawer';

const SCORE_COLOR_CLASSES = {
  green: 'text-emerald-500',
  amber: 'text-amber-500',
  orange: 'text-orange-500',
  red: 'text-red-500',
};

function ScoreBlock({ label, score, large }) {
  const color = SCORE_COLOR_CLASSES[getScoreColor(score)];
  return (
    <div className="flex flex-col items-center gap-0.5">
      <span className="text-[11px] font-bold uppercase tracking-wide text-muted">{label}</span>
      <span className={`font-bold transition-colors duration-300 ${color} ${large ? 'text-xl' : 'text-lg'}`}>
        {score.toFixed(1)}/10
      </span>
      <span className="text-[10px] text-muted">{getScoreLabel(score)}</span>
    </div>
  );
}

export default function IssuesPanel() {
  const { issues, nodes, runValidation, architectureScore } = useStore();
  const [expandedKey, setExpandedKey] = useState(null);
  const [collapsed, setCollapsed] = useState(false);

  useEffect(() => {
    runValidation();
  }, [runValidation]);

  if (nodes.length === 0) return null;

  const errors   = issues.filter(i => i.severity === 'error');
  const warnings = issues.filter(i => i.severity === 'warning');

  const toggleExpanded = (key) => {
    setExpandedKey(prev => (prev === key ? null : key));
  };

  return (
    <div className="absolute bottom-6 left-1/2 -translate-x-1/2 w-full max-w-2xl bg-surface border border-border rounded-lg shadow-2xl overflow-hidden z-10 flex flex-col max-h-[30rem]">

      <div
        onClick={() => setCollapsed(c => !c)}
        className="bg-header-bg px-5 py-3.5 flex justify-between items-center shrink-0 cursor-pointer select-none"
      >
        <div className="flex items-center gap-2">
          {collapsed ? (
            <ChevronUp className="w-4 h-4 text-header-text" />
          ) : (
            <ChevronDown className="w-4 h-4 text-header-text" />
          )}
          <h3 className="font-bold text-header-text text-sm tracking-wide">
            Validation Engine
          </h3>
        </div>
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

      <div className={`flex flex-col min-h-0 overflow-hidden transition-all duration-300 ease-in-out ${
        collapsed ? 'max-h-0' : 'max-h-[27rem]'
      }`}>
        {architectureScore ? (
          <div className="flex items-center justify-around px-5 py-3 border-b border-border bg-surface shrink-0">
            <ScoreBlock label="Security" score={architectureScore.security} />
            <ScoreBlock label="Reliability" score={architectureScore.reliability} />
            <ScoreBlock label="Performance" score={architectureScore.performance} />
            <ScoreBlock label="Overall" score={architectureScore.overall} large />
          </div>
        ) : (
          <div className="px-5 py-2.5 border-b border-border bg-surface shrink-0">
            <p className="text-xs text-muted text-center">
              Start adding components to see your architecture score
            </p>
          </div>
        )}

        <div className="flex-1 min-h-0 overflow-y-auto p-4 flex flex-col gap-3 bg-surface-alt">
          {issues.length === 0 ? (
            <div className="flex items-center gap-2 text-emerald-600 font-medium text-sm p-2">
              <CheckCircle2 className="w-5 h-5" />
              <span>All deterministic checks passed. Architecture is valid.</span>
            </div>
          ) : (
            issues.map((issue, idx) => {
              const key = `${issue.ruleId}::${issue.nodeId}::${idx}`;
              const isExpanded = expandedKey === key;
              const ruleObj = rules.find(r => r.id === issue.ruleId);

              return (
                <div key={key} className="flex flex-col">
                  <div
                    onClick={() => toggleExpanded(key)}
                    className={`flex items-start gap-3 p-3 rounded-md border border-l-[3px] shadow-sm cursor-pointer transition-colors ${
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

                  {ruleObj && (
                    <div className={`grid transition-all duration-300 ease-in-out ${
                      isExpanded ? 'grid-rows-[1fr] opacity-100 mt-2' : 'grid-rows-[0fr] opacity-0'
                    }`}>
                      <div className="overflow-hidden">
                        <IssueDetailDrawer
                          issue={issue}
                          rule={ruleObj}
                          onClose={() => setExpandedKey(null)}
                        />
                      </div>
                    </div>
                  )}
                </div>
              );
            })
          )}
        </div>
      </div>
    </div>
  );
}
