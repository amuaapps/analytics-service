# API Gateway Outputs
output "api_gateway_url" {
  description = "Base URL for the API Gateway"
  value       = aws_apigatewayv2_stage.main.invoke_url
}

output "api_gateway_id" {
  description = "ID of the API Gateway"
  value       = aws_apigatewayv2_api.main.id
}

# Lambda Function Outputs
output "ingest_lambda_arn" {
  description = "ARN of the ingest Lambda function"
  value       = aws_lambda_function.ingest.arn
}

output "ingest_lambda_name" {
  description = "Name of the ingest Lambda function"
  value       = aws_lambda_function.ingest.function_name
}

output "ingest_lambda_version" {
  description = "Latest version of the ingest Lambda function"
  value       = aws_lambda_function.ingest.version
}

output "query_lambda_arn" {
  description = "ARN of the query Lambda function"
  value       = aws_lambda_function.query.arn
}

output "query_lambda_name" {
  description = "Name of the query Lambda function"
  value       = aws_lambda_function.query.function_name
}

output "query_lambda_version" {
  description = "Latest version of the query Lambda function"
  value       = aws_lambda_function.query.version
}

output "processor_lambda_arn" {
  description = "ARN of the processor Lambda function"
  value       = aws_lambda_function.processor.arn
}

output "processor_lambda_name" {
  description = "Name of the processor Lambda function"
  value       = aws_lambda_function.processor.function_name
}

output "processor_lambda_version" {
  description = "Latest version of the processor Lambda function"
  value       = aws_lambda_function.processor.version
}

# Lambda Alias Outputs (for Blue/Green)
output "ingest_live_alias_arn" {
  description = "ARN of the ingest Lambda live alias"
  value       = aws_lambda_alias.ingest_live.arn
}

output "query_live_alias_arn" {
  description = "ARN of the query Lambda live alias"
  value       = aws_lambda_alias.query_live.arn
}

output "processor_live_alias_arn" {
  description = "ARN of the processor Lambda live alias"
  value       = aws_lambda_alias.processor_live.arn
}

output "live_alias_name" {
  description = "Name of the live Lambda alias for blue/green deployment"
  value       = "live"
}

# DynamoDB Outputs
output "dynamodb_table_name" {
  description = "Name of the DynamoDB table"
  value       = aws_dynamodb_table.events.name
}

output "dynamodb_table_arn" {
  description = "ARN of the DynamoDB table"
  value       = aws_dynamodb_table.events.arn
}

# S3 Outputs
output "s3_bucket_name" {
  description = "Name of the S3 bucket for raw events"
  value       = aws_s3_bucket.raw_events.id
}

output "s3_bucket_arn" {
  description = "ARN of the S3 bucket for raw events"
  value       = aws_s3_bucket.raw_events.arn
}

# SQS Outputs
output "sqs_queue_url" {
  description = "URL of the SQS queue"
  value       = aws_sqs_queue.events.url
}

output "sqs_queue_arn" {
  description = "ARN of the SQS queue"
  value       = aws_sqs_queue.events.arn
}

output "sqs_dlq_url" {
  description = "URL of the SQS dead letter queue"
  value       = aws_sqs_queue.events_dlq.url
}

output "sqs_dlq_arn" {
  description = "ARN of the SQS dead letter queue"
  value       = aws_sqs_queue.events_dlq.arn
}

# CloudWatch Outputs
output "ingest_log_group_name" {
  description = "Name of the ingest Lambda CloudWatch log group"
  value       = aws_cloudwatch_log_group.ingest_lambda.name
}

output "query_log_group_name" {
  description = "Name of the query Lambda CloudWatch log group"
  value       = aws_cloudwatch_log_group.query_lambda.name
}

output "processor_log_group_name" {
  description = "Name of the processor Lambda CloudWatch log group"
  value       = aws_cloudwatch_log_group.processor_lambda.name
}

# Environment Information
output "environment" {
  description = "Environment name"
  value       = var.environment
}

output "aws_region" {
  description = "AWS region"
  value       = var.aws_region
}

# Summary Output for CI/CD
output "deployment_summary" {
  description = "Summary of deployed resources for CI/CD"
  value = {
    api_url                 = aws_apigatewayv2_stage.main.invoke_url
    ingest_function         = aws_lambda_function.ingest.function_name
    query_function          = aws_lambda_function.query.function_name
    processor_function      = aws_lambda_function.processor.function_name
    live_alias              = "live"
    dynamodb_table          = aws_dynamodb_table.events.name
    s3_bucket               = aws_s3_bucket.raw_events.id
    sqs_queue               = aws_sqs_queue.events.url
    environment             = var.environment
    region                  = var.aws_region
  }
}
