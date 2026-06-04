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
  
  // 👇 History Stack
  past: [],
  future: [],

  runValidation: () => {
    const { nodes, edges } = get();
    const newIssues = validateArchitecture(nodes, edges);
    set({ issues: newIssues });
  },

  // 👇 Save the current state before we change it
  takeSnapshot: () => {
    const { nodes, edges, past } = get();
    set({
      past: [...past, { nodes, edges }],
      future: [], // Clear redo stack whenever a new action happens
    });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    
    const previousState = past[past.length - 1];
    const newPast = past.slice(0, past.length - 1);
    
    set({
      past: newPast,
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
    const newFuture = future.slice(1);
    
    set({
      past: [...past, { nodes, edges }],
      future: newFuture,
      nodes: nextState.nodes,
      edges: nextState.edges,
    });
    get().runValidation();
  },

  // --- Adjusted Event Handlers ---

  onNodesChange: (changes) => {
    // Only snapshot if the change is a deletion (dragging is handled separately)
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
    get().takeSnapshot(); // Snapshot before connecting
    const semanticConnection = {
      ...connection,
      type: 'awsEdge',
      animated: true,
      data: { authType: 'NONE', invocationType: 'Sync', iamPermissions: [] }
    };
    set({ edges: addEdge(semanticConnection, get().edges) });
    get().runValidation();
  },
  
  addNode: (node) => {
    get().takeSnapshot(); // Snapshot before adding
    set({ nodes: [...get().nodes, node] });
    get().runValidation();
  },
}));