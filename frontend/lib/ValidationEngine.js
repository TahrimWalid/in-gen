// frontend/lib/ValidationEngine.js
import { rules } from './rules';

export const validateArchitecture = (nodes, edges) => {
  const issues = [];

  // Loop through every node on the canvas
  nodes.forEach(node => {
    
    // Test the node against every rule in our registry
    rules.forEach(rule => {
      const failedNodeId = rule.evaluate(node, nodes, edges);
      
      // If the rule returns an ID, it means the rule failed. Catch the issue!
      if (failedNodeId) {
        issues.push({
          nodeId: failedNodeId,
          ruleId: rule.id,
          name: rule.name,
          severity: rule.severity,
          message: rule.message,
        });
      }
    });
    
  });

  return issues; // Returns an array of current architectural mistakes
};