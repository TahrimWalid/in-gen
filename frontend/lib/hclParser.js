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
]);

const LAYOUT = {
  columns: {
    apiGateway:  0,
    cognito:     0,
    lambda:      1,
    eventbridge: 1,
    sqs:         2,
    sns:         2,
    dynamodb:    2,
    s3:          2,
  },
  colWidth: 320,
  rowHeight: 140,
  startX: 120,
  startY: 80,
};

function normalizeType(serviceType) {
  return serviceType === 'eventBridge' ? 'eventbridge' : serviceType;
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

// Split a name into lowercase tokens regardless of whether it uses snake_case,
// camelCase, PascalCase, or kebab-case — so prefix detection and label cleanup
// work correctly for output from any LLM, not just snake_case-compliant ones.
function tokenize(name) {
  return name
    .replace(/([a-z])([A-Z])/g, '$1_$2')
    .replace(/([A-Z]{2,})([A-Z][a-z])/g, '$1_$2')
    .toLowerCase()
    .replace(/[-\s]+/g, '_')
    .split('_')
    .filter(Boolean);
}

// Detect a shared naming prefix (e.g. "social_media") across resource identifiers
// so it can be stripped from generated labels.
function detectCommonPrefix(resourceNames) {
  if (!resourceNames || resourceNames.length < 2) return '';

  const splitNames = resourceNames.map(tokenize);
  const minLength = Math.min(...splitNames.map(p => p.length));
  if (minLength < 2) return '';

  const minCount = Math.max(2, Math.floor(resourceNames.length * 0.6));
  const prefixParts = [];

  for (let i = 0; i < minLength - 1; i++) {
    const part = splitNames[0][i];
    const matchCount = splitNames.filter(p => p[i] === part).length;
    if (matchCount < minCount) break;
    prefixParts.push(part);
  }

  return prefixParts.join('_');
}

function cleanLabel(raw, commonPrefix = '') {
  if (!raw) return '';

  const tokens = tokenize(
    String(raw)
      .replace(/\$\{[^}]*\}/g, '')
      .replace(/-+$/, '')
      .trim()
  );

  let cleaned = tokens.join('_');

  if (commonPrefix && cleaned.startsWith(commonPrefix)) {
    const stripped = cleaned.slice(commonPrefix.length).replace(/^_+/, '');
    if (stripped) cleaned = stripped;
  }

  return cleaned
    .split('_')
    .filter(Boolean)
    .map(w => w.charAt(0).toUpperCase() + w.slice(1))
    .join(' ');
}

function findBalanced(text, startIndex, openChar, closeChar) {
  let depth = 0;
  for (let i = startIndex; i < text.length; i++) {
    if (text[i] === openChar) depth++;
    else if (text[i] === closeChar) {
      depth--;
      if (depth === 0) return i;
    }
  }
  return -1;
}

// Extract { actions, resources } per IAM statement from a raw HCL object body
// (used when jsonencode() wraps an expression hcl2json couldn't fully evaluate).
function parseStatementBlock(block) {
  const actions = [];
  const resources = [];

  const actionMatch = block.match(/Action\s*=\s*(\[[\s\S]*?\]|"[^"]*")/i);
  if (actionMatch) {
    const raw = actionMatch[1];
    if (raw.startsWith('[')) {
      (raw.match(/"([^"]*)"/g) || []).forEach(m => actions.push(m.slice(1, -1)));
    } else {
      actions.push(raw.slice(1, -1));
    }
  }

  const resourceMatch = block.match(/Resource\s*=\s*(\[[\s\S]*?\]|"[^"]*"|[^\n,}]+)/i);
  if (resourceMatch) {
    const raw = resourceMatch[1].trim();
    if (raw.startsWith('[')) {
      (raw.match(/"([^"]*)"|[\w.]+/g) || []).forEach(m => resources.push(m.replace(/"/g, '')));
    } else if (raw.startsWith('"')) {
      resources.push(raw.slice(1, -1));
    } else {
      resources.push(raw.replace(/,$/, '').trim());
    }
  }

  return { actions, resources };
}

function extractStatementsFromHcl(source) {
  const stmtMatch = source.match(/Statement\s*=\s*\[/);
  if (!stmtMatch) return [];

  const arrStart = stmtMatch.index + stmtMatch[0].length - 1;
  const arrEnd = findBalanced(source, arrStart, '[', ']');
  if (arrEnd === -1) return [];

  const arrContent = source.slice(arrStart + 1, arrEnd);
  const statements = [];
  let cursor = 0;

  while (true) {
    const braceStart = arrContent.indexOf('{', cursor);
    if (braceStart === -1) break;
    const braceEnd = findBalanced(arrContent, braceStart, '{', '}');
    if (braceEnd === -1) break;
    statements.push(parseStatementBlock(arrContent.slice(braceStart, braceEnd + 1)));
    cursor = braceEnd + 1;
  }

  return statements;
}

function extractStatements(parsedPolicy) {
  if (!parsedPolicy) return [];

  if (parsedPolicy.__hclSource) {
    return extractStatementsFromHcl(parsedPolicy.__hclSource);
  }

  const stmts = parsedPolicy.Statement || parsedPolicy.statement;
  const arr = Array.isArray(stmts) ? stmts : (stmts ? [stmts] : []);

  return arr.map(s => {
    const action = s.Action ?? s.action ?? [];
    const resource = s.Resource ?? s.resource ?? [];
    return {
      actions: Array.isArray(action) ? action : [action],
      resources: Array.isArray(resource) ? resource : [resource],
    };
  });
}

// Resolve a policy attribute (possibly jsonencode({...}) wrapped in ${...}) down
// to either a plain JS object or { __hclSource } for regex-based extraction.
function parseJsonencodePolicy(policyValue) {
  if (policyValue == null) return null;
  if (typeof policyValue === 'object') return policyValue;
  if (typeof policyValue !== 'string') return null;

  let value = policyValue.trim();

  const exprMatch = value.match(/^\$\{([\s\S]*)\}$/);
  if (exprMatch) value = exprMatch[1].trim();

  try {
    return JSON.parse(value);
  } catch { /* not plain JSON, try jsonencode() extraction */ }

  const jMatch = value.match(/^jsonencode\(([\s\S]*)\)$/);
  if (jMatch) return { __hclSource: jMatch[1].trim() };

  return { __hclSource: value };
}

function detectServiceFromActions(actions) {
  const joined = actions.join(' ').toLowerCase();
  if (joined.includes('dynamodb:')) return 'dynamodb';
  if (joined.includes('s3:')) return 's3';
  if (joined.includes('sqs:')) return 'sqs';
  if (joined.includes('sns:')) return 'sns';
  if (joined.includes('events:')) return 'eventBridge';
  return null;
}

function resolveResourceTarget(resources, nodesByResourceKey, targetServiceType, nodes) {
  for (const res of resources) {
    if (typeof res !== 'string') continue;
    const refMatch = res.match(/aws_(\w+)\.(\w+)/);
    if (refMatch) {
      const key = `aws_${refMatch[1]}.${refMatch[2]}`;
      if (nodesByResourceKey[key]) return nodesByResourceKey[key];
    }
  }

  const normalized = normalizeType(targetServiceType);
  const fallback = nodes.find(n => n.type === normalized);
  return fallback ? fallback.id : null;
}

// Build Lambda -> target-service edges from aws_iam_role_policy resources whose
// role is attached to a Lambda's execution role.
function extractIamEdges(resources, nodesByResourceKey, roleToLambda, nodes) {
  const edges = [];
  const policies = resources.aws_iam_role_policy || {};

  for (const [, resourceArr] of Object.entries(policies)) {
    const r = Array.isArray(resourceArr) ? resourceArr[0] : resourceArr;
    if (!r || typeof r !== 'object') continue;

    const roleMatch = String(r.role || '').match(/aws_iam_role\.(\w+)/);
    if (!roleMatch) continue;

    const lambdaId = roleToLambda[roleMatch[1]];
    if (!lambdaId) continue;

    const statements = extractStatements(parseJsonencodePolicy(r.policy));

    for (const stmt of statements) {
      const targetService = detectServiceFromActions(stmt.actions);
      if (!targetService) continue;

      const targetId = resolveResourceTarget(stmt.resources, nodesByResourceKey, targetService, nodes);
      if (!targetId) continue;

      const invocationType = (targetService === 'sqs' || targetService === 'sns' || targetService === 'eventBridge')
        ? 'Async'
        : 'Sync';

      edges.push({ id: randomUUID(), source: lambdaId, target: targetId, authType: 'IAM', invocationType });
    }
  }

  return edges;
}

function deduplicateEdges(edges) {
  const seen = new Set();
  return edges.filter(e => {
    const key = `${e.source}->${e.target}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

// Assigns x/y positions: column by service type, rows sorted by connection
// count (most-connected first), each column vertically centered.
function assignLayout(nodes, edges) {
  const columns = {};
  for (const node of nodes) {
    const col = LAYOUT.columns[node.type] ?? 3;
    if (!columns[col]) columns[col] = [];
    columns[col].push(node);
  }

  const connectionCount = (nodeId) =>
    edges.filter(e => e.source === nodeId || e.target === nodeId).length;

  for (const colNodes of Object.values(columns)) {
    colNodes.sort((a, b) => connectionCount(b.id) - connectionCount(a.id));
  }

  const maxColSize = Math.max(...Object.values(columns).map(c => c.length));
  const positions = {};

  for (const [col, colNodes] of Object.entries(columns)) {
    const x = LAYOUT.startX + Number(col) * LAYOUT.colWidth;
    const colHeight = colNodes.length * LAYOUT.rowHeight;
    const totalHeight = maxColSize * LAYOUT.rowHeight;
    const offsetY = LAYOUT.startY + (totalHeight - colHeight) / 2;

    colNodes.forEach((node, index) => {
      positions[node.id] = { x, y: offsetY + index * LAYOUT.rowHeight };
    });
  }

  return positions;
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
  const bucket = r.bucket;
  // jsonencode/interpolated bucket names (e.g. "${...}-bucket") aren't useful
  // as labels — fall back to the Terraform resource identifier instead.
  const label = (typeof bucket === 'string' && !bucket.includes('${')) ? bucket : name;
  return {
    label,
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

export async function parseHcl(hclString) {
  const nodes = [];
  let edges = [];
  const errors = [];
  const nodesByResourceKey = {};
  const roleToLambda = {};

  let parsed;
  try {
    parsed = await parse('main.tf', hclString);
  } catch (err) {
    return { nodes: [], edges: [], errors: [`Parse failed: ${err.message}`] };
  }

  const resources = parsed.resource || {};

  // Pass 1: detect a shared naming prefix across all supported resources
  const allResourceNames = [];
  for (const [resourceType, instances] of Object.entries(resources)) {
    if (!RESOURCE_TYPE_MAP[resourceType]) continue;
    if (!instances || typeof instances !== 'object') continue;
    allResourceNames.push(...Object.keys(instances));
  }
  const commonPrefix = detectCommonPrefix(allResourceNames);

  // Pass 2: build nodes (positions assigned later)
  for (const [resourceType, instances] of Object.entries(resources)) {
    const rawServiceType = RESOURCE_TYPE_MAP[resourceType];
    if (!rawServiceType) continue;
    if (!instances || typeof instances !== 'object') continue;

    const serviceType = normalizeType(rawServiceType);

    for (const [resourceName, resourceArr] of Object.entries(instances)) {
      const resource = Array.isArray(resourceArr) ? resourceArr[0] : resourceArr;
      if (!resource || typeof resource !== 'object') continue;

      const extracted = extractProperties(rawServiceType, resourceType, resource, resourceName);
      extracted.label = cleanLabel(extracted.label || resourceName, commonPrefix);
      const nodeId = randomUUID();

      nodesByResourceKey[`${resourceType}.${resourceName}`] = nodeId;

      if (rawServiceType === 'lambda' && resource.role) {
        const roleMatch = String(resource.role).match(/aws_iam_role\.(\w+)/);
        if (roleMatch) roleToLambda[roleMatch[1]] = nodeId;
      }

      nodes.push({
        id: nodeId,
        type: serviceType,
        label: extracted.label,
        data: {
          ...getServiceDefaults(serviceType),
          ...extracted,
        },
      });
    }
  }

  // Pass 3: detect edges from relationship resources
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
            let invocationType = 'Sync';
            if (principal.includes('apigateway')) {
              sourceId = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_api_gateway'))?.[1] || null;
            } else if (principal.includes('sns')) {
              sourceId = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_sns_topic.'))?.[1] || null;
            } else if (principal.includes('events')) {
              sourceId = Object.entries(nodesByResourceKey).find(([k]) => k.startsWith('aws_cloudwatch_event_bus'))?.[1] || null;
              invocationType = 'Async';
            }
            if (sourceId) {
              edges.push({ id: randomUUID(), source: sourceId, target: targetId, authType: 'NONE', invocationType });
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
      } catch (err) {
        errors.push(`Edge detection error in ${resourceType}: ${err.message}`);
      }
    }
  }

  try {
    edges.push(...extractIamEdges(resources, nodesByResourceKey, roleToLambda, nodes));
  } catch (err) {
    errors.push(`Edge detection error in aws_iam_role_policy: ${err.message}`);
  }

  edges = deduplicateEdges(edges);

  // Pass 4: apply layout positions
  const positions = assignLayout(nodes, edges);
  for (const node of nodes) {
    const pos = positions[node.id] || { x: LAYOUT.startX, y: LAYOUT.startY };
    node.x = pos.x;
    node.y = pos.y;
  }

  return { nodes, edges, errors };
}
