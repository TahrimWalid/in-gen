'use client';

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background, BackgroundVariant, ControlButton, getNodesBounds, getViewportForBounds } from 'reactflow';
import { toPng } from 'html-to-image';
import { useStore } from '../app/store';
import AwsNode from './AwsNode';
import AwsEdge from './AwsEdge';
import IssuesPanel from './IssuesPanel';
import PropertiesPanel from './PropertiesPanel';
import NodePropertiesPanel from './NodePropertiesPanel';
import ExportModal from './ExportModal';
import TemplatesModal from './TemplatesModal';
import WorkspaceTabBar from './WorkspaceTabBar';
import { Undo2, Redo2, Code2, Trash2, Sparkles, Network, Share2, LayoutTemplate } from 'lucide-react';
import { useTheme } from '../app/useTheme';
import 'reactflow/dist/style.css';

const getId = () => crypto.randomUUID();

async function encodeState(nodes, edges) {
  const bytes = new TextEncoder().encode(JSON.stringify({ nodes, edges }));
  const cs = new CompressionStream('deflate-raw');
  const writer = cs.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(cs.readable).arrayBuffer();
  let str = '';
  new Uint8Array(buf).forEach(b => (str += String.fromCharCode(b)));
  return btoa(str).replace(/\+/g, '-').replace(/\//g, '_').replace(/=/g, '');
}

async function decodeState(param) {
  const binary = atob(param.replace(/-/g, '+').replace(/_/g, '/'));
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  const ds = new DecompressionStream('deflate-raw');
  const writer = ds.writable.getWriter();
  writer.write(bytes);
  writer.close();
  const buf = await new Response(ds.readable).arrayBuffer();
  return JSON.parse(new TextDecoder().decode(buf));
}

export default function Canvas({ onToggleChat, isChatOpen }) {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [shareStatus, setShareStatus] = useState('idle');
  const [isExportingPng, setIsExportingPng] = useState(false);
  const { theme } = useTheme();

  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    addNode, takeSnapshot, undo, redo, past, future,
    setSelectedElement, clearCanvas,
    pendingFitView, clearPendingFitView,
    loadWorkspaces, loadFromSharedUrl,
  } = useStore();

  const nodeTypes = useMemo(() => ({ awsNode: AwsNode }), []);
  const edgeTypes = useMemo(() => ({ awsEdge: AwsEdge }), []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        event.shiftKey ? redo() : undo();
      } else if ((event.ctrlKey || event.metaKey) && event.key === 'y') {
        redo();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [undo, redo]);

  useEffect(() => {
    const param = new URLSearchParams(window.location.search).get('d');
    if (param) {
      decodeState(param)
        .then(({ nodes, edges }) => {
          loadFromSharedUrl(nodes, edges);
          history.replaceState(null, '', window.location.pathname);
        })
        .catch(() => loadWorkspaces());
    } else {
      loadWorkspaces();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingFitView && reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50);
      clearPendingFitView();
    }
  }, [pendingFitView, reactFlowInstance, clearPendingFitView]);

  const onNodeDragStart = useCallback(() => { takeSnapshot(); }, [takeSnapshot]);

  const onSelectionChange = useCallback(({ nodes, edges }) => {
    if (nodes.length > 0) {
      setSelectedElement({ ...nodes[0], elementType: 'node' });
    } else if (edges.length > 0) {
      setSelectedElement({ ...edges[0], elementType: 'edge' });
    } else {
      setSelectedElement(null);
    }
  }, [setSelectedElement]);

  const onDragOver = useCallback((event) => {
    event.preventDefault();
    event.dataTransfer.dropEffect = 'move';
  }, []);

  const onDrop = useCallback((event) => {
    event.preventDefault();
    const service = event.dataTransfer.getData('application/reactflow/service');
    const label = event.dataTransfer.getData('application/reactflow/label');
    if (!service) return;

    const position = reactFlowInstance.screenToFlowPosition({
      x: event.clientX,
      y: event.clientY,
    });
    addNode({ id: getId(), type: 'awsNode', position, data: { service, label } });
  }, [reactFlowInstance, addNode]);

  const handleShare = useCallback(async () => {
    if (nodes.length === 0) return;
    try {
      const encoded = await encodeState(nodes, edges);
      const url = `${window.location.origin}${window.location.pathname}?d=${encoded}`;
      if (url.length > 8000) {
        setShareStatus('toolarge');
        setTimeout(() => setShareStatus('idle'), 3000);
        return;
      }
      await navigator.clipboard.writeText(url);
      setShareStatus('copied');
      setTimeout(() => setShareStatus('idle'), 2000);
    } catch {
      setShareStatus('idle');
    }
  }, [nodes, edges]);

  const handleExportPng = useCallback(async () => {
    if (nodes.length === 0) return;
    setIsExportingPng(true);
    try {
      const bounds = getNodesBounds(nodes);
      const padding = 40;
      const imageWidth = Math.max(640, bounds.width + padding * 2);
      const imageHeight = Math.max(480, bounds.height + padding * 2);
      const { x, y, zoom } = getViewportForBounds(bounds, imageWidth, imageHeight, 0.5, 2);
      const viewport = document.querySelector('.react-flow__viewport');
      if (!viewport) return;
      const dataUrl = await toPng(viewport, {
        backgroundColor: theme === 'dark' ? '#0f1117' : '#ffffff',
        width: imageWidth,
        height: imageHeight,
        style: {
          width: `${imageWidth}px`,
          height: `${imageHeight}px`,
          transform: `translate(${x}px, ${y}px) scale(${zoom})`,
        },
      });
      const a = document.createElement('a');
      a.href = dataUrl;
      a.download = 'ingen-diagram.png';
      a.click();
    } finally {
      setIsExportingPng(false);
    }
  }, [nodes, theme]);

  return (
    <div className="w-full h-full flex flex-col" style={{ background: 'var(--canvas-bg)' }}>

      {/* Top header bar */}
      <div className="shrink-0 h-12 bg-surface border-b border-border px-3 flex items-center gap-2 z-20">
        <WorkspaceTabBar />

        <div className="flex-1 min-w-0" />

        {/* Right-side actions */}
        <button
          onClick={handleShare}
          disabled={nodes.length === 0}
          title={
            shareStatus === 'toolarge'
              ? 'Diagram too large to share via URL.'
              : 'Copy shareable link to clipboard'
          }
          className={`h-8 border px-3 rounded-md text-xs font-bold transition-all flex items-center gap-1.5 disabled:opacity-40 shrink-0 ${
            shareStatus === 'copied'
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : shareStatus === 'toolarge'
              ? 'bg-amber-500 border-amber-500 text-white'
              : 'bg-surface border-border text-secondary hover:bg-surface-hover'
          }`}
        >
          <Share2 className="w-3.5 h-3.5" />
          {shareStatus === 'copied' ? 'Copied!' : shareStatus === 'toolarge' ? 'Too large' : 'Share'}
        </button>

        <button
          onClick={() => setIsTemplatesOpen(true)}
          className="h-8 bg-surface border border-border text-secondary px-3 rounded-md hover:bg-surface-hover text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
          title="Browse architecture templates"
        >
          <LayoutTemplate className="w-3.5 h-3.5" />
          Templates
        </button>

        <button
          onClick={clearCanvas}
          className="h-8 border border-red-500 text-red-600 px-3 rounded-md hover:bg-red-500/10 text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
          title="Clear entire canvas"
        >
          <Trash2 className="w-3.5 h-3.5" />
          Clear
        </button>

        <button
          onClick={() => setIsExportOpen(true)}
          className="h-8 bg-purple-600 text-white px-3 rounded-md shadow-md hover:bg-purple-500 text-xs font-bold transition-all flex items-center gap-1.5 shrink-0"
        >
          <Code2 className="w-3.5 h-3.5" />
          Export Terraform
        </button>
      </div>

      {/* Canvas body */}
      <div className="flex-1 relative min-h-0" ref={reactFlowWrapper}>

        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center z-[5] pointer-events-none">
            <div className="flex flex-col items-center gap-4 text-center pointer-events-auto">
              <Network className="w-16 h-16 text-muted opacity-30" />
              <div>
                <h2 className="text-primary font-bold text-xl mb-2">Start building your architecture</h2>
                <p className="text-muted text-sm">Drag AWS components from the left sidebar, or start from a template.</p>
              </div>
              <div className="flex items-center gap-3">
                <button
                  onClick={() => setIsTemplatesOpen(true)}
                  className="px-4 py-2 bg-purple-600 text-white rounded-md font-semibold text-sm hover:bg-purple-500 transition-colors"
                >
                  Browse Templates
                </button>
                <span className="text-muted text-sm">← Drop a component to begin</span>
              </div>
            </div>
          </div>
        )}

        {/* Persistent AI Architect tab on canvas right edge */}
        <button
          onClick={onToggleChat}
          title="AI Architect (Ctrl+Shift+A)"
          className={`absolute right-0 top-1/2 -translate-y-1/2 z-20 flex flex-col items-center gap-1.5 py-4 px-1.5 rounded-l-lg shadow-lg text-white transition-colors ${
            isChatOpen ? 'bg-purple-500' : 'bg-purple-600 hover:bg-purple-500'
          }`}
        >
          <Sparkles className="w-3.5 h-3.5" />
          <span
            className="text-xs font-bold tracking-wider"
            style={{ writingMode: 'vertical-rl', transform: 'rotate(180deg)' }}
          >
            AI Architect
          </span>
        </button>

        <IssuesPanel />
        <PropertiesPanel />
        <NodePropertiesPanel />
        <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} onExportPng={handleExportPng} isExportingPng={isExportingPng} />
        <TemplatesModal isOpen={isTemplatesOpen} onClose={() => setIsTemplatesOpen(false)} />

        <ReactFlow
          nodes={nodes}
          edges={edges}
          nodeTypes={nodeTypes}
          edgeTypes={edgeTypes}
          onNodesChange={onNodesChange}
          onEdgesChange={onEdgesChange}
          onConnect={onConnect}
          onInit={setReactFlowInstance}
          onDrop={onDrop}
          onDragOver={onDragOver}
          onNodeDragStart={onNodeDragStart}
          onSelectionChange={onSelectionChange}
          deleteKeyCode={['Backspace', 'Delete']}
          fitView
        >
          <Controls>
            <ControlButton onClick={undo} disabled={past.length === 0} title="Undo (Ctrl+Z)">
              <Undo2 className="w-4 h-4 text-secondary" />
            </ControlButton>
            <ControlButton onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)">
              <Redo2 className="w-4 h-4 text-secondary" />
            </ControlButton>
          </Controls>
          <MiniMap />
          <Background
            variant={BackgroundVariant.Dots}
            gap={16}
            size={1}
            color={theme === 'dark' ? '#374151' : '#cbd5e1'}
          />
        </ReactFlow>
      </div>
    </div>
  );
}
