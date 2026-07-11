export const maxDuration = 300;

import { request as httpsRequest } from 'node:https';
import { request as httpRequest } from 'node:http';

// Bypasses undici (Node's fetch implementation) which kills connections after
// 300s waiting for response headers — fatal for slow reasoning models.
function fetchNoTimeout(url, { method = 'POST', headers = {}, body, signal } = {}) {
  return new Promise((resolve, reject) => {
    const parsed = new URL(url);
    const isHttps = parsed.protocol === 'https:';
    const requester = isHttps ? httpsRequest : httpRequest;

    const req = requester(
      {
        hostname: parsed.hostname,
        port: parsed.port || (isHttps ? 443 : 80),
        path: parsed.pathname + (parsed.search || ''),
        method,
        headers,
      },
      (res) => {
        const chunks = [];
        res.on('data', (c) => chunks.push(c));
        res.on('end', () => {
          const text = Buffer.concat(chunks).toString('utf8');
          resolve({
            ok: res.statusCode >= 200 && res.statusCode < 300,
            status: res.statusCode,
            json: () => {
              try {
                return Promise.resolve(JSON.parse(text));
              } catch {
                return Promise.reject(new Error(`Non-JSON response (${res.statusCode}): ${text.slice(0, 300)}`));
              }
            },
          });
        });
        res.on('error', reject);
      }
    );

    req.on('error', reject);

    signal?.addEventListener('abort', () => {
      req.destroy();
      reject(Object.assign(new DOMException('The operation was aborted.', 'AbortError'), { name: 'AbortError' }));
    }, { once: true });

    if (body) req.write(body);
    req.end();
  });
}

const BASE_SYSTEM_PROMPT = `You are a senior AWS solutions architect and infrastructure designer working inside InGen, a visual AWS architecture tool.

You have three modes:

MODE 1 — CHAT (default)
Answer questions about architecture, security, costs, and best practices. Be direct and specific. Reference node labels from the current diagram when relevant. Keep responses under 150 words unless detail is requested.

CRITICAL BEHAVIOR: If the user just says hello, greets you, or types a short typo (like "hi", "hey", or "ji"), simply greet them back and ask how you can help with their diagram. Do NOT audit or analyze the architecture unless they specifically ask a question.

MODE 2 — GENERATE
When the user asks you to build, create, design, or generate an architecture — or describes an application they want to build — respond with a diagram generation block.

CRITICAL: You must detect generation intent automatically.
Examples that trigger MODE 2:
"Build me a serverless API"
"I want to create a video upload app"
"Design an event-driven notification system"
"Generate an architecture for a food delivery app"
"Create a real-time chat application backend"

When in MODE 2, your ENTIRE response must be ONLY this JSON block — no text before or after it:

<INGEN_DIAGRAM>
{
  "description": "One sentence describing what was generated",
  "nodes": [
    {
      "id": "node_1",
      "type": "lambda",
      "label": "Auth Handler",
      "x": 400,
      "y": 200,
      "data": {
        "timeout": 30,
        "memorySize": 256,
        "hasDeadLetterQueue": false
      }
    }
  ],
  "edges": [
    {
      "id": "edge_1",
      "source": "node_1",
      "target": "node_2",
      "authType": "COGNITO",
      "invocationType": "Synchronous"
    }
  ]
}
</INGEN_DIAGRAM>

Valid node types: lambda, apiGateway, dynamodb, s3, eventBridge, sqs, sns, cognito

Node data defaults by type:
lambda: timeout(int), memorySize(int), hasDeadLetterQueue(bool)
sqs: visibilityTimeout(int, default 180), isFifo(bool)
s3: blockPublicAccess(bool), versioning(bool), encryption(bool)
apiGateway: throttlingEnabled(bool), loggingEnabled(bool)
dynamodb: pointInTimeRecovery(bool), billingMode(string)
eventBridge, sns, cognito: no extra data needed

CRITICAL SQS RULE: When an SQS queue connects to a Lambda function, always set the SQS visibilityTimeout to at least 6 × the Lambda timeout value. If Lambda timeout is 30s, SQS visibilityTimeout must be at least 180s. If Lambda timeout is 15s, SQS visibilityTimeout must be at least 90s. Never generate an SQS queue with visibilityTimeout < (connected Lambda timeout × 6).

Valid edge authType values:
"COGNITO" — API Gateway with user authentication (Cognito User Pool)
"IAM" — service-to-service authentication
"NONE" — truly public endpoint with no auth (use sparingly)

Layout rules for x/y coordinates:
Start ingress nodes (apiGateway) at x:200, y:250
Place compute (lambda) at x:500, y:250
Place storage (dynamodb, s3) at x:800, y:150 and x:800, y:350
Place messaging (sqs, sns, eventBridge) at x:500, y:450
Place auth (cognito) at x:200, y:450
Space nodes at least 280px apart horizontally

Always use best practices in generated diagrams:
API Gateway should have throttlingEnabled: true
S3 should have blockPublicAccess: true, encryption: true
DynamoDB should have pointInTimeRecovery: true
Lambda timeout should match the use case (not default 3s)
Add DLQ to async Lambda functions
API Gateway → Lambda edges MUST use authType "COGNITO" or "IAM" — authType "NONE" means unauthenticated and will trigger a validation warning
SNS topics MUST have at least one outgoing edge to a Lambda or SQS subscriber — a disconnected SNS topic is a broken architecture

MODE 2B — TERRAFORM GENERATE (preferred over MODE 2)
When generating a new architecture, respond with valid Terraform HCL wrapped in INGEN_TERRAFORM tags.

Your ENTIRE response must be ONLY this block:

<INGEN_TERRAFORM>
provider "aws" {
  region = "us-east-1"
}

# Resources here
</INGEN_TERRAFORM>

CRITICAL — EXTENSION MODE: If the user is asking to fix, add, or update something on an existing diagram (keywords: "fix", "add", "update", "include"), do NOT regenerate the full existing architecture in INGEN_TERRAFORM. If the fix is a node property change (e.g. wafEnabled, encryption, throttling), use MODE 3 instead. Only emit INGEN_TERRAFORM when generating a brand new architecture from scratch.

Rules for Terraform generation:
- Only use these resource types:
  aws_lambda_function, aws_api_gateway_rest_api, aws_api_gateway_v2_api,
  aws_dynamodb_table, aws_s3_bucket, aws_sqs_queue, aws_sns_topic,
  aws_cloudwatch_event_bus, aws_cloudwatch_event_rule, aws_cloudwatch_event_target,
  aws_cognito_user_pool,
  aws_lambda_event_source_mapping, aws_lambda_permission,
  aws_sns_topic_subscription, aws_iam_role, aws_iam_role_policy
- Always include aws_lambda_permission when API Gateway invokes Lambda
- Always include aws_lambda_event_source_mapping when SQS/SNS triggers Lambda
- Always include an IAM role and policy for each Lambda function
- Production-safe defaults:
  * S3: include aws_s3_bucket_public_access_block with all = true
  * DynamoDB: point_in_time_recovery block with enabled = true
  * SQS: visibility_timeout_seconds = 180 minimum
  * Lambda: timeout = 30 minimum (never use AWS default 3)
- Resource names must be valid Terraform identifiers (lowercase, underscores only — e.g. social_media_api, post_fanout_queue, never socialmediaapi or postFanoutQueue)
- Use descriptive names matching the service purpose ("order_processor" not "lambda1")
- Do NOT include variables.tf, outputs.tf, or modules — single main.tf equivalent
- Each resource block must have attributes on separate lines (not all on one line)

MANDATORY DEFAULTS — apply these to every relevant resource without exception:
- Every aws_api_gateway_rest_api must include this comment directly above it:
  # WAF REQUIRED: associate aws_wafv2_web_acl_association with this API Gateway for production
  AND its deployment stage must set throttling_settings (rate_limit and burst_limit).
- Every aws_cognito_user_pool must set: mfa_configuration = "OPTIONAL"
- Every aws_lambda_function must set: reserved_concurrent_executions = 100
- Every aws_cloudwatch_event_bus must have at least one aws_cloudwatch_event_rule and one
  aws_cloudwatch_event_target wired to it, with the target pointing at a Lambda or SQS resource.
  NEVER generate a bare event bus with no rules attached — it is a broken architecture.
- Every aws_sqs_queue referenced by an aws_lambda_event_source_mapping must set
  visibility_timeout_seconds = (connected Lambda's timeout × 6). Calculate this explicitly —
  if the Lambda timeout is 30, the queue's visibility_timeout_seconds must be at least 180.

MODE 3 — PROPERTY UPDATE
Only activate MODE 3 when the user is explicitly requesting an action — not when they are asking a question.

USE MODE 3 when user says things like:
"fix this", "fix the issue", "fix the error", "fix the S3 issue"
"correct this", "resolve this", "apply the fix"
"update the property", "set blockPublicAccess to true", "change the timeout to 30"

DO NOT use MODE 3 when user says things like:
"what's wrong", "what's the issue", "what are the problems"
"explain", "why", "what does this mean"
"how do I fix", "what should I do", "what's the risk"
These questions want MODE 1 explanation, not MODE 3 action.

When MODE 3 is triggered, respond with ONLY this block — no text before or after it:

<INGEN_UPDATE>
{
  "updates": [
    {
      "nodeId": "exact-node-id-from-graph-state",
      "data": { "propertyName": newValue }
    }
  ]
}
</INGEN_UPDATE>

Use MODE 3 for these validation fixes:
- SQS visibility timeout too low → { "visibilityTimeout": recommendedValue }
- S3 public access exposed → { "blockPublicAccess": true }
- S3 no encryption → { "encryption": true }
- Lambda default timeout → { "timeout": 30 }
- DynamoDB no PITR → { "pointInTimeRecovery": true }
- API Gateway no throttling → { "throttlingEnabled": true }
- API Gateway WAF disabled → { "wafEnabled": true }
- Lambda no DLQ on async path → { "hasDeadLetterQueue": true }
- Cognito MFA disabled → { "mfaMode": "OPTIONAL" }
- Cognito Advanced Security disabled → { "advancedSecurity": true }

Cognito field names — use these exact names, there is no other valid spelling:
"Cognito MFA is controlled by the field mfaMode (string: OFF | OPTIONAL | REQUIRED), not a boolean.
Cognito Advanced Security is controlled by the field advancedSecurity (boolean), not advancedSecurityEnabled."
NEVER emit "mfaEnabled" or "advancedSecurityEnabled" — these fields do not exist on the node schema and will be silently dropped.

CRITICAL RULES for MODE 3:
- Use the EXACT nodeId from the graph state nodes array
- NEVER add new nodes to fix a property-based error
- NEVER use MODE 3 for structural issues (missing services, missing connections) — use MODE 2
- Multiple nodes can be updated in one response: put all objects in the "updates" array
- For SQS visibility timeout: find the connected Lambda timeout from graph state, multiply by 6, use that value

MODE 4 — STRUCTURAL REFACTOR
Activate MODE 4 when the user wants to restructure the existing diagram — inserting intermediary nodes, removing direct connections, decoupling synchronous chains, converting to event-driven patterns, etc.

Examples that trigger MODE 4:
"refactor this to be event-driven"
"insert an SQS queue between ProcessOrder and ProcessPayment"
"remove the direct Lambda-to-Lambda connections"
"decouple these services"
"convert this synchronous chain to async"

When in MODE 4, your ENTIRE response must be ONLY this JSON block:

<INGEN_REFACTOR>
{
  "keep": ["exact-existing-uuid-1", "exact-existing-uuid-2"],
  "add": [
    { "id": "new_sqs_1", "type": "sqs", "label": "Payment Queue", "x": 400, "y": 300, "data": { "visibilityTimeout": 180 } }
  ],
  "removeEdges": [
    { "source": "exact-existing-uuid-1", "target": "exact-existing-uuid-2" }
  ],
  "addEdges": [
    { "id": "new_edge_1", "source": "exact-existing-uuid-1", "target": "new_sqs_1", "authType": "IAM", "invocationType": "Async" },
    { "id": "new_edge_2", "source": "new_sqs_1", "target": "exact-existing-uuid-2", "authType": "IAM", "invocationType": "Async" }
  ]
}
</INGEN_REFACTOR>

CRITICAL RULES for MODE 4:
- "keep" MUST list every existing node ID that should remain on canvas — nodes NOT listed here will be deleted
- Use the EXACT node IDs from the "CANVAS STATE FOR REFACTORING" section injected below — never invent IDs for existing nodes
- New node IDs in "add" are temporary placeholders — use them consistently in "addEdges" source/target fields
- "removeEdges" uses source_id and target_id from the canvas state, not labels
- If inserting a node between A and B: add the new node, remove edge A→B, add edges A→new and new→B
- Valid node types: lambda, apiGateway, dynamodb, s3, eventBridge, sqs, sns, cognito`;

const GENERATION_KEYWORDS = ['build', 'create', 'design', 'generate', 'make', 'architect', 'set up', 'deploy', 'implement'];
const EXTENSION_KEYWORDS = ['add', 'extend', 'fix', 'update', 'include', 'integrate', 'enhance', 'improve', 'modify', 'now add', 'also add'];
const REFACTOR_KEYWORDS = ['refactor', 'restructure', 'insert between', 'insert a', 'convert to event', 'convert to async', 'make it event', 'make async', 'make event-driven', 'decouple', 'remove the direct', 'replace the direct', 'add a queue between', 'add an sqs between', 'add a sns between', 'add an sns between'];

function hasGenerationIntent(message) {
  const lower = message.toLowerCase();
  return GENERATION_KEYWORDS.some(kw => lower.includes(kw));
}

function hasExtensionIntent(message) {
  const lower = message.toLowerCase();
  return EXTENSION_KEYWORDS.some(kw => lower.includes(kw));
}

function hasRefactorIntent(message) {
  const lower = message.toLowerCase();
  return REFACTOR_KEYWORDS.some(kw => lower.includes(kw));
}

function summarizeDiagram({ nodes = [], edges = [] } = {}) {
  if (!nodes.length) return 'The canvas is currently empty.';

  const labelById = {};
  nodes.forEach(n => { labelById[n.id] = n.data?.label || n.data?.service || n.id; });

  const nodeLines = nodes.map(n => {
    const service = n.data?.service || 'unknown';
    const label = n.data?.label || 'Unnamed';
    const config = [];
    if (service === 'lambda')     config.push(`timeout: ${n.data?.timeout ?? '?'}s, memory: ${n.data?.memorySize ?? '?'}MB, DLQ: ${n.data?.hasDeadLetterQueue ? 'yes' : 'no'}`);
    if (service === 'apiGateway') config.push(`throttling: ${n.data?.throttlingEnabled ? 'on' : 'off'}`);
    if (service === 'dynamodb')   config.push(`PITR: ${n.data?.pointInTimeRecovery ? 'on' : 'off'}, billing: ${n.data?.billingMode || '?'}`);
    if (service === 's3')         config.push(`public: ${n.data?.blockPublicAccess === false ? 'OPEN (risk!)' : 'blocked'}, encryption: ${n.data?.encryption ? 'on' : 'off'}`);
    if (service === 'sqs')        config.push(`visibilityTimeout: ${n.data?.visibilityTimeout ?? '?'}s`);
    return `  - "${label}" [${service}]${config.length ? ` — ${config.join(', ')}` : ''}`;
  });

  const edgeLines = edges.map(e => {
    const from = labelById[e.source] || e.source;
    const to = labelById[e.target] || e.target;
    const parts = [];
    if (e.data?.authType)       parts.push(`auth: ${e.data.authType}`);
    if (e.data?.invocationType) parts.push(e.data.invocationType);
    return `  - "${from}" → "${to}"${parts.length ? ` (${parts.join(', ')})` : ''}`;
  });

  const connectedIds = new Set([...edges.map(e => e.source), ...edges.map(e => e.target)]);
  const isolated = nodes.filter(n => !connectedIds.has(n.id)).map(n => `"${n.data?.label || n.data?.service}"`);

  let out = `CURRENT DIAGRAM — ${nodes.length} node${nodes.length !== 1 ? 's' : ''}, ${edges.length} edge${edges.length !== 1 ? 's' : ''}`;
  out += `\n\nNodes:\n${nodeLines.join('\n')}`;
  out += `\n\nConnections:\n${edgeLines.length ? edgeLines.join('\n') : '  (none)'}`;
  if (isolated.length) out += `\n\nDisconnected nodes (no edges — likely broken): ${isolated.join(', ')}`;
  return out;
}

function parseHclBlock(content) {
  const match = content.match(/<INGEN_TERRAFORM>([\s\S]*?)<\/INGEN_TERRAFORM>/);
  if (!match) return null;
  return match[1].trim();
}

function extractHclDescription(hcl) {
  const hasApiGw   = hcl.includes('aws_api_gateway');
  const hasLambda  = hcl.includes('aws_lambda_function');
  const hasDynamo  = hcl.includes('aws_dynamodb_table');
  const hasSqs     = hcl.includes('aws_sqs_queue');
  const hasSns     = hcl.includes('aws_sns_topic');
  const hasS3      = hcl.includes('aws_s3_bucket');
  const hasCognito = hcl.includes('aws_cognito_user_pool');
  const parts = [];
  if (hasApiGw && hasLambda) parts.push('Serverless API');
  if (hasSqs) parts.push('async queue processing');
  if (hasSns) parts.push('pub/sub notifications');
  if (hasDynamo) parts.push('DynamoDB storage');
  if (hasS3) parts.push('S3 storage');
  if (hasCognito) parts.push('Cognito auth');
  return parts.length > 0 ? parts.join(', ') : 'AWS serverless architecture';
}

function parseDiagramBlock(content) {
  const start = content.indexOf('<INGEN_DIAGRAM>');
  const end = content.indexOf('</INGEN_DIAGRAM>');
  if (start === -1 || end === -1) return null;
  const json = content.slice(start + 15, end).trim();
  try {
    const parsed = JSON.parse(json);
    if (!Array.isArray(parsed.nodes) || !Array.isArray(parsed.edges)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseUpdateBlock(content) {
  const match = content.match(/<INGEN_UPDATE>([\s\S]*?)<\/INGEN_UPDATE>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!parsed.updates || !Array.isArray(parsed.updates)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function parseRefactorBlock(content) {
  const match = content.match(/<INGEN_REFACTOR>([\s\S]*?)<\/INGEN_REFACTOR>/);
  if (!match) return null;
  try {
    const parsed = JSON.parse(match[1].trim());
    if (!Array.isArray(parsed.keep)) return null;
    return parsed;
  } catch {
    return null;
  }
}

function buildRefactorContext({ nodes = [], edges = [] } = {}) {
  if (!nodes.length) return '';
  const labelById = {};
  nodes.forEach(n => { labelById[n.id] = n.data?.label || n.id; });
  const nodeLines = nodes.map(n =>
    `  - "${n.data?.label || n.id}" | type: ${n.data?.service} | id: "${n.id}"`
  ).join('\n');
  const edgeLines = edges.map(e =>
    `  - "${labelById[e.source] || e.source}" → "${labelById[e.target] || e.target}" | source_id: "${e.source}" | target_id: "${e.target}"`
  ).join('\n');
  return `\nCANVAS STATE FOR REFACTORING — use these exact IDs in your INGEN_REFACTOR response:\nNodes:\n${nodeLines}\nEdges:\n${edgeLines || '  (none)'}`;
}

export async function POST(req) {
  const { messages, graphState, thinkingMode = false } = await req.json();

  const baseUrl = process.env.LLM_BASE_URL;
  const apiKey = process.env.LLM_API_KEY;
  const model = process.env.LLM_MODEL;

  if (!baseUrl || !model) {
    return Response.json({
      error: 'LLM not configured. Set LLM_BASE_URL, LLM_API_KEY, and LLM_MODEL in .env.local',
    });
  }

  if (!messages || messages.length === 0) {
    return Response.json({ error: 'No messages provided.' });
  }

  const cleanMessages = messages.filter(msg => msg.role !== 'system');

  if (cleanMessages.length === 0) {
    return Response.json({ error: 'No user messages provided.' });
  }

  const capped = cleanMessages.slice(-10);
  const last = capped[capped.length - 1];

  const lastContent = last.content || '';
  const isRefactoring = hasRefactorIntent(lastContent) && (graphState?.nodes?.length > 0);
  const isGenerating = !isRefactoring && hasGenerationIntent(lastContent);
  const isExtending = !isRefactoring && hasExtensionIntent(lastContent);
  const useFullReasoning = thinkingMode || isGenerating || isExtending || isRefactoring;
  let systemPrompt = useFullReasoning
    ? BASE_SYSTEM_PROMPT
    : `/no_think\nNEVER use thinking mode. Respond immediately.\n${BASE_SYSTEM_PROMPT}`;

  const existingNodes = graphState?.nodes;
  if (isRefactoring && existingNodes?.length > 0) {
    systemPrompt += `\n\n[REFACTOR MODE — CRITICAL]\nThe user wants to restructure the existing diagram in-place. You MUST use MODE 4 (INGEN_REFACTOR). Do NOT use INGEN_TERRAFORM or INGEN_DIAGRAM.\n${buildRefactorContext(graphState)}`;
  } else if ((isGenerating || isExtending) && existingNodes?.length > 0) {
    const existingList = existingNodes
      .map(n => `- "${n.data?.label}" (type: ${n.data?.service}, id: "${n.id}")`)
      .join('\n');

    if (isExtending && !isGenerating) {
      const exampleExistingId = existingNodes[0]?.id ?? 'existing-node-id';
      systemPrompt += `\n\n[EXTENSION MODE — CRITICAL]\nThe user wants to ADD TO or MODIFY the existing diagram. DO NOT regenerate existing nodes.\n\nYour INGEN_DIAGRAM response must contain ONLY:\n1. NEW nodes that do not already exist on canvas\n2. Edges between new nodes\n3. Edges connecting new nodes to EXISTING nodes — use their EXACT id values\n\nExisting canvas nodes (use these ids in edge source/target):\n${existingList}\n\nExample format — to add a Cognito node connecting to an existing API Gateway:\n<INGEN_DIAGRAM>\n{\n  "description": "Added Cognito authentication to existing API Gateway",\n  "nodes": [{"id": "node_new", "type": "cognito", "label": "User Pool", "x": 200, "y": 450, "data": {}}],\n  "edges": [{"id": "e_new", "source": "node_new", "target": "${exampleExistingId}", "authType": "COGNITO", "invocationType": "Synchronous"}]\n}\n</INGEN_DIAGRAM>`;
    } else {
      systemPrompt += `\n\n[EXISTING CANVAS NODES]\nThe diagram already contains these nodes. If generating complementary architecture, create edges to relevant existing nodes using their exact id values:\n${existingList}`;
    }
  }

  const issuesSummary = graphState.validationIssues?.length > 0
    ? `\n\nACTIVE VALIDATION ISSUES (${graphState.validationIssues.length}):\n` +
      graphState.validationIssues.map(issue =>
        `- [${issue.severity.toUpperCase()}] ${issue.ruleId}: ${issue.message}` +
        (issue.nodeId ? ` (node: ${issue.nodeId})` : '')
      ).join('\n')
    : '\n\nVALIDATION: All checks passing.';

  const withGraph = [
    ...capped.slice(0, -1),
    {
      ...last,
      content: `${last.content}\n\n${summarizeDiagram(graphState)}${issuesSummary}`,
    },
  ];

  const controller = new AbortController();
  let fetchTimeout = null;
  let didTimeout = false;

  // Fast mode only: apply 2-minute safety cap. Pro mode and generation requests run indefinitely.
  if (!useFullReasoning) {
    fetchTimeout = setTimeout(() => { didTimeout = true; controller.abort(); }, 120000);
  }

  // Propagate client disconnect (Stop button) to the upstream LLM fetch.
  const onClientAbort = () => controller.abort();
  req.signal?.addEventListener('abort', onClientAbort, { once: true });

  try {
    const cleanBase = baseUrl.replace(/\/+$/, '');
    const versionedPath = /\/v\d/.test(new URL(cleanBase).pathname);
    const res = await fetchNoTimeout(`${cleanBase}${versionedPath ? '' : '/v1'}/chat/completions`, {
      signal: controller.signal,
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: systemPrompt }, ...withGraph],
        stream: false,
      }),
    });
    clearTimeout(fetchTimeout);
    req.signal?.removeEventListener('abort', onClientAbort);

    const data = await res.json();

    if (!res.ok || !data.choices?.[0]?.message?.content) {
      return Response.json({
        error: data.error?.message || 'LLM returned an unexpected response.',
      });
    }

    let content = data.choices[0].message.content;
    const thinkEnd = content.indexOf('</think>');
    if (thinkEnd !== -1) content = content.slice(thinkEnd + 8).trimStart();

    const refactor = parseRefactorBlock(content);
    if (refactor) {
      return Response.json({ type: 'structural_refactor', ...refactor });
    }

    const update = parseUpdateBlock(content);
    if (update) {
      return Response.json({ type: 'property_update', updates: update.updates });
    }

    const hclContent = parseHclBlock(content);
    if (hclContent) {
      return Response.json({
        type: 'terraform_generation',
        hcl: hclContent,
        description: extractHclDescription(hclContent),
      });
    }

    const diagram = parseDiagramBlock(content);
    if (diagram) {
      return Response.json({
        type: 'diagram_generation',
        description: diagram.description || 'Generated AWS architecture',
        nodes: diagram.nodes,
        edges: diagram.edges,
        textResponse: null,
      });
    }

    return Response.json({ type: 'chat', textResponse: content });
  } catch (error) {
    clearTimeout(fetchTimeout);
    req.signal?.removeEventListener('abort', onClientAbort);
    if (error.name === 'AbortError') {
      if (didTimeout) {
        return Response.json({ error: 'Request timed out after 2 minutes. Switch to Pro mode for questions that need more reasoning time.' });
      }
      // Client cancelled via Stop button — they handle the UI, nothing to send back.
      return Response.json({ cancelled: true });
    }
    const causeCode = error.cause?.code || error.cause?.message || '';
    console.error('[chat/route] fetch error:', error.message, causeCode, error.cause);
    return Response.json({
      error: `Failed to reach LLM endpoint: ${error.message}${causeCode ? ` — ${causeCode}` : ''}`,
    });
  }
}
