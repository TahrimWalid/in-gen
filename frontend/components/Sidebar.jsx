'use client';

import React from 'react';
import {
  Zap, Globe, Database, HardDrive,
  Activity, Layers, MessageSquare, ShieldCheck,
  ChevronLeft, ChevronRight
} from 'lucide-react';

const awsNodes = [
  { key: 'apiGateway',  label: 'API Gateway',    icon: Globe,         color: 'text-purple-600', hoverBorder: 'hover:border-l-purple-600' },
  { key: 'lambda',      label: 'Lambda Function', icon: Zap,           color: 'text-orange-500', hoverBorder: 'hover:border-l-orange-500' },
  { key: 'dynamodb',    label: 'DynamoDB',        icon: Database,      color: 'text-blue-600',   hoverBorder: 'hover:border-l-blue-600'   },
  { key: 's3',          label: 'S3 Bucket',       icon: HardDrive,     color: 'text-green-600',  hoverBorder: 'hover:border-l-green-600'  },
  { key: 'eventbridge', label: 'EventBridge',     icon: Activity,      color: 'text-pink-600',   hoverBorder: 'hover:border-l-pink-600'   },
  { key: 'sqs',         label: 'SQS Queue',       icon: Layers,        color: 'text-yellow-600', hoverBorder: 'hover:border-l-yellow-600' },
  { key: 'sns',         label: 'SNS Topic',       icon: MessageSquare, color: 'text-rose-500',   hoverBorder: 'hover:border-l-rose-500'   },
  { key: 'cognito',     label: 'Cognito Auth',    icon: ShieldCheck,   color: 'text-red-500',    hoverBorder: 'hover:border-l-red-500'    },
];

export default function Sidebar({ collapsed, onToggle }) {
  const onDragStart = (event, serviceKey, label) => {
    event.dataTransfer.setData('application/reactflow/service', serviceKey);
    event.dataTransfer.setData('application/reactflow/label', label);
    event.effectAllowed = 'move';
  };

  if (collapsed) {
    return (
      <aside className="w-full h-full bg-surface border-r border-border flex flex-col items-center py-3 gap-1 overflow-hidden shadow-sm z-10">
        <button
          onClick={onToggle}
          title="Expand sidebar (Ctrl+B)"
          className="w-8 h-8 flex items-center justify-center rounded-md text-muted hover:text-primary hover:bg-surface-hover transition-colors mb-1"
        >
          <ChevronRight className="w-4 h-4" />
        </button>
        <div className="h-px w-8 bg-border mb-1" />
        {awsNodes.map((node) => {
          const Icon = node.icon;
          return (
            <div
              key={node.key}
              className={`w-9 h-9 flex items-center justify-center rounded-md border border-transparent hover:border-border hover:bg-surface-hover cursor-grab active:cursor-grabbing transition-colors ${node.color}`}
              title={node.label}
              onDragStart={(e) => onDragStart(e, node.key, node.label)}
              draggable
            >
              <Icon className="w-5 h-5" />
            </div>
          );
        })}
      </aside>
    );
  }

  return (
    <aside className="w-full h-full bg-surface border-r border-border flex flex-col overflow-hidden shadow-sm z-10">
      <div className="px-4 pt-4 pb-0 flex items-center justify-between">
        <h2 className="font-bold text-primary text-sm">AWS Components</h2>
        <div className="flex items-center gap-1.5">
          <span className="text-xs bg-surface-hover text-muted border border-border px-2 py-0.5 rounded-full font-medium">
            {awsNodes.length}
          </span>
          <button
            onClick={onToggle}
            title="Collapse sidebar (Ctrl+B)"
            className="w-6 h-6 flex items-center justify-center rounded-md text-muted hover:text-primary hover:bg-surface-hover transition-colors"
          >
            <ChevronLeft className="w-4 h-4" />
          </button>
        </div>
      </div>
      <div className="h-px bg-border mx-4 my-3" />
      <div className="flex flex-col gap-2 px-4 overflow-y-auto pb-4">
        {awsNodes.map((node) => {
          const Icon = node.icon;
          return (
            <div
              key={node.key}
              className={`flex items-center gap-3 p-3 border border-border border-l-2 border-l-transparent rounded-md cursor-grab active:cursor-grabbing bg-surface-alt hover:bg-surface-hover transition-colors ${node.hoverBorder}`}
              onDragStart={(e) => onDragStart(e, node.key, node.label)}
              draggable
            >
              <Icon className={`w-5 h-5 shrink-0 ${node.color}`} />
              <span className="text-sm font-medium text-secondary truncate">{node.label}</span>
            </div>
          );
        })}
      </div>
    </aside>
  );
}
