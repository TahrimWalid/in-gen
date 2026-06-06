// 1. CRITICAL: Give Vercel up to 120 seconds to wait for the GPU (prevents initial timeouts)
export const maxDuration = 120; 

const SYSTEM_PROMPT = `/no_think
You are a senior AWS solutions architect and infrastructure designer working inside InGen, a visual AWS architecture tool.

You have two modes:

MODE 1 — CHAT (default)
Answer questions about architecture, security, costs, and best practices. Be direct and specific. Reference node labels from the current diagram when relevant. Keep responses under 150 words unless detail is requested.

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
sqs: visibilityTimeout(int), isFifo(bool)
s3: blockPublicAccess(bool), versioning(bool), encryption(bool)
apiGateway: throttlingEnabled(bool), loggingEnabled(bool)
dynamodb: pointInTimeRecovery(bool), billingMode(string)
eventBridge, sns, cognito: no extra data needed

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
Add DLQ to async Lambda functions`;

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
  const { messages, graphState } = await req.json();

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

  // 2. CRITICAL: Strip out any frontend error messages (role: 'system') before sending to vLLM
  const cleanMessages = messages.filter(msg => msg.role !== 'system');

  if (cleanMessages.length === 0) {
    return Response.json({ error: 'No user messages provided.' });
  }

  // Use the cleaned messages array for the history
  const capped = cleanMessages.slice(-10);
  const last = capped[capped.length - 1];
  const withGraph = [
    ...capped.slice(0, -1),
    {
      ...last,
      content: `${last.content}\n\nCurrent diagram:\n${JSON.stringify(graphState, null, 2)}`,
    },
  ];

  try {
    const res = await fetch(`${baseUrl}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        ...(apiKey ? { Authorization: `Bearer ${apiKey}` } : {}),
      },
      body: JSON.stringify({
        model,
        messages: [{ role: 'system', content: SYSTEM_PROMPT }, ...withGraph],
        stream: false,
      }),
    });

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
    // Improved error logging so you can see exactly why fetch fails in Vercel logs
    console.error("Vercel Fetch Error:", error);
    return Response.json({
      error: `Failed to reach LLM endpoint: ${error.message}`,
    });
  }
}