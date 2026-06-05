import { create } from 'zustand';
import { persist } from 'zustand/middleware'; // 👈 1. Import persist middleware
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { validateArchitecture } from '../lib/ValidationEngine';

let autoSaveTimer = null;

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
      pendingFitView: false,
      diagrams: [],
      activeDiagramId: null,
      diagramName: 'Untitled Architecture',
      saveStatus: 'idle',

      setSelectedElement: (element) => set({ selectedElement: element }),

      initDiagrams: () => {
        try {
          const stored = JSON.parse(localStorage.getItem('ingen-diagrams') || '[]');
          const activeId = localStorage.getItem('ingen-active-diagram');
          const active = activeId ? stored.find(d => d.id === activeId) : null;
          if (active) {
            set({ diagrams: stored, activeDiagramId: activeId, diagramName: active.name, nodes: active.nodes, edges: active.edges });
            get().runValidation();
          } else {
            set({ diagrams: stored });
          }
        } catch { /* SSR or corrupt data */ }
      },

      setDiagramName: (name) => set({ diagramName: name }),

      saveDiagram: () => {
        const { nodes, edges, diagramName, activeDiagramId, diagrams } = get();
        if (nodes.length === 0 && !activeDiagramId) return;
        const now = new Date().toISOString();
        let updatedDiagrams;
        let newActiveId = activeDiagramId;
        if (activeDiagramId) {
          updatedDiagrams = diagrams.map(d =>
            d.id === activeDiagramId ? { ...d, name: diagramName, nodes, edges, updatedAt: now } : d
          );
        } else {
          const newId = crypto.randomUUID();
          newActiveId = newId;
          updatedDiagrams = [{ id: newId, name: diagramName, createdAt: now, updatedAt: now, nodes, edges }, ...diagrams];
        }
        set({ diagrams: updatedDiagrams, activeDiagramId: newActiveId });
        try {
          localStorage.setItem('ingen-diagrams', JSON.stringify(updatedDiagrams));
          localStorage.setItem('ingen-active-diagram', newActiveId);
        } catch { /* ignore */ }
      },

      scheduleAutoSave: () => {
        clearTimeout(autoSaveTimer);
        set({ saveStatus: 'saving' });
        autoSaveTimer = setTimeout(() => {
          get().saveDiagram();
          set({ saveStatus: 'saved' });
          setTimeout(() => set({ saveStatus: 'idle' }), 2000);
        }, 2000);
      },

      loadDiagram: (id) => {
        const diagram = get().diagrams.find(d => d.id === id);
        if (!diagram) return;
        clearTimeout(autoSaveTimer);
        get().takeSnapshot();
        set({ nodes: diagram.nodes, edges: diagram.edges, diagramName: diagram.name, activeDiagramId: id, selectedElement: null, pendingFitView: true, saveStatus: 'idle' });
        get().runValidation();
        try { localStorage.setItem('ingen-active-diagram', id); } catch { /* ignore */ }
      },

      deleteDiagram: (id) => {
        const { diagrams, activeDiagramId } = get();
        const updated = diagrams.filter(d => d.id !== id);
        set({ diagrams: updated });
        if (activeDiagramId === id) {
          clearTimeout(autoSaveTimer);
          set({ nodes: [], edges: [], issues: [], activeDiagramId: null, diagramName: 'Untitled Architecture', selectedElement: null, saveStatus: 'idle' });
          try { localStorage.removeItem('ingen-active-diagram'); } catch { /* ignore */ }
        }
        try { localStorage.setItem('ingen-diagrams', JSON.stringify(updated)); } catch { /* ignore */ }
      },

      renameDiagram: (id, newName) => {
        const name = newName.trim() || 'Untitled Architecture';
        const { diagrams, activeDiagramId } = get();
        const updated = diagrams.map(d => d.id === id ? { ...d, name, updatedAt: new Date().toISOString() } : d);
        set({ diagrams: updated });
        if (id === activeDiagramId) set({ diagramName: name });
        try { localStorage.setItem('ingen-diagrams', JSON.stringify(updated)); } catch { /* ignore */ }
      },

      newDiagram: () => {
        clearTimeout(autoSaveTimer);
        get().takeSnapshot();
        set({ nodes: [], edges: [], issues: [], activeDiagramId: null, diagramName: 'Untitled Architecture', selectedElement: null, saveStatus: 'idle' });
        try { localStorage.removeItem('ingen-active-diagram'); } catch { /* ignore */ }
      },

      loadFromSharedUrl: (nodes, edges) => {
        clearTimeout(autoSaveTimer);
        set({ nodes, edges, issues: [], activeDiagramId: null, diagramName: 'Shared Architecture', selectedElement: null, pendingFitView: true, saveStatus: 'idle' });
        get().runValidation();
      },

      loadTemplate: (template) => {
        clearTimeout(autoSaveTimer);
        set({ saveStatus: 'idle' });
        get().takeSnapshot();
        const idMap = {};
        template.nodes.forEach(n => { idMap[n.id] = crypto.randomUUID(); });
        const nodes = template.nodes.map(n => ({ ...n, id: idMap[n.id] }));
        const edges = template.edges.map(e => ({
          ...e,
          id: crypto.randomUUID(),
          source: idMap[e.source],
          target: idMap[e.target],
        }));
        set({ nodes, edges, issues: [], selectedElement: null, pendingFitView: true });
        get().runValidation();
      },

      clearPendingFitView: () => set({ pendingFitView: false }),

      // 👇 3. The Nuke Button Action (Task 8.2)
      clearCanvas: () => {
        clearTimeout(autoSaveTimer);
        set({ saveStatus: 'idle' });
        get().takeSnapshot();
        set({ nodes: [], edges: [], issues: [], selectedElement: null });
      },

      updateNodeData: (nodeId, newData) => {
        get().takeSnapshot();
        set({ nodes: get().nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node) });
        get().runValidation();
        set({ selectedElement: { ...get().nodes.find(n => n.id === nodeId), elementType: 'node' } });
        get().scheduleAutoSave();
      },

      updateEdgeData: (edgeId, newData) => {
        get().takeSnapshot();
        set({ edges: get().edges.map((edge) => edge.id === edgeId ? { ...edge, data: { ...edge.data, ...newData } } : edge) });
        get().runValidation();
        set({ selectedElement: { ...get().edges.find(e => e.id === edgeId), elementType: 'edge' } });
        get().scheduleAutoSave();
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
        get().scheduleAutoSave();
      },

      onEdgesChange: (changes) => {
        if (changes.some(c => c.type === 'remove')) get().takeSnapshot();
        set({ edges: applyEdgeChanges(changes, get().edges) });
        get().runValidation();
        get().scheduleAutoSave();
      },

      onConnect: (connection) => {
        get().takeSnapshot();
        const semanticConnection = {
          ...connection, type: 'awsEdge', animated: true,
          data: { authType: 'NONE', invocationType: 'Sync', iamPermissions: [] }
        };
        set({ edges: addEdge(semanticConnection, get().edges) });
        get().runValidation();
        get().scheduleAutoSave();
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
        get().scheduleAutoSave();
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