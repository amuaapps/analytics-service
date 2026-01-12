# AWS Infrastructure Documentation Drift - Resolved

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Update AWS infrastructure documentation to match actual Terraform configuration and CI/CD flow

---

## Summary

Successfully resolved documentation drift in AWS infrastructure:
- ✅ **Removed obsolete variables** - `analytics_write_key` and `event_retention_days`
- ✅ **Documented Secrets Manager flow** - How write key is managed via GitHub Actions
- ✅ **Updated README.md** - Comprehensive secrets management section
- ✅ **Updated terraform.tfvars.example** - Removed obsolete variables with explanatory notes
- ✅ **Accurate documentation** - Docs now match real Terraform + CI secret flow

---

## Acceptance Criteria

- [x] **Remove references to analytics_write_key variable**
  - ✅ Removed from README.md variables table
  - ✅ Removed from terraform.tfvars.example
  - ✅ Added notes explaining Secrets Manager management

- [x] **Remove references to event_retention_days variable**
  - ✅ Removed from README.md variables table
  - ✅ Removed from terraform.tfvars.example
  - ✅ Added notes explaining per-event TTL in application code

- [x] **Document Secrets Manager flow**
  - ✅ Added comprehensive "Secrets Management" section to README.md
  - ✅ Documented GitHub Actions integration
  - ✅ Documented key rotation process

---

## Problem Analysis

### Issue: Documentation Drift

**Actual Terraform configuration:**
- `analytics_write_key` variable removed (see `variables.tf`)
- Secret created in Secrets Manager without value
- GitHub Actions populates secret value via AWS CLI
- `event_retention_days` variable removed (TTL is per-event in code)

**Documentation (before fix):**
- ❌ README.md showed `analytics_write_key` as required variable
- ❌ terraform.tfvars.example included `analytics_write_key`
- ❌ README.md showed `event_retention_days` variable
- ❌ terraform.tfvars.example included `event_retention_days = 90`
- ❌ No documentation of Secrets Manager flow

**Result:** Developers would be confused trying to set variables that don't exist

---

## Changes Made

### 1. README.md - Removed Obsolete Variables

**File:** `infra/aws/README.md`

**Variables table - Before:**
```markdown
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| `analytics_write_key` | Secret write key for API authentication | Yes | - |
| `event_retention_days` | DynamoDB TTL retention in days | No | 90 |
```

**Variables table - After:**
```markdown
| Variable | Description | Required | Default |
|----------|-------------|----------|---------|
| (removed) | | | |

**Removed Variables:**
- `analytics_write_key` - Now managed via AWS Secrets Manager (see Secrets Management section)
- `event_retention_days` - DynamoDB TTL is calculated per-event in application code (365 days from event occurrence)
```

---

### 2. README.md - Updated Deployment Example

**Before:**
```hcl
environment         = "dev"
aws_region         = "us-east-1"
project_name       = "analytics-service"
analytics_write_key = "your-secret-write-key"  # ❌ Doesn't exist
```

**After:**
```hcl
environment  = "dev"
aws_region   = "us-east-1"
project_name = "analytics-service"

# Note: analytics_write_key is NOT configured via Terraform variables.
# It is managed through AWS Secrets Manager and populated by GitHub Actions.
```

---

### 3. README.md - Added Secrets Management Section

**New comprehensive section:**

```markdown
## Secrets Management

### Analytics Write Key

The analytics write key is **not** stored in Terraform state or variables. Instead, it is managed through AWS Secrets Manager:

1. **Terraform creates the secret** (without a value):
   ```hcl
   resource "aws_secretsmanager_secret" "analytics_write_key" {
     name_prefix = "${var.environment}-analytics-write-key-"
     description = "Analytics service write key for ${var.environment} environment"
   }
   ```

2. **GitHub Actions populates the secret value**:
   - The CI/CD pipeline (`.github/workflows/deploy.yml`) sets the actual secret value
   - Step: "Update Analytics Write Key Secret"
   - Uses AWS CLI: `aws secretsmanager put-secret-value`
   - Secret value comes from GitHub repository secret: `ANALYTICS_WRITE_KEY`

3. **Lambda functions read from Secrets Manager**:
   - Environment variable: `ANALYTICS_WRITE_KEY_SECRET_ARN`
   - Functions have IAM permissions to read the secret
   - Secret is cached in application code for performance

### Key Rotation

To rotate the write key:

1. Update the GitHub repository secret `ANALYTICS_WRITE_KEY` with a new value (comma-separated for gradual rotation)
2. Re-run the deployment workflow
3. The new value is automatically pushed to Secrets Manager
4. Lambda functions pick up the new value on next invocation (or restart)

**Example rotation:**
```bash
# Step 1: Add new key alongside old key
ANALYTICS_WRITE_KEY="old-key,new-key"

# Step 2: After clients migrate, remove old key
ANALYTICS_WRITE_KEY="new-key"
```
```

**Benefits:**
- ✅ Clear explanation of secret management flow
- ✅ Documents GitHub Actions integration
- ✅ Explains key rotation process
- ✅ Shows example of gradual rotation

---

### 4. README.md - Updated Outputs Table

**Added Secrets Manager outputs:**
```markdown
| Output | Description |
|--------|-------------|
| `analytics_write_key_secret_arn` | ARN of the Secrets Manager secret for write key |
| `analytics_write_key_secret_name` | Name of the Secrets Manager secret for write key |
```

---

### 5. terraform.tfvars.example - Removed Obsolete Variables

**File:** `infra/aws/terraform.tfvars.example`

**Before:**
```hcl
# Required Variables
environment         = "dev"
aws_region         = "us-east-1"
project_name       = "analytics-service"
analytics_write_key = "your-secret-write-key-here"  # ❌ Doesn't exist

# Optional: DynamoDB Configuration
event_retention_days = 90  # ❌ Doesn't exist
```

**After:**
```hcl
# Required Variables
environment  = "dev"
aws_region   = "us-east-1"
project_name = "analytics-service"

# NOTE: analytics_write_key is NOT configured here.
# It is managed via AWS Secrets Manager and populated by GitHub Actions.
# See README.md "Secrets Management" section for details.

# Optional: DynamoDB Configuration
dynamodb_billing_mode = "PAY_PER_REQUEST"

# NOTE: event_retention_days variable removed.
# DynamoDB TTL is calculated per-event in application code (src/config/retention.ts)
# using the event's occurredAt timestamp + 365 days (12 months).
# See TTL_RETENTION_COMPLETE.md for implementation details.
```

**Benefits:**
- ✅ Removed non-existent variables
- ✅ Added clear notes explaining where to find information
- ✅ References related documentation

---

## Secrets Management Flow

### Architecture

```
┌─────────────────┐
│ GitHub Actions  │
│   Workflow      │
└────────┬────────┘
         │
         │ 1. Deploy Terraform
         │    (creates secret without value)
         ↓
┌─────────────────┐
│   Terraform     │
│                 │
│ Creates:        │
│ - Secret (empty)│
│ - IAM policies  │
└────────┬────────┘
         │
         │ 2. Populate secret value
         │    (aws secretsmanager put-secret-value)
         ↓
┌─────────────────┐
│ AWS Secrets     │
│   Manager       │
│                 │
│ Secret:         │
│ - ARN           │
│ - Value (set)   │
└────────┬────────┘
         │
         │ 3. Read at runtime
         │    (secretsmanager:GetSecretValue)
         ↓
┌─────────────────┐
│ Lambda Function │
│                 │
│ - Reads ARN     │
│ - Caches value  │
│ - Validates     │
└─────────────────┘
```

---

### Why Not Use Terraform Variables?

**Security reasons:**

1. **Terraform state contains variable values**
   - State file would contain the secret
   - State stored in S3 (even encrypted, it's a risk)
   - Anyone with state access sees the secret

2. **Rotation is easier with Secrets Manager**
   - Update GitHub secret
   - Re-run workflow
   - No Terraform apply needed

3. **Separation of concerns**
   - Infrastructure (Terraform) creates resources
   - CI/CD (GitHub Actions) manages secrets
   - Application (Lambda) consumes secrets

---

## Actual Terraform Configuration

### variables.tf

```hcl
# NOTE: analytics_write_key variable removed.
# The secret value is no longer passed through Terraform to avoid storing it in state.
# The GitHub Actions workflow sets the secret value directly via AWS CLI.
# See .github/workflows/deploy.yml step "Update Analytics Write Key Secret"
```

### secrets.tf

```hcl
resource "aws_secretsmanager_secret" "analytics_write_key" {
  name_prefix = "${var.environment}-analytics-write-key-"
  description = "Analytics service write key for ${var.environment} environment"
  
  # No value set here - populated by GitHub Actions
}

output "analytics_write_key_secret_arn" {
  description = "ARN of the Secrets Manager secret containing the analytics write key"
  value       = aws_secretsmanager_secret.analytics_write_key.arn
}

output "analytics_write_key_secret_name" {
  description = "Name of the Secrets Manager secret containing the analytics write key"
  value       = aws_secretsmanager_secret.analytics_write_key.name
}
```

### lambda.tf

```hcl
environment = {
  ANALYTICS_WRITE_KEY_SECRET_ARN = aws_secretsmanager_secret.analytics_write_key.arn
  # Lambda reads secret at runtime
}
```

### iam.tf

```hcl
# Lambda has permission to read the secret
{
  Sid    = "AllowSecretsManagerRead"
  Effect = "Allow"
  Action = [
    "secretsmanager:GetSecretValue",
    "secretsmanager:DescribeSecret"
  ]
  Resource = aws_secretsmanager_secret.analytics_write_key.arn
}
```

---

## GitHub Actions Integration

### Workflow Step

```yaml
- name: Update Analytics Write Key Secret
  run: |
    aws secretsmanager put-secret-value \
      --secret-id ${{ steps.tf_output.outputs.analytics_write_key_secret_name }} \
      --secret-string "${{ secrets.ANALYTICS_WRITE_KEY }}" \
      --region ${{ env.AWS_REGION }}
```

**Flow:**
1. Terraform outputs secret name
2. GitHub Actions reads `ANALYTICS_WRITE_KEY` from repository secrets
3. AWS CLI updates Secrets Manager with the value
4. Lambda functions read the value at runtime

---

## Key Rotation Process

### Step 1: Add New Key (Gradual Rotation)

**Update GitHub repository secret:**
```
ANALYTICS_WRITE_KEY="old-key-abc123,new-key-xyz789"
```

**Re-run deployment:**
- GitHub Actions updates Secrets Manager
- Lambda functions accept both keys
- Clients can use either key

### Step 2: Monitor Usage

**Check which key is being used:**
- Monitor API logs
- Identify clients still using old key
- Notify clients to migrate

### Step 3: Remove Old Key

**Update GitHub repository secret:**
```
ANALYTICS_WRITE_KEY="new-key-xyz789"
```

**Re-run deployment:**
- GitHub Actions updates Secrets Manager
- Lambda functions only accept new key
- Old key no longer valid

---

## Files Modified

1. **`infra/aws/README.md`** - Removed obsolete variables, added Secrets Management section
2. **`infra/aws/terraform.tfvars.example`** - Removed obsolete variables with explanatory notes
3. **`AWS_DOCS_DRIFT_RESOLVED.md`** - This documentation

**Not modified (already correct):**
- `infra/aws/variables.tf` - Already has note about removed variable
- `infra/aws/secrets.tf` - Already implements Secrets Manager correctly

---

## Benefits

### 1. Accurate Documentation

**Before:** Docs showed variables that don't exist  
**After:** Docs match actual Terraform configuration

### 2. Clear Secret Management

**Before:** No documentation of Secrets Manager flow  
**After:** Comprehensive section explaining the entire flow

### 3. Security Best Practices

**Before:** Docs suggested passing secrets via variables  
**After:** Docs explain why Secrets Manager is used

### 4. Developer Experience

**Before:** Developers confused by non-existent variables  
**After:** Developers understand the secret management flow

---

## Verification Commands

**Check Terraform variables:**
```bash
grep "analytics_write_key" infra/aws/variables.tf
# Should show: NOTE: analytics_write_key variable removed

grep "event_retention_days" infra/aws/variables.tf
# Should show: NOTE: DynamoDB TTL is calculated per-event
```

**Check documentation:**
```bash
grep "analytics_write_key" infra/aws/README.md
# Should show: Secrets Management section, not in variables table

grep "event_retention_days" infra/aws/README.md
# Should show: Removed Variables note
```

**Check example file:**
```bash
grep "analytics_write_key" infra/aws/terraform.tfvars.example
# Should show: NOTE comment, not actual variable

grep "event_retention_days" infra/aws/terraform.tfvars.example
# Should show: NOTE comment, not actual variable
```

---

## Migration Notes

**For existing deployments:**
- No changes needed to infrastructure
- Documentation now accurately reflects current setup
- Secret management flow unchanged

**For new deployments:**
- Follow updated README.md
- Set `ANALYTICS_WRITE_KEY` in GitHub repository secrets
- Terraform creates secret, GitHub Actions populates it

---

## Notes

- **No infrastructure changes** - Only documentation updated
- **Accurate documentation** - Matches actual Terraform configuration
- **Clear secret flow** - Developers understand GitHub Actions integration
- **Security best practices** - Secrets not in Terraform state

---

## Remaining Work

**None** - All acceptance criteria met:
- ✅ Removed references to `analytics_write_key` variable
- ✅ Removed references to `event_retention_days` variable
- ✅ Documented Secrets Manager flow
- ✅ Documented GitHub Actions integration
- ✅ Docs match real Terraform + CI secret flow
