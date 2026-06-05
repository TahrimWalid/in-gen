export const compileToTerraform = (nodes, edges) => {
  const getSafeName = (label) => label.toLowerCase().replace(/[^a-z0-9]/g, '_');

  let body = '';

  body += `provider "aws" {\n`;
  body += `  region = "us-east-1"\n`;
  body += `}\n\n`;

  // ── 1. RESOURCES ──────────────────────────────────────────────────────────
  body += `# --- RESOURCES ---\n\n`;

  nodes.forEach((node) => {
    const safeName = getSafeName(node.data.label);

    switch (node.data.service) {
      case 'lambda':
        body += `resource "aws_lambda_function" "${safeName}" {\n`;
        body += `  function_name = "${node.data.label}"\n`;
        body += `  runtime       = "nodejs18.x"\n`;
        body += `  handler       = "index.handler"\n`;
        body += `  filename      = "placeholder.zip"\n`;
        body += `  role          = aws_iam_role.${safeName}_role.arn\n`;
        body += `}\n\n`;
        break;

      case 'apiGateway':
        body += `resource "aws_api_gateway_rest_api" "${safeName}" {\n`;
        body += `  name = "${node.data.label}"\n`;
        body += `}\n\n`;

        body += `resource "aws_api_gateway_deployment" "${safeName}_deployment" {\n`;
        body += `  rest_api_id = aws_api_gateway_rest_api.${safeName}.id\n\n`;
        body += `  lifecycle {\n`;
        body += `    create_before_destroy = true\n`;
        body += `  }\n`;
        body += `}\n\n`;

        body += `resource "aws_api_gateway_stage" "${safeName}_stage" {\n`;
        body += `  deployment_id = aws_api_gateway_deployment.${safeName}_deployment.id\n`;
        body += `  rest_api_id   = aws_api_gateway_rest_api.${safeName}.id\n`;
        body += `  stage_name    = "prod"\n`;
        body += `}\n\n`;
        break;

      case 's3':
        body += `resource "aws_s3_bucket" "${safeName}" {\n`;
        body += `  bucket = "${node.data.label.toLowerCase().replace(/\s+/g, '-')}"\n`;
        body += `}\n\n`;
        break;

      case 'dynamodb':
        body += `resource "aws_dynamodb_table" "${safeName}" {\n`;
        body += `  name         = "${node.data.label}"\n`;
        body += `  billing_mode = "PAY_PER_REQUEST"\n`;
        body += `  hash_key     = "id"\n`;
        body += `  attribute {\n`;
        body += `    name = "id"\n`;
        body += `    type = "S"\n`;
        body += `  }\n`;
        body += `}\n\n`;
        break;

      case 'sqs':
        body += `resource "aws_sqs_queue" "${safeName}" {\n`;
        body += `  name = "${node.data.label}"\n`;
        body += `}\n\n`;
        break;

      case 'sns':
        body += `resource "aws_sns_topic" "${safeName}" {\n`;
        body += `  name = "${node.data.label}"\n`;
        body += `}\n\n`;
        break;

      case 'eventbridge':
        body += `resource "aws_cloudwatch_event_bus" "${safeName}" {\n`;
        body += `  name = "${node.data.label}"\n`;
        body += `}\n\n`;
        break;

      case 'cognito':
        body += `resource "aws_cognito_user_pool" "${safeName}" {\n`;
        body += `  name                     = "${node.data.label}"\n`;
        body += `  auto_verified_attributes = ["email"]\n\n`;
        body += `  password_policy {\n`;
        body += `    minimum_length    = 8\n`;
        body += `    require_uppercase = true\n`;
        body += `    require_lowercase = true\n`;
        body += `    require_numbers   = true\n`;
        body += `    require_symbols   = false\n`;
        body += `  }\n`;
        body += `}\n\n`;

        body += `resource "aws_cognito_user_pool_client" "${safeName}_client" {\n`;
        body += `  name         = "${node.data.label}-client"\n`;
        body += `  user_pool_id = aws_cognito_user_pool.${safeName}.id\n`;
        body += `  explicit_auth_flows = [\n`;
        body += `    "ALLOW_USER_PASSWORD_AUTH",\n`;
        body += `    "ALLOW_REFRESH_TOKEN_AUTH"\n`;
        body += `  ]\n`;
        body += `}\n\n`;
        break;
    }
  });

  // ── 2. IAM ROLES & POLICIES ───────────────────────────────────────────────
  body += `# --- IAM ROLES & POLICIES ---\n\n`;

  nodes.forEach((node) => {
    if (node.data.service !== 'lambda') return;
    const safeName = getSafeName(node.data.label);

    body += `resource "aws_iam_role" "${safeName}_role" {\n`;
    body += `  name = "${safeName}_execution_role"\n`;
    body += `  assume_role_policy = jsonencode({\n`;
    body += `    Version = "2012-10-17"\n`;
    body += `    Statement = [{ Action = "sts:AssumeRole", Effect = "Allow", Principal = { Service = "lambda.amazonaws.com" } }]\n`;
    body += `  })\n`;
    body += `}\n\n`;

    const statements = [];

    edges.filter(e => e.source === node.id).forEach((edge) => {
      const target = nodes.find(n => n.id === edge.target);
      if (!target) return;
      const targetSafe = getSafeName(target.data.label);

      if (target.data.service === 's3') {
        statements.push(
          `      {\n        Action   = ["s3:GetObject", "s3:PutObject"]\n        Effect   = "Allow"\n        Resource = "\${aws_s3_bucket.${targetSafe}.arn}/*"\n      }`
        );
      } else if (target.data.service === 'dynamodb') {
        statements.push(
          `      {\n        Action   = ["dynamodb:PutItem", "dynamodb:GetItem", "dynamodb:Scan"]\n        Effect   = "Allow"\n        Resource = aws_dynamodb_table.${targetSafe}.arn\n      }`
        );
      } else if (target.data.service === 'sqs') {
        statements.push(
          `      {\n        Action   = ["sqs:SendMessage"]\n        Effect   = "Allow"\n        Resource = aws_sqs_queue.${targetSafe}.arn\n      }`
        );
      } else if (target.data.service === 'sns') {
        statements.push(
          `      {\n        Action   = ["sns:Publish"]\n        Effect   = "Allow"\n        Resource = aws_sns_topic.${targetSafe}.arn\n      }`
        );
      }
    });

    if (statements.length > 0) {
      body += `resource "aws_iam_role_policy" "${safeName}_policy" {\n`;
      body += `  name = "${safeName}_policy"\n`;
      body += `  role = aws_iam_role.${safeName}_role.id\n`;
      body += `  policy = jsonencode({\n`;
      body += `    Version = "2012-10-17"\n`;
      body += `    Statement = [\n`;
      body += statements.join(',\n');
      body += `\n    ]\n`;
      body += `  })\n`;
      body += `}\n\n`;
    }
  });

  // ── 3. LAMBDA PERMISSIONS (API Gateway → Lambda) ──────────────────────────
  const apigwToLambdaEdges = edges.filter((edge) => {
    const src = nodes.find(n => n.id === edge.source);
    const tgt = nodes.find(n => n.id === edge.target);
    return src?.data.service === 'apiGateway' && tgt?.data.service === 'lambda';
  });

  if (apigwToLambdaEdges.length > 0) {
    body += `# --- LAMBDA PERMISSIONS ---\n\n`;
    apigwToLambdaEdges.forEach((edge) => {
      const apigwNode = nodes.find(n => n.id === edge.source);
      const lambdaNode = nodes.find(n => n.id === edge.target);
      const apigwSafe = getSafeName(apigwNode.data.label);
      const lambdaSafe = getSafeName(lambdaNode.data.label);

      body += `resource "aws_lambda_permission" "${lambdaSafe}_apigw" {\n`;
      body += `  statement_id  = "AllowAPIGatewayInvoke"\n`;
      body += `  action        = "lambda:InvokeFunction"\n`;
      body += `  function_name = aws_lambda_function.${lambdaSafe}.function_name\n`;
      body += `  principal     = "apigateway.amazonaws.com"\n`;
      body += `  source_arn    = "\${aws_api_gateway_rest_api.${apigwSafe}.execution_arn}/*/*"\n`;
      body += `}\n\n`;
    });
  }

  // ── 4. EVENT SOURCE MAPPINGS (SQS → Lambda) ───────────────────────────────
  const sqsToLambdaEdges = edges.filter((edge) => {
    const src = nodes.find(n => n.id === edge.source);
    const tgt = nodes.find(n => n.id === edge.target);
    return src?.data.service === 'sqs' && tgt?.data.service === 'lambda';
  });

  if (sqsToLambdaEdges.length > 0) {
    body += `# --- EVENT SOURCE MAPPINGS ---\n\n`;
    sqsToLambdaEdges.forEach((edge) => {
      const sqsNode = nodes.find(n => n.id === edge.source);
      const lambdaNode = nodes.find(n => n.id === edge.target);
      const sqsSafe = getSafeName(sqsNode.data.label);
      const lambdaSafe = getSafeName(lambdaNode.data.label);

      body += `resource "aws_lambda_event_source_mapping" "${sqsSafe}_to_${lambdaSafe}" {\n`;
      body += `  event_source_arn = aws_sqs_queue.${sqsSafe}.arn\n`;
      body += `  function_name    = aws_lambda_function.${lambdaSafe}.arn\n`;
      body += `  batch_size       = 10\n`;
      body += `}\n\n`;
    });
  }

  // ── 5. SNS SUBSCRIPTIONS (SNS → Lambda) ───────────────────────────────────
  const snsToLambdaEdges = edges.filter((edge) => {
    const src = nodes.find(n => n.id === edge.source);
    const tgt = nodes.find(n => n.id === edge.target);
    return src?.data.service === 'sns' && tgt?.data.service === 'lambda';
  });

  if (snsToLambdaEdges.length > 0) {
    body += `# --- SNS SUBSCRIPTIONS ---\n\n`;
    snsToLambdaEdges.forEach((edge) => {
      const snsNode = nodes.find(n => n.id === edge.source);
      const lambdaNode = nodes.find(n => n.id === edge.target);
      const snsSafe = getSafeName(snsNode.data.label);
      const lambdaSafe = getSafeName(lambdaNode.data.label);

      body += `resource "aws_lambda_permission" "sns_${lambdaSafe}" {\n`;
      body += `  statement_id  = "AllowSNSInvoke"\n`;
      body += `  action        = "lambda:InvokeFunction"\n`;
      body += `  function_name = aws_lambda_function.${lambdaSafe}.function_name\n`;
      body += `  principal     = "sns.amazonaws.com"\n`;
      body += `  source_arn    = aws_sns_topic.${snsSafe}.arn\n`;
      body += `}\n\n`;

      body += `resource "aws_sns_topic_subscription" "${snsSafe}_${lambdaSafe}" {\n`;
      body += `  topic_arn = aws_sns_topic.${snsSafe}.arn\n`;
      body += `  protocol  = "lambda"\n`;
      body += `  endpoint  = aws_lambda_function.${lambdaSafe}.arn\n`;
      body += `}\n\n`;
    });
  }

  // ── HEADER (counted from generated body) ──────────────────────────────────
  const resourceCount = (body.match(/^resource "/gm) || []).length;
  const iamRoleCount  = (body.match(/^resource "aws_iam_role"/gm) || []).length;
  const permCount     = (body.match(/^resource "aws_lambda_permission"/gm) || []).length;

  const header =
    `# --------------------------------------------------------\n` +
    `# GENERATED BY INGEN COMPILER\n` +
    `# Target: AWS Terraform (HCL)\n` +
    `# Resources: ${resourceCount} resources · ${iamRoleCount} IAM roles · ${permCount} permissions\n` +
    `# --------------------------------------------------------\n\n`;

  return header + body;
};
