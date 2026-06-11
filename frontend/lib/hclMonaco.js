// Monaco language extras for the HCL editor: error markers from parse-hcl
// errors and a completion provider for Terraform/AWS resource authoring.
// Client-side only — imported from HclEditor.jsx after the Monaco instance loads.

const ERROR_POSITION_RE = /main\.tf:(\d+),(\d+)-(?:(\d+),)?(\d+):\s*(.*)/;

export function buildErrorMarkers(monaco, errors) {
  const markers = [];
  for (const err of errors || []) {
    const match = err.match(ERROR_POSITION_RE);
    if (!match) continue;
    const [, startLine, startCol, endLine, endCol, rawMessage] = match;
    markers.push({
      severity: monaco.MarkerSeverity.Error,
      startLineNumber: parseInt(startLine, 10),
      startColumn: parseInt(startCol, 10),
      endLineNumber: parseInt(endLine || startLine, 10),
      endColumn: parseInt(endCol, 10),
      message: rawMessage.replace(/[\]\s]+$/, '').trim(),
    });
  }
  return markers;
}

const RESOURCE_TYPES = {
  aws_lambda_function: {
    description: 'AWS Lambda function',
    attributes: ['function_name', 'runtime', 'handler', 'filename', 'role', 'timeout', 'memory_size', 'architectures', 'environment', 'reserved_concurrent_executions', 'dead_letter_config', 'vpc_config', 'layers'],
    snippet: [
      'resource "aws_lambda_function" "${1:name}" {',
      '  function_name = "${2:my-function}"',
      '  runtime       = "${3:nodejs20.x}"',
      '  handler       = "${4:index.handler}"',
      '  filename      = "${5:placeholder.zip}"',
      '  role          = ${6:aws_iam_role.lambda_role.arn}',
      '  timeout       = ${7:30}',
      '  memory_size   = ${8:128}',
      '}',
    ].join('\n'),
  },
  aws_api_gateway_rest_api: {
    description: 'API Gateway REST API',
    attributes: ['name', 'description', 'endpoint_configuration', 'binary_media_types', 'policy'],
    snippet: [
      'resource "aws_api_gateway_rest_api" "${1:name}" {',
      '  name = "${2:my-api}"',
      '}',
    ].join('\n'),
  },
  aws_api_gateway_v2_api: {
    description: 'API Gateway HTTP/WebSocket API',
    attributes: ['name', 'protocol_type', 'route_selection_expression', 'target', 'description', 'cors_configuration'],
    snippet: [
      'resource "aws_api_gateway_v2_api" "${1:name}" {',
      '  name          = "${2:my-api}"',
      '  protocol_type = "${3:HTTP}"',
      '}',
    ].join('\n'),
  },
  aws_dynamodb_table: {
    description: 'DynamoDB table',
    attributes: ['name', 'billing_mode', 'hash_key', 'range_key', 'attribute', 'read_capacity', 'write_capacity', 'stream_enabled', 'stream_view_type', 'point_in_time_recovery', 'server_side_encryption', 'ttl'],
    snippet: [
      'resource "aws_dynamodb_table" "${1:name}" {',
      '  name         = "${2:my-table}"',
      '  billing_mode = "${3:PAY_PER_REQUEST}"',
      '  hash_key     = "${4:id}"',
      '',
      '  attribute {',
      '    name = "${4:id}"',
      '    type = "S"',
      '  }',
      '}',
    ].join('\n'),
  },
  aws_s3_bucket: {
    description: 'S3 bucket',
    attributes: ['bucket', 'force_destroy', 'tags', 'versioning', 'server_side_encryption_configuration'],
    snippet: [
      'resource "aws_s3_bucket" "${1:name}" {',
      '  bucket = "${2:my-bucket-name}"',
      '}',
    ].join('\n'),
  },
  aws_sqs_queue: {
    description: 'SQS queue',
    attributes: ['name', 'visibility_timeout_seconds', 'message_retention_seconds', 'fifo_queue', 'delay_seconds', 'max_message_size', 'redrive_policy', 'kms_master_key_id'],
    snippet: [
      'resource "aws_sqs_queue" "${1:name}" {',
      '  name                       = "${2:my-queue}"',
      '  visibility_timeout_seconds = ${3:180}',
      '}',
    ].join('\n'),
  },
  aws_sns_topic: {
    description: 'SNS topic',
    attributes: ['name', 'fifo_topic', 'kms_master_key_id', 'display_name', 'policy'],
    snippet: [
      'resource "aws_sns_topic" "${1:name}" {',
      '  name = "${2:my-topic}"',
      '}',
    ].join('\n'),
  },
  aws_cloudwatch_event_bus: {
    description: 'EventBridge custom event bus',
    attributes: ['name', 'event_source_name', 'tags'],
    snippet: [
      'resource "aws_cloudwatch_event_bus" "${1:name}" {',
      '  name = "${2:my-event-bus}"',
      '}',
    ].join('\n'),
  },
  aws_cognito_user_pool: {
    description: 'Cognito user pool',
    attributes: ['name', 'auto_verified_attributes', 'password_policy', 'mfa_configuration', 'account_recovery_setting', 'admin_create_user_config'],
    snippet: [
      'resource "aws_cognito_user_pool" "${1:name}" {',
      '  name                     = "${2:my-user-pool}"',
      '  auto_verified_attributes = ["email"]',
      '',
      '  password_policy {',
      '    minimum_length    = 8',
      '    require_uppercase = true',
      '    require_lowercase = true',
      '    require_numbers   = true',
      '    require_symbols   = false',
      '  }',
      '}',
    ].join('\n'),
  },
  aws_lambda_event_source_mapping: {
    description: 'Lambda event source mapping (SQS/DynamoDB streams)',
    attributes: ['event_source_arn', 'function_name', 'batch_size', 'enabled', 'starting_position', 'maximum_batching_window_in_seconds'],
    snippet: [
      'resource "aws_lambda_event_source_mapping" "${1:name}" {',
      '  event_source_arn = ${2:aws_sqs_queue.my_queue.arn}',
      '  function_name    = ${3:aws_lambda_function.handler.arn}',
      '  batch_size       = ${4:10}',
      '}',
    ].join('\n'),
  },
  aws_lambda_permission: {
    description: 'Lambda resource-based permission',
    attributes: ['statement_id', 'action', 'function_name', 'principal', 'source_arn', 'qualifier'],
    snippet: [
      'resource "aws_lambda_permission" "${1:name}" {',
      '  statement_id  = "${2:AllowExecutionFromAPIGateway}"',
      '  action        = "lambda:InvokeFunction"',
      '  function_name = ${3:aws_lambda_function.handler.function_name}',
      '  principal     = "${4:apigateway.amazonaws.com}"',
      '}',
    ].join('\n'),
  },
  aws_sns_topic_subscription: {
    description: 'SNS topic subscription',
    attributes: ['topic_arn', 'protocol', 'endpoint', 'raw_message_delivery', 'filter_policy'],
    snippet: [
      'resource "aws_sns_topic_subscription" "${1:name}" {',
      '  topic_arn = ${2:aws_sns_topic.notifications.arn}',
      '  protocol  = "${3:lambda}"',
      '  endpoint  = ${4:aws_lambda_function.subscriber.arn}',
      '}',
    ].join('\n'),
  },
  aws_iam_role: {
    description: 'IAM role',
    attributes: ['name', 'assume_role_policy', 'path', 'description', 'managed_policy_arns', 'tags'],
    snippet: [
      'resource "aws_iam_role" "${1:name}" {',
      '  name = "${2:my-role}"',
      '',
      '  assume_role_policy = jsonencode({',
      '    Version = "2012-10-17"',
      '    Statement = [{',
      '      Action    = "sts:AssumeRole"',
      '      Effect    = "Allow"',
      '      Principal = { Service = "${3:lambda.amazonaws.com}" }',
      '    }]',
      '  })',
      '}',
    ].join('\n'),
  },
  aws_iam_role_policy: {
    description: 'IAM role inline policy',
    attributes: ['name', 'role', 'policy'],
    snippet: [
      'resource "aws_iam_role_policy" "${1:name}" {',
      '  name = "${2:my-policy}"',
      '  role = ${3:aws_iam_role.lambda_role.id}',
      '',
      '  policy = jsonencode({',
      '    Version = "2012-10-17"',
      '    Statement = [{',
      '      Action   = ["${4:dynamodb:GetItem}"]',
      '      Effect   = "Allow"',
      '      Resource = "${5:*}"',
      '    }]',
      '  })',
      '}',
    ].join('\n'),
  },
};

const TOP_LEVEL_BLOCKS = {
  resource: {
    detail: 'Resource block',
    snippet: 'resource "${1:aws_lambda_function}" "${2:name}" {\n  $0\n}',
  },
  provider: {
    detail: 'Provider block',
    snippet: 'provider "aws" {\n  region = "${1:us-east-1}"\n}',
  },
  variable: {
    detail: 'Variable block',
    snippet: 'variable "${1:name}" {\n  type    = string\n  default = "${2:value}"\n}',
  },
  output: {
    detail: 'Output block',
    snippet: 'output "${1:name}" {\n  value = ${2:resource.attribute}\n}',
  },
  data: {
    detail: 'Data source block',
    snippet: 'data "${1:aws_caller_identity}" "${2:current}" {}',
  },
  module: {
    detail: 'Module block',
    snippet: 'module "${1:name}" {\n  source = "${2:./module}"\n}',
  },
  terraform: {
    detail: 'Terraform settings block',
    snippet: 'terraform {\n  required_providers {\n    aws = {\n      source  = "hashicorp/aws"\n      version = "~> 5.0"\n    }\n  }\n}',
  },
};

// Walks backward from the cursor tracking brace depth to find the nearest
// unmatched "{" — if that line opens a `resource "type" "name" {` block,
// returns the resource type so attribute completions can be offered.
function findEnclosingResourceType(model, position) {
  let depth = 0;
  for (let lineNumber = position.lineNumber; lineNumber >= 1; lineNumber--) {
    const content = model.getLineContent(lineNumber);
    const text = lineNumber === position.lineNumber ? content.substring(0, position.column - 1) : content;
    for (let i = text.length - 1; i >= 0; i--) {
      const ch = text[i];
      if (ch === '}') {
        depth++;
      } else if (ch === '{') {
        if (depth === 0) {
          const match = content.match(/resource\s+"([A-Za-z0-9_]+)"/);
          return match ? match[1] : null;
        }
        depth--;
      }
    }
  }
  return null;
}

const ATTR_LINE_RE = /^(\s*)([A-Za-z0-9_]+)(\s*)=(\s*)(.*)$/;
const HEREDOC_START_RE = /<<-?(\w+)\s*$/;

// Lightweight terraform-fmt-style pass: aligns "=" within consecutive
// same-indent attribute lines, trims trailing whitespace, collapses blank
// runs, and ensures a single trailing newline. Does not re-indent or touch
// bracket structure, so it cannot turn valid HCL into invalid HCL.
export function formatHcl(text) {
  const lines = text.split('\n').map(l => l.replace(/[ \t]+$/, ''));
  const result = [...lines];

  let i = 0;
  while (i < result.length) {
    // Skip heredoc bodies verbatim — their content is significant.
    const heredoc = result[i].match(HEREDOC_START_RE);
    if (heredoc) {
      const terminator = heredoc[1];
      i++;
      while (i < result.length && result[i].trim() !== terminator) i++;
      i++;
      continue;
    }

    const match = result[i].match(ATTR_LINE_RE);
    if (!match) { i++; continue; }

    const indent = match[1];
    const group = [i];
    let j = i + 1;
    while (j < result.length) {
      const next = result[j].match(ATTR_LINE_RE);
      if (!next || next[1] !== indent) break;
      group.push(j);
      j++;
    }

    let maxKeyLen = 0;
    for (const idx of group) {
      maxKeyLen = Math.max(maxKeyLen, result[idx].match(ATTR_LINE_RE)[2].length);
    }
    for (const idx of group) {
      const m = result[idx].match(ATTR_LINE_RE);
      const key = m[2];
      const value = m[5];
      result[idx] = `${indent}${key}${' '.repeat(maxKeyLen - key.length)} = ${value}`;
    }

    i = j;
  }

  // Collapse runs of 2+ blank lines down to 1
  const collapsed = [];
  let blankRun = 0;
  for (const line of result) {
    if (line.trim() === '') {
      blankRun++;
      if (blankRun <= 1) collapsed.push(line);
    } else {
      blankRun = 0;
      collapsed.push(line);
    }
  }

  while (collapsed.length > 0 && collapsed[collapsed.length - 1].trim() === '') {
    collapsed.pop();
  }

  return collapsed.join('\n') + '\n';
}

let formatterRegistered = false;

export function registerHclFormatter(monaco) {
  if (formatterRegistered) return;
  formatterRegistered = true;

  monaco.languages.registerDocumentFormattingEditProvider('hcl', {
    provideDocumentFormattingEdits(model) {
      const text = model.getValue();
      const formatted = formatHcl(text);
      if (formatted === text) return [];
      return [{ range: model.getFullModelRange(), text: formatted }];
    },
  });
}

let registered = false;

export function registerHclCompletions(monaco) {
  if (registered) return;
  registered = true;

  monaco.languages.registerCompletionItemProvider('hcl', {
    triggerCharacters: ['"', '_'],
    provideCompletionItems(model, position) {
      const lineContent = model.getLineContent(position.lineNumber);
      const textBeforeCursor = lineContent.substring(0, position.column - 1);
      const word = model.getWordUntilPosition(position);
      const range = {
        startLineNumber: position.lineNumber,
        endLineNumber: position.lineNumber,
        startColumn: word.startColumn,
        endColumn: word.endColumn,
      };
      const beforeWord = lineContent.substring(0, word.startColumn - 1);
      const suggestions = [];

      // Start of a line/statement: attribute names if inside a known resource
      // block, otherwise top-level block keywords + full resource snippets.
      if (/^\s*$/.test(beforeWord)) {
        const resourceType = findEnclosingResourceType(model, position);
        if (resourceType && RESOURCE_TYPES[resourceType]) {
          for (const attr of RESOURCE_TYPES[resourceType].attributes) {
            suggestions.push({
              label: attr,
              kind: monaco.languages.CompletionItemKind.Property,
              insertText: `${attr} = `,
              detail: resourceType,
              range,
            });
          }
          return { suggestions };
        }

        for (const [keyword, def] of Object.entries(TOP_LEVEL_BLOCKS)) {
          suggestions.push({
            label: keyword,
            kind: monaco.languages.CompletionItemKind.Keyword,
            insertText: def.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: def.detail,
            range,
          });
        }
        for (const [type, def] of Object.entries(RESOURCE_TYPES)) {
          suggestions.push({
            label: type,
            kind: monaco.languages.CompletionItemKind.Snippet,
            insertText: def.snippet,
            insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
            detail: def.description,
            range,
          });
        }
        return { suggestions };
      }

      // Inside the type string of `resource "..."` — suggest resource types
      if (/^\s*resource\s+"[A-Za-z0-9_]*$/.test(textBeforeCursor)) {
        for (const [type, def] of Object.entries(RESOURCE_TYPES)) {
          suggestions.push({
            label: type,
            kind: monaco.languages.CompletionItemKind.Class,
            insertText: type,
            detail: def.description,
            range,
          });
        }
        return { suggestions };
      }

      return { suggestions };
    },
  });
}
