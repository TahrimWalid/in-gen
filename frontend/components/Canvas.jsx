'use client';

import React, { useRef, useState, useCallback, useMemo } from 'react';
import ReactFlow, { MiniMap, Controls, Background, BackgroundVariant } from 'reactflow';
import { useStore } from '../app/store';
import AwsNode from './AwsNode';
import AwsEdge from './AwsEdge'; // 👈 Import the edge
import 'reactflow/dist/style.css';

let id = 3;
const getId = () => `dndnode_${id++}`;

export default function Canvas() {
  const reactFlowWrapper = useRef(null);
  const [reactFlowInstance, setReactFlowInstance] = useState(null);
  
  const { nodes, edges, onNodesChange, onEdgesChange, onConnect, addNode } = useStore();

  // 👇 Register both our custom node AND custom edge
  const nodeTypes = useMemo(() => ({ awsNode: AwsNode }), []);
  const edgeTypes = useMemo(() => ({ awsEdge: AwsEdge }), []);

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

  // 👇 Our Phase 1 Exit Criteria: The JSON State Logger
  const logState = () => {
    const currentState = { nodes, edges };
    console.log("🔥 CURRENT ARCHITECTURE STATE 🔥");
    console.log(JSON.stringify(currentState, null, 2));
    alert("Check your browser console for the JSON state!");
  };

  return (
    <div className="w-full h-full flex-1 relative" ref={reactFlowWrapper}>
      {/* Floating Action Button */}
      <div className="absolute top-4 right-4 z-10">
        <button 
          onClick={logState}
          className="bg-slate-800 text-white px-4 py-2 rounded-md shadow-md hover:bg-slate-700 text-sm font-semibold transition-colors"
        >
          {'{ }'} Log JSON State
        </button>
      </div>

      <ReactFlow
        nodes={nodes}
        edges={edges}
        nodeTypes={nodeTypes}
        edgeTypes={edgeTypes} // 👈 Pass edgeTypes to ReactFlow
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        onInit={setReactFlowInstance}
        onDrop={onDrop}
        onDragOver={onDragOver}
        fitView
      >
        <Controls />
        <MiniMap />
        <Background variant={BackgroundVariant.Dots} gap={16} size={1} />
      </ReactFlow>
    </div>
  );
}