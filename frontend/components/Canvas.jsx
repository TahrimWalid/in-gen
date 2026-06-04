'use client';

import React, { useRef, useState, useCallback, useMemo, useEffect } from 'react';
import ReactFlow, { MiniMap, Controls, Background, BackgroundVariant, ControlButton } from 'reactflow';
import { useStore } from '../app/store';
import AwsNode from './AwsNode';
import AwsEdge from './AwsEdge';
import IssuesPanel from './IssuesPanel';
import PropertiesPanel from './PropertiesPanel';
import ExportModal from './ExportModal';
import { Undo2, Redo2, Code2 } from 'lucide-react';
import 'reactflow/dist/style.css';

let id = 3;
const getId = () => `dndnode_${id++}`;

export default function Canvas() {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  
  // 👇 State to control our new compiler modal
  const [isExportOpen, setIsExportOpen] = useState(false);
  
  // Pull our history functions and selection handler from the store
  const { 
    nodes, edges, onNodesChange, onEdgesChange, onConnect, 
    addNode, takeSnapshot, undo, redo, past, future,
    setSelectedElement 
  } = useStore();

  const nodeTypes = useMemo(() => ({ awsNode: AwsNode }), []);
  const edgeTypes = useMemo(() => ({ awsEdge: AwsEdge }), []);

  // Keyboard Shortcuts Hook (Undo/Redo)
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

  // Snapshot before a node starts moving
  const onNodeDragStart = useCallback(() => {
    takeSnapshot();
  }, [takeSnapshot]);

  // Handle Selection of Nodes/Edges to show in the Properties Panel
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

  return (
    <div className="w-full h-full flex-1 relative" ref={reactFlowWrapper}>
      
      {/* 👇 The new Export Button replaces the old JSON logger */}
      <div className="absolute top-4 right-4 z-10 flex gap-2">
        <button 
          onClick={() => setIsExportOpen(true)}
          className="bg-purple-600 text-white px-4 py-2 rounded-md shadow-md hover:bg-purple-500 text-sm font-bold transition-all flex items-center gap-2"
        >
          <Code2 className="w-4 h-4" />
          Export Terraform
        </button>
      </div>

      <IssuesPanel />
      <PropertiesPanel />
      
      {/* 👇 Mount the Export Modal */}
      <ExportModal isOpen={isExportOpen} onClose={() => setIsExportOpen(false)} />

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
            <Undo2 className="w-4 h-4 text-slate-700" />
          </ControlButton>
          <ControlButton onClick={redo} disabled={future.length === 0} title="Redo (Ctrl+Y)">
            <Redo2 className="w-4 h-4 text-slate-700" />
          </ControlButton>
        </Controls>
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}