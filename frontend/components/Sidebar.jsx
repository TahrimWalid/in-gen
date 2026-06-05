'use client';

import React from 'react';
import {
  Zap, Globe, Database, HardDrive,
  Activity, Layers, MessageSquare, ShieldCheck
} from 'lucide-react';

export default function Sidebar() {
  const onDragStart = (event, serviceKey, label) => {
    event.dataTransfer.setData('application/reactflow/service', serviceKey);
    event.dataTransfer.setData('application/reactflow/label', label);
    event.effectAllowed = 'move';
  };

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

  return (
    <aside className="w-64 bg-surface border-r border-border p-4 flex flex-col gap-3 shadow-sm z-10">
      <div className="px-1 mb-1 flex items-center justify-between">
        <h2 className="font-bold text-primary text-sm">AWS Components</h2>
        <span className="text-xs bg-surface-hover text-muted border border-border px-2 py-0.5 rounded-full font-medium">
          {awsNodes.length}
        </span>
      </div>
      <div className="h-px bg-border mb-1" />

      {awsNodes.map((node) => {
        const Icon = node.icon;
        return (
          <div
            key={node.key}
            className={`flex items-center gap-3 p-3 border border-border border-l-2 border-l-transparent rounded-md cursor-grab active:cursor-grabbing bg-surface-alt hover:bg-surface-hover transition-colors ${node.hoverBorder}`}
            onDragStart={(event) => onDragStart(event, node.key, node.label)}
            draggable
          >
            <Icon className={`w-5 h-5 ${node.color}`} />
            <span className="text-sm font-medium text-secondary">{node.label}</span>
          </div>
        );
      })}
    </aside>
  );
}
