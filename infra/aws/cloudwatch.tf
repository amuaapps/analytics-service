# CloudWatch Log Groups
resource "aws_cloudwatch_log_group" "ingest_lambda" {
  name              = "/aws/lambda/${var.project_name}-ingest-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-ingest-logs-${var.environment}"
  }
}

resource "aws_cloudwatch_log_group" "query_lambda" {
  name              = "/aws/lambda/${var.project_name}-query-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-query-logs-${var.environment}"
  }
}

resource "aws_cloudwatch_log_group" "processor_lambda" {
  name              = "/aws/lambda/${var.project_name}-processor-${var.environment}"
  retention_in_days = var.log_retention_days

  tags = {
    Name = "${var.project_name}-processor-logs-${var.environment}"
  }
}

# CloudWatch Alarms for Lambda Functions
resource "aws_cloudwatch_metric_alarm" "ingest_lambda_errors" {
  alarm_name          = "${var.project_name}-ingest-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Ingest Lambda function errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.ingest.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "query_lambda_errors" {
  alarm_name          = "${var.project_name}-query-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Query Lambda function errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.query.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "processor_lambda_errors" {
  alarm_name          = "${var.project_name}-processor-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Errors"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "Processor Lambda function errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.processor.function_name
  }
}

resource "aws_cloudwatch_metric_alarm" "ingest_lambda_throttles" {
  alarm_name          = "${var.project_name}-ingest-throttles-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "Throttles"
  namespace           = "AWS/Lambda"
  period              = 300
  statistic           = "Sum"
  threshold           = 5
  alarm_description   = "Ingest Lambda function throttles"
  treat_missing_data  = "notBreaching"

  dimensions = {
    FunctionName = aws_lambda_function.ingest.function_name
  }
}
