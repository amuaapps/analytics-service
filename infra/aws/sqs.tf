# Dead Letter Queue
resource "aws_sqs_queue" "events_dlq" {
  name                      = "${var.project_name}-events-dlq-${var.environment}"
  message_retention_seconds = 1209600 # 14 days
  
  tags = {
    Name        = "${var.project_name}-events-dlq-${var.environment}"
    Description = "Dead letter queue for failed event processing"
  }
}

# Main Event Processing Queue
resource "aws_sqs_queue" "events" {
  name                       = "${var.project_name}-events-${var.environment}"
  visibility_timeout_seconds = var.sqs_visibility_timeout
  message_retention_seconds  = var.sqs_message_retention
  receive_wait_time_seconds  = 20 # Enable long polling

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.events_dlq.arn
    maxReceiveCount     = var.sqs_max_receive_count
  })

  tags = {
    Name        = "${var.project_name}-events-${var.environment}"
    Description = "Queue for analytics event processing"
  }
}

# Queue Policy - Allow Lambda to send messages
resource "aws_sqs_queue_policy" "events" {
  queue_url = aws_sqs_queue.events.id

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Sid    = "AllowLambdaSend"
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ingest_lambda.arn
        }
        Action   = "sqs:SendMessage"
        Resource = aws_sqs_queue.events.arn
      }
    ]
  })
}

# CloudWatch Alarms for SQS
resource "aws_cloudwatch_metric_alarm" "sqs_age_of_oldest_message" {
  alarm_name          = "${var.project_name}-sqs-message-age-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 2
  metric_name         = "ApproximateAgeOfOldestMessage"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Maximum"
  threshold           = 600 # 10 minutes
  alarm_description   = "SQS messages are not being processed quickly enough"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.events.name
  }
}

resource "aws_cloudwatch_metric_alarm" "sqs_dlq_messages" {
  alarm_name          = "${var.project_name}-sqs-dlq-messages-${var.environment}"
  comparison_operator = "GreaterThanThreshold"
  evaluation_periods  = 1
  metric_name         = "ApproximateNumberOfMessagesVisible"
  namespace           = "AWS/SQS"
  period              = 300
  statistic           = "Sum"
  threshold           = 0
  alarm_description   = "Messages in dead letter queue"
  treat_missing_data  = "notBreaching"

  dimensions = {
    QueueName = aws_sqs_queue.events_dlq.name
  }
}
