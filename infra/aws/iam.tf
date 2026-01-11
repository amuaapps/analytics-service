# IAM Role for Ingest Lambda
resource "aws_iam_role" "ingest_lambda" {
  name = "${var.project_name}-ingest-lambda-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-ingest-lambda-${var.environment}"
  }
}

# IAM Policy for Ingest Lambda
resource "aws_iam_role_policy" "ingest_lambda" {
  name = "${var.project_name}-ingest-lambda-policy-${var.environment}"
  role = aws_iam_role.ingest_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSecretsManagerRead"
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.analytics_write_key.arn
      },
      {
        Sid    = "AllowS3WriteRawBatch"
        Effect = "Allow"
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "AllowSQSSendMessage"
        Effect = "Allow"
        Action = [
          "sqs:SendMessage",
          "sqs:GetQueueAttributes"
        ]
        Resource = aws_sqs_queue.events.arn
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.ingest_lambda.arn}:*"
      }
    ]
  })
}

# IAM Role for Query Lambda
resource "aws_iam_role" "query_lambda" {
  name = "${var.project_name}-query-lambda-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-query-lambda-${var.environment}"
  }
}

# IAM Policy for Query Lambda
resource "aws_iam_role_policy" "query_lambda" {
  name = "${var.project_name}-query-lambda-policy-${var.environment}"
  role = aws_iam_role.query_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowDynamoDBQuery"
        Effect = "Allow"
        Action = [
          "dynamodb:Query",
          "dynamodb:GetItem"
        ]
        Resource = [
          aws_dynamodb_table.events.arn,
          "${aws_dynamodb_table.events.arn}/index/*"
        ]
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.query_lambda.arn}:*"
      }
    ]
  })
}

# IAM Role for Processor Lambda
resource "aws_iam_role" "processor_lambda" {
  name = "${var.project_name}-processor-lambda-${var.environment}"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Action = "sts:AssumeRole"
        Effect = "Allow"
        Principal = {
          Service = "lambda.amazonaws.com"
        }
      }
    ]
  })

  tags = {
    Name = "${var.project_name}-processor-lambda-${var.environment}"
  }
}

# IAM Policy for Processor Lambda
resource "aws_iam_role_policy" "processor_lambda" {
  name = "${var.project_name}-processor-lambda-policy-${var.environment}"
  role = aws_iam_role.processor_lambda.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowSQSReceiveDelete"
        Effect = "Allow"
        Action = [
          "sqs:ReceiveMessage",
          "sqs:DeleteMessage",
          "sqs:GetQueueAttributes",
          "sqs:ChangeMessageVisibility"
        ]
        Resource = aws_sqs_queue.events.arn
      },
      {
        Sid    = "AllowS3ReadRawBatch"
        Effect = "Allow"
        Action = [
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "AllowDynamoDBWrite"
        Effect = "Allow"
        Action = [
          "dynamodb:PutItem",
          "dynamodb:BatchWriteItem",
          "dynamodb:GetItem"
        ]
        Resource = aws_dynamodb_table.events.arn
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Effect = "Allow"
        Action = [
          "logs:CreateLogStream",
          "logs:PutLogEvents"
        ]
        Resource = "${aws_cloudwatch_log_group.processor_lambda.arn}:*"
      }
    ]
  })
}
