// frontend/lib/fixHandler.js
// Applies deterministic property fixes or triggers an AI-assisted structural fix
// for a given validation issue, based on the rule's `fix` definition.

function buildUpdates(issue, rule, nodes, edges) {
  // SQS visibility timeout — calculate from connected Lambda
  if (rule.id === 'sqs-visibility-timeout') {
    const connectedLambda = edges
      .filter(e => e.source === issue.nodeId || e.target === issue.nodeId)
      .map(e => nodes.find(n => n.id === (e.source === issue.nodeId ? e.target : e.source)))
      .find(n => n?.data?.service === 'lambda');

    const lambdaTimeout = connectedLambda?.data?.timeout || 30;
    const recommendedTimeout = lambdaTimeout * 6;

    return [{ nodeId: issue.nodeId, data: { visibilityTimeout: recommendedTimeout } }];
  }

  // SQS FIFO name — append .fifo to label
  if (rule.id === 'sqs-fifo-name-suffix') {
    const node = nodes.find(n => n.id === issue.nodeId);
    const currentLabel = node?.data?.label || '';
    if (!currentLabel.endsWith('.fifo')) {
      return [{ nodeId: issue.nodeId, data: { label: `${currentLabel}.fifo` } }];
    }
    return [];
  }

  // Standard property fix
  return rule.fix.updates.map(update => ({
    nodeId: issue.nodeId,
    data: { [update.field]: update.value },
  }));
}

function triggerAiFix(issue, rule, nodes) {
  const node = nodes.find(n => n.id === issue.nodeId);
  const message = `Fix this validation issue automatically:
Rule: ${rule.name}
Affected node: ${node?.data?.label || issue.nodeId}
Issue: ${issue.message}
Add the necessary components to resolve this.`;

  window.dispatchEvent(new CustomEvent('ingen-ai-fix', {
    detail: { message, issue, rule },
  }));
}

export function applyDeterministicFix(issue, rule, nodes, edges, store) {
  const { fix } = rule;

  if (!fix || fix.type === 'ai-only') return false;

  if (fix.type === 'property') {
    const updates = buildUpdates(issue, rule, nodes, edges);
    if (updates.length === 0) return false;

    store.applyPropertyUpdates(updates);
    return true;
  }

  if (fix.type === 'structural') {
    triggerAiFix(issue, rule, nodes);
    return true;
  }

  return false;
}
