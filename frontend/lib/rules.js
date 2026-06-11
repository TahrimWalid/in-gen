// frontend/lib/rules.js

export const rules = [
  // 1. The Dead-End Gateway
  {
    id: 'api-gateway-no-compute',
    name: 'Dead-End API Gateway',
    severity: 'error',
    message: 'This API Gateway is not connected to any compute service. Route it to a Lambda or AWS service.',
    explanation: 'API Gateway is the entry point for client requests, but without a connected backend (Lambda, HTTP integration, or another AWS service), every route has nowhere to send incoming requests. ReactFlow shows this as a gateway node with no outgoing edges — meaning no integration has been wired up for any route.',
    consequence: 'Every API call returns a 500 Internal Server Error or 404, since API Gateway has nothing to invoke. Clients — including your own frontend — see total failure on every endpoint until an integration is added, and this is often only discovered after deployment when the first real request fails.',
    awsDocsUrl: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/getting-started-with-lambda-integration.html',
    fix: { type: 'structural' },
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
    explanation: 'A Lambda function with no event source (API Gateway, SQS, EventBridge, etc.) and no outgoing connections will never be invoked by anything in this architecture. It exists in the diagram but has no way to receive events or deliver output anywhere.',
    consequence: 'The function is dead weight from a deployment standpoint — Lambda only bills on invocation, so it costs nothing to run, but it represents wasted development effort and a Terraform resource that serves no purpose. In practice this almost always signals a missing connection that was forgotten during design.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/lambda-invocation.html',
    fix: { type: 'structural' },
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
    explanation: 'An API Gateway route with authType set to NONE means anyone on the internet can invoke the connected Lambda or backend without presenting credentials. This is appropriate for genuinely public endpoints (a health check, a public landing page) but dangerous for anything that touches user data or business logic.',
    consequence: 'Attackers can call the endpoint directly, bypassing any authentication checks your frontend performs. Exposed APIs like this have been used in real incidents to mass-enumerate user records, trigger unauthorized writes, or invoke costly Lambda functions at scale — a so-called "denial of wallet" attack that runs up your AWS bill.',
    awsDocsUrl: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-to-api.html',
    fix: { type: 'ai-only' },
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
    explanation: 'An SNS topic with no subscribers means published messages have nowhere to go. Unlike SQS, SNS does not queue messages for future subscribers — if nothing is subscribed at the moment a message is published, that message is discarded immediately.',
    consequence: 'Notifications, fan-out events, or alerts published to this topic vanish silently with no error and no retry. Downstream systems that should have reacted — sending emails, triggering Lambdas, writing to queues — never receive the event, and there is no record that anything was supposed to happen.',
    awsDocsUrl: 'https://docs.aws.amazon.com/sns/latest/dg/sns-how-it-works.html',
    fix: { type: 'structural' },
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
    explanation: 'An EventBridge bus with no rules or targets means every event published to it matches nothing and is dropped. EventBridge has no default "catch-all" destination — events without a matching rule simply disappear after being accepted.',
    consequence: 'Any service publishing events to this bus — state changes, scheduled triggers, cross-service notifications — has those events silently discarded with no error, no retry, and no record beyond the original PutEvents call. Debugging "why isn\'t X happening downstream" becomes very difficult because there is no failure signal anywhere in the pipeline.',
    awsDocsUrl: 'https://docs.aws.amazon.com/eventbridge/latest/userguide/eb-rules.html',
    fix: { type: 'structural' },
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
    explanation: 'Messages are flowing into this SQS queue, but no Lambda or other consumer is polling it. SQS does not process messages on its own — it just retains them until they expire or are explicitly consumed.',
    consequence: 'Messages accumulate in the queue until they hit the retention period (default 4 days) and are then permanently deleted, unprocessed. Whatever business logic was supposed to run on these messages — order fulfillment, email sending, data processing — never executes, and the failure is invisible unless someone is actively watching ApproximateNumberOfMessagesVisible in CloudWatch.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html',
    fix: { type: 'structural' },
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
    explanation: 'When a Lambda function receives an SQS message, the message becomes invisible for the visibility timeout period. If your Lambda takes longer than this timeout to process the message, SQS assumes the processing failed and makes the message visible again — causing it to be processed a second time.',
    consequence: 'Duplicate order processing, double charges, duplicate notifications, or corrupted data. In financial systems this can be catastrophic. The AWS recommendation is at least 6× the Lambda timeout to provide adequate safety margin.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/with-sqs.html#events-sqs-queueconfig',
    fix: { type: 'property', updates: [] },
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
    explanation: 'S3 Block Public Access is a bucket-level safety net that overrides all ACLs and bucket policies that would grant public access. Even if your bucket policy looks restrictive, without this setting a misconfigured ACL can silently expose your data.',
    consequence: 'Public S3 buckets are one of the most common causes of data breaches in AWS. Sensitive files, database backups, and internal documents have been leaked this way at major companies including Capital One and Twitch.',
    awsDocsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/access-control-block-public-access.html',
    fix: { type: 'property', updates: [{ field: 'blockPublicAccess', value: true }] },
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
    explanation: 'AWS sets new Lambda functions to a 3-second timeout by default. This value is rarely intentional — it is simply what is left when a developer does not configure a timeout, and it is far too short for most real workloads like database queries, external API calls, or file processing.',
    consequence: 'Functions that legitimately need more than 3 seconds — and a cold start alone can take 1-2 seconds for some runtimes — will be killed mid-execution with a "Task timed out" error. This can leave operations in a partially-completed state, such as a record written to DynamoDB while the corresponding S3 upload never happens, causing data inconsistency.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-function-common.html',
    fix: { type: 'property', updates: [{ field: 'timeout', value: 30 }] },
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
    explanation: 'Point-in-Time Recovery (PITR) continuously backs up your DynamoDB table, allowing restoration to any second within the last 35 days. Without it, the only protection against data loss is whatever on-demand backups you have manually created, if any.',
    consequence: 'A buggy deployment that runs a bulk delete or overwrite, or an engineer running the wrong script against production, results in permanent data loss. Without PITR there is no "undo" — this exact scenario has caused real production incidents where a single bad migration script wiped out hours or days of customer data.',
    awsDocsUrl: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/PointInTimeRecovery.html',
    fix: { type: 'property', updates: [{ field: 'pointInTimeRecovery', value: true }] },
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
    explanation: 'API Gateway throttling caps the rate of requests it will accept (in requests per second) before returning 429 Too Many Requests. Without it, there is no ceiling on how fast traffic — legitimate or malicious — can hit your backend.',
    consequence: 'A traffic spike, a retry storm from a misbehaving client, or a bot scraping your API can drive Lambda concurrency to your account limit, causing throttling errors for unrelated functions, and can rack up a Lambda and API Gateway bill far beyond expectations within hours.',
    awsDocsUrl: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html',
    fix: { type: 'property', updates: [{ field: 'throttlingEnabled', value: true }] },
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
    explanation: 'When a Lambda function is invoked asynchronously (by EventBridge or SNS) and fails after exhausting its automatic retries (2 retries by default), AWS discards the event entirely unless a Dead Letter Queue or destination is configured to capture it.',
    consequence: 'Failed events disappear with no record. If a Lambda processing order-confirmation emails starts throwing errors due to a bad deploy, every failed invocation during that window is lost forever — there is no automatic way to identify which events failed or replay them once the bug is fixed.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/invocation-async.html#invocation-dlq',
    fix: { type: 'property', updates: [{ field: 'hasDeadLetterQueue', value: true }] },
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
    explanation: 'AWS periodically deprecates Lambda runtimes when the underlying language version reaches end-of-life. Deprecated runtimes stop receiving security patches, meaning known vulnerabilities in the runtime remain unpatched in your functions.',
    consequence: 'Running deprecated runtimes means running unpatched code in production. AWS will eventually block new deployments to deprecated runtimes and may disable existing functions. Security compliance frameworks (SOC2, HIPAA) require up-to-date runtimes.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/lambda-runtimes.html',
    fix: { type: 'property', updates: [{ field: 'runtime', value: 'nodejs20.x' }] },
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
    explanation: 'Reserved concurrency caps the maximum number of simultaneous executions for a function and reserves that capacity from the account-wide pool (default 1000). Leaving it at -1 (unreserved) means this function can scale up to consume the entire account\'s available concurrency.',
    consequence: 'If this function experiences a sudden traffic spike or gets stuck in a retry loop — for example processing poison-pill SQS messages — it can consume all available concurrency in the AWS account, causing every other Lambda function, including unrelated and critical ones, to start throwing ThrottlingException errors with no invocations available.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-concurrency.html',
    fix: { type: 'property', updates: [{ field: 'reservedConcurrency', value: 100 }] },
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
    explanation: 'Attaching a Lambda function to a VPC requires AWS to provision an Elastic Network Interface for the function\'s execution environment. While AWS has significantly improved this since 2019 with Hyperplane ENIs, VPC-enabled functions still have measurably higher cold start latency than non-VPC functions.',
    consequence: 'If this Lambda doesn\'t actually need to reach private resources — RDS in a private subnet, ElastiCache, internal load balancers — the VPC attachment adds unnecessary cold-start latency to every cold invocation, and complicates outbound internet access by requiring a NAT Gateway, which itself costs roughly $32/month plus data processing fees.',
    awsDocsUrl: 'https://docs.aws.amazon.com/lambda/latest/dg/configuration-vpc.html',
    fix: { type: 'property', updates: [{ field: 'vpcEnabled', value: false }] },
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
    explanation: 'API Gateway without WAF has no protection against common web attacks. WAF inspects incoming HTTP requests and blocks malicious patterns before they reach your Lambda functions.',
    consequence: 'SQL injection, XSS, and DDoS attacks can reach your backend directly. A sustained DDoS can trigger thousands of Lambda invocations, causing service degradation and unexpected AWS bills.',
    awsDocsUrl: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/apigateway-control-access-aws-waf.html',
    fix: { type: 'property', updates: [{ field: 'wafEnabled', value: true }] },
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
    explanation: 'CORS with Access-Control-Allow-Origin: * tells browsers that any website, on any domain, is permitted to make requests to this API and read the response. This is convenient during development but removes a key browser-enforced security boundary in production.',
    consequence: 'A malicious website can embed JavaScript that calls your API directly from a victim\'s browser session. If the API relies on cookies or implicit credentials for auth rather than explicit tokens, this enables cross-site request forgery-style data theft. Even with token-based auth, wildcard CORS makes it trivial for any site to probe your API\'s behavior and error messages.',
    awsDocsUrl: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/how-to-cors.html',
    fix: { type: 'property', updates: [{ field: 'corsOrigin', value: '' }] },
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
    explanation: 'API Gateway\'s rate limit defines the steady-state requests-per-second your API will accept, while the burst limit defines how many requests can be queued momentarily above that rate using a token bucket algorithm. A rate limit with burstLimit set to 0 means there is no buffer for short traffic spikes.',
    consequence: 'Even brief, normal traffic bursts — a user double-clicking, a frontend retrying a failed request, multiple browser tabs loading simultaneously — get rejected with 429 Too Many Requests, even though average traffic is well within the configured rate. This produces intermittent, hard-to-reproduce errors that frustrate users and support teams.',
    awsDocsUrl: 'https://docs.aws.amazon.com/apigateway/latest/developerguide/api-gateway-request-throttling.html',
    fix: { type: 'property', updates: [{ field: 'burstLimit', value: 2000 }] },
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
    explanation: 'PROVISIONED billing mode requires you to specify fixed read/write capacity units up front. Without auto-scaling configured as a separate AWS resource — something this diagram cannot detect — that capacity stays fixed regardless of actual traffic.',
    consequence: 'If traffic exceeds provisioned capacity, requests are throttled with ProvisionedThroughputExceededException, even though PAY_PER_REQUEST mode would have absorbed the same load with zero configuration. Conversely, over-provisioning for peak traffic means paying for idle capacity around the clock. PAY_PER_REQUEST removes this entire class of capacity-planning problem for workloads with unpredictable or spiky traffic.',
    awsDocsUrl: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/HowItWorks.ReadWriteCapacityMode.html',
    fix: { type: 'property', updates: [{ field: 'billingMode', value: 'PAY_PER_REQUEST' }] },
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
    explanation: 'DynamoDB Streams captures a time-ordered log of item-level changes — inserts, updates, and deletes — for 24 hours. Enabling streams without attaching a consumer (typically a Lambda function via event source mapping) means this change log is captured but never read.',
    consequence: 'Stream records expire and are permanently deleted after 24 hours. If streams were enabled to power a feature like search-index syncing, audit logging, or cross-region replication, that feature silently does nothing — and the enabled stream still carries a small but non-zero cost for zero benefit.',
    awsDocsUrl: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/Streams.Lambda.html',
    fix: { type: 'structural' },
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
    explanation: 'DynamoDB tables can be encrypted at rest using AWS-owned keys, AWS-managed KMS keys, or customer-managed KMS keys. With encryption disabled, data is stored without this protection layer.',
    consequence: 'Compliance frameworks like SOC2, HIPAA, and PCI-DSS typically mandate encryption at rest for any table storing sensitive data, and audits will fail without it. While DynamoDB has encrypted all tables by default since 2018, an explicit encryption: false in this diagram represents a deliberate downgrade that auditors and security reviewers will flag immediately.',
    awsDocsUrl: 'https://docs.aws.amazon.com/amazondynamodb/latest/developerguide/EncryptionAtRest.html',
    fix: { type: 'property', updates: [{ field: 'encryption', value: true }] },
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
    explanation: 'S3 server-side encryption (SSE-S3, SSE-KMS, or SSE-C) encrypts objects as they are written to disk and decrypts them on retrieval, transparent to the application. With encryptionType set to "None", objects are stored in plaintext on AWS\'s storage infrastructure.',
    consequence: 'Any data stored in this bucket — user uploads, database backups, logs, generated reports — is unencrypted at rest. Combined with any future misconfiguration of bucket permissions, this compounds the blast radius of a leak. Most compliance frameworks (SOC2, HIPAA, PCI-DSS, GDPR) require encryption at rest for buckets containing personal or sensitive data.',
    awsDocsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/UsingKMSEncryption.html',
    fix: { type: 'property', updates: [{ field: 'encryptionType', value: 'SSE-S3' }] },
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
    explanation: 'S3 static website hosting serves objects over HTTP/HTTPS to anyone with the bucket\'s website endpoint URL — this requires the bucket or specific objects to be publicly readable. Block Public Access, when enabled, overrides bucket policies and ACLs to deny all public access. These two settings are mutually exclusive.',
    consequence: 'With both enabled, every request to the static website endpoint returns 403 Forbidden — the site is completely unreachable despite being "configured". Terraform apply may still succeed since the provider does not always validate this combination, so the actual site silently fails for every visitor, often only discovered after deployment.',
    awsDocsUrl: 'https://docs.aws.amazon.com/AmazonS3/latest/userguide/website-hosting-custom-domain-walkthrough.html',
    fix: { type: 'property', updates: [{ field: 'staticWebsiteHosting', value: false }] },
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
    explanation: 'AWS enforces a naming convention for FIFO queues: the queue name, and therefore its ARN, must end in ".fifo". This is a hard validation rule enforced by the SQS API itself — Terraform\'s aws_sqs_queue resource will be rejected by AWS if fifo_queue is true and the name does not have this suffix.',
    consequence: 'terraform apply fails outright with an InvalidParameterValue error from the SQS API — the queue is never created. This is caught at deploy time, not plan time, so it can block an entire deployment pipeline that includes other unrelated resources in the same apply.',
    awsDocsUrl: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/FIFO-queues.html',
    fix: { type: 'property', updates: [] },
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
    explanation: 'A Dead Letter Queue redirects messages that fail processing repeatedly, but only after maxReceiveCount delivery attempts. With maxReceiveCount set to 0, SQS has no threshold configured for when to consider a message "failed" and move it to the DLQ.',
    consequence: 'Messages that repeatedly fail processing — a "poison pill" — are redelivered to the consumer indefinitely instead of being routed to the DLQ for inspection. A single malformed message can consume Lambda invocations in an infinite retry loop until the message\'s retention period expires, masking the underlying bug and wasting compute.',
    awsDocsUrl: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-dead-letter-queues.html',
    fix: { type: 'property', updates: [{ field: 'maxReceiveCount', value: 3 }] },
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
    explanation: 'Message retention determines how long SQS keeps an unconsumed message before permanently deleting it, ranging from 60 seconds to 14 days with a default of 4 days (345600 seconds). A retention period under 86400 seconds (1 day) leaves very little buffer for consumer downtime.',
    consequence: 'If the consuming Lambda is down for a deployment, hits a bug, or the queue backs up due to a traffic spike, messages older than the retention window are permanently and silently deleted — a DLQ does not help here, since DLQs only catch processing failures, not expiry. This is a common cause of "missing data" incidents that are very hard to diagnose after the fact.',
    awsDocsUrl: 'https://docs.aws.amazon.com/AWSSimpleQueueService/latest/SQSDeveloperGuide/sqs-basic-architecture.html',
    fix: { type: 'property', updates: [{ field: 'messageRetentionSeconds', value: 345600 }] },
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
    explanation: 'An SNS topic\'s resource policy controls who can publish messages to it or subscribe to it. An "Open" access policy — effectively Principal: "*" with no conditions — allows any AWS account in the world, not just your own, to publish to or subscribe to this topic.',
    consequence: 'Any external AWS account can publish arbitrary messages to your topic, potentially triggering downstream Lambda functions, sending fake notifications to your users, or flooding subscribed SQS queues to run up your bill. An attacker could also subscribe their own endpoint to silently receive a copy of every message your application publishes — a direct data exfiltration vector.',
    awsDocsUrl: 'https://docs.aws.amazon.com/sns/latest/dg/sns-access-policy-use-cases.html',
    fix: { type: 'property', updates: [{ field: 'accessPolicy', value: 'Restricted' }] },
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
    explanation: 'FIFO SNS topics guarantee strict message ordering and exactly-once delivery, but AWS only allows them to fan out to FIFO SQS queues — the ordering and deduplication guarantees cannot be preserved by a Standard queue, which may reorder or duplicate messages.',
    consequence: 'terraform apply fails when creating the aws_sns_topic_subscription — AWS rejects the subscription with an InvalidParameter error because a FIFO topic cannot deliver to a non-FIFO queue. The deployment is blocked until the SQS queue is converted to FIFO, which requires recreating it since fifo_queue cannot be changed in place, or the SNS topic is changed to Standard.',
    awsDocsUrl: 'https://docs.aws.amazon.com/sns/latest/dg/fifo-topics.html',
    fix: { type: 'structural' },
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
    explanation: 'Without MFA, the only protection on user accounts is a password. If a user reuses a password from another breached service, or if credentials are phished, an attacker gains full account access with no additional barrier.',
    consequence: 'Account takeover attacks. In apps handling payments, health data, or personal information, a single compromised account can expose sensitive user data and create significant liability.',
    awsDocsUrl: 'https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-mfa.html',
    fix: { type: 'property', updates: [{ field: 'mfaMode', value: 'OPTIONAL' }] },
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
    explanation: 'Cognito\'s password policy enforces minimum complexity requirements at sign-up and password-change time. A minimum length below 8 characters falls below NIST SP 800-63B guidance and the baseline required by virtually every compliance framework.',
    consequence: 'Short passwords are dramatically easier to brute-force or crack from a leaked hash database — an 8-character minimum with mixed character classes can take years to crack offline, while shorter passwords can fall in hours on consumer hardware. SOC2, HIPAA, and PCI-DSS audits will fail a user pool configured below 8 characters, and any breach involving weak credentials becomes a liability finding.',
    awsDocsUrl: 'https://docs.aws.amazon.com/cognito/latest/developerguide/user-pool-settings-policies.html',
    fix: { type: 'property', updates: [{ field: 'passwordMinLength', value: 8 }] },
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
    explanation: 'Cognito access tokens are JWTs that grant API access for their entire validity period — they cannot be revoked server-side before they expire. A validity period over 24 hours means a stolen token remains usable by an attacker for up to that long, regardless of whether the user logs out or changes their password.',
    consequence: 'If an access token leaks via XSS, a compromised device, or a logging misconfiguration that captures Authorization headers, the attacker gets a full day or more of authenticated API access with no way for the application to cut it off short of rotating the entire user pool\'s signing keys, which invalidates every user\'s session.',
    awsDocsUrl: 'https://docs.aws.amazon.com/cognito/latest/developerguide/amazon-cognito-user-pools-using-tokens-with-identity-providers.html',
    fix: { type: 'property', updates: [{ field: 'accessTokenValidityHours', value: 1 }] },
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
    explanation: 'Cognito Advanced Security Mode adds compromised-credential detection (checking sign-in attempts against known leaked credential databases), adaptive authentication that scores risk per sign-in, and detailed security event logging for the user pool.',
    consequence: 'Without it, Cognito has no way to flag a sign-in using a password that appears in a known breach dump, no risk-based step-up authentication for unusual login patterns (new device, new country), and no security event history to investigate after a suspected compromise.',
    awsDocsUrl: 'https://docs.aws.amazon.com/cognito/latest/developerguide/cognito-user-pool-settings-advanced-security.html',
    fix: { type: 'property', updates: [{ field: 'advancedSecurity', value: true }] },
    evaluate: (node) => {
      if (node.data.service !== 'cognito') return null;
      return node.data.advancedSecurity === false ? node.id : null;
    }
  },
];
