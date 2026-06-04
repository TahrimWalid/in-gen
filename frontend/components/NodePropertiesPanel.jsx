'use client';

import React from 'react';
import { useStore } from '../app/store';
import { Settings, X } from 'lucide-react';

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-10 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-emerald-500' : 'bg-slate-300'
      }`}
    >
      <span
        className={`absolute top-1 left-1 w-4 h-4 bg-white rounded-full shadow transition-transform ${
          checked ? 'translate-x-4' : 'translate-x-0'
        }`}
      />
    </button>
  );
}

function Field({ label, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold text-slate-500 uppercase">{label}</label>
      {children}
    </div>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs font-bold text-slate-500 uppercase">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

const inputClass =
  'w-full px-3 py-2 border border-slate-300 rounded-md text-sm text-slate-900 bg-white focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function NodePropertiesPanel() {
  const { selectedElement, setSelectedElement, updateNodeData } = useStore();

  if (!selectedElement || selectedElement.elementType !== 'node') return null;

  const { id, data } = selectedElement;
  const service = data?.service;

  const update = (field, value) => updateNodeData(id, { [field]: value });

  return (
    <div className="absolute bottom-6 right-4 w-80 bg-white border border-slate-200 rounded-lg shadow-xl z-20 flex flex-col max-h-[480px] overflow-hidden">
      {/* Header */}
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-slate-800 flex items-center gap-2">
          <Settings className="w-4 h-4 text-slate-500" />
          Node Properties
        </h3>
        <button onClick={() => setSelectedElement(null)} className="text-slate-400 hover:text-slate-600">
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Body */}
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        <Field label="Resource Label">
          <input
            type="text"
            value={data.label || ''}
            onChange={(e) => update('label', e.target.value)}
            className={inputClass}
          />
        </Field>

        {service === 'lambda' && (
          <>
            <Field label="Timeout (seconds)">
              <input
                type="number" min={1} max={900}
                value={data.timeout ?? 3}
                onChange={(e) => update('timeout', Number(e.target.value))}
                className={inputClass}
              />
              {(data.timeout === 3 || data.timeout === undefined) && (
                <p className="text-xs text-amber-600 mt-1">
                  AWS default — likely too short for production workloads
                </p>
              )}
            </Field>
            <Field label="Memory Size">
              <select
                value={data.memorySize ?? 128}
                onChange={(e) => update('memorySize', Number(e.target.value))}
                className={inputClass}
              >
                {[128, 256, 512, 1024, 2048, 3008].map(mb => (
                  <option key={mb} value={mb}>{mb} MB</option>
                ))}
              </select>
            </Field>
            <ToggleField
              label="Dead Letter Queue"
              checked={data.hasDeadLetterQueue ?? false}
              onChange={(v) => update('hasDeadLetterQueue', v)}
            />
          </>
        )}

        {service === 'sqs' && (
          <>
            <Field label="Visibility Timeout (seconds)">
              <input
                type="number" min={0} max={43200}
                value={data.visibilityTimeout ?? 30}
                onChange={(e) => update('visibilityTimeout', Number(e.target.value))}
                className={inputClass}
              />
              <p className="text-xs text-slate-500 mt-1">
                Should be 6× your consuming Lambda&apos;s timeout to prevent duplicate processing
              </p>
            </Field>
            <ToggleField
              label="FIFO Queue"
              checked={data.isFifo ?? false}
              onChange={(v) => update('isFifo', v)}
            />
          </>
        )}

        {service === 's3' && (
          <>
            <ToggleField
              label="Block Public Access"
              checked={data.blockPublicAccess ?? true}
              onChange={(v) => update('blockPublicAccess', v)}
            />
            <ToggleField
              label="Versioning"
              checked={data.versioning ?? false}
              onChange={(v) => update('versioning', v)}
            />
            <ToggleField
              label="Encryption"
              checked={data.encryption ?? false}
              onChange={(v) => update('encryption', v)}
            />
          </>
        )}

        {service === 'apiGateway' && (
          <>
            <ToggleField
              label="Throttling Enabled"
              checked={data.throttlingEnabled ?? false}
              onChange={(v) => update('throttlingEnabled', v)}
            />
            <ToggleField
              label="Logging Enabled"
              checked={data.loggingEnabled ?? false}
              onChange={(v) => update('loggingEnabled', v)}
            />
          </>
        )}

        {service === 'dynamodb' && (
          <>
            <ToggleField
              label="Point-in-Time Recovery"
              checked={data.pointInTimeRecovery ?? false}
              onChange={(v) => update('pointInTimeRecovery', v)}
            />
            <Field label="Billing Mode">
              <select
                value={data.billingMode ?? 'PAY_PER_REQUEST'}
                onChange={(e) => update('billingMode', e.target.value)}
                className={inputClass}
              >
                <option value="PAY_PER_REQUEST">On-Demand (PAY_PER_REQUEST)</option>
                <option value="PROVISIONED">Provisioned</option>
              </select>
            </Field>
          </>
        )}
      </div>
    </div>
  );
}
