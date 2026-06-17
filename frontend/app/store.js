import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';
import { validateArchitecture } from '../lib/ValidationEngine';
import { getServiceDefaults } from '../lib/serviceDefaults';
import { calculateScore } from '../lib/architectureScorer';

const SAFETY_OVERRIDES = {
  s3:         { blockPublicAccess: true, encryption: true, versioning: false },
  apiGateway: { throttlingEnabled: true, loggingEnabled: false },
  dynamodb:   { pointInTimeRecovery: true },
  lambda:     { hasDeadLetterQueue: false },
};

const FIELD_ALIASES = {
  mfaEnabled: null,               // invalid field — drop it
  advancedSecurityEnabled: null,  // invalid field — drop it
  mfa: 'mfaMode',                 // normalize if AI sends this
  advancedSecurityMode: 'advancedSecurity',
};

function normalizeUpdateData(data) {
  const result = {};
  for (const [key, val] of Object.entries(data)) {
    if (key in FIELD_ALIASES) {
      const mapped = FIELD_ALIASES[key];
      if (mapped !== null) result[mapped] = val;
    } else {
      result[key] = val;
    }
  }
  return result;
}

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
    sourceHcl: null,
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
  architectureScore: null,
  past: [],
  future: [],
  selectedElement: null,
  pendingFitView: false,
  streamingIds: {},
  sourceHcl: null,

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
        sourceHcl: active.sourceHcl || null,
      });
      persistActiveId(active.id);
      get().runValidation();
      window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: active.messages || [] } }));
    } catch { /* SSR or corrupt */ }
  },

  switchWorkspace: (id) => {
    const { workspaces, activeWorkspaceId, nodes, edges, sourceHcl } = get();
    if (id === activeWorkspaceId) return;

    const now = new Date().toISOString();
    // Flush current canvas state into current workspace before switching
    const flushed = workspaces.map(w =>
      w.id === activeWorkspaceId ? { ...w, nodes, edges, sourceHcl, updatedAt: now } : w
    );
    const target = flushed.find(w => w.id === id);
    if (!target) return;

    clearTimeout(autoSaveTimer);
    set({
      workspaces: flushed,
      activeWorkspaceId: id,
      nodes: sanitizeNodePositions(target.nodes || []),
      edges: target.edges || [],
      sourceHcl: target.sourceHcl || null,
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
      architectureScore: null,
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
      set({ workspaces: [cleared], nodes: [], edges: [], issues: [], architectureScore: null, selectedElement: null, saveStatus: 'idle', past: [], future: [] });
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
        sourceHcl: next.sourceHcl || null,
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

  duplicateWorkspace: (id) => {
    const { workspaces, activeWorkspaceId, nodes, edges, sourceHcl } = get();
    if (workspaces.length >= 3) return false;

    const now = new Date().toISOString();
    const flushed = workspaces.map(w =>
      w.id === activeWorkspaceId ? { ...w, nodes, edges, sourceHcl, updatedAt: now } : w
    );
    const source = flushed.find(w => w.id === id);
    if (!source) return false;

    const copy = {
      ...source,
      id: `ws_${crypto.randomUUID()}`,
      name: `${source.name} (copy)`.slice(0, 50),
      createdAt: now,
      updatedAt: now,
    };
    const updated = [...flushed, copy];

    clearTimeout(autoSaveTimer);
    set({
      workspaces: updated,
      activeWorkspaceId: copy.id,
      nodes: sanitizeNodePositions(copy.nodes || []),
      edges: copy.edges || [],
      sourceHcl: copy.sourceHcl || null,
      selectedElement: null,
      pendingFitView: true,
      saveStatus: 'idle',
      past: [],
      future: [],
    });
    persistWorkspaces(updated);
    persistActiveId(copy.id);
    get().runValidation();
    window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: copy.messages || [] } }));
    return true;
  },

  importWorkspace: (wsData) => {
    const { workspaces, activeWorkspaceId, nodes, edges, sourceHcl } = get();
    if (workspaces.length >= 3) return false;

    const now = new Date().toISOString();
    const flushed = workspaces.map(w =>
      w.id === activeWorkspaceId ? { ...w, nodes, edges, sourceHcl, updatedAt: now } : w
    );

    const imported = {
      id: `ws_${crypto.randomUUID()}`,
      name: (wsData.name || 'Imported Architecture').slice(0, 50),
      createdAt: now,
      updatedAt: now,
      nodes: sanitizeNodePositions(wsData.nodes || []),
      edges: wsData.edges || [],
      messages: wsData.messages || [],
      sourceHcl: wsData.sourceHcl || null,
    };
    const updated = [...flushed, imported];

    clearTimeout(autoSaveTimer);
    set({
      workspaces: updated,
      activeWorkspaceId: imported.id,
      nodes: imported.nodes,
      edges: imported.edges,
      sourceHcl: imported.sourceHcl,
      selectedElement: null,
      pendingFitView: true,
      saveStatus: 'idle',
      past: [],
      future: [],
    });
    persistWorkspaces(updated);
    persistActiveId(imported.id);
    get().runValidation();
    window.dispatchEvent(new CustomEvent('workspace-switched', { detail: { messages: imported.messages } }));
    return true;
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
      const { workspaces, activeWorkspaceId, nodes, edges, sourceHcl } = get();
      const now = new Date().toISOString();
      const updated = workspaces.map(w =>
        w.id === activeWorkspaceId ? { ...w, nodes, edges, sourceHcl, updatedAt: now } : w
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
    set({ nodes: [], edges: [], issues: [], architectureScore: null, selectedElement: null, sourceHcl: null });
    get().scheduleAutoSave();
  },

  setSourceHcl: (hcl) => {
    set({ sourceHcl: hcl });
    get().scheduleAutoSave();
  },

  clearSourceHcl: () => {
    set({ sourceHcl: null });
    get().scheduleAutoSave();
  },

  updateNodeData: (nodeId, newData) => {
    get().takeSnapshot();
    set({
      nodes: get().nodes.map((node) => node.id === nodeId ? { ...node, data: { ...node.data, ...newData } } : node),
      sourceHcl: null,
    });
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

  applyPropertyUpdates: (updates) => {
    get().takeSnapshot();
    const updatedNodes = get().nodes.map(node => {
      const update = updates.find(u => u.nodeId === node.id);
      if (!update) return node;
      return { ...node, data: { ...node.data, ...normalizeUpdateData(update.data) } };
    });
    set({ nodes: updatedNodes });
    get().runValidation();
    const selected = get().selectedElement;
    if (selected?.elementType === 'node' && updates.some(u => u.nodeId === selected.id)) {
      set({ selectedElement: { ...updatedNodes.find(n => n.id === selected.id), elementType: 'node' } });
    }
    get().scheduleAutoSave();
  },

  applyParsedHcl: (parsedNodes, parsedEdges, hcl) => {
    get().takeSnapshot();

    const idMap = {};
    parsedNodes.forEach(n => { idMap[n.id] = crypto.randomUUID(); });

    const nodes = parsedNodes.map((node, index) => {
      const serviceType = normalizeServiceType(node.type);
      return {
        id: idMap[node.id],
        type: 'awsNode',
        position: {
          x: (typeof node.x === 'number' && !isNaN(node.x)) ? node.x : 200 + (index * 300),
          y: (typeof node.y === 'number' && !isNaN(node.y)) ? node.y : 250 + (Math.floor(index / 3) * 200),
        },
        data: {
          ...getServiceDefaults(serviceType),
          ...(node.data || {}),
          ...(SAFETY_OVERRIDES[serviceType] || {}),
          label: node.label,
          service: serviceType,
        },
      };
    });

    const edges = parsedEdges.map(edge => {
      const sourceId = idMap[edge.source] || edge.source;
      const sourceNode = nodes.find(n => n.id === sourceId);
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

    set({ nodes, edges, sourceHcl: hcl, selectedElement: null, pendingFitView: true });
    get().runValidation();
    get().scheduleAutoSave();
  },

  applyStructuralRefactor: ({ keep, add, removeEdges, addEdges }) => {
    get().takeSnapshot();
    const { nodes: currentNodes, edges: currentEdges } = get();

    const keepSet = new Set(keep || []);
    const keptNodes = keepSet.size > 0
      ? currentNodes.filter(n => keepSet.has(n.id))
      : currentNodes;

    const newIdMap = {};
    const addedNodes = (add || []).map((n, index) => {
      const serviceType = normalizeServiceType(n.type);
      const id = crypto.randomUUID();
      newIdMap[n.id] = id;
      return {
        id,
        type: 'awsNode',
        position: {
          x: (typeof n.x === 'number' && !isNaN(n.x)) ? n.x : 400 + (index * 250),
          y: (typeof n.y === 'number' && !isNaN(n.y)) ? n.y : 300 + (index * 150),
        },
        data: {
          ...getServiceDefaults(serviceType),
          ...(n.data || {}),
          ...(SAFETY_OVERRIDES[serviceType] || {}),
          label: n.label || serviceType,
          service: serviceType,
        },
      };
    });

    const removeSet = new Set((removeEdges || []).map(e => `${e.source}|${e.target}`));
    const keptEdges = currentEdges.filter(e => {
      if (keepSet.size > 0 && (!keepSet.has(e.source) || !keepSet.has(e.target))) return false;
      return !removeSet.has(`${e.source}|${e.target}`);
    });

    const allNodes = [...keptNodes, ...addedNodes];
    const addedEdges = (addEdges || []).map(e => {
      const source = newIdMap[e.source] || e.source;
      const target = newIdMap[e.target] || e.target;
      const sourceNode = allNodes.find(n => n.id === source);
      const defaultAuthType = sourceNode?.data?.service === 'apiGateway' ? 'COGNITO' : 'IAM';
      return {
        id: crypto.randomUUID(),
        source,
        target,
        type: 'awsEdge',
        animated: true,
        data: {
          authType: e.authType || defaultAuthType,
          invocationType: e.invocationType === 'Synchronous' ? 'Sync'
            : e.invocationType === 'Asynchronous' ? 'Async'
            : (e.invocationType || 'Async'),
          iamPermissions: [],
        },
      };
    });

    set({ nodes: allNodes, edges: [...keptEdges, ...addedEdges], sourceHcl: null, selectedElement: null });
    get().runValidation();
    get().scheduleAutoSave();
  },

  runValidation: () => {
    const { nodes, edges } = get();
    const issues = validateArchitecture(nodes, edges);
    set({ issues, architectureScore: calculateScore(issues, nodes) });
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
    set({ nodes: [...get().nodes, enriched], sourceHcl: null });
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

    const safeNodes = incomingNodes.map((node, index) => ({
      ...node,
      x: (typeof node.x === 'number' && !isNaN(node.x)) ? node.x : 200 + (index * 300),
      y: (typeof node.y === 'number' && !isNaN(node.y)) ? node.y : 250 + (Math.floor(index / 3) * 200),
    }));

    const idMap = {};
    safeNodes.forEach(n => { idMap[n.id] = crypto.randomUUID(); });

    for (let index = 0; index < safeNodes.length; index++) {
      const node = safeNodes[index];
      await new Promise(resolve => setTimeout(resolve, 300));

      const serviceType = normalizeServiceType(node.type);
      const newId = idMap[node.id];

      const enrichedNode = {
        id: newId,
        type: 'awsNode',
        position: { x: node.x, y: node.y + yOffset },
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
