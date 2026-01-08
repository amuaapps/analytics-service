# AWS Infrastructure (Terraform)

This directory contains Terraform configuration for deploying the Analytics Service to AWS.

## Architecture

- **API Gateway**: HTTP API routing to Lambda functions
- **Lambda Functions**: 
  - `ingest`: Accepts event batches and enqueues them
  - `query`: Queries events from DynamoDB
  - `processor`: Processes events from SQS queue
- **DynamoDB**: Operational event storage with TTL
- **S3**: Raw event storage with encryption and lifecycle policies
- **SQS**: Event processing queue with dead-letter queue
- **CloudWatch**: Logs and monitoring

## Blue/Green Deployment

The infrastructure supports blue/green deployments:
- Lambda functions use **aliases** (`live`, `blue`, `green`)
- API Gateway routes to the `live` alias
- New versions are deployed to `green` without affecting production
- After validation, traffic is switched from `blue` to `green` by updating the `live` alias
- Rollback is instant by reverting the alias

## Prerequisites

- Terraform >= 1.5.0
- AWS CLI configured with appropriate credentials
- S3 bucket for Terraform state (created separately)
- DynamoDB table for state locking (optional but recommended)

## Backend Configuration

Terraform state is stored remotely in S3. You must configure the backend before running Terraform.

### 1. Create State Backend Resources

```bash
# Create S3 bucket for state
aws s3api create-bucket \
  --bucket your-terraform-state-bucket \
  --region us-east-1

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket your-terraform-state-bucket \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket your-terraform-state-bucket \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for state locking (optional)
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region us-east-1
```

### 2. Configure Backend

Create `backend.tf` (not checked into git):

```hcl
terraform {
  backend "s3" {
    bucket         = "your-terraform-state-bucket"
    key            = "analytics-service/terraform.tfstate"
    region         = "us-east-1"
    encrypt        = true
    dynamodb_table = "terraform-state-lock"  # Optional
  }
}
```

Or use backend configuration file `backend.hcl`:

```hcl
bucket         = "your-terraform-state-bucket"
key            = "analytics-service/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "terraform-state-lock"
```

Then initialize with:
```bash
terraform init -backend-config=backend.hcl
```

## Deployment

### 1. Initialize Terraform

```bash
terraform init -backend-config=backend.hcl
```

### 2. Create Variables File

Create `terraform.tfvars`:

```hcl
environment         = "dev"
aws_region         = "us-east-1"
project_name       = "analytics-service"
analytics_write_key = "your-secret-write-key"

# Optional: Override defaults
# dynamodb_read_capacity  = 5
# dynamodb_write_capacity = 5
# lambda_memory_size      = 512
```

### 3. Plan

```bash
terraform plan
```

### 4. Apply

```bash
terraform apply
```

### 5. Get Outputs

```bash
terraform output
```

## Variables

| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `environment` | Environment name (dev, staging, prod) | Yes | - |
| `aws_region` | AWS region | Yes | - |
| `project_name` | Project name for resource naming | Yes | - |
| `analytics_write_key` | Secret write key for API authentication | Yes | - |
| `dynamodb_read_capacity` | DynamoDB read capacity units | No | 5 |
| `dynamodb_write_capacity` | DynamoDB write capacity units | No | 5 |
| `lambda_memory_size` | Lambda memory size in MB | No | 512 |
| `lambda_timeout` | Lambda timeout in seconds | No | 30 |
| `event_retention_days` | DynamoDB TTL retention in days | No | 90 |
| `raw_event_retention_days` | S3 lifecycle retention in days | No | 365 |

## Outputs

| Output | Description |
|--------|-------------|
| `api_gateway_url` | Base URL for the API Gateway |
| `ingest_lambda_arn` | ARN of the ingest Lambda function |
| `query_lambda_arn` | ARN of the query Lambda function |
| `processor_lambda_arn` | ARN of the processor Lambda function |
| `dynamodb_table_name` | Name of the DynamoDB table |
| `s3_bucket_name` | Name of the S3 bucket for raw events |
| `sqs_queue_url` | URL of the SQS queue |
| `live_alias_name` | Name of the live Lambda alias |

## Blue/Green Deployment Process

### Deploy New Version (GREEN)

```bash
# 1. Deploy infrastructure with new Lambda code
terraform apply

# 2. The new version is deployed but not live yet
# API Gateway still points to the previous version via the 'live' alias
```

### Switch to GREEN (Stage 4 of CI/CD)

```bash
# Update the 'live' alias to point to the new version
aws lambda update-alias \
  --function-name analytics-ingest-${environment} \
  --name live \
  --function-version $NEW_VERSION

aws lambda update-alias \
  --function-name analytics-query-${environment} \
  --name live \
  --function-version $NEW_VERSION

aws lambda update-alias \
  --function-name analytics-processor-${environment} \
  --name live \
  --function-version $NEW_VERSION
```

### Rollback

```bash
# Revert the 'live' alias to the previous version
aws lambda update-alias \
  --function-name analytics-ingest-${environment} \
  --name live \
  --function-version $PREVIOUS_VERSION
```

## Monitoring

CloudWatch log groups are created for each Lambda function:
- `/aws/lambda/analytics-ingest-${environment}`
- `/aws/lambda/analytics-query-${environment}`
- `/aws/lambda/analytics-processor-${environment}`

## Security

- All Lambda functions run with least-privilege IAM roles
- S3 bucket has encryption enabled (AES-256)
- DynamoDB has encryption at rest enabled
- API Gateway requires authentication via write key
- No public access to S3 or DynamoDB

## Cost Optimization

- DynamoDB uses on-demand billing by default (can be changed to provisioned)
- S3 lifecycle policies move old events to cheaper storage classes
- Lambda functions use appropriate memory sizes
- CloudWatch logs have retention policies

## Cleanup

```bash
terraform destroy
```

**Warning**: This will delete all resources including data in DynamoDB and S3.

## Troubleshooting

### State Lock Error

If you get a state lock error:

```bash
# Force unlock (use with caution)
terraform force-unlock <lock-id>
```

### Permission Errors

Ensure your AWS credentials have permissions for:
- Lambda (create, update, invoke)
- API Gateway (create, update)
- DynamoDB (create, update)
- S3 (create, put, get)
- SQS (create, send, receive)
- IAM (create roles, policies)
- CloudWatch (create log groups)

### Backend Configuration

If backend initialization fails, verify:
- S3 bucket exists and is accessible
- DynamoDB table exists (if using locking)
- AWS credentials are configured
- Region is correct

## CI/CD Integration

The outputs from this Terraform configuration are used by GitHub Actions:
- `api_gateway_url`: For integration tests
- Lambda ARNs: For deployment and alias updates
- `live_alias_name`: For traffic switching

See `.github/workflows/` for CI/CD pipeline configuration.
