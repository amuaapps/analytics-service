# Secrets Manager for Analytics Write Key
# Following agents.md best practice: secrets in cloud secret stores

resource "aws_secretsmanager_secret" "analytics_write_key" {
  name_prefix = "${var.environment}-analytics-write-key-"
  description = "Analytics service write key for ${var.environment} environment"

  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-analytics-write-key"
      Environment = var.environment
      ManagedBy   = "terraform"
    }
  )
}

resource "aws_secretsmanager_secret_version" "analytics_write_key" {
  secret_id     = aws_secretsmanager_secret.analytics_write_key.id
  secret_string = var.analytics_write_key
}

# IAM policy for Lambda to read the secret
data "aws_iam_policy_document" "lambda_secrets_access" {
  statement {
    sid    = "AllowGetSecretValue"
    effect = "Allow"
    actions = [
      "secretsmanager:GetSecretValue"
    ]
    resources = [
      aws_secretsmanager_secret.analytics_write_key.arn
    ]
  }
}

resource "aws_iam_policy" "lambda_secrets_access" {
  name_prefix = "${var.environment}-analytics-lambda-secrets-"
  description = "Allow Lambda functions to read analytics write key from Secrets Manager"
  policy      = data.aws_iam_policy_document.lambda_secrets_access.json

  tags = merge(
    var.tags,
    {
      Name        = "${var.environment}-analytics-lambda-secrets-policy"
      Environment = var.environment
    }
  )
}

# Attach policy to Ingest Lambda role (only Lambda that validates write key)
resource "aws_iam_role_policy_attachment" "ingest_lambda_secrets_access" {
  role       = aws_iam_role.ingest_lambda.name
  policy_arn = aws_iam_policy.lambda_secrets_access.arn
}

# Output the secret ARN for reference
output "analytics_write_key_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the analytics write key"
  value       = aws_secretsmanager_secret.analytics_write_key.arn
}

output "analytics_write_key_secret_name" {
  description = "Name of the Secrets Manager secret containing the analytics write key"
  value       = aws_secretsmanager_secret.analytics_write_key.name
}
