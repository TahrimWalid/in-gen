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
    message: 'API Gateway is routing to compute without an Authorizer. To fix: click the edge between this gateway and its Lambda, then change Auth Type to COGNITO or IAM in the Edge Properties panel.',
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
      const isReceiving = edges.some(edge => edge.target === node.id);
      const isConsumed = edges.some(edge => edge.source === node.id);
      return (isReceiving && !isConsumed) ? node.id : null;
    }
  },

  // 7. SQS visibility timeout vs Lambda timeout
  {
    id: 'sqs-visibility-timeout',
    name: 'SQS Visibility Timeout Too Low',
    severity: 'error',
    message: 'SQS visibility timeout must be at least 6× the consuming Lambda timeout to prevent duplicate processing.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'sqs') return null;
      const outgoing = edges.filter(e => e.source === node.id);
      for (const edge of outgoing) {
        const target = nodes.find(n => n.id === edge.target);
        if (!target || target.data.service !== 'lambda') continue;
        const sqsTimeout = node.data.visibilityTimeout ?? 30;
        const lambdaTimeout = target.data.timeout ?? 3;
        if (sqsTimeout < lambdaTimeout * 6) {
          const recommended = lambdaTimeout * 6;
          return {
            nodeId: node.id,
            message: `SQS visibility timeout (${sqsTimeout}s) is less than 6× the Lambda timeout (${lambdaTimeout}s). This causes duplicate message processing. Set visibility timeout to at least ${recommended}s.`,
          };
        }
      }
      return null;
    }
  },

  // 8. S3 public access exposed
  {
    id: 's3-public-access',
    name: 'S3 Bucket Has Public Access',
    severity: 'error',
    message: 'S3 bucket has public access enabled. This exposes your data to the internet. Enable Block Public Access unless this bucket intentionally serves public static assets.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 's3') return null;
      return node.data.blockPublicAccess === false ? node.id : null;
    }
  },

  // 9. Lambda using AWS default timeout
  {
    id: 'lambda-default-timeout',
    name: 'Lambda Using AWS Default Timeout',
    severity: 'warning',
    message: 'Lambda is using the AWS default timeout of 3 seconds. This is rarely correct for production. Set an explicit timeout based on your expected execution duration.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'lambda') return null;
      return (node.data.timeout === 3 || node.data.timeout === undefined) ? node.id : null;
    }
  },

  // 10. DynamoDB missing point-in-time recovery
  {
    id: 'dynamodb-no-pitr',
    name: 'DynamoDB Missing Point-in-Time Recovery',
    severity: 'warning',
    message: 'DynamoDB table has no Point-in-Time Recovery enabled. Accidental deletes or overwrites cannot be recovered. Enable PITR for production tables.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'dynamodb') return null;
      return node.data.pointInTimeRecovery === false ? node.id : null;
    }
  },

  // 11. API Gateway missing throttling
  {
    id: 'apigw-no-throttling',
    name: 'API Gateway Missing Throttling',
    severity: 'warning',
    message: 'API Gateway has no throttling configured. Without rate limits, a traffic spike or abuse can overwhelm your Lambda functions and inflate your bill.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'apiGateway') return null;
      if (node.data.throttlingEnabled !== false) return null;
      return edges.some(e => e.source === node.id) ? node.id : null;
    }
  },

  // 12. Lambda missing DLQ on async invocation path
  {
    id: 'lambda-no-dlq',
    name: 'Lambda Missing Dead Letter Queue',
    severity: 'warning',
    message: 'This Lambda is invoked asynchronously but has no Dead Letter Queue. Failed invocations will be silently dropped after AWS retries. Add a DLQ to capture failures.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'lambda') return null;
      if (node.data.hasDeadLetterQueue !== false) return null;
      const asyncSources = ['eventbridge', 'sns'];
      const hasAsyncTrigger = edges.some(edge => {
        if (edge.target !== node.id) return false;
        const source = nodes.find(n => n.id === edge.source);
        return source && asyncSources.includes(source.data.service);
      });
      return hasAsyncTrigger ? node.id : null;
    }
  },
];