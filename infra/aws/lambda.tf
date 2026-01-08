# Lambda deployment package placeholder
# In production, this would be built by CI/CD and uploaded to S3
# For now, we create a minimal placeholder

data "archive_file" "lambda_placeholder" {
  type        = "zip"
  output_path = "${path.module}/lambda_placeholder.zip"

  source {
    content  = "exports.handler = async (event) => ({ statusCode: 200, body: 'Placeholder' });"
    filename = "index.js"
  }
}

# Ingest Lambda Function
resource "aws_lambda_function" "ingest" {
  filename         = data.archive_file.lambda_placeholder.output_path
  function_name    = "${var.project_name}-ingest-${var.environment}"
  role             = aws_iam_role.ingest_lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout
  publish          = true # Enable versioning for blue/green

  environment {
    variables = {
      NODE_ENV                = var.environment
      LOG_LEVEL               = var.log_level
      SQS_QUEUE_URL           = aws_sqs_queue.events.url
      ANALYTICS_WRITE_KEY     = var.analytics_write_key
      CORS_ALLOWED_ORIGINS    = var.cors_allowed_origins
      MAX_PAYLOAD_SIZE_BYTES  = var.max_payload_size_bytes
      MAX_EVENTS_PER_BATCH    = var.max_events_per_batch
    }
  }

  tags = {
    Name = "${var.project_name}-ingest-${var.environment}"
  }

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      last_modified
    ]
  }
}

# Ingest Lambda Alias for Blue/Green
resource "aws_lambda_alias" "ingest_live" {
  name             = "live"
  description      = "Live traffic alias for blue/green deployment"
  function_name    = aws_lambda_function.ingest.arn
  function_version = aws_lambda_function.ingest.version

  lifecycle {
    ignore_changes = [function_version]
  }
}

# Query Lambda Function
resource "aws_lambda_function" "query" {
  filename         = data.archive_file.lambda_placeholder.output_path
  function_name    = "${var.project_name}-query-${var.environment}"
  role             = aws_iam_role.query_lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout
  publish          = true # Enable versioning for blue/green

  environment {
    variables = {
      NODE_ENV             = var.environment
      LOG_LEVEL            = var.log_level
      DYNAMODB_TABLE_NAME  = aws_dynamodb_table.events.name
      MAX_QUERY_LIMIT      = var.max_query_limit
    }
  }

  tags = {
    Name = "${var.project_name}-query-${var.environment}"
  }

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      last_modified
    ]
  }
}

# Query Lambda Alias for Blue/Green
resource "aws_lambda_alias" "query_live" {
  name             = "live"
  description      = "Live traffic alias for blue/green deployment"
  function_name    = aws_lambda_function.query.arn
  function_version = aws_lambda_function.query.version

  lifecycle {
    ignore_changes = [function_version]
  }
}

# Processor Lambda Function
resource "aws_lambda_function" "processor" {
  filename         = data.archive_file.lambda_placeholder.output_path
  function_name    = "${var.project_name}-processor-${var.environment}"
  role             = aws_iam_role.processor_lambda.arn
  handler          = "index.handler"
  source_code_hash = data.archive_file.lambda_placeholder.output_base64sha256
  runtime          = var.lambda_runtime
  memory_size      = var.lambda_memory_size
  timeout          = var.lambda_timeout
  publish          = true # Enable versioning for blue/green

  environment {
    variables = {
      NODE_ENV            = var.environment
      LOG_LEVEL           = var.log_level
      DYNAMODB_TABLE_NAME = aws_dynamodb_table.events.name
      S3_RAW_BUCKET_NAME  = aws_s3_bucket.raw_events.id
    }
  }

  tags = {
    Name = "${var.project_name}-processor-${var.environment}"
  }

  lifecycle {
    ignore_changes = [
      filename,
      source_code_hash,
      last_modified
    ]
  }
}

# Processor Lambda Alias for Blue/Green
resource "aws_lambda_alias" "processor_live" {
  name             = "live"
  description      = "Live traffic alias for blue/green deployment"
  function_name    = aws_lambda_function.processor.arn
  function_version = aws_lambda_function.processor.version

  lifecycle {
    ignore_changes = [function_version]
  }
}

# SQS Event Source Mapping for Processor Lambda
resource "aws_lambda_event_source_mapping" "processor_sqs" {
  event_source_arn = aws_sqs_queue.events.arn
  function_name    = aws_lambda_alias.processor_live.arn
  batch_size       = 10
  enabled          = true

  scaling_config {
    maximum_concurrency = 10
  }
}

# Lambda Permissions for API Gateway
resource "aws_lambda_permission" "ingest_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.ingest.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
  qualifier     = aws_lambda_alias.ingest_live.name
}

resource "aws_lambda_permission" "query_api_gateway" {
  statement_id  = "AllowAPIGatewayInvoke"
  action        = "lambda:InvokeFunction"
  function_name = aws_lambda_function.query.function_name
  principal     = "apigateway.amazonaws.com"
  source_arn    = "${aws_apigatewayv2_api.main.execution_arn}/*/*"
  qualifier     = aws_lambda_alias.query_live.name
}
