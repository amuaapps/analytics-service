# Secret Management Implementation

## Overview

Following `agents.md` best practice section 8.4, the analytics write key has been moved from plaintext environment variables to cloud-native secret stores:

- **AWS:** Secrets Manager
- **Azure:** Key Vault with managed identity access

**IMPORTANT:** As of 2026-01-09, AWS secret management has been refactored to follow best practices:
- ✅ Terraform creates the secret resource structure
- ✅ GitHub Actions workflow sets the secret value via AWS CLI
- ✅ Secret value is **NOT** stored in Terraform state
- ✅ Secret value is **NOT** passed through Terraform plan output

## Architecture

### AWS Lambda

**Infrastructure (Terraform):**
1. Creates Secrets Manager secret resource per environment (structure only)
2. Grants Lambda execution role `secretsmanager:GetSecretValue` permission (least privilege)
3. Passes secret ARN (not value) as environment variable
4. **Does NOT manage secret value** (handled by workflow)

**Deployment (GitHub Actions):**
1. Terraform creates/updates secret resource structure
2. Workflow step "Update Analytics Write Key Secret" sets the actual value via AWS CLI
3. Secret value comes from GitHub Secrets, never touches Terraform state

**Runtime:**
1. Lambda reads `ANALYTICS_WRITE_KEY_SECRET_ARN` from env
2. Fetches secret value from Secrets Manager on first request
3. Caches secret for Lambda instance lifetime
4. Lazy-loads AWS SDK to avoid cold start penalty

### Azure Functions

**Infrastructure (Bicep):**
1. Stores write key in Key Vault secret
2. Uses Key Vault reference syntax in Function App settings
3. Grants Function App managed identity access to Key Vault

**Runtime:**
1. Azure Functions runtime automatically resolves Key Vault reference
2. `ANALYTICS_WRITE_KEY` env var contains actual secret value (not reference)
3. No additional code needed - handled by Azure platform

## Implementation Details

### Files Created/Modified

**Infrastructure:**
- `infra/aws/secrets.tf` - NEW: Secrets Manager resources and IAM policies
- `infra/aws/lambda.tf` - MODIFIED: Replace plaintext with secret ARN
- `infra/azure/modules/keyvault.bicep` - MODIFIED: Add write key secret
- `infra/azure/modules/functionapp.bicep` - MODIFIED: Use Key Vault reference

**Application Code:**
- `src/config/secrets.ts` - NEW: Secret fetching logic
- `src/config/config.ts` - MODIFIED: Async config loading with secret fetch

### Environment Variables

**AWS Lambda (Before):**
```
ANALYTICS_WRITE_KEY=plaintext-secret-here  ❌ Insecure
```

**AWS Lambda (After):**
```
ANALYTICS_WRITE_KEY_SECRET_ARN=arn:aws:secretsmanager:us-east-1:123456789012:secret:prod-analytics-write-key-abc123  ✅ Secure
```

**Azure Functions (Before):**
```
ANALYTICS_WRITE_KEY=plaintext-secret-here  ❌ Insecure
```

**Azure Functions (After):**
```
ANALYTICS_WRITE_KEY=@Microsoft.KeyVault(SecretUri=https://kv-name.vault.azure.net/secrets/analytics-write-key/version)  ✅ Secure
```

## Security Benefits

### ✅ Secrets Not in IaC State

**Before (Legacy):**
```terraform
# terraform.tfstate contained plaintext secret
resource "aws_secretsmanager_secret_version" "analytics_write_key" {
  secret_id     = aws_secretsmanager_secret.analytics_write_key.id
  secret_string = var.analytics_write_key  # ❌ Secret in state!
}
```

**After (Current):**
```terraform
# terraform.tfstate only contains resource metadata
resource "aws_secretsmanager_secret" "analytics_write_key" {
  name_prefix = "${var.environment}-analytics-write-key-"
  description = "Analytics service write key"
  # No secret_version resource - value managed by workflow
}

# Workflow sets value via AWS CLI (not in Terraform)
```

**Result:**
- ✅ Secret value never touches Terraform state
- ✅ Secret value never appears in Terraform plan output
- ✅ Secret value never logged in CI (AWS CLI auto-masks)
- ✅ Terraform only manages resource structure, not sensitive data

### ✅ Least Privilege IAM

Lambda execution role can ONLY:
- `secretsmanager:GetSecretValue` on specific secret ARN
- Cannot list, create, update, or delete secrets
- Cannot access other secrets

### ✅ Audit Trail

All secret access is logged:
- **AWS:** CloudTrail logs `GetSecretValue` API calls
- **Azure:** Key Vault diagnostic logs track access

### ✅ Secret Rotation

Secrets can be rotated without code changes:
- Update secret value in Secrets Manager/Key Vault
- Lambda instances pick up new value on next cold start
- Azure Functions runtime automatically refreshes

## Deployment

### AWS

**Method 1: Via GitHub Actions (Recommended)**

The workflow automatically handles secret management:

```yaml
# .github/workflows/deploy.yml

- name: Terraform Apply
  run: terraform apply -auto-approve tfplan
  env:
    TF_VAR_environment: ${{ needs.setup.outputs.environment }}
    TF_VAR_aws_region: ${{ vars.AWS_REGION }}
    TF_VAR_project_name: analytics-service
    # NOTE: TF_VAR_analytics_write_key is NOT passed here

- name: Update Analytics Write Key Secret
  env:
    ANALYTICS_WRITE_KEY: ${{ secrets.ANALYTICS_WRITE_KEY }}
  run: |
    SECRET_NAME=$(terraform output -raw analytics_write_key_secret_name)
    aws secretsmanager put-secret-value \
      --secret-id "$SECRET_NAME" \
      --secret-string "$ANALYTICS_WRITE_KEY"
```

**Method 2: Manual Deployment**

```bash
cd infra/aws

# Deploy infrastructure (no secret value needed)
terraform apply

# Get the secret name from Terraform output
SECRET_NAME=$(terraform output -raw analytics_write_key_secret_name)

# Set the secret value via AWS CLI
aws secretsmanager put-secret-value \
  --secret-id "$SECRET_NAME" \
  --secret-string "your-secret-key"

# Secret is now in Secrets Manager, NOT in Terraform state
```

### Azure

```bash
cd infra/azure

# Deploy with secret parameter
az deployment group create \
  --resource-group rg-analytics-prod \
  --template-file main.bicep \
  --parameters analyticsWriteKey="your-secret-key"

# Secret is now in Key Vault, Function App uses reference
```

### CI/CD Updates

**GitHub Actions (AWS) - Current Implementation:**
```yaml
# Step 1: Terraform creates secret resource (no value)
- name: Terraform Apply
  working-directory: infra/aws
  run: terraform apply -auto-approve tfplan
  env:
    TF_VAR_environment: ${{ needs.setup.outputs.environment }}
    TF_VAR_aws_region: ${{ vars.AWS_REGION }}
    TF_VAR_project_name: analytics-service
    # NOTE: No TF_VAR_analytics_write_key here!

# Step 2: Workflow sets secret value via AWS CLI
- name: Update Analytics Write Key Secret
  env:
    AWS_REGION: ${{ vars.AWS_REGION || 'us-east-1' }}
    ANALYTICS_WRITE_KEY: ${{ secrets.ANALYTICS_WRITE_KEY }}
  run: |
    cd infra/aws
    SECRET_NAME=$(terraform output -raw analytics_write_key_secret_name)
    cd ../..
    
    aws secretsmanager put-secret-value \
      --secret-id "$SECRET_NAME" \
      --secret-string "$ANALYTICS_WRITE_KEY" \
      --region "$AWS_REGION"
    
    echo "✅ Secret updated (NOT stored in Terraform state)"
```

**GitHub Actions (Azure):**
```yaml
- name: Deploy Infrastructure
  run: |
    az deployment group create \
      --resource-group ${{ vars.RESOURCE_GROUP }} \
      --template-file infra/azure/main.bicep \
      --parameters analyticsWriteKey=${{ secrets.ANALYTICS_WRITE_KEY }}
```

## Local Development

For local development, fallback to direct env var:

```bash
# .env.local (not committed)
ANALYTICS_WRITE_KEY=local-dev-key
```

Code automatically detects when cloud provider is not configured and uses direct env var.

## Testing

### Verify Secret Not in State

**AWS:**
```bash
cd infra/aws

# Check Terraform state - should NOT contain secret value
terraform show | grep -i "analytics_write_key"
# Should show: secret resource metadata only
# Should NOT show: plaintext secret value

# Verify secret value is in Secrets Manager (not Terraform)
SECRET_NAME=$(terraform output -raw analytics_write_key_secret_name)
aws secretsmanager get-secret-value \
  --secret-id "$SECRET_NAME" \
  --query 'SecretString' \
  --output text
# Should return: the actual secret value (from workflow, not Terraform)
```

**Azure:**
```bash
az functionapp config appsettings list \
  --name <function-app-name> \
  --resource-group <rg> \
  --query "[?name=='ANALYTICS_WRITE_KEY'].value"
# Should show: @Microsoft.KeyVault(...)
# Should NOT show plaintext key
```

### Verify Secret Fetching Works

**AWS:**
```bash
# Invoke Lambda and check logs
aws lambda invoke \
  --function-name analytics-ingest-prod \
  --payload '{"test": true}' \
  response.json

# Check CloudWatch logs for successful secret fetch
```

**Azure:**
```bash
# Check Function App logs
az monitor app-insights query \
  --app <app-insights-name> \
  --analytics-query "traces | where message contains 'write key'"
```

## Migration from Plaintext

### AWS

1. Deploy new Terraform with secrets.tf
2. Update Lambda env vars to use secret ARN
3. Deploy new Lambda code with secret fetching
4. Verify authentication still works
5. Remove old `analytics_write_key` variable from Lambda env

### Azure

1. Deploy updated Key Vault module with secret
2. Update Function App settings to use Key Vault reference
3. Grant Function App managed identity Key Vault access
4. Verify authentication still works

## Troubleshooting

### AWS: "Access Denied" fetching secret

**Cause:** Lambda execution role lacks `secretsmanager:GetSecretValue` permission

**Fix:**
```bash
# Verify IAM policy is attached
aws iam list-attached-role-policies \
  --role-name analytics-lambda-execution-prod
```

### Azure: "Key Vault reference not resolved"

**Cause:** Function App managed identity not granted Key Vault access

**Fix:**
```bash
# Grant access via Bicep or manually
az keyvault set-policy \
  --name <key-vault-name> \
  --object-id <function-app-identity-id> \
  --secret-permissions get
```

### Cold Start Latency

**Issue:** First request slower due to secret fetch

**Mitigation:**
- Secret is cached after first fetch
- AWS SDK lazy-loaded to minimize impact
- Consider Lambda provisioned concurrency for critical paths

## Compliance

This implementation satisfies:
- ✅ **agents.md Section 8.4:** Secrets in cloud secret stores
- ✅ **agents.md Section 8.1:** Least privilege IAM
- ✅ **agents.md Section 5.5:** No hardcoded secrets
- ✅ **OWASP:** Secure secret storage
- ✅ **SOC 2:** Secret access audit trail

## Future Enhancements

1. **Automatic Rotation:** Implement AWS Secrets Manager rotation Lambda
2. **Multiple Keys:** Support key rotation with multiple active keys
3. **Per-Environment Keys:** Different keys for dev/staging/prod
4. **Managed Identity (AWS):** Use IAM roles for service accounts when available
