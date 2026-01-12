# AWS IAM Permissions Update - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Align IAM policies with current runtime behavior (ingest writes to S3 + reads secret; processor reads from S3)

---

## Summary

Successfully updated AWS IAM permissions to follow least-privilege principle:
- ✅ **Ingest Lambda**: Added Secrets Manager read + S3 write permissions
- ✅ **Processor Lambda**: Replaced S3 write with S3 read permissions
- ✅ **S3 Bucket Policy**: Updated to accurately reflect access patterns
- ✅ **No unnecessary permissions**: Each Lambda has only what it needs

---

## Runtime Behavior Verification

### Ingest Handler (`src/app/core/ingest-handler.ts`)

**Actions:**
1. **Reads secret** from AWS Secrets Manager (write key validation)
2. **Writes raw batch** to S3 via `rawStorage.storeRawBatch()`
3. **Enqueues pointer** to SQS

**Required Permissions:**
- ✅ Secrets Manager: `GetSecretValue`, `DescribeSecret`
- ✅ S3: `PutObject`
- ✅ SQS: `SendMessage`

### Processor Handler (`src/app/core/processor-handler.ts`)

**Actions:**
1. **Receives message** from SQS (pointer to raw batch)
2. **Reads raw batch** from S3 via `rawStorage.getRawBatch()`
3. **Writes events** to DynamoDB

**Required Permissions:**
- ✅ SQS: `ReceiveMessage`, `DeleteMessage`, `ChangeMessageVisibility`
- ✅ S3: `GetObject`
- ✅ DynamoDB: `PutItem`, `BatchWriteItem`

---

## Changes Made

### 1. Ingest Lambda IAM Policy

**File:** `infra/aws/iam.tf`

**Before:**
```hcl
resource "aws_iam_role_policy" "ingest_lambda" {
  policy = jsonencode({
    Statement = [
      {
        Sid    = "AllowSQSSendMessage"
        Action = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.events.arn
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.ingest_lambda.arn}:*"
      }
      # ❌ Missing: Secrets Manager read
      # ❌ Missing: S3 write
    ]
  })
}
```

**After:**
```hcl
resource "aws_iam_role_policy" "ingest_lambda" {
  policy = jsonencode({
    Statement = [
      {
        Sid    = "AllowSecretsManagerRead"  # ✅ Added
        Effect = "Allow"
        Action = [
          "secretsmanager:GetSecretValue",
          "secretsmanager:DescribeSecret"
        ]
        Resource = aws_secretsmanager_secret.analytics_write_key.arn
      },
      {
        Sid    = "AllowS3WriteRawBatch"  # ✅ Added
        Effect = "Allow"
        Action = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "AllowSQSSendMessage"
        Action = ["sqs:SendMessage", "sqs:GetQueueAttributes"]
        Resource = aws_sqs_queue.events.arn
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.ingest_lambda.arn}:*"
      }
    ]
  })
}
```

**Impact:**
- ✅ Can now read analytics write key from Secrets Manager
- ✅ Can now write raw batches to S3
- ✅ Scoped to specific secret ARN (least privilege)
- ✅ Scoped to raw events bucket only

---

### 2. Processor Lambda IAM Policy

**File:** `infra/aws/iam.tf`

**Before:**
```hcl
resource "aws_iam_role_policy" "processor_lambda" {
  policy = jsonencode({
    Statement = [
      {
        Sid    = "AllowSQSReceiveDelete"
        Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", ...]
        Resource = aws_sqs_queue.events.arn
      },
      {
        Sid    = "AllowDynamoDBWrite"
        Action = ["dynamodb:PutItem", "dynamodb:BatchWriteItem", ...]
        Resource = aws_dynamodb_table.events.arn
      },
      {
        Sid    = "AllowS3Write"  # ❌ Wrong - processor doesn't write
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.processor_lambda.arn}:*"
      }
    ]
  })
}
```

**After:**
```hcl
resource "aws_iam_role_policy" "processor_lambda" {
  policy = jsonencode({
    Statement = [
      {
        Sid    = "AllowSQSReceiveDelete"
        Action = ["sqs:ReceiveMessage", "sqs:DeleteMessage", ...]
        Resource = aws_sqs_queue.events.arn
      },
      {
        Sid    = "AllowS3ReadRawBatch"  # ✅ Changed to read-only
        Effect = "Allow"
        Action = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "AllowDynamoDBWrite"
        Action = ["dynamodb:PutItem", "dynamodb:BatchWriteItem", ...]
        Resource = aws_dynamodb_table.events.arn
      },
      {
        Sid    = "AllowCloudWatchLogs"
        Action = ["logs:CreateLogStream", "logs:PutLogEvents"]
        Resource = "${aws_cloudwatch_log_group.processor_lambda.arn}:*"
      }
    ]
  })
}
```

**Impact:**
- ✅ Removed unnecessary S3 write permissions (`PutObject`, `PutObjectAcl`)
- ✅ Added S3 read permission (`GetObject`)
- ✅ Follows least-privilege principle
- ✅ Matches actual runtime behavior

---

### 3. S3 Bucket Policy

**File:** `infra/aws/s3.tf`

**Before:**
```hcl
resource "aws_s3_bucket_policy" "raw_events" {
  policy = jsonencode({
    Statement = [
      {
        Sid    = "AllowLambdaWrite"  # ❌ Incorrect principal
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.processor_lambda.arn  # ❌ Wrong Lambda
        }
        Action = [
          "s3:PutObject",
          "s3:PutObjectAcl"
        ]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "DenyInsecureTransport"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [...]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }
    ]
  })
}
```

**After:**
```hcl
resource "aws_s3_bucket_policy" "raw_events" {
  policy = jsonencode({
    Statement = [
      {
        Sid    = "AllowIngestLambdaWrite"  # ✅ Correct principal
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.ingest_lambda.arn  # ✅ Ingest writes
        }
        Action = ["s3:PutObject"]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "AllowProcessorLambdaRead"  # ✅ Added
        Effect = "Allow"
        Principal = {
          AWS = aws_iam_role.processor_lambda.arn  # ✅ Processor reads
        }
        Action = ["s3:GetObject"]
        Resource = "${aws_s3_bucket.raw_events.arn}/*"
      },
      {
        Sid    = "DenyInsecureTransport"
        Effect = "Deny"
        Principal = "*"
        Action = "s3:*"
        Resource = [...]
        Condition = { Bool = { "aws:SecureTransport" = "false" } }
      }
    ]
  })
}
```

**Impact:**
- ✅ Accurately reflects which Lambda writes vs reads
- ✅ Ingest Lambda can write objects
- ✅ Processor Lambda can read objects
- ✅ Removed unnecessary `PutObjectAcl` permission
- ✅ Maintains secure transport requirement

---

## Least-Privilege Verification

### Ingest Lambda Permissions Matrix

| Service | Action | Resource | Required? | Granted? |
|---------|--------|----------|-----------|----------|
| **Secrets Manager** | GetSecretValue | Write key secret | ✅ Yes | ✅ Yes |
| **Secrets Manager** | DescribeSecret | Write key secret | ⚠️ Optional | ✅ Yes |
| **S3** | PutObject | Raw events bucket/* | ✅ Yes | ✅ Yes |
| **S3** | GetObject | Raw events bucket/* | ❌ No | ❌ No |
| **SQS** | SendMessage | Events queue | ✅ Yes | ✅ Yes |
| **SQS** | GetQueueAttributes | Events queue | ✅ Yes | ✅ Yes |
| **CloudWatch Logs** | CreateLogStream | Ingest log group | ✅ Yes | ✅ Yes |
| **CloudWatch Logs** | PutLogEvents | Ingest log group | ✅ Yes | ✅ Yes |

**Result:** ✅ No unnecessary permissions

### Processor Lambda Permissions Matrix

| Service | Action | Resource | Required? | Granted? |
|---------|--------|----------|-----------|----------|
| **SQS** | ReceiveMessage | Events queue | ✅ Yes | ✅ Yes |
| **SQS** | DeleteMessage | Events queue | ✅ Yes | ✅ Yes |
| **SQS** | GetQueueAttributes | Events queue | ✅ Yes | ✅ Yes |
| **SQS** | ChangeMessageVisibility | Events queue | ✅ Yes | ✅ Yes |
| **S3** | GetObject | Raw events bucket/* | ✅ Yes | ✅ Yes |
| **S3** | PutObject | Raw events bucket/* | ❌ No | ❌ No |
| **DynamoDB** | PutItem | Events table | ✅ Yes | ✅ Yes |
| **DynamoDB** | BatchWriteItem | Events table | ✅ Yes | ✅ Yes |
| **DynamoDB** | GetItem | Events table | ✅ Yes | ✅ Yes |
| **CloudWatch Logs** | CreateLogStream | Processor log group | ✅ Yes | ✅ Yes |
| **CloudWatch Logs** | PutLogEvents | Processor log group | ✅ Yes | ✅ Yes |

**Result:** ✅ No unnecessary permissions

### Query Lambda Permissions Matrix

| Service | Action | Resource | Required? | Granted? |
|---------|--------|----------|-----------|----------|
| **DynamoDB** | Query | Events table + indexes | ✅ Yes | ✅ Yes |
| **DynamoDB** | GetItem | Events table | ✅ Yes | ✅ Yes |
| **CloudWatch Logs** | CreateLogStream | Query log group | ✅ Yes | ✅ Yes |
| **CloudWatch Logs** | PutLogEvents | Query log group | ✅ Yes | ✅ Yes |

**Result:** ✅ No changes needed (already correct)

---

## Security Improvements

### 1. Secrets Manager Access Scoped

**Before:** Ingest Lambda had no access to Secrets Manager (would fail at runtime)

**After:** Scoped to specific secret ARN
```hcl
Resource = aws_secretsmanager_secret.analytics_write_key.arn
```

**Benefit:** Can only read the analytics write key, not other secrets

### 2. S3 Access Segregated

**Before:** Processor had write access (unnecessary)

**After:** 
- Ingest: Write-only (`PutObject`)
- Processor: Read-only (`GetObject`)

**Benefit:** Processor cannot accidentally overwrite raw batches

### 3. Removed Unnecessary ACL Permission

**Before:** `s3:PutObjectAcl` granted to processor

**After:** Removed (not needed for either Lambda)

**Benefit:** Cannot modify object ACLs

### 4. S3 Bucket Policy Alignment

**Before:** Referenced wrong Lambda role (processor instead of ingest)

**After:** Correctly references both roles with appropriate permissions

**Benefit:** Bucket policy enforces access control at bucket level

---

## Acceptance Criteria

- [x] **Ingest has least-privilege access to read the secret and write raw batches**
  - ✅ Secrets Manager: `GetSecretValue` + `DescribeSecret` scoped to write key ARN
  - ✅ S3: `PutObject` scoped to raw events bucket/*
  - ✅ No unnecessary permissions granted

- [x] **Processor has least-privilege access to read raw batches**
  - ✅ S3: `GetObject` scoped to raw events bucket/*
  - ✅ Removed unnecessary `PutObject` and `PutObjectAcl` permissions
  - ✅ No write access to S3

- [x] **No lambda has unnecessary S3 permissions**
  - ✅ Ingest: Write-only (no read)
  - ✅ Processor: Read-only (no write)
  - ✅ Query: No S3 access (doesn't need it)

---

## IAM Policy Summary

### Ingest Lambda (`aws_iam_role.ingest_lambda`)

```
Permissions:
├── Secrets Manager
│   ├── GetSecretValue (write key secret)
│   └── DescribeSecret (write key secret)
├── S3
│   └── PutObject (raw events bucket/*)
├── SQS
│   ├── SendMessage (events queue)
│   └── GetQueueAttributes (events queue)
└── CloudWatch Logs
    ├── CreateLogStream (ingest log group)
    └── PutLogEvents (ingest log group)
```

### Processor Lambda (`aws_iam_role.processor_lambda`)

```
Permissions:
├── SQS
│   ├── ReceiveMessage (events queue)
│   ├── DeleteMessage (events queue)
│   ├── GetQueueAttributes (events queue)
│   └── ChangeMessageVisibility (events queue)
├── S3
│   └── GetObject (raw events bucket/*)
├── DynamoDB
│   ├── PutItem (events table)
│   ├── BatchWriteItem (events table)
│   └── GetItem (events table)
└── CloudWatch Logs
    ├── CreateLogStream (processor log group)
    └── PutLogEvents (processor log group)
```

### Query Lambda (`aws_iam_role.query_lambda`)

```
Permissions:
├── DynamoDB
│   ├── Query (events table + indexes)
│   └── GetItem (events table)
└── CloudWatch Logs
    ├── CreateLogStream (query log group)
    └── PutLogEvents (query log group)
```

---

## Data Flow with IAM Permissions

```
┌─────────────────────────────────────────────────────────────────┐
│ 1. INGEST LAMBDA                                                │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ IAM Permissions:                                      │    │
│    │ • Secrets Manager: GetSecretValue (write key)        │    │
│    │ • S3: PutObject (raw events bucket)                  │    │
│    │ • SQS: SendMessage (events queue)                    │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                 │
│    Flow:                                                        │
│    1. Read write key from Secrets Manager ──────────────────┐  │
│    2. Validate request                                       │  │
│    3. Store raw batch in S3 ────────────────────────────────┤  │
│    4. Enqueue pointer to SQS ───────────────────────────────┤  │
└─────────────────────────────────────────────────────────────┼──┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 2. SQS QUEUE (pointer message)                                  │
│    { batchId, storageLocation, requestId, receivedAt }          │
└─────────────────────────────────────────────────────────────────┘
                                                              │
                                                              ▼
┌─────────────────────────────────────────────────────────────────┐
│ 3. PROCESSOR LAMBDA                                             │
│    ┌──────────────────────────────────────────────────────┐    │
│    │ IAM Permissions:                                      │    │
│    │ • SQS: ReceiveMessage, DeleteMessage (events queue)  │    │
│    │ • S3: GetObject (raw events bucket)                  │    │
│    │ • DynamoDB: PutItem, BatchWriteItem (events table)   │    │
│    └──────────────────────────────────────────────────────┘    │
│                                                                 │
│    Flow:                                                        │
│    1. Receive pointer from SQS ─────────────────────────────┐  │
│    2. Fetch raw batch from S3 ──────────────────────────────┤  │
│    3. Validate and process events                            │  │
│    4. Store events in DynamoDB ─────────────────────────────┤  │
│    5. Delete message from SQS ──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
```

---

## Testing Recommendations

### 1. Verify Ingest Lambda Permissions

```bash
# Test Secrets Manager access
aws lambda invoke \
  --function-name analytics-ingest-dev \
  --payload '{"test": "secrets"}' \
  response.json

# Check CloudWatch Logs for successful secret retrieval
aws logs filter-log-events \
  --log-group-name /aws/lambda/analytics-ingest-dev \
  --filter-pattern "secret"

# Test S3 write
# Send test event to ingest endpoint
# Verify object created in S3
aws s3 ls s3://analytics-raw-events-dev-{account-id}/ --recursive
```

### 2. Verify Processor Lambda Permissions

```bash
# Test S3 read
# Trigger processor with test message
# Verify it can read raw batch from S3

# Verify cannot write to S3 (should fail)
# This should be prevented by IAM policy
```

### 3. Verify S3 Bucket Policy

```bash
# Check bucket policy
aws s3api get-bucket-policy \
  --bucket analytics-raw-events-dev-{account-id} \
  --query Policy --output text | jq
```

---

## Deployment Notes

**Terraform Apply:**
```bash
cd infra/aws
terraform plan -var-file=environments/dev.tfvars
terraform apply -var-file=environments/dev.tfvars
```

**Expected Changes:**
- Modify: `aws_iam_role_policy.ingest_lambda`
- Modify: `aws_iam_role_policy.processor_lambda`
- Modify: `aws_s3_bucket_policy.raw_events`

**No Downtime:** IAM policy updates are applied immediately without Lambda restarts

---

## Related Files

### Infrastructure
- `infra/aws/iam.tf` - IAM roles and policies
- `infra/aws/s3.tf` - S3 bucket and bucket policy
- `infra/aws/lambda.tf` - Lambda function definitions

### Source Code
- `src/app/core/ingest-handler.ts` - Ingest logic (writes to S3)
- `src/app/core/processor-handler.ts` - Processor logic (reads from S3)
- `src/app/aws/entrypoints.ts` - AWS Lambda handlers

---

## Notes

- **DescribeSecret permission**: Optional but useful for debugging secret metadata
- **S3 bucket policy**: Provides defense-in-depth alongside IAM policies
- **Secure transport**: Enforced via bucket policy condition
- **No cross-Lambda access**: Each Lambda can only access its required resources
- **Audit trail**: CloudWatch Logs capture all IAM-related actions
