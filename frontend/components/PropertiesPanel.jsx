'use client';

import React from 'react';
import { useStore } from '../app/store';
import { Settings, X } from 'lucide-react';

export default function PropertiesPanel() {
  const { selectedElement, setSelectedElement, updateEdgeData } = useStore();

  if (!selectedElement || selectedElement.elementType !== 'edge') return null;

  const data = selectedElement.data || {};

  return (
    <div className="absolute top-16 right-4 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-20 overflow-hidden flex flex-col">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-500" />
          Connection Properties
        </h3>
        <button onClick={() => setSelectedElement(null)} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4">
        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Authentication Type</label>
          <select
            value={data.authType || 'NONE'}
            onChange={(e) => updateEdgeData(selectedElement.id, { authType: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="NONE">None (Public)</option>
            <option value="COGNITO">Amazon Cognito</option>
            <option value="IAM">AWS IAM</option>
            <option value="CUSTOM">Custom Authorizer</option>
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className="text-xs font-bold text-slate-500 uppercase">Invocation Type</label>
          <select
            value={data.invocationType || 'Sync'}
            onChange={(e) => updateEdgeData(selectedElement.id, { invocationType: e.target.value })}
            className="w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500"
          >
            <option value="Sync">Synchronous</option>
            <option value="Async">Asynchronous</option>
          </select>
        </div>
      </div>
    </div>
  );
}
