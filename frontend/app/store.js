import { create } from 'zustand';
import { applyNodeChanges, applyEdgeChanges, addEdge } from 'reactflow';

export const useStore = create((set, get) => ({
  nodes: [
    { 
      id: '1', 
      type: 'awsNode', 
      position: { x: 250, y: 100 }, 
      data: { service: 'apiGateway', label: 'API Gateway' } 
    },
    { 
      id: '2', 
      type: 'awsNode', 
      position: { x: 600, y: 100 }, 
      data: { service: 'lambda', label: 'Lambda Function' } 
    },
  ],
  edges: [
    { id: 'e1-2', source: '1', target: '2', animated: true }
  ],

  onNodesChange: (changes) => {
    set({
      nodes: applyNodeChanges(changes, get().nodes),
    });
  },
  onEdgesChange: (changes) => {
    set({
      edges: applyEdgeChanges(changes, get().edges),
    });
  },
  onConnect: (connection) => {
  // Inject our custom semantic data into every new connection
    const semanticConnection = {
      ...connection,
      type: 'awsEdge', // Use our custom edge component
      animated: true,
      data: {
        authType: 'NONE', // Default values for our rules engine to read later
        invocationType: 'Sync',
        iamPermissions: []
      }
    };
    
    set({
      edges: addEdge(semanticConnection, get().edges),
    });
  },
  addNode: (node) => {
    set({
      nodes: [...get().nodes, node]
    });
  },
}));