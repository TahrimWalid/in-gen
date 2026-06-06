import { parse } from '@cdktf/hcl2json';
import { getServiceDefaults } from './serviceDefaults.js';
import { randomUUID } from 'crypto';

const RESOURCE_TYPE_MAP = {
  aws_lambda_function:       'lambda',
  aws_api_gateway_rest_api:  'apiGateway',
  aws_api_gateway_v2_api:    'apiGateway',
  aws_dynamodb_table:        'dynamodb',
  aws_s3_bucket:             's3',
  aws_sqs_queue:             'sqs',
  aws_sns_topic:             'sns',
  aws_cloudwatch_event_bus:  'eventBridge',
  aws_cognito_user_pool:     'cognito',
};

const EDGE_RESOURCE_TYPES = new Set([
  'aws_lambda_event_source_mapping',
  'aws_lambda_permission',
  'aws_sns_topic_subscription',
  'aws_iam_role_policy',
  'aws_iam_role_policy_attachment',
]);

const LAYOUT_COLUMNS = {
  apiGateway:  0,
  cognito:     0,
  lambda:      1,
  sqs:         1,
  sns:         1,
  eventbridge: 1,
  dynamodb:    2,
  s3:          2,
};

const COLUMN_WIDTH = 300;
const ROW_HEIGHT = 150;
const START_X = 150;
const START_Y = 150;

function normalizeType(serviceType) {
  return serviceType === 'eventBridge' ? 'eventbridge' : serviceType;
}

function getPosition(serviceType, columnCounts) {
  const col = LAYOUT_COLUMNS[serviceType] ?? 3;
  const row = columnCounts[col] || 0;
  columnCounts[col] = row + 1;
  return { x: START_X + col * COLUMN_WIDTH, y: START_Y + row * ROW_HEIGHT };
}

// Strip ${...} wrapper that hcl2json uses for resource references
function resolveRef(ref, nodesByResourceKey) {
  if (!ref || typeof ref !== 'string') return null;
  const inner = ref.replace(/^\$\{(.+)\}$/, '$1').trim();
  const parts = inner.split('.');
  if (parts.length >= 2) {
    return nodesByResourceKey[`${parts[0]}.${parts[1]}`] || null;
  }
  return null;
}

function arr0(val) {
  return Array.isArray(val) ? val[0] : val;
}

function cleanLabel(raw) {
  return raw
    .replace(/_/g, ' ')
    .replace(/([A-Z])/g, ' $1')
    .trim()
    .replace(/\s+/g, ' ')
    .split(' ')
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function extractLambdaProps(r, name) {
  return {
    label: r.function_name || name,
    runtime: r.runtime || 'nodejs20.x',
    timeout: parseInt(r.timeout) || 30,
    memorySize: parseInt(r.memory_size) || 128,
    architecture: (Array.isArray(r.architectures) ? r.architectures[0] : r.architectures) || 'x86_64',
    hasDeadLetterQueue: !!(r.dead_letter_config),
    vpcEnabled: !!(r.vpc_config),
    reservedConcurrency: parseInt(r.reserved_concurrent_executions) || -1,
  };
}

function extractApiGatewayProps(r, name, resourceType) {
  return {
    label: r.name || name,
    apiType: resourceType === 'aws_api_gateway_v2_api' ? (r.protocol_type || 'HTTP') : 'REST',
    throttlingEnabled: true,
    loggingEnabled: false,
  };
}

function extractDynamoDbProps(r, name) {
  const pitr = arr0(r.point_in_time_recovery);
  const sse = arr0(r.server_side_encryption);
  const ttl = arr0(r.ttl);
  return {
    label: r.name || name,
    billingMode: r.billing_mode || 'PAY_PER_REQUEST',
    pointInTimeRecovery: pitr?.enabled || false,
    encryption: !!(sse),
    readCapacity: parseInt(r.read_capacity) || 5,
    writeCapacity: parseInt(r.write_capacity) || 5,
    streamsEnabled: !!(r.stream_enabled),
    streamViewType: r.stream_view_type || 'NEW_AND_OLD_IMAGES',
    ttlEnabled: !!(ttl?.enabled),
  };
}

function extractS3Props(r, name) {
  const versioning = arr0(r.versioning);
  return {
    label: r.bucket || name,
    blockPublicAccess: true,
    versioning: versioning?.enabled || false,
    encryption: true,
    encryptionType: 'SSE-S3',
  };
}

function extractSqsProps(r, name) {
  let dlqEnabled = false;
  let maxReceiveCount = 3;
  if (r.redrive_policy) {
    dlqEnabled = true;
    try {
      const policy = typeof r.redrive_policy === 'string' ? JSON.parse(r.redrive_policy) : r.redrive_policy;
      maxReceiveCount = policy.maxReceiveCount || 3;
    } catch { /* use default */ }
  }
  return {
    label: r.name || name,
    isFifo: r.fifo_queue === true,
    visibilityTimeout: parseInt(r.visibility_timeout_seconds) || 180,
    messageRetentionSeconds: parseInt(r.message_retention_seconds) || 345600,
    deliveryDelaySeconds: parseInt(r.delay_seconds) || 0,
    dlqEnabled,
    maxReceiveCount,
    sqsEncryption: !!(r.kms_master_key_id),
  };
}

function extractSnsProps(r, name) {
  return {
    label: r.name || name,
    topicType: r.fifo_topic ? 'FIFO' : 'Standard',
    snsEncryption: !!(r.kms_master_key_id),
    accessPolicy: 'Restricted',
  };
}

function extractEventBridgeProps(r, name) {
  return {
    label: r.name || name,
    isCustomBus: r.name !== 'default',
    archiveEnabled: false,
  };
}

function extractCognitoProps(r, name) {
  const pw = arr0(r.password_policy);
  const addOns = arr0(r.user_pool_add_ons);
  return {
    label: r.name || name,
    mfaMode: r.mfa_configuration || 'OFF',
    passwordMinLength: parseInt(pw?.minimum_length) || 8,
    passwordRequireUppercase: pw?.require_uppercase ?? true,
    passwordRequireLowercase: pw?.require_lowercase ?? true,
    passwordRequireNumbers: pw?.require_numbers ?? true,
    passwordRequireSymbols: pw?.require_symbols ?? false,
    advancedSecurity: addOns?.advanced_security_mode === 'ENFORCED',
    accessTokenValidityHours: 1,
  };
}

function extractProperties(serviceType, resourceType, resource, resourceName) {
  switch (serviceType) {
    case 'lambda':      return extractLambdaProps(resource, resourceName);
    case 'apiGateway':  return extractApiGatewayProps(resource, resourceName, resourceType);
    case 'dynamodb':    return extractDynamoDbProps(resource, resourceName);
    case 's3':          return extractS3Props(resource, resourceName);
    case 'sqs':         return extractSqsProps(resource, resourceName);
    case 'sns':         return extractSnsProps(resource, resourceName);
    case 'eventBridge': return extractEventBridgeProps(resource, resourceName);
    case 'cognito':     return extractCognitoProps(resource, resourceName);
    default:            return { label: resourceName };
  }
}

function extractIamActions(policy) {
  try {
    const doc = typeof policy === 'string' ? JSON.parse(policy) : policy;
    const stmts = doc.Statement || doc.statement || [];
    return stmts.flatMap(s => {
      const a = s.Action || s.action || [];
      return Array.isArray(a) ? a : [a];
    });
  } catch {
    return [];
  }
}

export async function parseHcl(hclString) {
  const nodes = [];
  const edges = [];
  const errors = [];
  const nodesByResourceKey = {};
  const columnCounts = {};

  let parsed;
  try {
    parsed = await parse('main.tf', hclString);
  } catch (err) {
    return { nodes: [], edges: [], errors: [`Parse failed: ${err.message}`] };
  }

  const resources = parsed.resource || {};

  // First pass: build nodes
  for (const [resourceType, instances] of Object.entries(resources)) {
    const rawServiceType = RESOURCE_TYPE_MAP[resourceType];
    if (!rawServiceType) continue;
    if (!instances || typeof instances !== 'object') continue;

    const serviceType = normalizeType(rawServiceType);

    for (const [resourceName, resourceArr] of Object.entries(instances)) {
      const resource = Array.isArray(resourceArr) ? resourceArr[0] : resourceArr;
      if (!resource || typeof resource !== 'object') continue;

      const pos = getPosition(serviceType, columnCounts);
      const extracted = extractProperties(rawServiceType, resourceType, resource, resourceName);
      extracted.label = cleanLabel(extracted.label || resourceName);
      const nodeId = randomUUID();

      nodesByResourceKey[`${resourceType}.${resourceName}`] = nodeId;

      nodes.push({
        id: nodeId,
        type: serviceType,
        x: pos.x,
        y: pos.y,
        label: extracted.label,
        data: {
          ...getServiceDefaults(serviceType),
          ...extracted,
        },
      });
    }
  }

  // Second pass: detect edges from relationship resources
  for (const [resourceType, instances] of Object.entries(resources)) {
    if (!EDGE_RESOURCE_TYPES.has(resourceType)) continue;
    if (!instances || typeof instances !== 'object') continue;

    for (const [, resourceArr] of Object.entries(instances)) {
      const r = Array.isArray(resourceArr) ? resourceArr[0] : resourceArr;
      if (!r || typeof r !== 'object') continue;

      try {
        if (resourceType === 'aws_lambda_event_source_mapping') {
          const sourceId = resolveRef(r.event_source_arn, nodesByResourceKey);
          const targetId = resolveRef(r.function_name, nodesByResourceKey);
          if (sourceId && targetId) {
            edges.push({ id: randomUUID(), source: sourceId, target: targetId, authType: 'NONE', invocationType: 'Async' });
          } else {
            errors.push(`Unresolvable refs in aws_lambda_event_source_mapping`);
          }
        }

        if (resourceType === 'aws_lambda_permission') {
          const principal = r.principal || '';
          const targetId = resolveRef(r.function_name, nodesByResourceKey);
          if (targetId) {
            let sourceId = null;
            if (principal.includes('apigateway')) {
              sourceId = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_api_gateway'))?.[1] || null;
            } else if (principal.includes('sns')) {
              sourceId = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_sns_topic.'))?.[1] || null;
            }
            if (sourceId) {
              edges.push({ id: randomUUID(), source: sourceId, target: targetId, authType: 'NONE', invocationType: 'Sync' });
            }
          }
        }

        if (resourceType === 'aws_sns_topic_subscription') {
          const sourceId = resolveRef(r.topic_arn, nodesByResourceKey);
          const targetId = resolveRef(r.endpoint, nodesByResourceKey);
          if (sourceId && targetId) {
            edges.push({ id: randomUUID(), source: sourceId, target: targetId, authType: 'NONE', invocationType: 'Async' });
          }
        }

        if (resourceType === 'aws_iam_role_policy') {
          const actions = extractIamActions(r.policy);
          const lambdaEntry = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_lambda_function'));
          if (lambdaEntry && actions.length > 0) {
            const lambdaId = lambdaEntry[1];
            if (actions.some(a => typeof a === 'string' && a.toLowerCase().includes('dynamodb'))) {
              const id = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_dynamodb_table'))?.[1];
              if (id) edges.push({ id: randomUUID(), source: lambdaId, target: id, authType: 'IAM', invocationType: 'Sync' });
            }
            if (actions.some(a => typeof a === 'string' && a.toLowerCase().includes('s3:'))) {
              const id = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_s3_bucket'))?.[1];
              if (id) edges.push({ id: randomUUID(), source: lambdaId, target: id, authType: 'IAM', invocationType: 'Sync' });
            }
            if (actions.some(a => typeof a === 'string' && a.toLowerCase().includes('sqs:sendmessage'))) {
              const id = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_sqs_queue'))?.[1];
              if (id) edges.push({ id: randomUUID(), source: lambdaId, target: id, authType: 'IAM', invocationType: 'Async' });
            }
            if (actions.some(a => typeof a === 'string' && a.toLowerCase().includes('sns:publish'))) {
              const id = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_sns_topic'))?.[1];
              if (id) edges.push({ id: randomUUID(), source: lambdaId, target: id, authType: 'IAM', invocationType: 'Async' });
            }
          }
        }
      } catch (err) {
        errors.push(`Edge detection error in ${resourceType}: ${err.message}`);
      }
    }
  }

  // Deduplicate edges with identical source+target
  const seen = new Set();
  const deduped = edges.filter(e => {
    const key = `${e.source}→${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });

  return { nodes, edges: deduped, errors };
}
