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

  // ── Lambda ────────────────────────────────────────────────────

  // 13. Lambda end-of-life runtime
  {
    id: 'lambda-eol-runtime',
    name: 'Lambda End-of-Life Runtime',
    severity: 'error',
    message: 'This Lambda uses a runtime that AWS has deprecated. Deprecated runtimes no longer receive security patches. Migrate to nodejs20.x, python3.12, or java21.',
    evaluate: (node) => {
      if (node.data.service !== 'lambda') return null;
      const eolRuntimes = [
        'nodejs12.x', 'nodejs14.x', 'nodejs16.x',
        'python3.7', 'python3.8', 'python3.9',
        'java8', 'java8.al2', 'go1.x',
        'dotnet6', 'ruby2.7',
      ];
      return eolRuntimes.includes(node.data.runtime)
        ? { nodeId: node.id, message: `Runtime ${node.data.runtime} is end-of-life. Migrate to a supported runtime.` }
        : null;
    }
  },

  // 14. Lambda unreserved concurrency
  {
    id: 'lambda-no-reserved-concurrency',
    name: 'Lambda Unreserved Concurrency',
    severity: 'warning',
    message: 'Lambda has no reserved concurrency. Under high load, this function can consume all available account concurrency, starving other functions. Set a concurrency limit for production workloads.',
    evaluate: (node) => {
      if (node.data.service !== 'lambda') return null;
      return node.data.reservedConcurrency === -1 ? node.id : null;
    }
  },

  // 15. Lambda VPC cold start risk
  {
    id: 'lambda-vpc-cold-start',
    name: 'Lambda VPC Cold Start Risk',
    severity: 'warning',
    message: 'Lambda is configured to run inside a VPC. VPC-enabled Lambdas have longer cold start times. Only use VPC if this Lambda needs to access private resources like RDS or ElastiCache.',
    evaluate: (node) => {
      if (node.data.service !== 'lambda') return null;
      return node.data.vpcEnabled === true ? node.id : null;
    }
  },

  // ── API Gateway ───────────────────────────────────────────────

  // 16. API Gateway missing WAF
  {
    id: 'apigw-no-waf',
    name: 'API Gateway Missing WAF',
    severity: 'warning',
    message: 'API Gateway has no WAF (Web Application Firewall) configured. Without WAF, your API is vulnerable to common web exploits like SQL injection, XSS, and DDoS. Enable WAF for production APIs.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'apiGateway') return null;
      const hasOutgoing = edges.some(e => e.source === node.id);
      if (!hasOutgoing) return null;
      return node.data.wafEnabled === false ? node.id : null;
    }
  },

  // 17. API Gateway CORS wildcard origin
  {
    id: 'apigw-cors-wildcard',
    name: 'API Gateway CORS Wildcard Origin',
    severity: 'warning',
    message: 'API Gateway has CORS enabled with a wildcard origin (*). This allows any domain to call your API. Restrict the allowed origins to your specific frontend domains in production.',
    evaluate: (node) => {
      if (node.data.service !== 'apiGateway') return null;
      return (node.data.corsEnabled && node.data.corsOrigin === '*') ? node.id : null;
    }
  },

  // 18. API Gateway rate limit without burst limit
  {
    id: 'apigw-rate-without-burst',
    name: 'API Gateway Rate Limit Without Burst',
    severity: 'warning',
    message: 'API Gateway has a rate limit configured but no burst limit. Without a burst limit, sudden traffic spikes can still overwhelm your backend. Configure both rate and burst limits together.',
    evaluate: (node) => {
      if (node.data.service !== 'apiGateway') return null;
      const hasRate = node.data.rateLimit > 0;
      const hasBurst = node.data.burstLimit > 0;
      return (hasRate && !hasBurst) ? node.id : null;
    }
  },

  // ── DynamoDB ──────────────────────────────────────────────────

  // 19. DynamoDB PROVISIONED without autoscaling note
  {
    id: 'dynamodb-provisioned-no-autoscaling',
    name: 'DynamoDB PROVISIONED Without Auto-Scaling Note',
    severity: 'warning',
    message: 'DynamoDB is set to PROVISIONED billing mode. Without auto-scaling, fixed capacity can cause throttling under variable load or waste money when traffic is low. Use PAY_PER_REQUEST for unpredictable workloads.',
    evaluate: (node) => {
      if (node.data.service !== 'dynamodb') return null;
      return node.data.billingMode === 'PROVISIONED' ? node.id : null;
    }
  },

  // 20. DynamoDB streams enabled but no Lambda consumer
  {
    id: 'dynamodb-streams-no-consumer',
    name: 'DynamoDB Streams Without Consumer',
    severity: 'warning',
    message: 'DynamoDB Streams is enabled but no Lambda consumer is connected. Stream records will accumulate and expire after 24 hours without being processed. Connect a Lambda function to consume the stream.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'dynamodb') return null;
      if (!node.data.streamsEnabled) return null;
      const hasLambdaConsumer = edges.some(e => {
        if (e.source !== node.id) return false;
        const target = nodes.find(n => n.id === e.target);
        return target?.data?.service === 'lambda';
      });
      return hasLambdaConsumer ? null : node.id;
    }
  },

  // 21. DynamoDB encryption disabled
  {
    id: 'dynamodb-no-encryption',
    name: 'DynamoDB Missing Encryption',
    severity: 'error',
    message: 'DynamoDB table has encryption disabled. All production tables should encrypt data at rest to meet compliance requirements and protect against unauthorized access.',
    evaluate: (node) => {
      if (node.data.service !== 'dynamodb') return null;
      return node.data.encryption === false ? node.id : null;
    }
  },

  // ── S3 ────────────────────────────────────────────────────────

  // 22. S3 no server-side encryption
  {
    id: 's3-no-encryption',
    name: 'S3 Bucket Missing Encryption',
    severity: 'error',
    message: 'S3 bucket has no server-side encryption enabled. All production buckets must encrypt data at rest. Enable SSE-S3 at minimum, or SSE-KMS for sensitive data.',
    evaluate: (node) => {
      if (node.data.service !== 's3') return null;
      return node.data.encryptionType === 'None' ? node.id : null;
    }
  },

  // 23. S3 static hosting + block public access conflict
  {
    id: 's3-static-hosting-conflict',
    name: 'S3 Static Website Hosting Conflict',
    severity: 'error',
    message: 'S3 has static website hosting enabled but Block Public Access is also enabled. These settings conflict — static website hosting requires public access. Either disable Block Public Access for the static site, or serve via CloudFront instead.',
    evaluate: (node) => {
      if (node.data.service !== 's3') return null;
      return (node.data.staticWebsiteHosting && node.data.blockPublicAccess) ? node.id : null;
    }
  },

  // ── SQS ──────────────────────────────────────────────────────

  // 24. SQS FIFO queue name missing .fifo suffix
  {
    id: 'sqs-fifo-name-suffix',
    name: 'SQS FIFO Queue Name Missing .fifo',
    severity: 'error',
    message: 'AWS requires FIFO queue names to end with ".fifo". Without this suffix, the queue creation will fail at deployment. Rename this queue to end with ".fifo".',
    evaluate: (node) => {
      if (node.data.service !== 'sqs') return null;
      if (!node.data.isFifo) return null;
      const label = node.data.label || '';
      return !label.endsWith('.fifo')
        ? { nodeId: node.id, message: `FIFO queue "${label}" must end with ".fifo". Rename to "${label}.fifo".` }
        : null;
    }
  },

  // 25. SQS DLQ enabled but max receive count is zero
  {
    id: 'sqs-dlq-no-max-receive',
    name: 'SQS DLQ Without Max Receive Count',
    severity: 'warning',
    message: 'SQS Dead Letter Queue is enabled but max receive count is not configured (set to 0). Without this, messages will never be routed to the DLQ. Set max receive count to 3-5 for typical workloads.',
    evaluate: (node) => {
      if (node.data.service !== 'sqs') return null;
      return (node.data.dlqEnabled && node.data.maxReceiveCount === 0) ? node.id : null;
    }
  },

  // 26. SQS message retention too short
  {
    id: 'sqs-short-retention',
    name: 'SQS Short Message Retention',
    severity: 'warning',
    message: 'SQS message retention is under 1 day (86400 seconds). Messages that are not processed in time will be silently dropped. Increase retention to at least 4 days for production queues.',
    evaluate: (node) => {
      if (node.data.service !== 'sqs') return null;
      const retention = node.data.messageRetentionSeconds;
      return (typeof retention === 'number' && retention < 86400) ? node.id : null;
    }
  },

  // ── SNS ──────────────────────────────────────────────────────

  // 27. SNS open access policy
  {
    id: 'sns-open-access-policy',
    name: 'SNS Topic Open Access Policy',
    severity: 'error',
    message: 'SNS topic has an open access policy allowing any AWS account to publish or subscribe. This creates severe risk of unauthorized message injection or data exfiltration. Restrict the resource policy to specific principals.',
    evaluate: (node) => {
      if (node.data.service !== 'sns') return null;
      return node.data.accessPolicy === 'Open' ? node.id : null;
    }
  },

  // 28. FIFO SNS connected to Standard SQS
  {
    id: 'sns-fifo-to-standard-sqs',
    name: 'FIFO SNS Cannot Subscribe Standard SQS',
    severity: 'error',
    message: 'A FIFO SNS topic cannot deliver messages to a Standard SQS queue. FIFO SNS topics only support FIFO SQS queues as subscribers. Change the SQS queue to FIFO or use a Standard SNS topic.',
    evaluate: (node, nodes, edges) => {
      if (node.data.service !== 'sns') return null;
      if (node.data.topicType !== 'FIFO') return null;
      const hasViolation = edges
        .filter(e => e.source === node.id)
        .some(e => {
          const target = nodes.find(n => n.id === e.target);
          return target?.data?.service === 'sqs' && !target?.data?.isFifo;
        });
      return hasViolation ? node.id : null;
    }
  },

  // ── Cognito ───────────────────────────────────────────────────

  // 29. Cognito MFA disabled
  {
    id: 'cognito-no-mfa',
    name: 'Cognito MFA Disabled',
    severity: 'warning',
    message: 'Cognito User Pool has MFA disabled. Without MFA, compromised passwords give attackers full account access. Enable at least Optional MFA for production user pools handling sensitive data.',
    evaluate: (node) => {
      if (node.data.service !== 'cognito') return null;
      return node.data.mfaMode === 'OFF' ? node.id : null;
    }
  },

  // 30. Cognito weak password policy
  {
    id: 'cognito-weak-password',
    name: 'Cognito Weak Password Policy',
    severity: 'error',
    message: 'Cognito password minimum length is below 8 characters. This violates AWS security best practices and most compliance frameworks (SOC2, HIPAA, PCI-DSS). Set minimum length to at least 8.',
    evaluate: (node) => {
      if (node.data.service !== 'cognito') return null;
      const len = node.data.passwordMinLength;
      return (typeof len === 'number' && len < 8)
        ? { nodeId: node.id, message: `Password minimum length is ${len}. Must be at least 8.` }
        : null;
    }
  },

  // 31. Cognito access token validity too long
  {
    id: 'cognito-long-access-token',
    name: 'Cognito Access Token Validity Too Long',
    severity: 'warning',
    message: 'Cognito access token validity exceeds 24 hours. Long-lived access tokens increase the window of exposure if a token is compromised. Set access token validity to 1 hour or less for production.',
    evaluate: (node) => {
      if (node.data.service !== 'cognito') return null;
      return node.data.accessTokenValidityHours > 24 ? node.id : null;
    }
  },

  // 32. Cognito advanced security disabled
  {
    id: 'cognito-no-advanced-security',
    name: 'Cognito Advanced Security Disabled',
    severity: 'warning',
    message: 'Cognito Advanced Security Mode is disabled. This feature detects compromised credentials, adds adaptive authentication, and provides security event logging. Enable it for production user pools.',
    evaluate: (node) => {
      if (node.data.service !== 'cognito') return null;
      return node.data.advancedSecurity === false ? node.id : null;
    }
  },
];