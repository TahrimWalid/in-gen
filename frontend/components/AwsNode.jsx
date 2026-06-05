import React from 'react';
import { Handle, Position } from 'reactflow';
import { useStore } from '../app/store';
import {
  Zap, Globe, Database, HardDrive,
  Activity, Layers, MessageSquare, ShieldCheck,
} from 'lucide-react';

const serviceConfig = {
  apiGateway: { icon: Globe,        color: 'text-purple-600', bg: 'bg-purple-100', border: 'border-purple-300' },
  lambda:     { icon: Zap,          color: 'text-orange-500', bg: 'bg-orange-100', border: 'border-orange-300' },
  dynamodb:   { icon: Database,     color: 'text-blue-600',   bg: 'bg-blue-100',   border: 'border-blue-300'   },
  s3:         { icon: HardDrive,    color: 'text-green-600',  bg: 'bg-green-100',  border: 'border-green-300'  },
  eventbridge:{ icon: Activity,     color: 'text-pink-600',   bg: 'bg-pink-100',   border: 'border-pink-300'   },
  sqs:        { icon: Layers,       color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-300' },
  sns:        { icon: MessageSquare,color: 'text-rose-500',   bg: 'bg-rose-100',   border: 'border-rose-300'   },
  cognito:    { icon: ShieldCheck,  color: 'text-red-500',    bg: 'bg-red-100',    border: 'border-red-300'    },
};

export default function AwsNode({ id, data, selected }) {
  const allIssues = useStore(state => state.issues);
  const nodeIssues = allIssues.filter(issue => issue.nodeId === id);

  const hasErrors   = nodeIssues.some(i => i.severity === 'error');
  const hasWarnings = nodeIssues.some(i => i.severity === 'warning');

  const config = serviceConfig[data.service] || {
    icon: Database, color: 'text-muted', bg: 'bg-surface-alt', border: 'border-border',
  };
  const Icon = config.icon;

  return (
    <div className={`relative flex items-center min-w-[180px] bg-surface border-2 rounded-lg transition-all duration-200 ${
      selected
        ? 'border-blue-500 shadow-md ring-4 ring-blue-50'
        : `${config.border} shadow-sm hover:shadow-md`
    }`}>

      {nodeIssues.length > 0 && (
        <div className="absolute -top-2.5 -right-2.5 z-10">
          {hasErrors ? (
            <div
              className="w-5 h-5 bg-red-500 text-white rounded-full flex items-center justify-center text-xs font-bold leading-none shadow-sm animate-badge-pulse"
              title="This node has critical errors. Check the Issues Panel."
            >
              !
            </div>
          ) : (
            <div
              className="w-5 h-5 bg-amber-500 text-white rounded-full flex items-center justify-center text-xs font-bold leading-none shadow-sm"
              title="This node has warnings. Check the Issues Panel."
            >
              !
            </div>
          )}
        </div>
      )}

      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-muted" />

      <div className={`p-3 rounded-l-md ${config.bg} flex items-center justify-center border-r border-border`}>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>

      <div className="p-3 text-sm font-semibold text-primary tracking-wide">
        {data.label}
      </div>

      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-muted" />
    </div>
  );
}
