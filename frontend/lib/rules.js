// frontend/lib/rules.js

export const rules = [
  {
    id: 'api-gateway-no-compute',
    name: 'Dead-End API Gateway',
    severity: 'error', // 'error' or 'warning'
    message: 'This API Gateway is not connected to any compute service. Route it to a Lambda function to handle requests.',
    evaluate: (node, nodes, edges) => {
      // Only evaluate this rule for API Gateway nodes
      if (node.data.service !== 'apiGateway') return null;

      // Look for any outgoing edge from this API Gateway that points to a Lambda
      const hasComputeTarget = edges.some(edge => {
        if (edge.source !== node.id) return false;
        
        const targetNode = nodes.find(n => n.id === edge.target);
        return targetNode && targetNode.data.service === 'lambda';
      });

      // If it DOES NOT have a compute target, return the node's ID to flag it
      return hasComputeTarget ? null : node.id; 
    }
  },
  {
    id: 'orphan-lambda',
    name: 'Orphaned Lambda Function',
    severity: 'warning',
    message: 'This Lambda has no triggers (inputs) and no destinations (outputs). It will never execute.',
    evaluate: (node, nodes, edges) => {
      // Only evaluate this rule for Lambda nodes
      if (node.data.service !== 'lambda') return null;

      // Check if this node is involved in ANY edge
      const hasConnections = edges.some(edge => edge.source === node.id || edge.target === node.id);

      // If it has NO connections, return the node's ID to flag it
      return hasConnections ? null : node.id;
    }
  }
];