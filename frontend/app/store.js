import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { validateArchitecture } from '../lib/ValidationEngine';

export const useStore = create((set, get) => ({
  nodes: [
    { id: '1', type: 'awsNode', position: { x: 250, y: 100 }, data: { service: 'apiGateway', label: 'API Gateway' } },
    { id: '2', type: 'awsNode', position: { x: 600, y: 100 }, data: { service: 'lambda', label: 'Lambda Function' } },
  ],
  edges: [
    { id: 'e1-2', source: '1', target: '2', type: 'awsEdge', animated: true, data: { invocationType: 'Sync', authType: 'NONE' } }
  ],
  issues: [], 
  past: [],
  future: [],

  // 👇 NEW: State to track what the user clicked on
  selectedElement: null,
  setSelectedElement: (element) => set({ selectedElement: element }),

  // 👇 NEW: Functions to update specific node/edge data
  updateNodeData: (nodeId, newData) => {
    get().takeSnapshot();
    set({
      nodes: get().nodes.map((node) => 
        node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
      )
    });
    get().runValidation();
    // Update selected element so the UI stays in sync
    set({ selectedElement: { ...get().nodes.find(n => n.id === nodeId), elementType: 'node' } });
  },

  updateEdgeData: (edgeId, newData) => {
    get().takeSnapshot();
    set({
      edges: get().edges.map((edge) => 
        edge.id === edgeId ? { ...edge, data: { ...edge.data, ...newData } } : edge
      )
    });
    get().runValidation();
    set({ selectedElement: { ...get().edges.find(e => e.id === edgeId), elementType: 'edge' } });
  },

  runValidation: () => {
    const { nodes, edges } = get();
    const newIssues = validateArchitecture(nodes, edges);
    set({ issues: newIssues });
  },

  takeSnapshot: () => {
    const { nodes, edges, past } = get();
    set({ past: [...past, { nodes, edges }], future: [] });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const previousState = past[past.length - 1];
    set({
      past: past.slice(0, past.length - 1),
      future: [{ nodes, edges }, ...future],
      nodes: previousState.nodes,
      edges: previousState.edges,
    });
    get().runValidation();
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const nextState = future[0];
    set({
      past: [...past, { nodes, edges }],
      future: future.slice(1),
      nodes: nextState.nodes,
      edges: nextState.edges,
    });
    get().runValidation();
  },

  onNodesChange: (changes) => {
    if (changes.some(c => c.type === 'remove')) get().takeSnapshot();
    set({ nodes: applyNodeChanges(changes, get().nodes) });
    get().runValidation();
  },
  
  onEdgesChange: (changes) => {
    if (changes.some(c => c.type === 'remove')) get().takeSnapshot();
    set({ edges: applyEdgeChanges(changes, get().edges) });
    get().runValidation();
  },
  
  onConnect: (connection) => {
    get().takeSnapshot();
    const semanticConnection = {
      ...connection, type: 'awsEdge', animated: true,
      data: { authType: 'NONE', invocationType: 'Sync', iamPermissions: [] }
    };
    set({ edges: addEdge(semanticConnection, get().edges) });
    get().runValidation();
  },
  
  addNode: (node) => {
    get().takeSnapshot();
    set({ nodes: [...get().nodes, node] });
    get().runValidation();
  },
}));