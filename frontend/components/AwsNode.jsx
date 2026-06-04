import React from 'react';
import { Handle, Position } from 'reactflow';
import { useStore } from '../app/store'; 
import { 
  Zap, Globe, Database, HardDrive, 
  Activity, Layers, MessageSquare, ShieldCheck,
  AlertCircle, AlertTriangle 
} from 'lucide-react';

const serviceConfig = {
  apiGateway: { icon: Globe, color: 'text-purple-600', bg: 'bg-purple-100', border: 'border-purple-300' },
  lambda: { icon: Zap, color: 'text-orange-500', bg: 'bg-orange-100', border: 'border-orange-300' },
  dynamodb: { icon: Database, color: 'text-blue-600', bg: 'bg-blue-100', border: 'border-blue-300' },
  s3: { icon: HardDrive, color: 'text-green-600', bg: 'bg-green-100', border: 'border-green-300' },
  eventbridge: { icon: Activity, color: 'text-pink-600', bg: 'bg-pink-100', border: 'border-pink-300' },
  sqs: { icon: Layers, color: 'text-yellow-600', bg: 'bg-yellow-100', border: 'border-yellow-300' },
  sns: { icon: MessageSquare, color: 'text-rose-500', bg: 'bg-rose-100', border: 'border-rose-300' },
  cognito: { icon: ShieldCheck, color: 'text-red-500', bg: 'bg-red-100', border: 'border-red-300' }
};

export default function AwsNode({ id, data, selected }) {
  
  // 👇 THE FIX: Grab the array first, filter it second. No infinite loop!
  const allIssues = useStore(state => state.issues);
  const nodeIssues = allIssues.filter(issue => issue.nodeId === id);
  
  const hasErrors = nodeIssues.some(i => i.severity === 'error');
  const hasWarnings = nodeIssues.some(i => i.severity === 'warning');

  const config = serviceConfig[data.service] || { 
    icon: Database, color: 'text-slate-500', bg: 'bg-slate-100', border: 'border-slate-300' 
  };
  
  const Icon = config.icon;

  return (
    <div className={`relative flex items-center min-w-[180px] bg-white border-2 rounded-lg transition-all duration-200 ${
      selected ? 'border-blue-500 shadow-md ring-4 ring-blue-50' : `${config.border} shadow-sm hover:shadow-md`
    }`}>
      
      {/* THE VISUAL FEEDBACK BADGE */}
      {nodeIssues.length > 0 && (
        <div className="absolute -top-3 -right-3 z-10 flex shadow-sm rounded-full animate-bounce-short">
          {hasErrors ? (
            <div className="bg-red-100 p-1.5 rounded-full border border-red-300 text-red-600" title="This node has critical errors. Check the Issues Panel.">
              <AlertCircle className="w-4 h-4" />
            </div>
          ) : (
            <div className="bg-amber-100 p-1.5 rounded-full border border-amber-300 text-amber-600" title="This node has warnings. Check the Issues Panel.">
              <AlertTriangle className="w-4 h-4" />
            </div>
          )}
        </div>
      )}

      {/* Target Handle (Input) */}
      <Handle type="target" position={Position.Left} className="w-3 h-3 bg-slate-400" />
      
      {/* Icon Area */}
      <div className={`p-3 rounded-l-md ${config.bg} flex items-center justify-center border-r border-slate-100`}>
        <Icon className={`w-5 h-5 ${config.color}`} />
      </div>
      
      {/* Label Area */}
      <div className="p-3 text-sm font-semibold text-slate-800 tracking-wide">
        {data.label}
      </div>

      {/* Source Handle (Output) */}
      <Handle type="source" position={Position.Right} className="w-3 h-3 bg-slate-400" />
    </div>
  );
}