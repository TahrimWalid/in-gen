const SYSTEM_PROMPT = `You are a senior AWS solutions architect reviewing a serverless architecture diagram in InGen, a visual infrastructure design tool.

You will receive the current diagram state as a JSON graph with nodes and edges. Each node has a type (lambda, apiGateway, s3, dynamodb, sqs, sns, eventbridge, cognito) and a data object with configuration properties. Each edge has semantic metadata including authType and invocationType.

Your role:
- Answer questions about the architecture concisely and precisely
- Identify architectural risks, anti-patterns, and missing components
- Suggest specific improvements with reasoning
- Reference specific nodes by their label when discussing issues
- Be direct — this is a technical tool for engineers, not a chatbot

You do NOT modify the diagram. You only advise.
When the diagram is empty, say so and ask what the user is building.
Keep responses under 200 words unless the user asks for detail.
Format responses in plain text. No markdown headers. Use short paragraphs.`;

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

  const capped = messages.slice(-10);
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

    return Response.json({ content: data.choices[0].message.content });
  } catch {
    return Response.json({
      error: 'Failed to reach LLM endpoint. Check LLM_BASE_URL in .env.local.',
    });
  }
}
