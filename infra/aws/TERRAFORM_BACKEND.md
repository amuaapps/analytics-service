# Terraform Backend Configuration

This document explains how Terraform state is managed for the Analytics Service AWS infrastructure.

## Overview

Terraform state is stored remotely in AWS S3 with DynamoDB for state locking. This ensures:
- Team collaboration (shared state)
- State locking (prevents concurrent modifications)
- State versioning (rollback capability)
- Encryption at rest

## Backend Configuration Strategy

### CI/CD (GitHub Actions)

The backend configuration is **generated at runtime** from GitHub Secrets/Variables. This approach:
- ✅ Avoids checking in sensitive backend config
- ✅ Allows different backends per environment
- ✅ Supports multiple AWS accounts
- ✅ No manual file management

**GitHub Actions generates `backend-generated.hcl`:**
```hcl
bucket         = "${{ secrets.TF_STATE_BUCKET }}"
key            = "analytics-service/${{ environment }}/terraform.tfstate"
region         = "${{ vars.AWS_REGION }}"
encrypt        = true
dynamodb_table = "${{ secrets.TF_STATE_LOCK_TABLE }}"
```

### Local Development

For local development, create a `backend.hcl` file (gitignored):

```bash
# Copy the example
cp backend.hcl.example backend.hcl

# Edit with your values
vi backend.hcl
```

**Example `backend.hcl`:**
```hcl
bucket         = "my-terraform-state-bucket"
key            = "analytics-service/dev/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "terraform-state-lock"
```

Then run:
```bash
terraform init -backend-config=backend.hcl
```

## Required GitHub Secrets/Variables

### Secrets (Repository Settings → Secrets)

| Name | Description | Example |
|------|-------------|---------|
| `TF_STATE_BUCKET` | S3 bucket for Terraform state | `analytics-terraform-state` |
| `TF_STATE_LOCK_TABLE` | DynamoDB table for state locking | `terraform-state-lock` |

### Variables (Repository Settings → Variables)

| Name | Description | Default |
|------|-------------|---------|
| `AWS_REGION` | AWS region | `us-east-1` |

**Note:** If secrets are not set, defaults are used (see workflow file).

## Setting Up Backend Resources

### One-Time Setup (Per AWS Account)

```bash
# Set variables
BUCKET_NAME="analytics-terraform-state"
REGION="us-east-1"
TABLE_NAME="terraform-state-lock"

# 1. Create S3 bucket
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $REGION

# 2. Enable versioning
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

# 3. Enable encryption
aws s3api put-bucket-encryption \
  --bucket $BUCKET_NAME \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      },
      "BucketKeyEnabled": true
    }]
  }'

# 4. Block public access
aws s3api put-public-access-block \
  --bucket $BUCKET_NAME \
  --public-access-block-configuration \
    "BlockPublicAcls=true,IgnorePublicAcls=true,BlockPublicPolicy=true,RestrictPublicBuckets=true"

# 5. Create DynamoDB table for locking
aws dynamodb create-table \
  --table-name $TABLE_NAME \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION

# 6. Add GitHub Secrets
echo "Add these to GitHub Secrets:"
echo "TF_STATE_BUCKET=$BUCKET_NAME"
echo "TF_STATE_LOCK_TABLE=$TABLE_NAME"
```

### Verify Setup

```bash
# Check bucket exists
aws s3 ls s3://$BUCKET_NAME

# Check DynamoDB table
aws dynamodb describe-table --table-name $TABLE_NAME
```

## State File Organization

State files are organized by environment:

```
s3://analytics-terraform-state/
├── analytics-service/
│   ├── dev/
│   │   └── terraform.tfstate
│   ├── staging/
│   │   └── terraform.tfstate
│   └── prod/
│       └── terraform.tfstate
```

This allows:
- Independent state per environment
- Easy environment isolation
- Parallel deployments to different environments

## How It Works in CI/CD

### Step 1: Configure Backend (GitHub Actions)
```yaml
- name: Configure Terraform Backend
  run: |
    cat > backend-generated.hcl <<EOF
    bucket         = "${{ secrets.TF_STATE_BUCKET }}"
    key            = "analytics-service/${{ environment }}/terraform.tfstate"
    region         = "${{ vars.AWS_REGION }}"
    encrypt        = true
    dynamodb_table = "${{ secrets.TF_STATE_LOCK_TABLE }}"
    EOF
```

### Step 2: Initialize Terraform
```yaml
- name: Terraform Init
  run: terraform init -backend-config=backend-generated.hcl
```

### Step 3: Plan and Apply
```yaml
- name: Terraform Plan
  run: terraform plan -out=tfplan

- name: Terraform Apply
  run: terraform apply -auto-approve tfplan
```

## State Locking

DynamoDB provides state locking to prevent concurrent modifications:

**Lock Behavior:**
- Lock acquired before `terraform plan` or `terraform apply`
- Lock released after operation completes
- If lock exists, Terraform waits or fails (configurable)

**Lock Table Schema:**
```
LockID (String, Hash Key): <bucket>/<key>-md5
Info (String): JSON with lock metadata
```

**Example Lock:**
```json
{
  "ID": "abc123",
  "Operation": "OperationTypeApply",
  "Info": "",
  "Who": "github-actions@runner-123",
  "Version": "1.5.0",
  "Created": "2026-01-08T12:00:00Z",
  "Path": "analytics-service/dev/terraform.tfstate"
}
```

## Troubleshooting

### Error: "Failed to get existing workspaces"

**Cause:** Backend not configured or bucket doesn't exist

**Solution:**
```bash
# Verify bucket exists
aws s3 ls s3://your-bucket-name

# If not, create it (see setup above)
```

### Error: "Error acquiring the state lock"

**Cause:** Another Terraform operation is in progress or stale lock

**Solution:**
```bash
# Check for active locks
aws dynamodb scan --table-name terraform-state-lock

# If stale, force unlock (use with caution)
terraform force-unlock <lock-id>
```

### Error: "Backend configuration changed"

**Cause:** Backend config differs from initialized state

**Solution:**
```bash
# Reconfigure backend
terraform init -reconfigure -backend-config=backend.hcl
```

### Error: "Access Denied" on S3 bucket

**Cause:** Insufficient IAM permissions

**Solution:**
Ensure your IAM user/role has these permissions:
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "s3:ListBucket",
        "s3:GetObject",
        "s3:PutObject",
        "s3:DeleteObject"
      ],
      "Resource": [
        "arn:aws:s3:::your-bucket-name",
        "arn:aws:s3:::your-bucket-name/*"
      ]
    },
    {
      "Effect": "Allow",
      "Action": [
        "dynamodb:PutItem",
        "dynamodb:GetItem",
        "dynamodb:DeleteItem"
      ],
      "Resource": "arn:aws:dynamodb:*:*:table/terraform-state-lock"
    }
  ]
}
```

## Best Practices

### 1. Separate Backends Per Environment
- Use different state files for dev/staging/prod
- Prevents accidental cross-environment changes
- Allows parallel deployments

### 2. Enable State Versioning
- S3 versioning enabled by default
- Allows rollback to previous state
- Protects against accidental deletions

### 3. Encrypt State Files
- State contains sensitive data (secrets, IPs, etc.)
- Always use encryption at rest (AES256 or KMS)
- Use HTTPS for state access

### 4. Use State Locking
- Prevents concurrent modifications
- Avoids state corruption
- Required for team collaboration

### 5. Regular State Backups
- S3 versioning provides automatic backups
- Consider cross-region replication for DR
- Test state restore procedures

### 6. Least Privilege Access
- Limit who can access state bucket
- Use IAM roles, not long-lived credentials
- Audit state access with CloudTrail

## Migration from Local State

If you have existing local state:

```bash
# 1. Create backend resources (see setup above)

# 2. Add backend configuration to versions.tf
# (already done in this repo)

# 3. Initialize with migration
terraform init -backend-config=backend.hcl

# Terraform will ask: "Do you want to copy existing state?"
# Answer: yes

# 4. Verify state was migrated
aws s3 ls s3://your-bucket/analytics-service/dev/

# 5. Remove local state file
rm terraform.tfstate terraform.tfstate.backup
```

## References

- [Terraform S3 Backend](https://www.terraform.io/language/settings/backends/s3)
- [Terraform State Locking](https://www.terraform.io/language/state/locking)
- [AWS S3 Best Practices](https://docs.aws.amazon.com/AmazonS3/latest/userguide/security-best-practices.html)
