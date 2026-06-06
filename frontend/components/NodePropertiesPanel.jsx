'use client';

import React, { useState } from 'react';
import { useStore } from '../app/store';
import { Settings, X, Plus, Trash2 } from 'lucide-react';

// ── Shared primitives ─────────────────────────────────────────

function Toggle({ checked, onChange }) {
  return (
    <button
      type="button"
      onClick={() => onChange(!checked)}
      className={`relative inline-flex w-10 h-6 rounded-full transition-colors shrink-0 ${
        checked ? 'bg-emerald-500' : 'bg-border'
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

export function ToggleField({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs font-bold text-muted uppercase">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-border-input rounded-md text-sm text-input-text bg-input-bg focus:outline-none focus:ring-2 focus:ring-blue-500';

export function NumberField({ label, value, min, max, onChange, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold text-muted uppercase">{label}</label>
      <input
        type="number"
        min={min}
        max={max}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className={inputCls}
      />
      {hint && <p className="text-xs text-amber-500 mt-0.5">{hint}</p>}
    </div>
  );
}

export function SelectField({ label, value, options, onChange }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold text-muted uppercase">{label}</label>
      <select
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      >
        {options.map(({ value: v, label: l }) => (
          <option key={v} value={v}>{l}</option>
        ))}
      </select>
    </div>
  );
}

export function TextField({ label, value, onChange, hint }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold text-muted uppercase">{label}</label>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className={inputCls}
      />
      {hint && <p className="text-xs text-amber-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function KeyValueList({ pairs, onChange }) {
  const pairInput =
    'flex-1 min-w-0 px-2 py-1.5 border border-border-input rounded-md text-xs text-input-text bg-input-bg focus:outline-none focus:ring-1 focus:ring-blue-500';
  const add = () => onChange([...pairs, { key: '', value: '' }]);
  const remove = (i) => onChange(pairs.filter((_, idx) => idx !== i));
  const patch = (i, field, val) =>
    onChange(pairs.map((p, idx) => (idx === i ? { ...p, [field]: val } : p)));

  return (
    <div className="flex flex-col gap-2">
      <label className="text-xs font-bold text-muted uppercase">
        Environment Variables
      </label>
      {pairs.length === 0 && (
        <p className="text-xs text-muted italic">No variables defined</p>
      )}
      {pairs.map((p, i) => (
        <div key={i} className="flex items-center gap-1">
          <input
            type="text"
            placeholder="KEY"
            value={p.key}
            onChange={(e) => patch(i, 'key', e.target.value)}
            className={pairInput}
          />
          <input
            type="text"
            placeholder="value"
            value={p.value}
            onChange={(e) => patch(i, 'value', e.target.value)}
            className={pairInput}
          />
          <button
            type="button"
            onClick={() => remove(i)}
            className="text-muted hover:text-red-500 shrink-0 p-0.5"
          >
            <Trash2 className="w-3.5 h-3.5" />
          </button>
        </div>
      ))}
      <button
        type="button"
        onClick={add}
        className="flex items-center gap-1 text-xs text-muted hover:text-primary self-start mt-0.5"
      >
        <Plus className="w-3 h-3" />
        Add variable
      </button>
    </div>
  );
}

// ── Tab bar ───────────────────────────────────────────────────

function TabBar({ tabs, active, onSelect }) {
  return (
    <div className="flex border-b border-border shrink-0 overflow-x-auto">
      {tabs.map(({ id, label }) => (
        <button
          key={id}
          type="button"
          onClick={() => onSelect(id)}
          className={`px-3 py-2 text-xs font-semibold whitespace-nowrap transition-colors ${
            active === id
              ? 'border-b-2 border-purple-500 text-primary -mb-px'
              : 'text-muted hover:text-primary'
          }`}
        >
          {label}
        </button>
      ))}
    </div>
  );
}

// ── Tab layout per service ────────────────────────────────────

const ALL_TABS = [
  { id: 'basic',       label: 'Basic'    },
  { id: 'performance', label: 'Perf'     },
  { id: 'security',    label: 'Security' },
  { id: 'advanced',    label: 'Advanced' },
];

const SERVICE_TABS = {
  lambda:      ['basic', 'performance', 'security', 'advanced'],
  apiGateway:  ['basic', 'performance', 'security', 'advanced'],
  dynamodb:    ['basic', 'performance', 'security', 'advanced'],
  s3:          ['basic', 'performance', 'security', 'advanced'],
  sqs:         ['basic', 'performance', 'security'],
  sns:         ['basic', 'performance', 'security'],
  eventbridge: ['basic', 'performance', 'advanced'],
  cognito:     ['basic', 'performance', 'security'],
};

// ── Main component ────────────────────────────────────────────

export default function NodePropertiesPanel() {
  const { selectedElement, setSelectedElement, updateNodeData } = useStore();
  // { [serviceType]: tabId } — persists last active tab per service type
  const [activeTabs, setActiveTabs] = useState({});

  if (!selectedElement || selectedElement.elementType !== 'node') return null;

  const { id, data } = selectedElement;
  const service = data?.service;
  const upd = (field, value) => updateNodeData(id, { [field]: value });

  const visibleIds = SERVICE_TABS[service] ?? ['basic'];
  const visibleTabs = ALL_TABS.filter((t) => visibleIds.includes(t.id));
  const activeTab =
    activeTabs[service] && visibleIds.includes(activeTabs[service])
      ? activeTabs[service]
      : 'basic';
  const setTab = (tab) =>
    setActiveTabs((prev) => ({ ...prev, [service]: tab }));

  return (
    <div className="absolute bottom-6 right-4 w-80 bg-surface border border-border rounded-lg shadow-xl z-20 flex flex-col max-h-[560px] overflow-hidden">
      {/* Header */}
      <div className="bg-surface-alt border-b border-border px-4 py-3 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-primary flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted" />
          Node Properties
        </h3>
        <button
          onClick={() => setSelectedElement(null)}
          className="text-muted hover:text-primary"
        >
          <X className="w-5 h-5" />
        </button>
      </div>

      {/* Tab bar */}
      <TabBar tabs={visibleTabs} active={activeTab} onSelect={setTab} />

      {/* Tab content */}
      <div className="p-4 flex flex-col gap-4 overflow-y-auto">

        {/* ══ BASIC ══════════════════════════════════════════ */}
        {activeTab === 'basic' && <>
          <TextField
            label="Resource Label"
            value={data.label || ''}
            onChange={(v) => upd('label', v)}
          />

          {service === 'lambda' && <>
            <SelectField
              label="Runtime"
              value={data.runtime ?? 'nodejs20.x'}
              onChange={(v) => upd('runtime', v)}
              options={[
                { value: 'nodejs20.x',  label: 'Node.js 20.x' },
                { value: 'nodejs18.x',  label: 'Node.js 18.x' },
                { value: 'nodejs16.x',  label: 'Node.js 16.x (EOL)' },
                { value: 'python3.12',  label: 'Python 3.12' },
                { value: 'python3.11',  label: 'Python 3.11' },
                { value: 'python3.10',  label: 'Python 3.10' },
                { value: 'python3.9',   label: 'Python 3.9 (EOL)' },
                { value: 'java21',      label: 'Java 21' },
                { value: 'java17',      label: 'Java 17' },
                { value: 'java11',      label: 'Java 11' },
                { value: 'dotnet8',     label: '.NET 8' },
                { value: 'ruby3.3',     label: 'Ruby 3.3' },
              ]}
            />
            <SelectField
              label="Architecture"
              value={data.architecture ?? 'x86_64'}
              onChange={(v) => upd('architecture', v)}
              options={[
                { value: 'x86_64', label: 'x86_64' },
                { value: 'arm64',  label: 'arm64 (Graviton2)' },
              ]}
            />
          </>}

          {service === 'apiGateway' && <>
            <SelectField
              label="API Type"
              value={data.apiType ?? 'REST'}
              onChange={(v) => upd('apiType', v)}
              options={[
                { value: 'REST',      label: 'REST' },
                { value: 'HTTP',      label: 'HTTP' },
                { value: 'WebSocket', label: 'WebSocket' },
              ]}
            />
            <TextField
              label="Stage Name"
              value={data.stageName ?? 'prod'}
              onChange={(v) => upd('stageName', v)}
            />
          </>}

          {service === 'dynamodb' && (
            <SelectField
              label="Billing Mode"
              value={data.billingMode ?? 'PAY_PER_REQUEST'}
              onChange={(v) => upd('billingMode', v)}
              options={[
                { value: 'PAY_PER_REQUEST', label: 'On-Demand (PAY_PER_REQUEST)' },
                { value: 'PROVISIONED',     label: 'Provisioned' },
              ]}
            />
          )}

          {service === 's3' && (
            <ToggleField
              label="Static Website Hosting"
              checked={data.staticWebsiteHosting ?? false}
              onChange={(v) => upd('staticWebsiteHosting', v)}
            />
          )}

          {service === 'sqs' && (
            <ToggleField
              label="FIFO Queue"
              checked={data.isFifo ?? false}
              onChange={(v) => upd('isFifo', v)}
            />
          )}

          {service === 'sns' && (
            <SelectField
              label="Topic Type"
              value={data.topicType ?? 'Standard'}
              onChange={(v) => upd('topicType', v)}
              options={[
                { value: 'Standard', label: 'Standard' },
                { value: 'FIFO',     label: 'FIFO' },
              ]}
            />
          )}

          {service === 'eventbridge' && (
            <ToggleField
              label="Custom Bus"
              checked={data.isCustomBus ?? false}
              onChange={(v) => upd('isCustomBus', v)}
            />
          )}

          {service === 'cognito' && <>
            <SelectField
              label="MFA Mode"
              value={data.mfaMode ?? 'OFF'}
              onChange={(v) => upd('mfaMode', v)}
              options={[
                { value: 'OFF',      label: 'OFF' },
                { value: 'OPTIONAL', label: 'OPTIONAL' },
                { value: 'REQUIRED', label: 'REQUIRED' },
              ]}
            />
            <SelectField
              label="Account Recovery"
              value={data.accountRecovery ?? 'PHONE_WITHOUT_MFA'}
              onChange={(v) => upd('accountRecovery', v)}
              options={[
                { value: 'PHONE_WITHOUT_MFA', label: 'Phone (without MFA)' },
                { value: 'EMAIL_ONLY',        label: 'Email only' },
                { value: 'PHONE_AND_EMAIL',   label: 'Phone and Email' },
              ]}
            />
          </>}
        </>}

        {/* ══ PERFORMANCE ════════════════════════════════════ */}
        {activeTab === 'performance' && <>
          {service === 'lambda' && <>
            <NumberField
              label="Timeout (seconds)"
              min={1} max={900}
              value={data.timeout ?? 3}
              onChange={(v) => upd('timeout', v)}
              hint={
                (data.timeout === 3 || data.timeout === undefined)
                  ? 'AWS default — likely too short for production'
                  : undefined
              }
            />
            <SelectField
              label="Memory Size"
              value={data.memorySize ?? 128}
              onChange={(v) => upd('memorySize', Number(v))}
              options={[128, 256, 512, 1024, 2048, 3008].map((mb) => ({
                value: mb,
                label: `${mb} MB`,
              }))}
            />
            <NumberField
              label="Reserved Concurrency"
              min={-1}
              value={data.reservedConcurrency ?? -1}
              onChange={(v) => upd('reservedConcurrency', v)}
              hint={
                data.reservedConcurrency === -1
                  ? 'Unreserved — shares account concurrency pool'
                  : undefined
              }
            />
          </>}

          {service === 'apiGateway' && <>
            <NumberField
              label="Rate Limit (req/s)"
              min={0}
              value={data.rateLimit ?? 0}
              onChange={(v) => upd('rateLimit', v)}
            />
            <NumberField
              label="Burst Limit"
              min={0}
              value={data.burstLimit ?? 0}
              onChange={(v) => upd('burstLimit', v)}
            />
            <ToggleField
              label="Cache Enabled"
              checked={data.cacheEnabled ?? false}
              onChange={(v) => upd('cacheEnabled', v)}
            />
            {data.cacheEnabled && (
              <NumberField
                label="Cache TTL (seconds)"
                min={0} max={3600}
                value={data.cacheTtl ?? 300}
                onChange={(v) => upd('cacheTtl', v)}
              />
            )}
          </>}

          {service === 'dynamodb' && <>
            {data.billingMode === 'PROVISIONED' && <>
              <NumberField
                label="Read Capacity (RCU)"
                min={1}
                value={data.readCapacity ?? 5}
                onChange={(v) => upd('readCapacity', v)}
              />
              <NumberField
                label="Write Capacity (WCU)"
                min={1}
                value={data.writeCapacity ?? 5}
                onChange={(v) => upd('writeCapacity', v)}
              />
            </>}
            <ToggleField
              label="TTL Enabled"
              checked={data.ttlEnabled ?? false}
              onChange={(v) => upd('ttlEnabled', v)}
            />
          </>}

          {service === 's3' && <>
            <ToggleField
              label="Lifecycle Rules"
              checked={data.lifecycleEnabled ?? false}
              onChange={(v) => upd('lifecycleEnabled', v)}
            />
            <ToggleField
              label="Replication"
              checked={data.replicationEnabled ?? false}
              onChange={(v) => upd('replicationEnabled', v)}
            />
          </>}

          {service === 'sqs' && <>
            <NumberField
              label="Visibility Timeout (seconds)"
              min={0} max={43200}
              value={data.visibilityTimeout ?? 30}
              onChange={(v) => upd('visibilityTimeout', v)}
              hint="Should be ≥ 6× your Lambda consumer timeout"
            />
            <SelectField
              label="Message Retention"
              value={data.messageRetentionSeconds ?? 345600}
              onChange={(v) => upd('messageRetentionSeconds', Number(v))}
              options={[
                { value: 60,      label: '1 minute' },
                { value: 3600,    label: '1 hour' },
                { value: 86400,   label: '1 day' },
                { value: 345600,  label: '4 days' },
                { value: 604800,  label: '7 days' },
                { value: 1209600, label: '14 days (max)' },
              ]}
            />
            <NumberField
              label="Delivery Delay (seconds)"
              min={0} max={900}
              value={data.deliveryDelaySeconds ?? 0}
              onChange={(v) => upd('deliveryDelaySeconds', v)}
            />
            <NumberField
              label="Max Message Size (bytes)"
              min={1024} max={262144}
              value={data.maxMessageSize ?? 262144}
              onChange={(v) => upd('maxMessageSize', v)}
            />
          </>}

          {service === 'sns' && (
            <ToggleField
              label="Delivery Retry"
              checked={data.deliveryRetryEnabled ?? true}
              onChange={(v) => upd('deliveryRetryEnabled', v)}
            />
          )}

          {service === 'eventbridge' && <>
            <ToggleField
              label="Archive Enabled"
              checked={data.archiveEnabled ?? false}
              onChange={(v) => upd('archiveEnabled', v)}
            />
            {data.archiveEnabled && (
              <NumberField
                label="Archive Retention (days)"
                min={1}
                value={data.archiveRetentionDays ?? 7}
                onChange={(v) => upd('archiveRetentionDays', v)}
              />
            )}
          </>}

          {service === 'cognito' && <>
            <NumberField
              label="Access Token Validity (hours)"
              min={1} max={24}
              value={data.accessTokenValidityHours ?? 1}
              onChange={(v) => upd('accessTokenValidityHours', v)}
            />
            <NumberField
              label="Refresh Token Validity (days)"
              min={1} max={3650}
              value={data.refreshTokenValidityDays ?? 30}
              onChange={(v) => upd('refreshTokenValidityDays', v)}
            />
          </>}
        </>}

        {/* ══ SECURITY ═══════════════════════════════════════ */}
        {activeTab === 'security' && <>
          {service === 'lambda' && <>
            <ToggleField
              label="Dead Letter Queue"
              checked={data.hasDeadLetterQueue ?? false}
              onChange={(v) => upd('hasDeadLetterQueue', v)}
            />
            <ToggleField
              label="VPC Enabled"
              checked={data.vpcEnabled ?? false}
              onChange={(v) => upd('vpcEnabled', v)}
            />
          </>}

          {service === 'apiGateway' && <>
            <ToggleField
              label="Throttling Enabled"
              checked={data.throttlingEnabled ?? true}
              onChange={(v) => upd('throttlingEnabled', v)}
            />
            <ToggleField
              label="WAF Enabled"
              checked={data.wafEnabled ?? false}
              onChange={(v) => upd('wafEnabled', v)}
            />
            <ToggleField
              label="CORS Enabled"
              checked={data.corsEnabled ?? false}
              onChange={(v) => upd('corsEnabled', v)}
            />
            {data.corsEnabled && (
              <TextField
                label="CORS Origin"
                value={data.corsOrigin ?? '*'}
                onChange={(v) => upd('corsOrigin', v)}
                hint={
                  data.corsOrigin === '*'
                    ? 'Wildcard origin — consider restricting in production'
                    : undefined
                }
              />
            )}
          </>}

          {service === 'dynamodb' && <>
            <ToggleField
              label="Encryption"
              checked={data.encryption ?? true}
              onChange={(v) => upd('encryption', v)}
            />
            <ToggleField
              label="Point-in-Time Recovery"
              checked={data.pointInTimeRecovery ?? true}
              onChange={(v) => upd('pointInTimeRecovery', v)}
            />
          </>}

          {service === 's3' && <>
            <ToggleField
              label="Block Public Access"
              checked={data.blockPublicAccess ?? true}
              onChange={(v) => upd('blockPublicAccess', v)}
            />
            <SelectField
              label="Encryption Type"
              value={data.encryptionType ?? 'SSE-S3'}
              onChange={(v) => upd('encryptionType', v)}
              options={[
                { value: 'SSE-S3',  label: 'SSE-S3' },
                { value: 'SSE-KMS', label: 'SSE-KMS' },
                { value: 'None',    label: 'None' },
              ]}
            />
            <ToggleField
              label="Object Lock"
              checked={data.objectLock ?? false}
              onChange={(v) => upd('objectLock', v)}
            />
            <ToggleField
              label="Access Logging"
              checked={data.accessLogging ?? false}
              onChange={(v) => upd('accessLogging', v)}
            />
          </>}

          {service === 'sqs' && <>
            <ToggleField
              label="Encryption"
              checked={data.sqsEncryption ?? false}
              onChange={(v) => upd('sqsEncryption', v)}
            />
            <ToggleField
              label="Dead Letter Queue"
              checked={data.dlqEnabled ?? false}
              onChange={(v) => upd('dlqEnabled', v)}
            />
            {data.dlqEnabled && (
              <NumberField
                label="Max Receive Count"
                min={1} max={1000}
                value={data.maxReceiveCount ?? 3}
                onChange={(v) => upd('maxReceiveCount', v)}
              />
            )}
          </>}

          {service === 'sns' && <>
            <ToggleField
              label="Encryption"
              checked={data.snsEncryption ?? false}
              onChange={(v) => upd('snsEncryption', v)}
            />
            <SelectField
              label="Access Policy"
              value={data.accessPolicy ?? 'Restricted'}
              onChange={(v) => upd('accessPolicy', v)}
              options={[
                { value: 'Restricted', label: 'Restricted' },
                { value: 'Open',       label: 'Open' },
              ]}
            />
            <ToggleField
              label="Filter Policy"
              checked={data.filterPolicyEnabled ?? false}
              onChange={(v) => upd('filterPolicyEnabled', v)}
            />
          </>}

          {service === 'cognito' && <>
            <ToggleField
              label="Advanced Security"
              checked={data.advancedSecurity ?? false}
              onChange={(v) => upd('advancedSecurity', v)}
            />
            <NumberField
              label="Min Password Length"
              min={6} max={99}
              value={data.passwordMinLength ?? 8}
              onChange={(v) => upd('passwordMinLength', v)}
              hint={
                (data.passwordMinLength ?? 8) < 8
                  ? 'Below minimum recommended length'
                  : undefined
              }
            />
            <ToggleField
              label="Require Uppercase"
              checked={data.passwordRequireUppercase ?? true}
              onChange={(v) => upd('passwordRequireUppercase', v)}
            />
            <ToggleField
              label="Require Lowercase"
              checked={data.passwordRequireLowercase ?? true}
              onChange={(v) => upd('passwordRequireLowercase', v)}
            />
            <ToggleField
              label="Require Numbers"
              checked={data.passwordRequireNumbers ?? true}
              onChange={(v) => upd('passwordRequireNumbers', v)}
            />
            <ToggleField
              label="Require Symbols"
              checked={data.passwordRequireSymbols ?? false}
              onChange={(v) => upd('passwordRequireSymbols', v)}
            />
          </>}
        </>}

        {/* ══ ADVANCED ═══════════════════════════════════════ */}
        {activeTab === 'advanced' && <>
          {service === 'lambda' && (
            <KeyValueList
              pairs={data.environmentVariables ?? []}
              onChange={(v) => upd('environmentVariables', v)}
            />
          )}

          {service === 'apiGateway' && (
            <ToggleField
              label="Logging Enabled"
              checked={data.loggingEnabled ?? false}
              onChange={(v) => upd('loggingEnabled', v)}
            />
          )}

          {service === 'dynamodb' && <>
            <ToggleField
              label="Streams Enabled"
              checked={data.streamsEnabled ?? false}
              onChange={(v) => upd('streamsEnabled', v)}
            />
            {data.streamsEnabled && (
              <SelectField
                label="Stream View Type"
                value={data.streamViewType ?? 'NEW_AND_OLD_IMAGES'}
                onChange={(v) => upd('streamViewType', v)}
                options={[
                  { value: 'NEW_AND_OLD_IMAGES', label: 'NEW_AND_OLD_IMAGES' },
                  { value: 'NEW_IMAGE',          label: 'NEW_IMAGE' },
                  { value: 'OLD_IMAGE',          label: 'OLD_IMAGE' },
                  { value: 'KEYS_ONLY',          label: 'KEYS_ONLY' },
                ]}
              />
            )}
            <ToggleField
              label="Global Table"
              checked={data.globalTable ?? false}
              onChange={(v) => upd('globalTable', v)}
            />
          </>}

          {service === 's3' && (
            <ToggleField
              label="Versioning"
              checked={data.versioning ?? false}
              onChange={(v) => upd('versioning', v)}
            />
          )}

          {service === 'eventbridge' && (
            <ToggleField
              label="Schema Discovery"
              checked={data.schemaDiscovery ?? false}
              onChange={(v) => upd('schemaDiscovery', v)}
            />
          )}
        </>}

      </div>
    </div>
  );
}
