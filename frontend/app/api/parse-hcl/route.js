import { parseHcl } from '../../../lib/hclParser';

export async function POST(request) {
  try {
    const { hcl } = await request.json();
    if (!hcl || typeof hcl !== 'string') {
      return Response.json({ error: 'Missing or invalid hcl field' }, { status: 400 });
    }
    const result = await parseHcl(hcl);
    return Response.json(result);
  } catch (error) {
    return Response.json(
      { nodes: [], edges: [], errors: [`Parser error: ${error.message}`] },
      { status: 200 }
    );
  }
}
