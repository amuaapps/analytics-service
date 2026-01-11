# S3 Bucket for Raw Event Storage
resource "aws_s3_bucket" "raw_events" {
  bucket = "${var.project_name}-raw-events-${var.environment}-${data.aws_caller_identity.current.account_id}"

  tags = {
    Name        = "${var.project_name}-raw-events-${var.environment}"
    Description = "Immutable storage for raw analytics events"
  }
}

# Block all public access
resource "aws_s3_bucket_public_access_block" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  block_public_acls       = true
  block_public_policy     = true
  ignore_public_acls      = true
  restrict_public_buckets = true
}

# Enable versioning
resource "aws_s3_bucket_versioning" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  versioning_configuration {
    status = "Enabled"
  }
}

# Enable encryption
resource "aws_s3_bucket_server_side_encryption_configuration" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  rule {
    apply_server_side_encryption_by_default {
      sse_algorithm = "AES256"
    }
    bucket_key_enabled = true
  }
}

# Lifecycle policy
resource "aws_s3_bucket_lifecycle_configuration" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  rule {
    id     = "transition-to-ia"
    status = "Enabled"

    transition {
      days          = var.raw_event_transition_days
      storage_class = "STANDARD_IA"
    }

    transition {
      days          = var.raw_event_transition_days * 2
      storage_class = "GLACIER_IR"
    }

    expiration {
      days = var.raw_event_retention_days
    }

    noncurrent_version_expiration {
      noncurrent_days = 90
    }
  }
}

# Bucket policy - allow access from Lambda execution roles
resource "aws_s3_bucket_policy" "raw_events" {
  bucket = aws_s3_bucket.raw_events.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowIngestLambdaWrite"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ingest_lambda.arn
        }
        Action = [
          "s3:PutObject"
        ]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "AllowProcessorLambdaRead"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.processor_lambda.arn
        }
        Action = [
          "s3:GetObject"
        ]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "DenyInsecureTransport"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [
          aws_s3_bucket.raw_events.arn,
          "${aws_s3_bucket.raw_events.arn}/*"
        ]
        Condition = {
          Bool = {
            "aws:SecureTransport" = "false"
          }
        }
      }
    ]
  })
}

# CloudWatch Alarms for S3
resource "aws_cloudwatch_metric_alarm" "s3_4xx_errors" {
  alarm_name          = "${var.project_name}-s3-4xx-errors-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "4xxErrors"
  namespace           = "AWS/S3"
  period              = 300
  statistic           = "Sum"
  threshold           = 10
  alarm_description   = "S3 4xx errors"
  treat_missing_data  = "notBreaching"

  dimensions = {
    BucketName = aws_s3_bucket.raw_events.id
  }
}

# Data source for current AWS account
data "aws_caller_identity" "current" {}
