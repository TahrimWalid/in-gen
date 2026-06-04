// frontend/lib/rules.js

export const rules = [
  // 1. The Dead-End Gateway
  {
    id: 'api-gateway-no-compute',
    name: 'Dead-End API Gateway',
    severity: 'error',
    message: 'This API Gateway is not connected to any compute service. Route it to a Lambda or AWS service.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'apiGateway') return null;
      const hasComputeTarget = edges.some(edge => edge.source === node.id);
      return hasComputeTarget ? null : node.id; 
    }
  },

  // 2. The Orphaned Compute
  {
    id: 'orphan-lambda',
    name: 'Orphaned Lambda Function',
    severity: 'warning',
    message: 'This Lambda has no triggers (inputs) and no destinations (outputs). It will never execute.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'lambda') return null;
      const hasConnections = edges.some(edge => edge.source === node.id || edge.target === node.id);
      return hasConnections ? null : node.id;
    }
  },

  // 3. Unauthenticated Public API (Reads Edge Metadata)
  {
    id: 'unauthenticated-api',
    name: 'Unauthenticated Public Endpoint',
    severity: 'warning',
    message: 'API Gateway is routing to compute without an Authorizer. If this is not a public API, change the auth type to Cognito or Custom IAM.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'apiGateway') return null;
      
      // Find edges leaving the API Gateway where authType is 'NONE'
      const hasPublicEndpoint = edges.some(edge => 
        edge.source === node.id && edge.data?.authType === 'NONE'
      );
      
      return hasPublicEndpoint ? node.id : null;
    }
  },

  // 4. SNS Topic without Subscribers
  {
    id: 'sns-no-subscribers',
    name: 'SNS Topic Missing Subscribers',
    severity: 'warning',
    message: 'This SNS Topic receives messages but has no subscribers (e.g., SQS or Lambda) to push them to.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'sns') return null;
      const hasSubscribers = edges.some(edge => edge.source === node.id);
      return hasSubscribers ? null : node.id;
    }
  },

  // 5. EventBridge Black Hole
  {
    id: 'eventbridge-blackhole',
    name: 'EventBridge Black Hole',
    severity: 'error',
    message: 'EventBridge bus has no target rules configured. Events sent here will be dropped.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'eventbridge') return null;
      const hasTargets = edges.some(edge => edge.source === node.id);
      return hasTargets ? null : node.id;
    }
  },

  // 6. SQS Queue unconsumed
  {
    id: 'sqs-unconsumed',
    name: 'Unconsumed SQS Queue',
    severity: 'error',
    message: 'Messages are entering this SQS queue but nothing is polling it. Add a Lambda worker to consume messages.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'sqs') return null;
      // Is there an edge going INTO the queue?
      const isReceiving = edges.some(edge => edge.target === node.id);
      // Is there an edge going OUT of the queue?
      const isConsumed = edges.some(edge => edge.source === node.id);
      
      return (isReceiving && !isConsumed) ? node.id : null;
    }
  }
];