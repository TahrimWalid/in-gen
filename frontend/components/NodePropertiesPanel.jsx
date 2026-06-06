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

function Field({ label, hint, children }) {
  return (
    <div className="flex flex-col gap-1">
      <label className="text-xs font-bold text-muted uppercase">{label}</label>
      {children}
      {hint && <p className="text-xs text-amber-500 mt-0.5">{hint}</p>}
    </div>
  );
}

function ToggleField({ label, checked, onChange }) {
  return (
    <div className="flex items-center justify-between py-0.5">
      <span className="text-xs font-bold text-muted uppercase">{label}</span>
      <Toggle checked={checked} onChange={onChange} />
    </div>
  );
}

const inputCls =
  'w-full px-3 py-2 border border-border-input rounded-md text-sm text-input-text bg-input-bg focus:outline-none focus:ring-2 focus:ring-blue-500';

export default function NodePropertiesPanel() {
  const { selectedElement, setSelectedElement, updateNodeData } = useStore();

  if (!selectedElement || selectedElement.elementType !== 'node') return null;

  const { id, data } = selectedElement;
  const service = data?.service;

  const upd = (field, value) => updateNodeData(id, { [field]: value });

  return (
    <div className="absolute bottom-6 right-4 w-80 bg-surface border border-border rounded-lg shadow-xl z-20 flex flex-col max-h-[560px] overflow-hidden">
      <div className="bg-surface-alt border-b border-border px-4 py-3 flex justify-between items-center shrink-0">
        <h3 className="font-bold text-primary flex items-center gap-2">
          <Settings className="w-4 h-4 text-muted" />
          Node Properties
        </h3>
        <button onClick={() => setSelectedElement(null)} className="text-muted hover:text-primary">
          <X className="w-5 h-5" />
        </button>
      </div>

      <div className="p-4 flex flex-col gap-4 overflow-y-auto">
        {/* Label — all services */}
        <Field label="Resource Label">
          <input
            type="text"
            value={data.label || ''}
            onChange={(e) => upd('label', e.target.value)}
            className={inputCls}
          />
        </Field>

        {/* ── Lambda ─────────────────────────────────── */}
        {service === 'lambda' && <>
          <Field label="Runtime">
            <select value={data.runtime ?? 'nodejs20.x'} onChange={(e) => upd('runtime', e.target.value)} className={inputCls}>
              <option value="nodejs20.x">Node.js 20.x</option>
              <option value="nodejs18.x">Node.js 18.x</option>
              <option value="nodejs16.x">Node.js 16.x (EOL)</option>
              <option value="python3.12">Python 3.12</option>
              <option value="python3.11">Python 3.11</option>
              <option value="python3.10">Python 3.10</option>
              <option value="python3.9">Python 3.9 (EOL)</option>
              <option value="java21">Java 21</option>
              <option value="java17">Java 17</option>
              <option value="java11">Java 11</option>
              <option value="dotnet8">.NET 8</option>
              <option value="ruby3.3">Ruby 3.3</option>
            </select>
          </Field>
          <Field label="Architecture">
            <select value={data.architecture ?? 'x86_64'} onChange={(e) => upd('architecture', e.target.value)} className={inputCls}>
              <option value="x86_64">x86_64</option>
              <option value="arm64">arm64 (Graviton2)</option>
            </select>
          </Field>
          <Field
            label="Timeout (seconds)"
            hint={(data.timeout === 3 || data.timeout === undefined) ? 'AWS default — likely too short for production' : undefined}
          >
            <input type="number" min={1} max={900} value={data.timeout ?? 3} onChange={(e) => upd('timeout', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Memory Size">
            <select value={data.memorySize ?? 128} onChange={(e) => upd('memorySize', Number(e.target.value))} className={inputCls}>
              {[128, 256, 512, 1024, 2048, 3008].map(mb => <option key={mb} value={mb}>{mb} MB</option>)}
            </select>
          </Field>
          <Field
            label="Reserved Concurrency"
            hint={data.reservedConcurrency === -1 ? 'Unreserved — shares account concurrency pool' : undefined}
          >
            <input type="number" min={-1} value={data.reservedConcurrency ?? -1} onChange={(e) => upd('reservedConcurrency', Number(e.target.value))} className={inputCls} />
          </Field>
          <ToggleField label="Dead Letter Queue" checked={data.hasDeadLetterQueue ?? false} onChange={(v) => upd('hasDeadLetterQueue', v)} />
          <ToggleField label="VPC Enabled" checked={data.vpcEnabled ?? false} onChange={(v) => upd('vpcEnabled', v)} />
        </>}

        {/* ── API Gateway ────────────────────────────── */}
        {service === 'apiGateway' && <>
          <Field label="API Type">
            <select value={data.apiType ?? 'REST'} onChange={(e) => upd('apiType', e.target.value)} className={inputCls}>
              <option value="REST">REST</option>
              <option value="HTTP">HTTP</option>
              <option value="WebSocket">WebSocket</option>
            </select>
          </Field>
          <Field label="Stage Name">
            <input type="text" value={data.stageName ?? 'prod'} onChange={(e) => upd('stageName', e.target.value)} className={inputCls} />
          </Field>
          <Field label="Rate Limit (req/s)">
            <input type="number" min={0} value={data.rateLimit ?? 0} onChange={(e) => upd('rateLimit', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Burst Limit">
            <input type="number" min={0} value={data.burstLimit ?? 0} onChange={(e) => upd('burstLimit', Number(e.target.value))} className={inputCls} />
          </Field>
          <ToggleField label="Cache Enabled" checked={data.cacheEnabled ?? false} onChange={(v) => upd('cacheEnabled', v)} />
          {data.cacheEnabled && (
            <Field label="Cache TTL (seconds)">
              <input type="number" min={0} max={3600} value={data.cacheTtl ?? 300} onChange={(e) => upd('cacheTtl', Number(e.target.value))} className={inputCls} />
            </Field>
          )}
          <ToggleField label="Throttling Enabled" checked={data.throttlingEnabled ?? true} onChange={(v) => upd('throttlingEnabled', v)} />
          <ToggleField label="WAF Enabled" checked={data.wafEnabled ?? false} onChange={(v) => upd('wafEnabled', v)} />
          <ToggleField label="CORS Enabled" checked={data.corsEnabled ?? false} onChange={(v) => upd('corsEnabled', v)} />
          {data.corsEnabled && (
            <Field
              label="CORS Origin"
              hint={data.corsOrigin === '*' ? 'Wildcard origin — consider restricting in production' : undefined}
            >
              <input type="text" value={data.corsOrigin ?? '*'} onChange={(e) => upd('corsOrigin', e.target.value)} className={inputCls} />
            </Field>
          )}
          <ToggleField label="Logging Enabled" checked={data.loggingEnabled ?? false} onChange={(v) => upd('loggingEnabled', v)} />
        </>}

        {/* ── DynamoDB ───────────────────────────────── */}
        {service === 'dynamodb' && <>
          <Field label="Billing Mode">
            <select value={data.billingMode ?? 'PAY_PER_REQUEST'} onChange={(e) => upd('billingMode', e.target.value)} className={inputCls}>
              <option value="PAY_PER_REQUEST">On-Demand (PAY_PER_REQUEST)</option>
              <option value="PROVISIONED">Provisioned</option>
            </select>
          </Field>
          {data.billingMode === 'PROVISIONED' && <>
            <Field label="Read Capacity (RCU)">
              <input type="number" min={1} value={data.readCapacity ?? 5} onChange={(e) => upd('readCapacity', Number(e.target.value))} className={inputCls} />
            </Field>
            <Field label="Write Capacity (WCU)">
              <input type="number" min={1} value={data.writeCapacity ?? 5} onChange={(e) => upd('writeCapacity', Number(e.target.value))} className={inputCls} />
            </Field>
          </>}
          <ToggleField label="TTL Enabled" checked={data.ttlEnabled ?? false} onChange={(v) => upd('ttlEnabled', v)} />
          <ToggleField label="Encryption" checked={data.encryption ?? true} onChange={(v) => upd('encryption', v)} />
          <ToggleField label="Point-in-Time Recovery" checked={data.pointInTimeRecovery ?? true} onChange={(v) => upd('pointInTimeRecovery', v)} />
          <ToggleField label="Streams Enabled" checked={data.streamsEnabled ?? false} onChange={(v) => upd('streamsEnabled', v)} />
          {data.streamsEnabled && (
            <Field label="Stream View Type">
              <select value={data.streamViewType ?? 'NEW_AND_OLD_IMAGES'} onChange={(e) => upd('streamViewType', e.target.value)} className={inputCls}>
                <option value="NEW_AND_OLD_IMAGES">NEW_AND_OLD_IMAGES</option>
                <option value="NEW_IMAGE">NEW_IMAGE</option>
                <option value="OLD_IMAGE">OLD_IMAGE</option>
                <option value="KEYS_ONLY">KEYS_ONLY</option>
              </select>
            </Field>
          )}
          <ToggleField label="Global Table" checked={data.globalTable ?? false} onChange={(v) => upd('globalTable', v)} />
        </>}

        {/* ── S3 ────────────────────────────────────── */}
        {service === 's3' && <>
          <ToggleField label="Static Website Hosting" checked={data.staticWebsiteHosting ?? false} onChange={(v) => upd('staticWebsiteHosting', v)} />
          <ToggleField label="Lifecycle Rules" checked={data.lifecycleEnabled ?? false} onChange={(v) => upd('lifecycleEnabled', v)} />
          <ToggleField label="Replication" checked={data.replicationEnabled ?? false} onChange={(v) => upd('replicationEnabled', v)} />
          <ToggleField label="Block Public Access" checked={data.blockPublicAccess ?? true} onChange={(v) => upd('blockPublicAccess', v)} />
          <Field label="Encryption Type">
            <select value={data.encryptionType ?? 'SSE-S3'} onChange={(e) => upd('encryptionType', e.target.value)} className={inputCls}>
              <option value="SSE-S3">SSE-S3</option>
              <option value="SSE-KMS">SSE-KMS</option>
              <option value="None">None</option>
            </select>
          </Field>
          <ToggleField label="Object Lock" checked={data.objectLock ?? false} onChange={(v) => upd('objectLock', v)} />
          <ToggleField label="Access Logging" checked={data.accessLogging ?? false} onChange={(v) => upd('accessLogging', v)} />
          <ToggleField label="Versioning" checked={data.versioning ?? false} onChange={(v) => upd('versioning', v)} />
        </>}

        {/* ── SQS ───────────────────────────────────── */}
        {service === 'sqs' && <>
          <ToggleField label="FIFO Queue" checked={data.isFifo ?? false} onChange={(v) => upd('isFifo', v)} />
          <Field label="Visibility Timeout (seconds)">
            <input type="number" min={0} max={43200} value={data.visibilityTimeout ?? 30} onChange={(e) => upd('visibilityTimeout', Number(e.target.value))} className={inputCls} />
            <p className="text-xs text-muted mt-1">Should be ≥ 6× your Lambda consumer timeout</p>
          </Field>
          <Field label="Message Retention">
            <select value={data.messageRetentionSeconds ?? 345600} onChange={(e) => upd('messageRetentionSeconds', Number(e.target.value))} className={inputCls}>
              <option value={60}>1 minute</option>
              <option value={3600}>1 hour</option>
              <option value={86400}>1 day</option>
              <option value={345600}>4 days</option>
              <option value={604800}>7 days</option>
              <option value={1209600}>14 days (max)</option>
            </select>
          </Field>
          <Field label="Delivery Delay (seconds)">
            <input type="number" min={0} max={900} value={data.deliveryDelaySeconds ?? 0} onChange={(e) => upd('deliveryDelaySeconds', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Max Message Size (bytes)">
            <input type="number" min={1024} max={262144} value={data.maxMessageSize ?? 262144} onChange={(e) => upd('maxMessageSize', Number(e.target.value))} className={inputCls} />
          </Field>
          <ToggleField label="Encryption" checked={data.sqsEncryption ?? false} onChange={(v) => upd('sqsEncryption', v)} />
          <ToggleField label="Dead Letter Queue" checked={data.dlqEnabled ?? false} onChange={(v) => upd('dlqEnabled', v)} />
          {data.dlqEnabled && (
            <Field label="Max Receive Count">
              <input type="number" min={1} max={1000} value={data.maxReceiveCount ?? 3} onChange={(e) => upd('maxReceiveCount', Number(e.target.value))} className={inputCls} />
            </Field>
          )}
        </>}

        {/* ── SNS ───────────────────────────────────── */}
        {service === 'sns' && <>
          <Field label="Topic Type">
            <select value={data.topicType ?? 'Standard'} onChange={(e) => upd('topicType', e.target.value)} className={inputCls}>
              <option value="Standard">Standard</option>
              <option value="FIFO">FIFO</option>
            </select>
          </Field>
          <ToggleField label="Delivery Retry" checked={data.deliveryRetryEnabled ?? true} onChange={(v) => upd('deliveryRetryEnabled', v)} />
          <ToggleField label="Encryption" checked={data.snsEncryption ?? false} onChange={(v) => upd('snsEncryption', v)} />
          <Field label="Access Policy">
            <select value={data.accessPolicy ?? 'Restricted'} onChange={(e) => upd('accessPolicy', e.target.value)} className={inputCls}>
              <option value="Restricted">Restricted</option>
              <option value="Open">Open</option>
            </select>
          </Field>
          <ToggleField label="Filter Policy" checked={data.filterPolicyEnabled ?? false} onChange={(v) => upd('filterPolicyEnabled', v)} />
        </>}

        {/* ── EventBridge ───────────────────────────── */}
        {service === 'eventbridge' && <>
          <ToggleField label="Custom Bus" checked={data.isCustomBus ?? false} onChange={(v) => upd('isCustomBus', v)} />
          <ToggleField label="Archive Enabled" checked={data.archiveEnabled ?? false} onChange={(v) => upd('archiveEnabled', v)} />
          {data.archiveEnabled && (
            <Field label="Archive Retention (days)">
              <input type="number" min={1} value={data.archiveRetentionDays ?? 7} onChange={(e) => upd('archiveRetentionDays', Number(e.target.value))} className={inputCls} />
            </Field>
          )}
          <ToggleField label="Schema Discovery" checked={data.schemaDiscovery ?? false} onChange={(v) => upd('schemaDiscovery', v)} />
        </>}

        {/* ── Cognito ───────────────────────────────── */}
        {service === 'cognito' && <>
          <Field label="MFA Mode">
            <select value={data.mfaMode ?? 'OFF'} onChange={(e) => upd('mfaMode', e.target.value)} className={inputCls}>
              <option value="OFF">OFF</option>
              <option value="OPTIONAL">OPTIONAL</option>
              <option value="REQUIRED">REQUIRED</option>
            </select>
          </Field>
          <Field label="Account Recovery">
            <select value={data.accountRecovery ?? 'PHONE_WITHOUT_MFA'} onChange={(e) => upd('accountRecovery', e.target.value)} className={inputCls}>
              <option value="PHONE_WITHOUT_MFA">Phone (without MFA)</option>
              <option value="EMAIL_ONLY">Email only</option>
              <option value="PHONE_AND_EMAIL">Phone and Email</option>
            </select>
          </Field>
          <Field label="Access Token Validity (hours)">
            <input type="number" min={1} max={24} value={data.accessTokenValidityHours ?? 1} onChange={(e) => upd('accessTokenValidityHours', Number(e.target.value))} className={inputCls} />
          </Field>
          <Field label="Refresh Token Validity (days)">
            <input type="number" min={1} max={3650} value={data.refreshTokenValidityDays ?? 30} onChange={(e) => upd('refreshTokenValidityDays', Number(e.target.value))} className={inputCls} />
          </Field>
          <ToggleField label="Advanced Security" checked={data.advancedSecurity ?? false} onChange={(v) => upd('advancedSecurity', v)} />
          <Field
            label="Min Password Length"
            hint={(data.passwordMinLength ?? 8) < 8 ? 'Below minimum recommended length' : undefined}
          >
            <input type="number" min={6} max={99} value={data.passwordMinLength ?? 8} onChange={(e) => upd('passwordMinLength', Number(e.target.value))} className={inputCls} />
          </Field>
          <ToggleField label="Require Uppercase" checked={data.passwordRequireUppercase ?? true} onChange={(v) => upd('passwordRequireUppercase', v)} />
          <ToggleField label="Require Lowercase" checked={data.passwordRequireLowercase ?? true} onChange={(v) => upd('passwordRequireLowercase', v)} />
          <ToggleField label="Require Numbers" checked={data.passwordRequireNumbers ?? true} onChange={(v) => upd('passwordRequireNumbers', v)} />
          <ToggleField label="Require Symbols" checked={data.passwordRequireSymbols ?? false} onChange={(v) => upd('passwordRequireSymbols', v)} />
        </>}
      </div>
    </div>
  );
}
