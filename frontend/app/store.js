import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // 👈 1. Import persist middleware
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { validateArchitecture } from '../lib/ValidationEngine';

// 👇 2. Wrap the store creator in persist()
export const useStore = create(
  persist(
    (set, get) => ({
      nodes: [],
      edges: [],
      issues: [], 
      past: [],
      future: [],
      selectedElement: null,

      setSelectedElement: (element) => set({ selectedElement: element }),

      // 👇 3. The Nuke Button Action (Task 8.2)
      clearCanvas: () => {
        get().takeSnapshot(); // Take a snapshot so the user can hit Undo if they accidentally clear!
        set({
          nodes: [],
          edges: [],
          issues: [],
          selectedElement: null,
        });
      },

      updateNodeData: (nodeId, newData) => {
        get().takeSnapshot();
        set({
          nodes: get().nodes.map((node) => 
            node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node
          )
        });
        get().runValidation();
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
        set({ past: [...past.slice(-49), { nodes, edges }], future: [] });
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
        if (changes.some(c => c.type !== 'position' && c.type !== 'dimensions')) {
          get().runValidation();
        }
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
        const serviceDefaults = {
          lambda:      { timeout: 3, memorySize: 128, hasDeadLetterQueue: false },
          sqs:         { visibilityTimeout: 30, isFifo: false },
          s3:          { blockPublicAccess: true, versioning: false, encryption: false },
          apiGateway:  { throttlingEnabled: false, loggingEnabled: false },
          dynamodb:    { pointInTimeRecovery: false, billingMode: 'PAY_PER_REQUEST' },
        };
        const enriched = {
          ...node,
          data: { ...(serviceDefaults[node.data.service] || {}), ...node.data },
        };
        set({ nodes: [...get().nodes, enriched] });
        get().runValidation();
      },
    }),
    {
      name: 'ingen-canvas-storage', // 👈 4. The name of the key in localStorage
      // We only want to save the actual architecture, not the undo history or selection state
      partialize: (state) => ({
        nodes: state.nodes,
        edges: state.edges,
      }),
    }
  )
);