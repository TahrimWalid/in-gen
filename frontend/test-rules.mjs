// Quick smoke-test: validates every new rule fires (or doesn't) as expected.
import { rules } from './lib/rules.js';

const byId = Object.fromEntries(rules.map(r => [r.id, r]));

function check(ruleId, node, nodes = [], edges = [], expectFire) {
  const rule = byId[ruleId];
  if (!rule) { console.error(`MISSING RULE: ${ruleId}`); return false; }
  const result = rule.evaluate(node, nodes, edges);
  const fired = result !== null;
  const ok = fired === expectFire;
  console.log(`${ok ? '✅' : '❌'} ${ruleId} (${expectFire ? 'should fire' : 'should pass'})`);
  if (!ok) console.log('   result:', result);
  return ok;
}

function node(id, service, data = {}) {
  return { id, data: { service, ...data } };
}
function edge(src, tgt) {
  return { id: `${src}-${tgt}`, source: src, target: tgt, data: {} };
}

let pass = 0, fail = 0;
function t(ruleId, n, nodes, edges, expectFire) {
  check(ruleId, n, nodes, edges, expectFire) ? pass++ : fail++;
}

// ── lambda-eol-runtime ────────────────────────────────────────
const lEol = node('l1', 'lambda', { runtime: 'nodejs14.x' });
const lOk  = node('l2', 'lambda', { runtime: 'nodejs20.x' });
t('lambda-eol-runtime', lEol, [], [], true);
t('lambda-eol-runtime', lOk,  [], [], false);

// ── lambda-no-reserved-concurrency ───────────────────────────
t('lambda-no-reserved-concurrency', node('l3', 'lambda', { reservedConcurrency: -1 }),   [], [], true);
t('lambda-no-reserved-concurrency', node('l4', 'lambda', { reservedConcurrency: 100 }),  [], [], false);

// ── lambda-vpc-cold-start ─────────────────────────────────────
t('lambda-vpc-cold-start', node('l5', 'lambda', { vpcEnabled: true }),  [], [], true);
t('lambda-vpc-cold-start', node('l6', 'lambda', { vpcEnabled: false }), [], [], false);

// ── apigw-no-waf ─────────────────────────────────────────────
const apigw = node('gw1', 'apiGateway', { wafEnabled: false });
const lam   = node('lam1', 'lambda', {});
const gwEdge = edge('gw1', 'lam1');
t('apigw-no-waf', apigw, [apigw, lam], [gwEdge], true);
t('apigw-no-waf', node('gw2', 'apiGateway', { wafEnabled: true }), [apigw, lam], [gwEdge], false);
// No outgoing edges → should not fire
t('apigw-no-waf', apigw, [apigw], [], false);

// ── apigw-cors-wildcard ───────────────────────────────────────
t('apigw-cors-wildcard', node('gw3', 'apiGateway', { corsEnabled: true, corsOrigin: '*' }),               [], [], true);
t('apigw-cors-wildcard', node('gw4', 'apiGateway', { corsEnabled: true, corsOrigin: 'https://foo.com' }), [], [], false);
t('apigw-cors-wildcard', node('gw5', 'apiGateway', { corsEnabled: false, corsOrigin: '*' }),              [], [], false);

// ── apigw-rate-without-burst ──────────────────────────────────
t('apigw-rate-without-burst', node('gw6', 'apiGateway', { rateLimit: 1000, burstLimit: 0 }), [], [], true);
t('apigw-rate-without-burst', node('gw7', 'apiGateway', { rateLimit: 1000, burstLimit: 500 }), [], [], false);
t('apigw-rate-without-burst', node('gw8', 'apiGateway', { rateLimit: 0, burstLimit: 0 }), [], [], false);

// ── dynamodb-provisioned-no-autoscaling ───────────────────────
t('dynamodb-provisioned-no-autoscaling', node('db1', 'dynamodb', { billingMode: 'PROVISIONED' }),     [], [], true);
t('dynamodb-provisioned-no-autoscaling', node('db2', 'dynamodb', { billingMode: 'PAY_PER_REQUEST' }), [], [], false);

// ── dynamodb-streams-no-consumer ──────────────────────────────
const dbStreams = node('db3', 'dynamodb', { streamsEnabled: true });
const dbLam    = node('lam2', 'lambda', {});
const dbEdge   = edge('db3', 'lam2');
t('dynamodb-streams-no-consumer', dbStreams, [dbStreams, dbLam], [dbEdge], false); // has consumer
t('dynamodb-streams-no-consumer', dbStreams, [dbStreams],        [],       true);  // no consumer
t('dynamodb-streams-no-consumer', node('db4', 'dynamodb', { streamsEnabled: false }), [], [], false);

// ── dynamodb-no-encryption ────────────────────────────────────
t('dynamodb-no-encryption', node('db5', 'dynamodb', { encryption: false }), [], [], true);
t('dynamodb-no-encryption', node('db6', 'dynamodb', { encryption: true }),  [], [], false);

// ── s3-no-encryption ─────────────────────────────────────────
t('s3-no-encryption', node('s1', 's3', { encryptionType: 'None' }),   [], [], true);
t('s3-no-encryption', node('s2', 's3', { encryptionType: 'SSE-S3' }), [], [], false);

// ── s3-static-hosting-conflict ───────────────────────────────
t('s3-static-hosting-conflict', node('s3a', 's3', { staticWebsiteHosting: true,  blockPublicAccess: true }),  [], [], true);
t('s3-static-hosting-conflict', node('s3b', 's3', { staticWebsiteHosting: true,  blockPublicAccess: false }), [], [], false);
t('s3-static-hosting-conflict', node('s3c', 's3', { staticWebsiteHosting: false, blockPublicAccess: true }),  [], [], false);

// ── sqs-fifo-name-suffix ──────────────────────────────────────
t('sqs-fifo-name-suffix', node('q1', 'sqs', { isFifo: true,  label: 'MyQueue' }),      [], [], true);
t('sqs-fifo-name-suffix', node('q2', 'sqs', { isFifo: true,  label: 'MyQueue.fifo' }), [], [], false);
t('sqs-fifo-name-suffix', node('q3', 'sqs', { isFifo: false, label: 'MyQueue' }),       [], [], false);

// ── sqs-dlq-no-max-receive ────────────────────────────────────
t('sqs-dlq-no-max-receive', node('q4', 'sqs', { dlqEnabled: true,  maxReceiveCount: 0 }), [], [], true);
t('sqs-dlq-no-max-receive', node('q5', 'sqs', { dlqEnabled: true,  maxReceiveCount: 3 }), [], [], false);
t('sqs-dlq-no-max-receive', node('q6', 'sqs', { dlqEnabled: false, maxReceiveCount: 0 }), [], [], false);

// ── sqs-short-retention ───────────────────────────────────────
t('sqs-short-retention', node('q7', 'sqs', { messageRetentionSeconds: 3600 }),   [], [], true);
t('sqs-short-retention', node('q8', 'sqs', { messageRetentionSeconds: 345600 }), [], [], false);
t('sqs-short-retention', node('q9', 'sqs', {}),                                  [], [], false); // undefined → safe

// ── sns-open-access-policy ────────────────────────────────────
t('sns-open-access-policy', node('sn1', 'sns', { accessPolicy: 'Open' }),       [], [], true);
t('sns-open-access-policy', node('sn2', 'sns', { accessPolicy: 'Restricted' }), [], [], false);

// ── sns-fifo-to-standard-sqs ──────────────────────────────────
const fifoSns    = node('sn3', 'sns', { topicType: 'FIFO' });
const stdSqs     = node('q10', 'sqs', { isFifo: false });
const fifoSqs    = node('q11', 'sqs', { isFifo: true });
const toStd      = edge('sn3', 'q10');
const toFifo     = edge('sn3', 'q11');
t('sns-fifo-to-standard-sqs', fifoSns, [fifoSns, stdSqs],  [toStd],  true);   // FIFO SNS → Standard SQS
t('sns-fifo-to-standard-sqs', fifoSns, [fifoSns, fifoSqs], [toFifo], false);  // FIFO SNS → FIFO SQS (ok)
t('sns-fifo-to-standard-sqs', node('sn4', 'sns', { topicType: 'Standard' }), [fifoSns, stdSqs], [toStd], false);

// ── cognito-no-mfa ────────────────────────────────────────────
t('cognito-no-mfa', node('c1', 'cognito', { mfaMode: 'OFF' }),      [], [], true);
t('cognito-no-mfa', node('c2', 'cognito', { mfaMode: 'OPTIONAL' }), [], [], false);

// ── cognito-weak-password ─────────────────────────────────────
t('cognito-weak-password', node('c3', 'cognito', { passwordMinLength: 6 }), [], [], true);
t('cognito-weak-password', node('c4', 'cognito', { passwordMinLength: 8 }), [], [], false);
t('cognito-weak-password', node('c5', 'cognito', {}),                       [], [], false); // undefined → safe

// ── cognito-long-access-token ─────────────────────────────────
t('cognito-long-access-token', node('c6', 'cognito', { accessTokenValidityHours: 48 }), [], [], true);
t('cognito-long-access-token', node('c7', 'cognito', { accessTokenValidityHours: 1 }),  [], [], false);

// ── cognito-no-advanced-security ─────────────────────────────
t('cognito-no-advanced-security', node('c8', 'cognito', { advancedSecurity: false }), [], [], true);
t('cognito-no-advanced-security', node('c9', 'cognito', { advancedSecurity: true }),  [], [], false);

// ── Existing rules untouched ──────────────────────────────────
// Spot-check 3 to confirm no regressions
const orphan = node('lo', 'lambda', {});
t('orphan-lambda', orphan, [orphan], [], true);
t('s3-public-access', node('s99', 's3', { blockPublicAccess: false }), [], [], true);
t('sqs-visibility-timeout',
  node('qv', 'sqs', { visibilityTimeout: 30 }),
  [node('qv', 'sqs', { visibilityTimeout: 30 }), node('lv', 'lambda', { timeout: 30 })],
  [edge('qv', 'lv')],
  true
);

console.log(`\n${pass} passed, ${fail} failed out of ${pass + fail} checks`);
process.exit(fail > 0 ? 1 : 0);
