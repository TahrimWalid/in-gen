'use client';

import React from 'react';
import { useStore } from '../app/store';
import { TEMPLATES } from '../lib/templates';
import { X, LayoutTemplate } from 'lucide-react';

const SERVICE_LABELS = {
  lambda:      'Lambda',
  apiGateway:  'API Gateway',
  dynamodb:    'DynamoDB',
  s3:          'S3',
  eventbridge: 'EventBridge',
  sqs:         'SQS',
  sns:         'SNS',
  cognito:     'Cognito',
};

const SERVICE_BADGE_COLORS = {
  lambda:      'bg-orange-500/15 text-orange-500',
  apiGateway:  'bg-purple-500/15 text-purple-500',
  dynamodb:    'bg-blue-500/15 text-blue-500',
  s3:          'bg-green-500/15 text-green-600',
  eventbridge: 'bg-pink-500/15 text-pink-500',
  sqs:         'bg-yellow-500/15 text-yellow-600',
  sns:         'bg-rose-500/15 text-rose-500',
  cognito:     'bg-red-500/15 text-red-500',
};

export default function TemplatesModal({ isOpen, onClose }) {
  const { loadTemplate } = useStore();

  if (!isOpen) return null;

  const handleLoad = (template) => {
    loadTemplate(template);
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 backdrop-blur-sm">
      <div className="bg-surface border border-border w-full max-w-3xl mx-4 rounded-xl shadow-2xl flex flex-col max-h-[85vh] overflow-hidden">

        <div className="px-6 py-4 border-b border-border flex justify-between items-start shrink-0">
          <div className="flex items-center gap-3">
            <LayoutTemplate className="w-5 h-5 text-purple-500" />
            <div>
              <h2 className="font-bold text-primary text-lg">Architecture Templates</h2>
              <p className="text-muted text-sm mt-0.5">
                Start with a pre-built pattern. Your current canvas will be replaced. This action is undoable.
              </p>
            </div>
          </div>
          <button onClick={onClose} className="text-muted hover:text-primary transition-colors mt-0.5 shrink-0">
            <X className="w-5 h-5" />
          </button>
        </div>

        <div className="overflow-y-auto p-6">
          <div className="grid grid-cols-2 gap-4">
            {TEMPLATES.map(template => {
              const uniqueServices = [...new Set(template.nodes.map(n => n.data.service))];
              return (
                <div
                  key={template.id}
                  className="bg-surface-alt border border-border rounded-lg p-4 flex flex-col gap-3 hover:border-purple-400/50 transition-colors"
                >
                  <div>
                    <h3 className="font-bold text-primary text-sm">{template.name}</h3>
                    <p className="text-muted text-xs mt-1 leading-relaxed">{template.description}</p>
                  </div>

                  <p className="text-xs text-muted">
                    {template.nodes.length} nodes · {template.edges.length} connections
                  </p>

                  <div className="flex flex-wrap gap-1.5">
                    {uniqueServices.map(service => (
                      <span
                        key={service}
                        className={`text-xs px-2 py-0.5 rounded-full font-medium ${SERVICE_BADGE_COLORS[service] || 'bg-surface text-muted'}`}
                      >
                        {SERVICE_LABELS[service] || service}
                      </span>
                    ))}
                  </div>

                  <button
                    onClick={() => handleLoad(template)}
                    className="mt-auto w-full px-3 py-2 bg-purple-600 text-white rounded-md text-sm font-semibold hover:bg-purple-500 transition-colors"
                  >
                    Load Template
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
