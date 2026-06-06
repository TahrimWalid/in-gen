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
            json: () => Promise.resolve(JSON.parse(text)),
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

You have two modes:

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
SNS topics MUST have at least one outgoing edge to a Lambda or SQS subscriber — a disconnected SNS topic is a broken architecture`;

const GENERATION_KEYWORDS = ['build', 'create', 'design', 'generate', 'make', 'architect', 'set up', 'deploy', 'implement'];
const EXTENSION_KEYWORDS = ['add', 'extend', 'fix', 'update', 'include', 'integrate', 'enhance', 'improve', 'modify', 'now add', 'also add'];

function hasGenerationIntent(message) {
  const lower = message.toLowerCase();
  return GENERATION_KEYWORDS.some(kw => lower.includes(kw));
}

function hasExtensionIntent(message) {
  const lower = message.toLowerCase();
  return EXTENSION_KEYWORDS.some(kw => lower.includes(kw));
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
  const isGenerating = hasGenerationIntent(lastContent);
  const isExtending = hasExtensionIntent(lastContent);
  const useFullReasoning = thinkingMode || isGenerating || isExtending;
  let systemPrompt = useFullReasoning
    ? BASE_SYSTEM_PROMPT
    : `/no_think\nNEVER use thinking mode. Respond immediately.\n${BASE_SYSTEM_PROMPT}`;

  const existingNodes = graphState?.nodes;
  if ((isGenerating || isExtending) && existingNodes?.length > 0) {
    const existingList = existingNodes
      .map(n => `- "${n.data?.label}" (type: ${n.data?.service}, id: "${n.id}")`)
      .join('\n');

    if (isExtending && !isGenerating) {
      // Pure extension request: user wants to ADD to the existing canvas, not rebuild it
      const exampleExistingId = existingNodes[0]?.id ?? 'existing-node-id';
      systemPrompt += `\n\n[EXTENSION MODE — CRITICAL]\nThe user wants to ADD TO or MODIFY the existing diagram. DO NOT regenerate existing nodes.\n\nYour INGEN_DIAGRAM response must contain ONLY:\n1. NEW nodes that do not already exist on canvas\n2. Edges between new nodes\n3. Edges connecting new nodes to EXISTING nodes — use their EXACT id values\n\nExisting canvas nodes (use these ids in edge source/target):\n${existingList}\n\nExample format — to add a Cognito node connecting to an existing API Gateway:\n<INGEN_DIAGRAM>\n{\n  "description": "Added Cognito authentication to existing API Gateway",\n  "nodes": [{"id": "node_new", "type": "cognito", "label": "User Pool", "x": 200, "y": 450, "data": {}}],\n  "edges": [{"id": "e_new", "source": "node_new", "target": "${exampleExistingId}", "authType": "COGNITO", "invocationType": "Synchronous"}]\n}\n</INGEN_DIAGRAM>`;
    } else {
      // Generation request with existing canvas: inject context for integration
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
    const res = await fetchNoTimeout(`${baseUrl}/v1/chat/completions`, {
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
