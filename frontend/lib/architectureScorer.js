// frontend/lib/architectureScorer.js
// Computes per-category architecture health scores (0-10) from validation issues.

const WEIGHTS = {
  security: {
    rules: [
      's3-public-access',
      's3-no-encryption',
      's3-static-hosting-conflict',
      'dynamodb-no-encryption',
      'apigw-no-waf',
      'apigw-cors-wildcard',
      'sns-open-access-policy',
      'cognito-no-mfa',
      'cognito-weak-password',
      'cognito-long-access-token',
      'cognito-no-advanced-security',
      'lambda-eol-runtime',
    ],
    errorPenalty: 20,
    warningPenalty: 8,
  },
  reliability: {
    rules: [
      'api-gateway-no-compute',
      'orphan-lambda',
      'lambda-no-dlq',
      'lambda-default-timeout',
      'lambda-no-reserved-concurrency',
      'sqs-visibility-timeout',
      'sqs-unconsumed',
      'sqs-dlq-no-max-receive',
      'sqs-short-retention',
      'sqs-fifo-name-suffix',
      'eventbridge-blackhole',
      'dynamodb-streams-no-consumer',
      'sns-fifo-to-standard-sqs',
    ],
    errorPenalty: 20,
    warningPenalty: 8,
  },
  performance: {
    rules: [
      'lambda-vpc-cold-start',
      'dynamodb-provisioned-no-autoscaling',
      'apigw-no-throttling',
      'apigw-rate-without-burst',
    ],
    errorPenalty: 15,
    warningPenalty: 5,
  },
};

export function calculateScore(issues, nodes) {
  // Need at least 2 nodes to score meaningfully
  if (!nodes || nodes.length < 2) {
    return null;
  }

  const scores = {};

  for (const [category, config] of Object.entries(WEIGHTS)) {
    const categoryIssues = issues.filter(i => config.rules.includes(i.ruleId));

    const errorCount = categoryIssues.filter(i => i.severity === 'error').length;
    const warningCount = categoryIssues.filter(i => i.severity === 'warning').length;

    const penalty = (errorCount * config.errorPenalty) + (warningCount * config.warningPenalty);

    scores[category] = Math.max(0, Math.min(10, 10 - (penalty / 10)));
  }

  return {
    security: Math.round(scores.security * 10) / 10,
    reliability: Math.round(scores.reliability * 10) / 10,
    performance: Math.round(scores.performance * 10) / 10,
    overall: Math.round(
      ((scores.security * 0.5) +
       (scores.reliability * 0.35) +
       (scores.performance * 0.15)) * 10
    ) / 10,
  };
}

export function getScoreColor(score) {
  if (score >= 8) return 'green';
  if (score >= 6) return 'amber';
  if (score >= 4) return 'orange';
  return 'red';
}

export function getScoreLabel(score) {
  if (score >= 9) return 'Excellent';
  if (score >= 7) return 'Good';
  if (score >= 5) return 'Needs Work';
  if (score >= 3) return 'Poor';
  return 'Critical';
}
