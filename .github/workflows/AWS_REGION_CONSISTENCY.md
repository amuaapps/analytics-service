# AWS Region Consistency Fix

This document explains the changes made to ensure AWS region consistency between Terraform and AWS CLI operations in the GitHub Actions workflow.

## Problem

**Before the fix:**
- Terraform used default region from `variables.tf` (`us-east-1`)
- AWS CLI commands relied on AWS credentials action configuration
- No explicit region passed to Terraform via environment variables
- Potential for region mismatch between Terraform-created resources and AWS CLI operations
- Function names hardcoded without using variables

**Risk:**
- Terraform creates resources in one region
- AWS CLI commands try to update resources in a different region
- Deployments fail or update wrong resources

## Solution

### 1. Pass Region Explicitly to Terraform

**Added to all Terraform steps:**
```yaml
env:
  TF_VAR_aws_region: ${{ vars.AWS_REGION || 'us-east-1' }}
  TF_VAR_project_name: analytics-service
  TF_VAR_environment: ${{ needs.setup.outputs.environment }}
```

**Applied to:**
- `Terraform Init`
- `Terraform Plan`
- `Terraform Apply`

**Benefit:**
- Terraform uses exact same region as AWS CLI
- No reliance on defaults
- Explicit configuration

### 2. Add Region Flag to All AWS CLI Commands

**Lambda Update Function Code:**
```yaml
env:
  AWS_REGION: ${{ vars.AWS_REGION || 'us-east-1' }}
  PROJECT_NAME: analytics-service
  ENVIRONMENT: ${{ needs.setup.outputs.environment }}

run: |
  aws lambda update-function-code \
    --function-name ${PROJECT_NAME}-ingest-${ENVIRONMENT} \
    --zip-file fileb://dist/lambda-deployment.zip \
    --region ${AWS_REGION} \
    --publish
```

**API Gateway Query:**
```yaml
env:
  AWS_REGION: ${{ vars.AWS_REGION || 'us-east-1' }}

run: |
  aws apigatewayv2 get-apis \
    --region ${AWS_REGION} \
    --query "Items[?Name=='${PROJECT_NAME}-api-${ENVIRONMENT}'].ApiEndpoint | [0]"
```

**Lambda Alias Update:**
```yaml
env:
  AWS_REGION: ${{ vars.AWS_REGION || 'us-east-1' }}

run: |
  aws lambda update-alias \
    --function-name ${FUNCTION_NAME} \
    --name live \
    --function-version ${VERSION} \
    --region ${AWS_REGION}
```

### 3. Use Environment Variables for Naming

**Before:**
```yaml
--function-name analytics-ingest-${{ needs.setup.outputs.environment }}
```

**After:**
```yaml
env:
  PROJECT_NAME: analytics-service
  ENVIRONMENT: ${{ needs.setup.outputs.environment }}

--function-name ${PROJECT_NAME}-ingest-${ENVIRONMENT}
```

**Benefits:**
- Consistent naming across all operations
- Easy to change project name in one place
- Matches Terraform variable usage

## Region Consistency Flow

```
GitHub Variable: AWS_REGION (or default: us-east-1)
                        ↓
        ┌───────────────┴───────────────┐
        ↓                               ↓
   Terraform                       AWS CLI
   (TF_VAR_aws_region)            (--region flag)
        ↓                               ↓
   Creates resources              Updates resources
   in specified region            in same region
        ↓                               ↓
        └───────────────┬───────────────┘
                        ↓
              Same region guaranteed
```

## Changes Summary

### Stage 3: Deploy GREEN (AWS)

**Terraform Init:**
```yaml
env:
  TF_VAR_environment: ${{ needs.setup.outputs.environment }}
  TF_VAR_aws_region: ${{ vars.AWS_REGION || 'us-east-1' }}        # ✅ Added
  TF_VAR_project_name: analytics-service                          # ✅ Added
```

**Terraform Plan:**
```yaml
env:
  TF_VAR_environment: ${{ needs.setup.outputs.environment }}
  TF_VAR_aws_region: ${{ vars.AWS_REGION || 'us-east-1' }}        # ✅ Added
  TF_VAR_project_name: analytics-service                          # ✅ Added
  TF_VAR_analytics_write_key: ${{ secrets.ANALYTICS_WRITE_KEY }}
```

**Terraform Apply:**
```yaml
env:
  TF_VAR_environment: ${{ needs.setup.outputs.environment }}
  TF_VAR_aws_region: ${{ vars.AWS_REGION || 'us-east-1' }}        # ✅ Added
  TF_VAR_project_name: analytics-service                          # ✅ Added
```

**Deploy Lambda Functions:**
```yaml
env:
  AWS_REGION: ${{ vars.AWS_REGION || 'us-east-1' }}               # ✅ Added
  PROJECT_NAME: analytics-service                                 # ✅ Added
  ENVIRONMENT: ${{ needs.setup.outputs.environment }}             # ✅ Added

run: |
  aws lambda update-function-code \
    --function-name ${PROJECT_NAME}-ingest-${ENVIRONMENT} \
    --zip-file fileb://dist/lambda-deployment.zip \
    --region ${AWS_REGION} \                                      # ✅ Added
    --publish
```

### Stage 4: Test & Switch (AWS)

**Get API Gateway URL:**
```yaml
env:
  AWS_REGION: ${{ vars.AWS_REGION || 'us-east-1' }}               # ✅ Added
  PROJECT_NAME: analytics-service                                 # ✅ Added
  ENVIRONMENT: ${{ needs.setup.outputs.environment }}             # ✅ Added

run: |
  aws apigatewayv2 get-apis \
    --region ${AWS_REGION} \                                      # ✅ Added
    --query "Items[?Name=='${PROJECT_NAME}-api-${ENVIRONMENT}'].ApiEndpoint | [0]"
```

**Switch to GREEN:**
```yaml
env:
  AWS_REGION: ${{ vars.AWS_REGION || 'us-east-1' }}               # ✅ Added

run: |
  aws lambda update-alias \
    --function-name ${FUNCTION_NAME} \
    --name live \
    --function-version ${VERSION} \
    --region ${AWS_REGION}                                        # ✅ Added
```

## Configuration

### GitHub Variables

| Variable | Description | Default |
|----------|-------------|---------|
| `AWS_REGION` | AWS region for all operations | `us-east-1` |

**Setting the variable:**
```
Repository Settings → Secrets and variables → Actions → Variables → New repository variable
Name: AWS_REGION
Value: us-east-1 (or your preferred region)
```

### Terraform Variables

The workflow now passes these variables explicitly:

| Variable | Source | Purpose |
|----------|--------|---------|
| `TF_VAR_aws_region` | `${{ vars.AWS_REGION }}` | Region for Terraform resources |
| `TF_VAR_project_name` | `analytics-service` | Project name for resource naming |
| `TF_VAR_environment` | `${{ needs.setup.outputs.environment }}` | Environment (dev/staging/prod) |

## Verification

### Check Region Consistency

```bash
# In GitHub Actions logs, verify:

# Terraform Init
TF_VAR_aws_region=us-east-1

# Terraform Plan
TF_VAR_aws_region=us-east-1

# Deploy Lambda
Region: us-east-1

# Get API Gateway URL
API Gateway URL: https://xxx.execute-api.us-east-1.amazonaws.com (Region: us-east-1)

# Switch to GREEN
Region: us-east-1
```

All should show the same region.

### Test Different Regions

To deploy to a different region:

1. Update GitHub Variable `AWS_REGION` to `eu-west-1`
2. Trigger deployment
3. Verify all operations use `eu-west-1`

## Benefits

### ✅ Consistency
- All AWS operations use the same region
- No region mismatch between Terraform and AWS CLI
- Predictable resource location

### ✅ Flexibility
- Easy to change region via GitHub Variable
- No code changes needed
- Supports multi-region deployments

### ✅ Maintainability
- Single source of truth for region (`AWS_REGION` variable)
- Environment variables for naming consistency
- Clear and explicit configuration

### ✅ Debugging
- Region logged in each step
- Easy to verify consistency
- Clear error messages if region mismatch

## Troubleshooting

### Error: "ResourceNotFoundException"

**Cause:** AWS CLI trying to access resources in wrong region

**Solution:**
```bash
# Check GitHub Variable
Repository Settings → Variables → AWS_REGION

# Verify Terraform used correct region
# Check Terraform Apply logs for:
TF_VAR_aws_region=<region>

# Verify AWS CLI used correct region
# Check Deploy Lambda logs for:
Region: <region>
```

### Error: "Function not found"

**Cause:** Function name mismatch or wrong region

**Solution:**
```bash
# Verify function name format
${PROJECT_NAME}-${FUNCTION}-${ENVIRONMENT}
# Example: analytics-service-ingest-dev

# List functions in region
aws lambda list-functions --region us-east-1 --query 'Functions[].FunctionName'
```

### Resources in Wrong Region

**Cause:** Terraform default region used instead of explicit region

**Solution:**
```bash
# Verify TF_VAR_aws_region is set in all Terraform steps
grep -A5 "Terraform Init\|Terraform Plan\|Terraform Apply" .github/workflows/deploy.yml

# Should show:
env:
  TF_VAR_aws_region: ${{ vars.AWS_REGION || 'us-east-1' }}
```

## Migration Notes

### For Existing Deployments

If you have existing resources in a specific region:

1. Set `AWS_REGION` variable to match existing resources
2. Next deployment will use consistent region
3. No migration needed

### For New Deployments

1. Set `AWS_REGION` variable before first deployment
2. All resources will be created in specified region
3. Consistent from the start

## Best Practices

### 1. Always Set AWS_REGION Variable
```
Don't rely on defaults - explicitly set the region
```

### 2. Use Same Region for Backend
```yaml
# Backend configuration should use same region
region = "${{ vars.AWS_REGION || 'us-east-1' }}"
```

### 3. Log Region in Each Step
```bash
echo "Region: ${AWS_REGION}"
```

### 4. Verify Region Consistency
```bash
# After deployment, verify all resources in same region
aws lambda list-functions --region ${AWS_REGION}
aws apigatewayv2 get-apis --region ${AWS_REGION}
aws dynamodb list-tables --region ${AWS_REGION}
```

## References

- [AWS CLI Region Configuration](https://docs.aws.amazon.com/cli/latest/userguide/cli-configure-quickstart.html#cli-configure-quickstart-region)
- [Terraform AWS Provider Region](https://registry.terraform.io/providers/hashicorp/aws/latest/docs#region)
- [GitHub Actions Variables](https://docs.github.com/en/actions/learn-github-actions/variables)
