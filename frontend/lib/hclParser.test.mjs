import { parseHcl } from './hclParser.js';

let passed = 0;
let failed = 0;

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

async function run(name, fn) {
  try {
    await fn();
    console.log(`  PASS  ${name}`);
    passed++;
  } catch (err) {
    console.log(`  FAIL  ${name} — ${err.message}`);
    failed++;
  }
}

// --- Layout constants (mirrors LAYOUT in hclParser.js) ---

const LAYOUT_COL0_X = 120;
const LAYOUT_COL1_X = 440;
const LAYOUT_COL2_X = 760;

// --- Test HCL fixtures ---

const T1_SINGLE_LAMBDA = `
resource "aws_lambda_function" "my_func" {
  function_name = "my-function"
  runtime       = "nodejs20.x"
  timeout       = 30
  memory_size   = 256
}
`;

const T2_WEB_API = `
resource "aws_api_gateway_rest_api" "api" {
  name = "my-api"
}
resource "aws_lambda_function" "handler" {
  function_name = "my-handler"
  runtime       = "nodejs20.x"
  timeout       = 30
}
resource "aws_dynamodb_table" "table" {
  name         = "my-table"
  billing_mode = "PAY_PER_REQUEST"
}
resource "aws_lambda_permission" "apigw" {
  principal     = "apigateway.amazonaws.com"
  function_name = aws_lambda_function.handler.arn
}
resource "aws_iam_role_policy" "lambda_policy" {
  role   = aws_iam_role.lambda_role.id
  policy = jsonencode({
    Statement = [{
      Action   = ["dynamodb:GetItem", "dynamodb:PutItem"]
      Effect   = "Allow"
      Resource = "*"
    }]
  })
}
`;

const T3_SQS_LAMBDA = `
resource "aws_sqs_queue" "my_queue" {
  name                       = "my-queue"
  visibility_timeout_seconds = 180
}
resource "aws_lambda_function" "processor" {
  function_name = "queue-processor"
  runtime       = "nodejs20.x"
  timeout       = 30
}
resource "aws_lambda_event_source_mapping" "sqs_trigger" {
  event_source_arn = "aws_sqs_queue.my_queue.arn"
  function_name    = "aws_lambda_function.processor.arn"
}
`;

const T4_SNS_LAMBDA = `
resource "aws_sns_topic" "notifications" {
  name = "my-topic"
}
resource "aws_lambda_function" "subscriber" {
  function_name = "sns-subscriber"
  runtime       = "nodejs20.x"
  timeout       = 30
}
resource "aws_sns_topic_subscription" "sub" {
  topic_arn = "aws_sns_topic.notifications.arn"
  endpoint  = "aws_lambda_function.subscriber.arn"
  protocol  = "lambda"
}
`;

const T5_S3 = `
resource "aws_s3_bucket" "data" {
  bucket = "my-data-bucket"
}
resource "aws_s3_bucket" "versioned" {
  bucket = "my-versioned-bucket"
}
`;

const T6_COGNITO = `
resource "aws_cognito_user_pool" "users" {
  name              = "user-pool"
  mfa_configuration = "OPTIONAL"
  password_policy {
    minimum_length    = 12
    require_uppercase = true
    require_lowercase = true
    require_numbers   = true
    require_symbols   = true
  }
}
`;

const T7_FULL = `
resource "aws_api_gateway_rest_api" "api" {
  name = "api"
}
resource "aws_cognito_user_pool" "auth" {
  name = "auth-pool"
}
resource "aws_lambda_function" "fn" {
  function_name = "main-function"
  runtime       = "nodejs20.x"
  timeout       = 30
}
resource "aws_sqs_queue" "queue" {
  name = "work-queue"
}
resource "aws_sns_topic" "topic" {
  name = "events"
}
resource "aws_cloudwatch_event_bus" "bus" {
  name = "custom-bus"
}
resource "aws_dynamodb_table" "db" {
  name         = "data-table"
  billing_mode = "PAY_PER_REQUEST"
}
resource "aws_s3_bucket" "store" {
  bucket = "data-store"
}
`;

const T8_FIFO_SQS = `
resource "aws_sqs_queue" "fifo_queue" {
  name                       = "my-queue.fifo"
  fifo_queue                 = true
  visibility_timeout_seconds = 300
}
`;

const T9_LAMBDA_VPC = `
resource "aws_lambda_function" "vpc_fn" {
  function_name = "vpc-function"
  runtime       = "nodejs20.x"
  timeout       = 30
  vpc_config {
    subnet_ids         = ["subnet-123"]
    security_group_ids = ["sg-456"]
  }
}
`;

const T10_INVALID_HCL = `
this is not valid hcl !!!
resource {{{{{
`;

const T11_SOCIAL_MEDIA = `
resource "aws_api_gateway_rest_api" "social_media_api" {
  name = "social-media-api"
}

resource "aws_cognito_user_pool" "social_media_auth" {
  name              = "social-media-auth-pool"
  mfa_configuration = "OFF"
}

resource "aws_lambda_function" "social_media_create_post" {
  function_name = "social-media-create-post"
  runtime       = "nodejs20.x"
  timeout       = 30
  role          = aws_iam_role.social_media_create_post_role.arn
}

resource "aws_iam_role" "social_media_create_post_role" {
  name = "social-media-create-post-role"
}

resource "aws_iam_role_policy" "social_media_create_post_policy" {
  name = "social-media-create-post-policy"
  role = aws_iam_role.social_media_create_post_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = ["dynamodb:PutItem"]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.social_media_posts.arn
      },
      {
        Action   = ["sqs:SendMessage"]
        Effect   = "Allow"
        Resource = aws_sqs_queue.social_media_notifications.arn
      }
    ]
  })
}

resource "aws_lambda_function" "social_media_notification_worker" {
  function_name = "social-media-notification-worker"
  runtime       = "nodejs20.x"
  timeout       = 30
  role          = aws_iam_role.social_media_notification_worker_role.arn
}

resource "aws_iam_role" "social_media_notification_worker_role" {
  name = "social-media-notification-worker-role"
}

resource "aws_iam_role_policy" "social_media_notification_worker_policy" {
  name = "social-media-notification-worker-policy"
  role = aws_iam_role.social_media_notification_worker_role.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action   = ["dynamodb:GetItem"]
        Effect   = "Allow"
        Resource = aws_dynamodb_table.social_media_posts.arn
      },
      {
        Action   = ["sns:Publish"]
        Effect   = "Allow"
        Resource = aws_sns_topic.social_media_alerts.arn
      }
    ]
  })
}

resource "aws_dynamodb_table" "social_media_posts" {
  name         = "social-media-posts"
  billing_mode = "PAY_PER_REQUEST"
}

resource "aws_sqs_queue" "social_media_notifications" {
  name = "social-media-notifications"
}

resource "aws_sns_topic" "social_media_alerts" {
  name = "social-media-alerts"
}

resource "aws_lambda_event_source_mapping" "social_media_sqs_trigger" {
  event_source_arn = aws_sqs_queue.social_media_notifications.arn
  function_name    = aws_lambda_function.social_media_notification_worker.arn
}
`;

// --- Run tests ---

console.log('\nhclParser test suite\n');

await run('Test 1: Single Lambda — 1 node, correct props', async () => {
  const { nodes, edges, errors } = await parseHcl(T1_SINGLE_LAMBDA);
  assert(nodes.length === 1, `Expected 1 node, got ${nodes.length}`);
  assert(edges.length === 0, `Expected 0 edges, got ${edges.length}`);
  assert(nodes[0].type === 'lambda', `Expected type lambda, got ${nodes[0].type}`);
  assert(nodes[0].label === 'My Function', `Expected label My Function, got ${nodes[0].label}`);
  assert(nodes[0].data.timeout === 30, `Expected timeout 30, got ${nodes[0].data.timeout}`);
  assert(nodes[0].data.memorySize === 256, `Expected memorySize 256, got ${nodes[0].data.memorySize}`);
  assert(nodes[0].data.runtime === 'nodejs20.x', `Expected runtime nodejs20.x`);
  assert(typeof nodes[0].x === 'number' && !isNaN(nodes[0].x), 'x is NaN or missing');
  assert(typeof nodes[0].y === 'number' && !isNaN(nodes[0].y), 'y is NaN or missing');
});

await run('Test 2: API Gateway + Lambda + DynamoDB + IAM — 3+ nodes, 1+ edges', async () => {
  const { nodes, edges, errors } = await parseHcl(T2_WEB_API);
  assert(nodes.length >= 3, `Expected ≥3 nodes, got ${nodes.length}`);
  assert(edges.length >= 1, `Expected ≥1 edge, got ${edges.length}`);
  const types = nodes.map(n => n.type);
  assert(types.includes('apiGateway'), 'Missing apiGateway node');
  assert(types.includes('lambda'), 'Missing lambda node');
  assert(types.includes('dynamodb'), 'Missing dynamodb node');
});

await run('Test 3: SQS + Lambda event source mapping — 2 nodes, 1 edge', async () => {
  const { nodes, edges, errors } = await parseHcl(T3_SQS_LAMBDA);
  assert(nodes.length === 2, `Expected 2 nodes, got ${nodes.length}`);
  assert(edges.length === 1, `Expected 1 edge, got ${edges.length}`);
  const sqsNode = nodes.find(n => n.type === 'sqs');
  assert(sqsNode, 'Missing sqs node');
  assert(sqsNode.data.visibilityTimeout === 180, `Expected visibilityTimeout 180, got ${sqsNode.data.visibilityTimeout}`);
  assert(edges[0].source === sqsNode.id, 'Edge source should be SQS');
});

await run('Test 4: SNS + Lambda subscription — 2 nodes, 1 edge', async () => {
  const { nodes, edges, errors } = await parseHcl(T4_SNS_LAMBDA);
  assert(nodes.length === 2, `Expected 2 nodes, got ${nodes.length}`);
  assert(edges.length === 1, `Expected 1 edge, got ${edges.length}`);
  const snsNode = nodes.find(n => n.type === 'sns');
  assert(snsNode, 'Missing sns node');
  assert(edges[0].source === snsNode.id, 'Edge source should be SNS');
});

await run('Test 5: S3 with config — blockPublicAccess forced true', async () => {
  const { nodes, edges, errors } = await parseHcl(T5_S3);
  assert(nodes.length === 2, `Expected 2 nodes, got ${nodes.length}`);
  nodes.forEach(n => {
    assert(n.type === 's3', `Expected s3 type`);
    assert(n.data.blockPublicAccess === true, 'blockPublicAccess must be true');
    assert(n.data.encryption === true, 'encryption must be true');
    assert(typeof n.x === 'number' && !isNaN(n.x), 'x is NaN');
    assert(typeof n.y === 'number' && !isNaN(n.y), 'y is NaN');
  });
});

await run('Test 6: Cognito with MFA and password policy', async () => {
  const { nodes, edges, errors } = await parseHcl(T6_COGNITO);
  assert(nodes.length === 1, `Expected 1 node, got ${nodes.length}`);
  const n = nodes[0];
  assert(n.type === 'cognito', `Expected cognito type`);
  assert(n.data.mfaMode === 'OPTIONAL', `Expected mfaMode OPTIONAL, got ${n.data.mfaMode}`);
  assert(n.data.passwordMinLength === 12, `Expected passwordMinLength 12, got ${n.data.passwordMinLength}`);
  assert(n.data.passwordRequireSymbols === true, `Expected passwordRequireSymbols true`);
});

await run('Test 7: Full serverless app — 8 nodes (one per service type)', async () => {
  const { nodes, edges, errors } = await parseHcl(T7_FULL);
  assert(nodes.length === 8, `Expected 8 nodes, got ${nodes.length}`);
  const types = new Set(nodes.map(n => n.type));
  ['apiGateway', 'cognito', 'lambda', 'sqs', 'sns', 'eventbridge', 'dynamodb', 's3'].forEach(t => {
    assert(types.has(t), `Missing node type: ${t}`);
  });
  nodes.forEach(n => {
    assert(typeof n.x === 'number' && !isNaN(n.x), `Node ${n.type} has NaN x`);
    assert(typeof n.y === 'number' && !isNaN(n.y), `Node ${n.type} has NaN y`);
  });
});

await run('Test 8: FIFO SQS queue — isFifo: true', async () => {
  const { nodes, edges, errors } = await parseHcl(T8_FIFO_SQS);
  assert(nodes.length === 1, `Expected 1 node, got ${nodes.length}`);
  assert(nodes[0].data.isFifo === true, `Expected isFifo true, got ${nodes[0].data.isFifo}`);
  assert(nodes[0].data.visibilityTimeout === 300, `Expected visibilityTimeout 300, got ${nodes[0].data.visibilityTimeout}`);
});

await run('Test 9: Lambda with VPC — vpcEnabled: true', async () => {
  const { nodes, edges, errors } = await parseHcl(T9_LAMBDA_VPC);
  assert(nodes.length === 1, `Expected 1 node, got ${nodes.length}`);
  assert(nodes[0].data.vpcEnabled === true, `Expected vpcEnabled true, got ${nodes[0].data.vpcEnabled}`);
});

await run('Test 10: Invalid HCL — returns errors array, no crash', async () => {
  const result = await parseHcl(T10_INVALID_HCL);
  assert(result && typeof result === 'object', 'Should return an object');
  assert(Array.isArray(result.errors), 'errors must be an array');
  assert(result.errors.length > 0, 'Should have at least one error');
  assert(Array.isArray(result.nodes), 'nodes must be an array');
  assert(Array.isArray(result.edges), 'edges must be an array');
});

await run('Test 11: Social media app — prefix-stripped labels, IAM edges, layout', async () => {
  const { nodes, edges, errors } = await parseHcl(T11_SOCIAL_MEDIA);
  assert(errors.length === 0, `Expected no errors, got ${JSON.stringify(errors)}`);
  assert(nodes.length === 7, `Expected 7 nodes, got ${nodes.length}`);
  assert(edges.length === 5, `Expected 5 edges, got ${edges.length}`);

  const apiGw = nodes.find(n => n.type === 'apiGateway');
  const cognito = nodes.find(n => n.type === 'cognito');
  const lambda1 = nodes.find(n => n.label === 'Create Post');
  const lambda2 = nodes.find(n => n.label === 'Notification Worker');
  const dynamodb = nodes.find(n => n.type === 'dynamodb');
  const sqs = nodes.find(n => n.type === 'sqs');
  const sns = nodes.find(n => n.type === 'sns');

  assert(lambda1, 'Missing "Create Post" lambda node');
  assert(lambda1.label === 'Create Post', `Expected label "Create Post", got ${lambda1.label}`);
  assert(lambda2.label === 'Notification Worker', `Expected label "Notification Worker", got ${lambda2.label}`);
  assert(dynamodb.label === 'Posts', `Expected DynamoDB label "Posts", got ${dynamodb.label}`);
  assert(sqs.label === 'Notifications', `Expected SQS label "Notifications", got ${sqs.label}`);
  assert(sns.label === 'Alerts', `Expected SNS label "Alerts", got ${sns.label}`);
  assert(apiGw.label === 'Api', `Expected API Gateway label "Api", got ${apiGw.label}`);

  assert(apiGw.x === LAYOUT_COL0_X && cognito.x === LAYOUT_COL0_X, 'API Gateway/Cognito should be in column 0');
  assert(lambda1.x === LAYOUT_COL1_X && lambda2.x === LAYOUT_COL1_X, 'Lambdas should be in column 1');
  assert(dynamodb.x === LAYOUT_COL2_X && sqs.x === LAYOUT_COL2_X && sns.x === LAYOUT_COL2_X, 'DynamoDB/SQS/SNS should be in column 2');

  const iamEdgeExists = (sourceId, targetId, invocationType) =>
    edges.some(e => e.source === sourceId && e.target === targetId && e.authType === 'IAM' && e.invocationType === invocationType);

  assert(iamEdgeExists(lambda1.id, dynamodb.id, 'Sync'), 'Missing IAM edge: Create Post -> DynamoDB (Sync)');
  assert(iamEdgeExists(lambda1.id, sqs.id, 'Async'), 'Missing IAM edge: Create Post -> SQS (Async)');
  assert(iamEdgeExists(lambda2.id, dynamodb.id, 'Sync'), 'Missing IAM edge: Notification Worker -> DynamoDB (Sync)');
  assert(iamEdgeExists(lambda2.id, sns.id, 'Async'), 'Missing IAM edge: Notification Worker -> SNS (Async)');

  const eventSourceEdge = edges.find(e => e.source === sqs.id && e.target === lambda2.id);
  assert(eventSourceEdge, 'Missing event source mapping edge: SQS -> Notification Worker');
  assert(eventSourceEdge.authType === 'NONE', `Expected SQS -> Lambda edge authType NONE, got ${eventSourceEdge.authType}`);
});

console.log(`\n${passed + failed} tests: ${passed} passed, ${failed} failed\n`);
if (failed > 0) process.exit(1);
