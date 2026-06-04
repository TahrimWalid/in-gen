import { rules } from './rules';

export const validateArchitecture = (nodes, edges) => {
  const issues = [];

  nodes.forEach(node => {
    rules.forEach(rule => {
      const result = rule.evaluate(node, nodes, edges);
      if (!result) return;

      const results = Array.isArray(result) ? result : [result];
      results.forEach(r => {
        if (!r) return;
        const nodeId = typeof r === 'string' ? r : r.nodeId;
        const message = (typeof r === 'object' && r.message) ? r.message : rule.message;
        issues.push({ nodeId, ruleId: rule.id, name: rule.name, severity: rule.severity, message });
      });
    });
  });

  return issues;
};
