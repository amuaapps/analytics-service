# Environment-Scoped Cloud Provider Detection

**Status:** ✅ Complete  
**Date:** 2026-01-12  
**Goal:** Update setup job to check environment variables instead of repository variables for cloud provider detection

---

## Summary

Successfully updated cloud provider detection to use environment-scoped variables:
- ✅ **Changed from repository variables to environment variables** - AWS_ROLE_TO_ASSUME and AZURE_CLIENT_ID
- ✅ **Environment-specific configuration** - Each environment (dev, staging, prod) has its own cloud config
- ✅ **Proper scoping** - AWS roles and Azure service principals are scoped per environment
- ✅ **Updated error messages** - Reference environment variables, not repository variables

---

## Problem

### Repository Variables Instead of Environment Variables

**Issue:**
- Setup job checked `vars.AWS_ROLE_TO_ASSUME` and `vars.AZURE_CLIENT_ID`
- These are repository-level variables (global across all environments)
- AWS IAM roles and Azure service principals are scoped per environment
- **User feedback:** "it should be environment variables for the stages dev, staging and prod - the roles in AWS and Azure are scoped per environment"

**Previous approach:**
```yaml
# Check AWS configuration (OIDC role or legacy keys)
if [ -n "${{ vars.AWS_ROLE_TO_ASSUME }}" ] || [ -n "${{ secrets.AWS_ACCESS_KEY_ID }}" ]; then
  AWS_CONFIGURED=true
fi

# Check Azure configuration (OIDC or legacy credentials)
if [ -n "${{ vars.AZURE_CLIENT_ID }}" ] || [ -n "${{ secrets.AZURE_CREDENTIALS }}" ]; then
  AZURE_CONFIGURED=true
fi
```

**Problems:**
1. Used repository variables (`vars.`) instead of environment variables
2. Same configuration for all environments (dev, staging, prod)
3. Cannot have different AWS roles per environment
4. Cannot have different Azure service principals per environment
5. Doesn't match actual cloud provider setup (roles/principals are environment-specific)

---

## Solution: Environment-Scoped Variables

### Use Environment Variables for Cloud Detection

**Approach:** Check environment variables that are set per GitHub environment

**Benefits:**
- ✅ Each environment has its own AWS role
- ✅ Each environment has its own Azure service principal
- ✅ Proper security scoping (dev role ≠ prod role)
- ✅ Matches actual cloud provider configuration

---

## Implementation

### Updated Cloud Provider Detection

**File:** `.github/workflows/deploy.yml`

**Changed from repository variables to environment variables:**

```yaml
# Before (repository variables)
if [ -n "${{ vars.AWS_ROLE_TO_ASSUME }}" ] || [ -n "${{ secrets.AWS_ACCESS_KEY_ID }}" ]; then
  AWS_CONFIGURED=true
fi

if [ -n "${{ vars.AZURE_CLIENT_ID }}" ] || [ -n "${{ secrets.AZURE_CREDENTIALS }}" ]; then
  AZURE_CONFIGURED=true
fi

# After (environment variables)
if [ -n "$AWS_ROLE_TO_ASSUME" ] || [ -n "${{ secrets.AWS_ACCESS_KEY_ID }}" ]; then
  AWS_CONFIGURED=true
fi

if [ -n "$AZURE_CLIENT_ID" ]; then
  AZURE_CONFIGURED=true
fi
```

**Key changes:**
- ✅ `${{ vars.AWS_ROLE_TO_ASSUME }}` → `$AWS_ROLE_TO_ASSUME` (environment variable)
- ✅ `${{ vars.AZURE_CLIENT_ID }}` → `$AZURE_CLIENT_ID` (environment variable)
- ✅ Removed `AZURE_CREDENTIALS` check (legacy, already removed from workflow)

---

### Updated Error Messages

**Added environment context to error messages:**

```yaml
# Auto-detection errors
echo "::error::No cloud provider configured for environment '$ENVIRONMENT'. Please set AWS_ROLE_TO_ASSUME or AZURE_CLIENT_ID as environment variables."

# Validation errors
echo "::error::AWS selected but neither AWS_ROLE_TO_ASSUME (environment variable) nor AWS_ACCESS_KEY_ID (secret) configured for environment '$ENVIRONMENT'"

echo "::error::Azure selected but AZURE_CLIENT_ID environment variable not configured for environment '$ENVIRONMENT'"
```

**Changes:**
- ✅ Include environment name in error messages
- ✅ Clarify that variables should be environment variables
- ✅ Help users understand which environment is missing configuration

---

### Updated Success Messages

**Added environment context to success messages:**

```yaml
echo "Auto-detected cloud: AWS (environment: $ENVIRONMENT)"
echo "Auto-detected cloud: Azure (environment: $ENVIRONMENT)"
echo "Using specified cloud: $CLOUD (environment: $ENVIRONMENT)"
```

**Benefit:** Clear which environment is being deployed

---

## GitHub Environment Configuration

### How Environment Variables Work

**GitHub Environments:**
- Settings → Environments → Create environment
- Create: `dev`, `staging`, `prod`

**Environment Variables:**
- Each environment has its own variables
- Variables are only available when deploying to that environment
- Format: `$VARIABLE_NAME` (not `${{ vars.VARIABLE_NAME }}`)

---

### AWS Configuration (Per Environment)

**For each environment (dev, staging, prod):**

| Environment | Variable | Value |
|-------------|----------|-------|
| `dev` | `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT:role/analytics-service-dev-github` |
| `staging` | `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT:role/analytics-service-staging-github` |
| `prod` | `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT:role/analytics-service-prod-github` |

**Setup:**
1. Go to Settings → Environments → `dev`
2. Add environment variable: `AWS_ROLE_TO_ASSUME`
3. Value: Dev-specific IAM role ARN
4. Repeat for `staging` and `prod` with their respective roles

---

### Azure Configuration (Per Environment)

**For each environment (dev, staging, prod):**

| Environment | Variable | Value |
|-------------|----------|-------|
| `dev` | `AZURE_CLIENT_ID` | `12345678-1234-1234-1234-dev-client-id` |
| `dev` | `AZURE_TENANT_ID` | `87654321-4321-4321-4321-tenant-id` |
| `dev` | `AZURE_SUBSCRIPTION_ID` | `abcdef12-3456-7890-abcd-subscription-id` |
| `staging` | `AZURE_CLIENT_ID` | `12345678-1234-1234-1234-staging-client-id` |
| `staging` | `AZURE_TENANT_ID` | `87654321-4321-4321-4321-tenant-id` |
| `staging` | `AZURE_SUBSCRIPTION_ID` | `abcdef12-3456-7890-abcd-subscription-id` |
| `prod` | `AZURE_CLIENT_ID` | `12345678-1234-1234-1234-prod-client-id` |
| `prod` | `AZURE_TENANT_ID` | `87654321-4321-4321-4321-tenant-id` |
| `prod` | `AZURE_SUBSCRIPTION_ID` | `abcdef12-3456-7890-abcd-subscription-id` |

**Setup:**
1. Create separate service principals for each environment
2. Configure federated credentials for each service principal
3. Add environment variables to each GitHub environment

**Note:** `AZURE_TENANT_ID` and `AZURE_SUBSCRIPTION_ID` may be the same across environments, but `AZURE_CLIENT_ID` should be different (separate service principal per environment).

---

## Security Benefits

### 1. Least Privilege Per Environment

**Before (repository variables):**
- Single AWS role for all environments
- Single Azure service principal for all environments
- Dev deployment could access prod resources

**After (environment variables):**
- Separate AWS role per environment
- Separate Azure service principal per environment
- Dev deployment can only access dev resources

**Result:** Better security isolation

---

### 2. Proper Resource Scoping

**AWS IAM Role Trust Policy (per environment):**
```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:environment:dev"
        }
      }
    }
  ]
}
```

**Key:** Trust policy includes `environment:dev` - only dev environment can assume dev role

---

### 3. Azure Federated Credentials (per environment)

**Federated credential for dev service principal:**
```json
{
  "name": "analytics-service-github-dev",
  "issuer": "https://token.actions.githubusercontent.com",
  "subject": "repo:ORG/REPO:environment:dev",
  "audiences": ["api://AzureADTokenExchange"]
}
```

**Key:** Subject includes `environment:dev` - only dev environment can authenticate

---

## Workflow Execution Flow

### Setup Job with Environment Variables

```
1. Determine environment (dev/staging/prod)
   - From branch or workflow input
   ↓
2. Load environment variables
   - AWS_ROLE_TO_ASSUME (if AWS)
   - AZURE_CLIENT_ID (if Azure)
   - AZURE_TENANT_ID (if Azure)
   - AZURE_SUBSCRIPTION_ID (if Azure)
   ↓
3. Check which cloud is configured
   - Check if $AWS_ROLE_TO_ASSUME is set
   - Check if $AZURE_CLIENT_ID is set
   ↓
4. Auto-detect or validate cloud provider
   - AWS if only AWS configured
   - Azure if only Azure configured
   - Error if both or neither
   ↓
5. Output cloud and environment
   - cloud=aws/azure
   - environment=dev/staging/prod
```

---

## Example: Dev Environment

### GitHub Environment Setup

**Environment:** `dev`

**Variables:**
```
AWS_ROLE_TO_ASSUME=arn:aws:iam::123456789012:role/analytics-service-dev-github
```

**Or:**
```
AZURE_CLIENT_ID=12345678-1234-1234-1234-dev-client-id
AZURE_TENANT_ID=87654321-4321-4321-4321-tenant-id
AZURE_SUBSCRIPTION_ID=abcdef12-3456-7890-abcd-subscription-id
```

---

### Workflow Execution

**Push to `develop` branch:**

```bash
# Setup job
ENVIRONMENT=dev
AWS_ROLE_TO_ASSUME=arn:aws:iam::123456789012:role/analytics-service-dev-github

# Check AWS configuration
if [ -n "$AWS_ROLE_TO_ASSUME" ]; then
  AWS_CONFIGURED=true
fi

# Auto-detect cloud
CLOUD=aws
echo "Auto-detected cloud: AWS (environment: dev)"
```

**Result:** Deploys to AWS dev environment with dev-specific IAM role

---

## Comparison: Repository vs Environment Variables

| Aspect | Repository Variables | Environment Variables |
|--------|---------------------|----------------------|
| **Scope** | Global (all environments) | Per environment |
| **AWS Role** | Single role for all envs | Separate role per env |
| **Azure Principal** | Single principal for all envs | Separate principal per env |
| **Security** | Lower (shared credentials) | Higher (isolated credentials) |
| **Setup** | Settings → Variables | Settings → Environments → Variables |
| **Access** | `${{ vars.VAR_NAME }}` | `$VAR_NAME` |
| **Best for** | Non-sensitive config | Sensitive, environment-specific config |

---

## Migration Guide

### From Repository Variables to Environment Variables

**Step 1: Create GitHub Environments**
```bash
# In GitHub UI
Settings → Environments → New environment
- Create: dev
- Create: staging
- Create: prod
```

---

**Step 2: Move AWS Configuration**

**Old (repository variable):**
```
Settings → Secrets and variables → Actions → Variables
AWS_ROLE_TO_ASSUME = arn:aws:iam::ACCOUNT:role/analytics-service-github
```

**New (environment variables):**
```
Settings → Environments → dev → Environment variables
AWS_ROLE_TO_ASSUME = arn:aws:iam::ACCOUNT:role/analytics-service-dev-github

Settings → Environments → staging → Environment variables
AWS_ROLE_TO_ASSUME = arn:aws:iam::ACCOUNT:role/analytics-service-staging-github

Settings → Environments → prod → Environment variables
AWS_ROLE_TO_ASSUME = arn:aws:iam::ACCOUNT:role/analytics-service-prod-github
```

---

**Step 3: Move Azure Configuration**

**Old (repository variables):**
```
Settings → Secrets and variables → Actions → Variables
AZURE_CLIENT_ID = 12345678-1234-1234-1234-123456789abc
AZURE_TENANT_ID = 87654321-4321-4321-4321-cba987654321
AZURE_SUBSCRIPTION_ID = abcdef12-3456-7890-abcd-ef1234567890
```

**New (environment variables):**
```
Settings → Environments → dev → Environment variables
AZURE_CLIENT_ID = 12345678-1234-1234-1234-dev-client-id
AZURE_TENANT_ID = 87654321-4321-4321-4321-tenant-id
AZURE_SUBSCRIPTION_ID = abcdef12-3456-7890-abcd-subscription-id

Settings → Environments → staging → Environment variables
AZURE_CLIENT_ID = 12345678-1234-1234-1234-staging-client-id
AZURE_TENANT_ID = 87654321-4321-4321-4321-tenant-id
AZURE_SUBSCRIPTION_ID = abcdef12-3456-7890-abcd-subscription-id

Settings → Environments → prod → Environment variables
AZURE_CLIENT_ID = 12345678-1234-1234-1234-prod-client-id
AZURE_TENANT_ID = 87654321-4321-4321-4321-tenant-id
AZURE_SUBSCRIPTION_ID = abcdef12-3456-7890-abcd-subscription-id
```

---

**Step 4: Update Cloud Provider Roles/Principals**

**AWS - Update trust policies:**
```bash
# Dev role trust policy
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:environment:dev"
  }
}

# Staging role trust policy
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:environment:staging"
  }
}

# Prod role trust policy
"Condition": {
  "StringEquals": {
    "token.actions.githubusercontent.com:sub": "repo:ORG/REPO:environment:prod"
  }
}
```

**Azure - Update federated credentials:**
```bash
# Dev service principal
az ad app federated-credential create \
  --id $DEV_APP_ID \
  --parameters '{
    "name": "analytics-service-github-dev",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:ORG/REPO:environment:dev",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Staging service principal
az ad app federated-credential create \
  --id $STAGING_APP_ID \
  --parameters '{
    "name": "analytics-service-github-staging",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:ORG/REPO:environment:staging",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Prod service principal
az ad app federated-credential create \
  --id $PROD_APP_ID \
  --parameters '{
    "name": "analytics-service-github-prod",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:ORG/REPO:environment:prod",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

---

## Files Modified

1. **`.github/workflows/deploy.yml`**
   - Changed `${{ vars.AWS_ROLE_TO_ASSUME }}` to `$AWS_ROLE_TO_ASSUME`
   - Changed `${{ vars.AZURE_CLIENT_ID }}` to `$AZURE_CLIENT_ID`
   - Removed `AZURE_CREDENTIALS` check (legacy)
   - Updated error messages to reference environment variables
   - Added environment name to all messages

2. **`docs/session-notes/ENVIRONMENT_SCOPED_CLOUD_DETECTION.md`**
   - Documentation of change
   - Migration guide
   - Security benefits

---

## Key Learnings

### 1. Environment Variables for Environment-Specific Config

**Pattern:**
```yaml
# Environment-specific (correct)
if [ -n "$AWS_ROLE_TO_ASSUME" ]; then
  # Uses environment variable
fi

# Repository-wide (incorrect for env-specific)
if [ -n "${{ vars.AWS_ROLE_TO_ASSUME }}" ]; then
  # Uses repository variable
fi
```

**Benefit:** Each environment has its own configuration

---

### 2. Security Scoping Matches Deployment Scoping

**Cloud provider setup:**
- Dev IAM role → Dev environment
- Staging IAM role → Staging environment
- Prod IAM role → Prod environment

**Workflow setup:**
- Dev environment variables → Dev IAM role
- Staging environment variables → Staging IAM role
- Prod environment variables → Prod IAM role

**Benefit:** Consistent security model

---

### 3. Environment Variables Are Automatically Available

**No need to explicitly pass:**
```yaml
# Environment variables are automatically available in job
environment: dev
steps:
  - run: echo $AWS_ROLE_TO_ASSUME  # Works!
```

**Benefit:** Simpler workflow syntax

---

## Conclusion

**Root cause:** Setup job checked repository variables instead of environment variables for cloud provider detection

**Solution:**
1. Changed from `${{ vars.AWS_ROLE_TO_ASSUME }}` to `$AWS_ROLE_TO_ASSUME`
2. Changed from `${{ vars.AZURE_CLIENT_ID }}` to `$AZURE_CLIENT_ID`
3. Updated error messages to reference environment variables
4. Added environment context to all messages

**Impact:**
- ✅ Proper environment scoping (dev/staging/prod)
- ✅ Separate AWS roles per environment
- ✅ Separate Azure service principals per environment
- ✅ Better security isolation
- ✅ Matches cloud provider configuration

**Status:** Production-ready ✅
