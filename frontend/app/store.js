import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { validateArchitecture } from '../lib/ValidationEngine';

const SERVICE_DEFAULTS = {
  lambda:     { timeout: 30, memorySize: 128, hasDeadLetterQueue: false },
  sqs:        { visibilityTimeout: 30, isFifo: false },
  s3:         { blockPublicAccess: true, versioning: false, encryption: true },
  apiGateway: { throttlingEnabled: true, loggingEnabled: false },
  dynamodb:   { pointInTimeRecovery: true, billingMode: 'PAY_PER_REQUEST' },
};

function getServiceDefaults(serviceType) {
  return SERVICE_DEFAULTS[serviceType] || {};
}

const SAFETY_OVERRIDES = {
  s3:         { blockPublicAccess: true, encryption: true },
  apiGateway: { throttlingEnabled: true },
  dynamodb:   { pointInTimeRecovery: true },
};

function normalizeServiceType(type) {
  if (type === 'eventBridge') return 'eventbridge';
  return type;
}

function sanitizeNodePositions(nodes) {
  return nodes.map((n, i) => {
    const x = typeof n.position?.x === 'number' && !isNaN(n.position.x) ? n.position.x : 200 + (i * 280);
    const y = typeof n.position?.y === 'number' && !isNaN(n.position.y) ? n.position.y : 250;
    return (x === n.position?.x && y === n.position?.y) ? n : { ...n, position: { x, y } };
  });
}

function makeWorkspace(name = 'Untitled Architecture') {
  return {
    id: `ws_${crypto.randomUUID()}`,
    name,
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString(),
    nodes: [],
    edges: [],
    messages: [],
  };
}

function persistWorkspaces(workspaces) {
  try { localStorage.setItem('ingen-workspaces', JSON.stringify(workspaces)); } catch { /* ignore */ }
}

function persistActiveId(id) {
  try { localStorage.setItem('ingen-active-workspace', id); } catch { /* ignore */ }
}

let autoSaveTimer = null;

export const useStore = create((set, get) => ({
  // Canvas state
  nodes: [],
  edges: [],
  issues: [],
  past: [],
  future: [],
  selectedElement: null,
  pendingFitView: false,
  streamingIds: {},

  // Workspace state
  workspaces: [],
  activeWorkspaceId: null,
  saveStatus: 'idle',

  setSelectedElement: (element) => set({ selectedElement: element }),
  clearPendingFitView: () => set({ pendingFitView: false }),

  getCurrentWorkspace: () => {
    const { workspaces, activeWorkspaceId } = get();
    return workspaces.find(w => w.id === activeWorkspaceId) || null;
  },

  loadWorkspaces: () => {
    try {
      const raw = localStorage.getItem('ingen-workspaces');
      const stored = raw ? JSON.parse(raw) : [];
      const savedActiveId = localStorage.getItem('ingen-active-workspace');

      if (!stored.length) {
        const ws = makeWorkspace();
        persistWorkspaces([ws]);
        persistActiveId(ws.id);
        set({ workspaces: [ws], activeWorkspaceId: ws.id });
        window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: [] } }));
        return;
      }

      const active = (savedActiveId && stored.find(w => w.id === savedActiveId)) || stored[0];
      set({
        workspaces: stored,
        activeWorkspaceId: active.id,
        nodes: sanitizeNodePositions(active.nodes || []),
        edges: active.edges || [],
      });
      persistActiveId(active.id);
      get().runValidation();
      window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: active.messages || [] } }));
    } catch { /* SSR or corrupt */ }
  },

  switchWorkspace: (id) => {
    const { workspaces, activeWorkspaceId, nodes, edges } = get();
    if (id === activeWorkspaceId) return;

    const now = new Date().toISOString();
    // Flush current canvas state into current workspace before switching
    const flushed = workspaces.map(w =>
      w.id === activeWorkspaceId ? { ...w, nodes, edges, updatedAt: now } : w
    );
    const target = flushed.find(w => w.id === id);
    if (!target) return;

    clearTimeout(autoSaveTimer);
    set({
      workspaces: flushed,
      activeWorkspaceId: id,
      nodes: sanitizeNodePositions(target.nodes || []),
      edges: target.edges || [],
      selectedElement: null,
      pendingFitView: true,
      saveStatus: 'idle',
      past: [],
      future: [],
    });
    persistWorkspaces(flushed);
    persistActiveId(id);
    get().runValidation();
    window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: target.messages || [] } }));
  },

  newWorkspace: () => {
    const { workspaces, activeWorkspaceId, nodes, edges } = get();
    if (workspaces.length >= 3) return false;

    const now = new Date().toISOString();
    const flushed = workspaces.map(w =>
      w.id === activeWorkspaceId ? { ...w, nodes, edges, updatedAt: now } : w
    );
    const ws = makeWorkspace();
    const updated = [...flushed, ws];

    clearTimeout(autoSaveTimer);
    set({
      workspaces: updated,
      activeWorkspaceId: ws.id,
      nodes: [],
      edges: [],
      issues: [],
      selectedElement: null,
      pendingFitView: false,
      saveStatus: 'idle',
      past: [],
      future: [],
    });
    persistWorkspaces(updated);
    persistActiveId(ws.id);
    window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: [] } }));
    return true;
  },

  deleteWorkspace: (id) => {
    const { workspaces, activeWorkspaceId } = get();

    if (workspaces.length <= 1) {
      // Always keep at least one workspace — clear it instead of deleting
      clearTimeout(autoSaveTimer);
      const cleared = { ...workspaces[0], nodes: [], edges: [], messages: [], updatedAt: new Date().toISOString() };
      set({ workspaces: [cleared], nodes: [], edges: [], issues: [], selectedElement: null, saveStatus: 'idle', past: [], future: [] });
      persistWorkspaces([cleared]);
      window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: [] } }));
      return;
    }

    const remaining = workspaces.filter(w => w.id !== id);

    if (id === activeWorkspaceId) {
      const next = remaining[0];
      clearTimeout(autoSaveTimer);
      set({
        workspaces: remaining,
        activeWorkspaceId: next.id,
        nodes: sanitizeNodePositions(next.nodes || []),
        edges: next.edges || [],
        issues: [],
        selectedElement: null,
        pendingFitView: true,
        saveStatus: 'idle',
        past: [],
        future: [],
      });
      persistActiveId(next.id);
      get().runValidation();
      window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: next.messages || [] } }));
    } else {
      set({ workspaces: remaining });
    }

    persistWorkspaces(remaining);
  },

  renameWorkspace: (id, name) => {
    const trimmed = (name || '').trim() || 'Untitled Architecture';
    const { workspaces } = get();
    const updated = workspaces.map(w =>
      w.id === id ? { ...w, name: trimmed, updatedAt: new Date().toISOString() } : w
    );
    set({ workspaces: updated });
    persistWorkspaces(updated);
  },

  updateWorkspaceMessages: (messages) => {
    const { workspaces, activeWorkspaceId } = get();
    const updated = workspaces.map(w =>
      w.id === activeWorkspaceId ? { ...w, messages } : w
    );
    set({ workspaces: updated });
    get().scheduleAutoSave();
  },

  scheduleAutoSave: () => {
    clearTimeout(autoSaveTimer);
    set({ saveStatus: 'saving' });
    autoSaveTimer = setTimeout(() => {
      const { workspaces, activeWorkspaceId, nodes, edges } = get();
      const now = new Date().toISOString();
      const updated = workspaces.map(w =>
        w.id === activeWorkspaceId ? { ...w, nodes, edges, updatedAt: now } : w
      );
      set({ workspaces: updated, saveStatus: 'saved' });
      persistWorkspaces(updated);
      setTimeout(() => set({ saveStatus: 'idle' }), 2000);
    }, 2000);
  },

  loadFromSharedUrl: (nodes, edges) => {
    clearTimeout(autoSaveTimer);
    set({ nodes: sanitizeNodePositions(nodes), edges, issues: [], selectedElement: null, pendingFitView: true, saveStatus: 'idle' });
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
    get().scheduleAutoSave();
  },

  clearCanvas: () => {
    clearTimeout(autoSaveTimer);
    set({ saveStatus: 'idle' });
    get().takeSnapshot();
    set({ nodes: [], edges: [], issues: [], selectedElement: null });
    get().scheduleAutoSave();
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
    set({ issues: validateArchitecture(nodes, edges) });
  },

  takeSnapshot: () => {
    const { nodes, edges, past } = get();
    set({ past: [...past.slice(-49), { nodes, edges }], future: [] });
  },

  undo: () => {
    const { past, future, nodes, edges } = get();
    if (past.length === 0) return;
    const prev = past[past.length - 1];
    set({ past: past.slice(0, -1), future: [{ nodes, edges }, ...future], nodes: prev.nodes, edges: prev.edges });
    get().runValidation();
  },

  redo: () => {
    const { past, future, nodes, edges } = get();
    if (future.length === 0) return;
    const next = future[0];
    set({ past: [...past, { nodes, edges }], future: future.slice(1), nodes: next.nodes, edges: next.edges });
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
    const sourceNode = get().nodes.find(n => n.id === connection.source);
    const defaultAuthType = sourceNode?.data?.service === 'apiGateway' ? 'COGNITO' : 'NONE';
    const semanticConnection = {
      ...connection, type: 'awsEdge', animated: true,
      data: { authType: defaultAuthType, invocationType: 'Sync', iamPermissions: [] },
    };
    set({ edges: addEdge(semanticConnection, get().edges) });
    get().runValidation();
    get().scheduleAutoSave();
  },

  addNode: (node) => {
    get().takeSnapshot();
    const enriched = {
      ...node,
      data: { ...getServiceDefaults(node.data.service), ...node.data },
    };
    set({ nodes: [...get().nodes, enriched] });
    get().runValidation();
    get().scheduleAutoSave();
  },

  streamNodes: async (incomingNodes, incomingEdges, replace, description) => {
    get().takeSnapshot();

    if (replace) {
      set({ nodes: [], edges: [], selectedElement: null });
    }

    const yOffset = replace ? 0 : (() => {
      const existing = get().nodes;
      if (existing.length === 0) return 0;
      return Math.max(...existing.map(n => n.position?.y ?? 0)) + 300;
    })();

    const validNodes = incomingNodes.map((node, index) => ({
      ...node,
      x: (typeof node.x === 'number' && !isNaN(node.x)) ? node.x : 200 + (index * 280),
      y: (typeof node.y === 'number' && !isNaN(node.y)) ? node.y : 250,
    }));

    const idMap = {};
    validNodes.forEach(n => { idMap[n.id] = crypto.randomUUID(); });

    for (let index = 0; index < validNodes.length; index++) {
      const node = validNodes[index];
      await new Promise(resolve => setTimeout(resolve, 300));

      const serviceType = normalizeServiceType(node.type);
      const newId = idMap[node.id];
      const safeX = typeof node.x === 'number' && !isNaN(node.x) ? node.x : 200 + (index * 280);
      const safeY = typeof node.y === 'number' && !isNaN(node.y) ? node.y : 250;

      const enrichedNode = {
        id: newId,
        type: 'awsNode',
        position: { x: safeX, y: safeY + yOffset },
        data: {
          ...getServiceDefaults(serviceType),
          ...(node.data || {}),
          ...(SAFETY_OVERRIDES[serviceType] || {}),
          label: node.label,
          service: serviceType,
        },
      };

      set(state => ({
        nodes: [...state.nodes, enrichedNode],
        streamingIds: { ...state.streamingIds, [newId]: true },
      }));

      const capturedId = newId;
      setTimeout(() => {
        set(state => {
          const { [capturedId]: _removed, ...rest } = state.streamingIds;
          return { streamingIds: rest };
        });
      }, 400);
    }

    await new Promise(resolve => setTimeout(resolve, 300));

    const enrichedEdges = incomingEdges.map(edge => {
      const sourceId = idMap[edge.source] || edge.source;
      const sourceNode = get().nodes.find(n => n.id === sourceId);
      const defaultAuthType = sourceNode?.data?.service === 'apiGateway' ? 'COGNITO' : 'NONE';
      return {
        id: crypto.randomUUID(),
        source: sourceId,
        target: idMap[edge.target] || edge.target,
        type: 'awsEdge',
        animated: true,
        data: {
          authType: (edge.authType && edge.authType !== 'NONE') ? edge.authType : defaultAuthType,
          invocationType: edge.invocationType === 'Synchronous' ? 'Sync'
            : edge.invocationType === 'Asynchronous' ? 'Async'
            : (edge.invocationType || 'Sync'),
          iamPermissions: [],
        },
      };
    });

    set(state => ({ edges: [...state.edges, ...enrichedEdges], pendingFitView: true }));

    // Auto-name workspace when it still has the default name
    if (description) {
      const { workspaces, activeWorkspaceId } = get();
      const current = workspaces.find(w => w.id === activeWorkspaceId);
      if (current?.name === 'Untitled Architecture') {
        get().renameWorkspace(activeWorkspaceId, description.slice(0, 40).trim());
      }
    }

    get().runValidation();
    get().scheduleAutoSave();
  },
}));
