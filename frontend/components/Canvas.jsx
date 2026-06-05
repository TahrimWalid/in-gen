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
import ChatSidebar from './ChatSidebar';
import ExportModal from './ExportModal';
import TemplatesModal from './TemplatesModal';
import DiagramsPanel from './DiagramsPanel';
import { Undo2, Redo2, Code2, Trash2, Sparkles, Sun, Moon, LayoutTemplate, Network, FolderOpen, Share2 } from 'lucide-react';
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

export default function Canvas() {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  const [isExportOpen, setIsExportOpen] = useState(false);
  const [isChatOpen, setIsChatOpen] = useState(false);
  const [isTemplatesOpen, setIsTemplatesOpen] = useState(false);
  const [isDiagramsPanelOpen, setIsDiagramsPanelOpen] = useState(false);
  const [isEditingName, setIsEditingName] = useState(false);
  const [diagramNameInput, setDiagramNameInput] = useState('');
  const [shareStatus, setShareStatus] = useState('idle');
  const [isExportingPng, setIsExportingPng] = useState(false);
  const { theme, toggle: toggleTheme } = useTheme();

  const {
    nodes, edges, onNodesChange, onEdgesChange, onConnect,
    addNode, takeSnapshot, undo, redo, past, future,
    setSelectedElement, clearCanvas,
    pendingFitView, clearPendingFitView,
    diagramName, setDiagramName, saveStatus, initDiagrams,
    activeDiagramId, renameDiagram, loadFromSharedUrl,
  } = useStore();

  const nodeTypes = useMemo(() => ({ awsNode: AwsNode }), []);
  const edgeTypes = useMemo(() => ({ awsEdge: AwsEdge }), []);

  useEffect(() => {
    const handleKeyDown = (event) => {
      if ((event.ctrlKey || event.metaKey) && event.key === 'z') {
        if (event.shiftKey) {
          redo();
        } else {
          undo();
        }
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
        .catch(() => initDiagrams());
    } else {
      initDiagrams();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (pendingFitView && reactFlowInstance) {
      setTimeout(() => reactFlowInstance.fitView({ padding: 0.2 }), 50);
      clearPendingFitView();
    }
  }, [pendingFitView, reactFlowInstance, clearPendingFitView]);

  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

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

  const onDrop = useCallback(
    (event) => {
      event.preventDefault();
      const service = event.dataTransfer.getData('application/reactflow/service');
      const label = event.dataTransfer.getData('application/reactflow/label');
      if (!service) return;

      const position = reactFlowInstance.screenToFlowPosition({
        x: event.clientX,
        y: event.clientY,
      });

      const newNode = {
        id: getId(),
        type: 'awsNode',
        position,
        data: { service, label },
      };

      addNode(newNode);
    },
    [reactFlowInstance, addNode]
  );

  const handleNameSave = () => {
    setIsEditingName(false);
    const trimmed = diagramNameInput.trim() || 'Untitled Architecture';
    if (activeDiagramId) {
      renameDiagram(activeDiagramId, trimmed);
    } else {
      setDiagramName(trimmed);
    }
  };

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
    <div className="w-full h-full flex-1 relative" style={{ background: 'var(--canvas-bg)' }} ref={reactFlowWrapper}>
      
      {/* Diagram name + save indicator — top left */}
      <div className="absolute top-4 left-4 z-10 flex items-center gap-3">
        {isEditingName ? (
          <input
            type="text"
            value={diagramNameInput}
            onChange={(e) => setDiagramNameInput(e.target.value)}
            onBlur={handleNameSave}
            onKeyDown={(e) => { if (e.key === 'Enter') handleNameSave(); if (e.key === 'Escape') setIsEditingName(false); }}
            autoFocus
            className="bg-transparent border-b border-purple-500 text-primary font-semibold text-sm focus:outline-none min-w-[180px]"
          />
        ) : (
          <button
            onClick={() => { setDiagramNameInput(diagramName); setIsEditingName(true); }}
            className="text-primary font-semibold text-sm hover:text-purple-500 transition-colors max-w-[220px] truncate text-left"
            title="Click to rename"
          >
            {diagramName}
          </button>
        )}
        {saveStatus === 'saving' && <span className="text-xs text-muted">Saving...</span>}
        {saveStatus === 'saved' && <span className="text-xs text-emerald-500">Saved</span>}
      </div>

      {/* Top Right Action Buttons */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        {/* 👇 The new Clear Canvas Button */}
        <button
          onClick={toggleTheme}
          className="bg-surface border border-border text-secondary px-3 py-2 rounded-md shadow-sm hover:bg-surface-hover text-sm font-bold transition-all flex items-center gap-2"
          title={theme === 'dark' ? 'Switch to light mode' : 'Switch to dark mode'}
        >
          {theme === 'dark' ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
        </button>

        <button
          onClick={() => setIsDiagramsPanelOpen(o => !o)}
          className={`border px-3 py-2 rounded-md shadow-sm text-sm font-bold transition-all flex items-center gap-2 ${
            isDiagramsPanelOpen
              ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-500'
              : 'bg-surface border-border text-secondary hover:bg-surface-hover'
          }`}
          title="My saved diagrams"
        >
          <FolderOpen className="w-4 h-4" />
          My Diagrams
        </button>

        <button
          onClick={handleShare}
          disabled={nodes.length === 0}
          title={
            shareStatus === 'toolarge'
              ? 'Diagram too large to share via URL. Save it and share the diagram name instead.'
              : 'Copy shareable link to clipboard'
          }
          className={`border px-3 py-2 rounded-md shadow-sm text-sm font-bold transition-all flex items-center gap-2 disabled:opacity-40 ${
            shareStatus === 'copied'
              ? 'bg-emerald-600 border-emerald-600 text-white'
              : shareStatus === 'toolarge'
              ? 'bg-amber-500 border-amber-500 text-white'
              : 'bg-surface border-border text-secondary hover:bg-surface-hover'
          }`}
        >
          <Share2 className="w-4 h-4" />
          {shareStatus === 'copied' ? 'Link copied!' : shareStatus === 'toolarge' ? 'Too large' : 'Share'}
        </button>

        <button
          onClick={() => setIsTemplatesOpen(true)}
          className="bg-surface border border-border text-secondary px-3 py-2 rounded-md shadow-sm hover:bg-surface-hover text-sm font-bold transition-all flex items-center gap-2"
          title="Browse architecture templates"
        >
          <LayoutTemplate className="w-4 h-4" />
          Templates
        </button>

        <button
          onClick={clearCanvas}
          className="bg-surface border border-border text-red-600 px-3 py-2 rounded-md shadow-sm hover:bg-red-50 text-sm font-bold transition-all flex items-center gap-2"
          title="Clear entire canvas"
        >
          <Trash2 className="w-4 h-4" />
          Clear
        </button>

        <button
          onClick={() => setIsChatOpen(o => !o)}
          className={`border px-3 py-2 rounded-md shadow-sm text-sm font-bold transition-all flex items-center gap-2 ${
            isChatOpen
              ? 'bg-purple-600 border-purple-600 text-white hover:bg-purple-500'
              : 'bg-surface border-border text-secondary hover:bg-surface-hover'
          }`}
        >
          <Sparkles className="w-4 h-4" />
          AI Architect
        </button>

        <button
          onClick={() => setIsExportOpen(true)}
          className="bg-purple-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-purple-500 text-sm font-bold transition-all flex items-center gap-2"
        >
          <Code2 className="w-4 h-4" />
          Export Terraform
        </button>
      </div>

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

      <IssuesPanel />
      <PropertiesPanel />
      <NodePropertiesPanel />
      <ChatSidebar isOpen={isChatOpen} onClose={() => setIsChatOpen(false)} />
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} onExportPng={handleExportPng} isExportingPng={isExportingPng} />
      <TemplatesModal isOpen={isTemplatesOpen} onClose={() => setIsTemplatesOpen(false)} />
      <DiagramsPanel isOpen={isDiagramsPanelOpen} onClose={() => setIsDiagramsPanelOpen(false)} />

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
  );
}