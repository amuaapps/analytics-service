# OIDC Authentication Setup Guide

## Overview

This guide explains how to configure OpenID Connect (OIDC) authentication for GitHub Actions to deploy to AWS and Azure without using long-lived credentials.

**Benefits:**
- ✅ No long-lived secrets in GitHub
- ✅ Automatic credential rotation
- ✅ Fine-grained permissions per environment
- ✅ Audit trail via cloud provider IAM
- ✅ Compliance with security best practices

## Architecture

### Traditional (Legacy) Authentication

```
GitHub Actions
  ↓ Uses stored secrets
  ↓ AWS_ACCESS_KEY_ID / AWS_SECRET_ACCESS_KEY
  ↓ AZURE_CREDENTIALS (JSON with client secret)
  ↓
Cloud Provider
  ↓ Long-lived credentials
  ↓ Manual rotation required
  ↓ Risk if leaked
```

### OIDC Authentication (Current)

```
GitHub Actions
  ↓ Requests OIDC token (automatic)
  ↓ Token contains: repo, branch, environment
  ↓
Cloud Provider
  ↓ Validates token signature
  ↓ Checks trust policy
  ↓ Issues temporary credentials (1 hour)
  ↓
Deployment
  ↓ Short-lived credentials
  ↓ No secrets to leak
```

## AWS OIDC Setup

### Step 1: Create OIDC Identity Provider

**Via AWS Console:**

1. Navigate to **IAM → Identity providers → Add provider**
2. Select **OpenID Connect**
3. Configure:
   - **Provider URL:** `https://token.actions.githubusercontent.com`
   - **Audience:** `sts.amazonaws.com`
4. Click **Add provider**

**Via AWS CLI:**

```bash
aws iam create-open-id-connect-provider \
  --url https://token.actions.githubusercontent.com \
  --client-id-list sts.amazonaws.com \
  --thumbprint-list 6938fd4d98bab03faadb97b34396831e3780aea1
```

**Via Terraform:**

```hcl
# infra/aws/github-oidc.tf
resource "aws_iam_openid_connect_provider" "github" {
  url = "https://token.actions.githubusercontent.com"

  client_id_list = [
    "sts.amazonaws.com",
  ]

  thumbprint_list = [
    "6938fd4d98bab03faadb97b34396831e3780aea1"
  ]

  tags = {
    Name        = "GitHub Actions OIDC"
    ManagedBy   = "Terraform"
  }
}
```

### Step 2: Create IAM Role for GitHub Actions

**Trust Policy** (allows GitHub Actions from your repo):

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Principal": {
        "Federated": "arn:aws:iam::ACCOUNT_ID:oidc-provider/token.actions.githubusercontent.com"
      },
      "Action": "sts:AssumeRoleWithWebIdentity",
      "Condition": {
        "StringEquals": {
          "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
        },
        "StringLike": {
          "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/analytics-service:*"
        }
      }
    }
  ]
}
```

**Environment-Specific Trust Policies:**

For **dev** environment:
```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/analytics-service:environment:dev"
    }
  }
}
```

For **staging** environment:
```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/analytics-service:environment:staging"
    }
  }
}
```

For **prod** environment:
```json
{
  "Condition": {
    "StringEquals": {
      "token.actions.githubusercontent.com:aud": "sts.amazonaws.com"
    },
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/analytics-service:environment:prod"
    }
  }
}
```

**Terraform Example:**

```hcl
# infra/aws/github-oidc.tf

# Dev environment role
resource "aws_iam_role" "github_actions_dev" {
  name = "GitHubActions-AnalyticsService-Dev"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:YOUR_ORG/analytics-service:environment:dev"
          }
        }
      }
    ]
  })

  tags = {
    Environment = "dev"
    ManagedBy   = "Terraform"
  }
}

# Staging environment role
resource "aws_iam_role" "github_actions_staging" {
  name = "GitHubActions-AnalyticsService-Staging"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:YOUR_ORG/analytics-service:environment:staging"
          }
        }
      }
    ]
  })

  tags = {
    Environment = "staging"
    ManagedBy   = "Terraform"
  }
}

# Prod environment role
resource "aws_iam_role" "github_actions_prod" {
  name = "GitHubActions-AnalyticsService-Prod"

  assume_role_policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Principal = {
          Federated = aws_iam_openid_connect_provider.github.arn
        }
        Action = "sts:AssumeRoleWithWebIdentity"
        Condition = {
          StringEquals = {
            "token.actions.githubusercontent.com:aud" = "sts.amazonaws.com"
          }
          StringLike = {
            "token.actions.githubusercontent.com:sub" = "repo:YOUR_ORG/analytics-service:environment:prod"
          }
        }
      }
    ]
  })

  tags = {
    Environment = "prod"
    ManagedBy   = "Terraform"
  }
}
```

### Step 3: Attach Permissions Policy

**Required Permissions:**

```json
{
  "Version": "2012-10-17",
  "Statement": [
    {
      "Effect": "Allow",
      "Action": [
        "lambda:UpdateFunctionCode",
        "lambda:PublishVersion",
        "lambda:UpdateAlias",
        "lambda:GetAlias",
        "lambda:GetFunction",
        "lambda:GetFunctionConfiguration",
        "apigatewayv2:GetApis",
        "apigatewayv2:GetApi",
        "s3:PutObject",
        "s3:GetObject",
        "dynamodb:DescribeTable",
        "sqs:GetQueueAttributes"
      ],
      "Resource": [
        "arn:aws:lambda:REGION:ACCOUNT_ID:function:analytics-service-*-ENV",
        "arn:aws:apigatewayv2:REGION:ACCOUNT_ID:/apis/*",
        "arn:aws:s3:::analytics-service-*-ENV/*",
        "arn:aws:dynamodb:REGION:ACCOUNT_ID:table/analytics-events-ENV",
        "arn:aws:sqs:REGION:ACCOUNT_ID:analytics-events-ENV"
      ]
    }
  ]
}
```

**Terraform Example:**

```hcl
# infra/aws/github-oidc.tf

resource "aws_iam_policy" "github_actions_deploy" {
  name        = "GitHubActions-AnalyticsService-Deploy"
  description = "Permissions for GitHub Actions to deploy analytics service"

  policy = jsonencode({
    Version = "2012-10-17"
    Statement = [
      {
        Effect = "Allow"
        Action = [
          "lambda:UpdateFunctionCode",
          "lambda:PublishVersion",
          "lambda:UpdateAlias",
          "lambda:GetAlias",
          "lambda:GetFunction",
          "lambda:GetFunctionConfiguration",
          "apigatewayv2:GetApis",
          "apigatewayv2:GetApi"
        ]
        Resource = [
          "arn:aws:lambda:${var.aws_region}:${data.aws_caller_identity.current.account_id}:function:analytics-service-*",
          "arn:aws:apigatewayv2:${var.aws_region}:${data.aws_caller_identity.current.account_id}:/apis/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "s3:PutObject",
          "s3:GetObject"
        ]
        Resource = [
          "arn:aws:s3:::analytics-service-*/*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "dynamodb:DescribeTable"
        ]
        Resource = [
          "arn:aws:dynamodb:${var.aws_region}:${data.aws_caller_identity.current.account_id}:table/analytics-events-*"
        ]
      },
      {
        Effect = "Allow"
        Action = [
          "sqs:GetQueueAttributes"
        ]
        Resource = [
          "arn:aws:sqs:${var.aws_region}:${data.aws_caller_identity.current.account_id}:analytics-events-*"
        ]
      }
    ]
  })
}

# Attach policy to roles
resource "aws_iam_role_policy_attachment" "github_actions_dev" {
  role       = aws_iam_role.github_actions_dev.name
  policy_arn = aws_iam_policy.github_actions_deploy.arn
}

resource "aws_iam_role_policy_attachment" "github_actions_staging" {
  role       = aws_iam_role.github_actions_staging.name
  policy_arn = aws_iam_policy.github_actions_deploy.arn
}

resource "aws_iam_role_policy_attachment" "github_actions_prod" {
  role       = aws_iam_role.github_actions_prod.name
  policy_arn = aws_iam_policy.github_actions_deploy.arn
}
```

### Step 4: Configure GitHub Variables

**Repository Variables** (Settings → Secrets and variables → Actions → Variables):

| Variable Name | Value | Scope |
|---|---|---|
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT_ID:role/GitHubActions-AnalyticsService-Dev` | dev environment |
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT_ID:role/GitHubActions-AnalyticsService-Staging` | staging environment |
| `AWS_ROLE_TO_ASSUME` | `arn:aws:iam::ACCOUNT_ID:role/GitHubActions-AnalyticsService-Prod` | prod environment |
| `AWS_REGION` | `us-east-1` | All environments |

**Note:** Use environment-specific variables for different roles per environment.

### Step 5: Remove Legacy Secrets (Optional)

Once OIDC is working, remove:
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`

The workflow includes fallback support, so you can test OIDC first before removing legacy credentials.

## Azure OIDC Setup

### Step 1: Create App Registration

**Via Azure Portal:**

1. Navigate to **Azure Active Directory → App registrations → New registration**
2. Configure:
   - **Name:** `GitHub-Actions-AnalyticsService`
   - **Supported account types:** Single tenant
   - **Redirect URI:** Leave empty
3. Click **Register**
4. Note the **Application (client) ID** and **Directory (tenant) ID**

**Via Azure CLI:**

```bash
az ad app create \
  --display-name "GitHub-Actions-AnalyticsService"
```

### Step 2: Create Federated Credentials

**For each environment (dev, staging, prod):**

**Via Azure Portal:**

1. Navigate to **App registrations → Your app → Certificates & secrets → Federated credentials**
2. Click **Add credential**
3. Select **GitHub Actions deploying Azure resources**
4. Configure:
   - **Organization:** `YOUR_ORG`
   - **Repository:** `analytics-service`
   - **Entity type:** `Environment`
   - **Environment name:** `dev` (or `staging`, `prod`)
   - **Name:** `github-actions-dev`
5. Click **Add**

**Via Azure CLI:**

```bash
# Dev environment
az ad app federated-credential create \
  --id <APPLICATION_ID> \
  --parameters '{
    "name": "github-actions-dev",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:YOUR_ORG/analytics-service:environment:dev",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Staging environment
az ad app federated-credential create \
  --id <APPLICATION_ID> \
  --parameters '{
    "name": "github-actions-staging",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:YOUR_ORG/analytics-service:environment:staging",
    "audiences": ["api://AzureADTokenExchange"]
  }'

# Prod environment
az ad app federated-credential create \
  --id <APPLICATION_ID> \
  --parameters '{
    "name": "github-actions-prod",
    "issuer": "https://token.actions.githubusercontent.com",
    "subject": "repo:YOUR_ORG/analytics-service:environment:prod",
    "audiences": ["api://AzureADTokenExchange"]
  }'
```

### Step 3: Create Service Principal and Assign Permissions

**Create Service Principal:**

```bash
az ad sp create --id <APPLICATION_ID>
```

**Assign Contributor Role (per environment):**

```bash
# Dev environment
az role assignment create \
  --assignee <APPLICATION_ID> \
  --role Contributor \
  --scope /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-dev-rg

# Staging environment
az role assignment create \
  --assignee <APPLICATION_ID> \
  --role Contributor \
  --scope /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-staging-rg

# Prod environment
az role assignment create \
  --assignee <APPLICATION_ID> \
  --role Contributor \
  --scope /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-prod-rg
```

**Least Privilege Alternative (Recommended):**

Create a custom role with only required permissions:

```bash
az role definition create --role-definition '{
  "Name": "GitHub Actions Analytics Service Deploy",
  "Description": "Permissions for GitHub Actions to deploy analytics service",
  "Actions": [
    "Microsoft.Resources/deployments/*",
    "Microsoft.Web/sites/*",
    "Microsoft.Storage/storageAccounts/*",
    "Microsoft.DocumentDB/databaseAccounts/*",
    "Microsoft.ServiceBus/namespaces/queues/*"
  ],
  "AssignableScopes": [
    "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-dev-rg",
    "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-staging-rg",
    "/subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-prod-rg"
  ]
}'

# Assign custom role
az role assignment create \
  --assignee <APPLICATION_ID> \
  --role "GitHub Actions Analytics Service Deploy" \
  --scope /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-dev-rg
```

### Step 4: Configure GitHub Variables

**Repository Variables** (Settings → Secrets and variables → Actions → Variables):

| Variable Name | Value | Scope |
|---|---|---|
| `AZURE_CLIENT_ID` | `<APPLICATION_ID>` | All environments |
| `AZURE_TENANT_ID` | `<DIRECTORY_ID>` | All environments |
| `AZURE_SUBSCRIPTION_ID` | `<SUBSCRIPTION_ID>` | All environments |

**Note:** These values are the same across environments. Environment isolation is achieved via federated credential subject claims and resource group scoping.

### Step 5: Remove Legacy Secrets (Optional)

Once OIDC is working, remove:
- `AZURE_CREDENTIALS`

The workflow includes fallback support, so you can test OIDC first before removing legacy credentials.

## Workflow Configuration

The workflow has been updated to support both OIDC and legacy authentication:

### AWS Configuration

```yaml
- name: Configure AWS credentials
  uses: aws-actions/configure-aws-credentials@v4
  with:
    role-to-assume: ${{ vars.AWS_ROLE_TO_ASSUME }}
    role-session-name: GitHubActions-${{ github.run_id }}-deploy-green
    aws-region: ${{ vars.AWS_REGION || 'us-east-1' }}
    # Legacy fallback (will be removed in future)
    aws-access-key-id: ${{ secrets.AWS_ACCESS_KEY_ID }}
    aws-secret-access-key: ${{ secrets.AWS_SECRET_ACCESS_KEY }}
```

**Behavior:**
- If `AWS_ROLE_TO_ASSUME` is set → Uses OIDC
- If `AWS_ROLE_TO_ASSUME` is not set → Falls back to access keys
- If neither is set → Workflow fails

### Azure Configuration

```yaml
- name: Azure Login
  uses: azure/login@v2
  with:
    client-id: ${{ vars.AZURE_CLIENT_ID }}
    tenant-id: ${{ vars.AZURE_TENANT_ID }}
    subscription-id: ${{ vars.AZURE_SUBSCRIPTION_ID }}
    # Legacy fallback (will be removed in future)
    creds: ${{ secrets.AZURE_CREDENTIALS }}
```

**Behavior:**
- If `AZURE_CLIENT_ID` is set → Uses OIDC
- If `AZURE_CLIENT_ID` is not set → Falls back to service principal JSON
- If neither is set → Workflow fails

## Testing OIDC Setup

### AWS Testing

1. **Set up OIDC** (Steps 1-4 above)
2. **Configure GitHub variables** with role ARN
3. **Keep legacy secrets** temporarily
4. **Trigger deployment** to dev environment
5. **Check workflow logs** for:
   ```
   Assuming role: arn:aws:iam::ACCOUNT_ID:role/GitHubActions-AnalyticsService-Dev
   Credentials obtained via OIDC
   ```
6. **Verify deployment succeeds**
7. **Remove legacy secrets** once confident

### Azure Testing

1. **Set up OIDC** (Steps 1-4 above)
2. **Configure GitHub variables** with client ID, tenant ID, subscription ID
3. **Keep legacy secret** temporarily
4. **Trigger deployment** to dev environment
5. **Check workflow logs** for:
   ```
   Logging in using OIDC...
   Login successful
   ```
6. **Verify deployment succeeds**
7. **Remove legacy secret** once confident

## Troubleshooting

### AWS: "Not authorized to perform sts:AssumeRoleWithWebIdentity"

**Cause:** Trust policy doesn't allow GitHub Actions

**Fix:** Verify trust policy includes:
```json
{
  "Condition": {
    "StringLike": {
      "token.actions.githubusercontent.com:sub": "repo:YOUR_ORG/analytics-service:*"
    }
  }
}
```

**Check subject claim in workflow logs:**
```
Subject: repo:YOUR_ORG/analytics-service:environment:dev
```

### AWS: "Role ARN is not valid"

**Cause:** `AWS_ROLE_TO_ASSUME` variable not set or incorrect

**Fix:** 
1. Go to GitHub → Settings → Secrets and variables → Actions → Variables
2. Add `AWS_ROLE_TO_ASSUME` for each environment
3. Use full ARN: `arn:aws:iam::ACCOUNT_ID:role/ROLE_NAME`

### Azure: "AADSTS700016: Application not found"

**Cause:** `AZURE_CLIENT_ID` is incorrect or app registration doesn't exist

**Fix:**
1. Verify client ID in Azure Portal → App registrations
2. Ensure app registration exists
3. Update `AZURE_CLIENT_ID` variable in GitHub

### Azure: "AADSTS70021: No matching federated identity record found"

**Cause:** Federated credential not configured or subject claim mismatch

**Fix:**
1. Verify federated credential exists for the environment
2. Check subject claim format:
   - Expected: `repo:YOUR_ORG/analytics-service:environment:dev`
   - Check workflow logs for actual subject claim
3. Ensure environment name matches exactly (case-sensitive)

### Azure: "Authorization failed"

**Cause:** Service principal doesn't have permissions on resource group

**Fix:**
```bash
az role assignment create \
  --assignee <APPLICATION_ID> \
  --role Contributor \
  --scope /subscriptions/<SUBSCRIPTION_ID>/resourceGroups/analytics-service-dev-rg
```

## Security Best Practices

### 1. Environment-Specific Roles

**AWS:**
```
GitHubActions-AnalyticsService-Dev    → Can only deploy to dev
GitHubActions-AnalyticsService-Staging → Can only deploy to staging
GitHubActions-AnalyticsService-Prod   → Can only deploy to prod
```

**Azure:**
```
Federated credential subject: repo:ORG/REPO:environment:dev
Role assignment scope: /resourceGroups/analytics-service-dev-rg
```

### 2. Least Privilege Permissions

**Only grant permissions needed for deployment:**
- Lambda: Update code, publish versions, update aliases
- API Gateway: Read API details
- S3: Put/Get objects in deployment bucket
- DynamoDB: Describe table (for validation)
- SQS: Get queue attributes (for validation)

**Do NOT grant:**
- IAM permissions (use separate Terraform role)
- Delete permissions (prevent accidental deletion)
- Cross-environment access

### 3. Audit and Monitoring

**AWS CloudTrail:**
```
Filter: userIdentity.principalId contains "GitHubActions"
```

**Azure Activity Log:**
```
Filter: Caller = "GitHub-Actions-AnalyticsService"
```

### 4. Session Naming

Use unique session names for traceability:
```yaml
role-session-name: GitHubActions-${{ github.run_id }}-deploy-green
```

This appears in CloudTrail/Activity Log for audit purposes.

## Migration Checklist

### AWS Migration

- [ ] Create OIDC identity provider in AWS
- [ ] Create IAM roles for each environment (dev, staging, prod)
- [ ] Configure trust policies with GitHub subject claims
- [ ] Attach deployment permissions policies
- [ ] Add `AWS_ROLE_TO_ASSUME` variable in GitHub (per environment)
- [ ] Test deployment to dev environment
- [ ] Verify OIDC authentication in workflow logs
- [ ] Test deployment to staging environment
- [ ] Test deployment to prod environment
- [ ] Remove `AWS_ACCESS_KEY_ID` and `AWS_SECRET_ACCESS_KEY` secrets
- [ ] Update documentation

### Azure Migration

- [ ] Create app registration in Azure AD
- [ ] Create federated credentials for each environment (dev, staging, prod)
- [ ] Create service principal
- [ ] Assign permissions to resource groups
- [ ] Add `AZURE_CLIENT_ID`, `AZURE_TENANT_ID`, `AZURE_SUBSCRIPTION_ID` variables in GitHub
- [ ] Test deployment to dev environment
- [ ] Verify OIDC authentication in workflow logs
- [ ] Test deployment to staging environment
- [ ] Test deployment to prod environment
- [ ] Remove `AZURE_CREDENTIALS` secret
- [ ] Update documentation

## Compliance & Governance

### SOC 2 Compliance

**Control:** Access Control (CC6.1)
- ✅ No long-lived credentials stored in GitHub
- ✅ Automatic credential rotation (1-hour sessions)
- ✅ Audit trail via cloud provider IAM logs

**Control:** Logical and Physical Access Controls (CC6.2)
- ✅ Environment-specific roles prevent cross-environment access
- ✅ Least privilege permissions
- ✅ Federated identity with trust policies

### ISO 27001 Compliance

**A.9.2.1 User registration and de-registration**
- ✅ No manual user credential management
- ✅ Automated identity federation

**A.9.2.2 User access provisioning**
- ✅ Just-in-time access via OIDC tokens
- ✅ Short-lived credentials (1 hour)

**A.9.4.1 Information access restriction**
- ✅ Environment scoping via subject claims
- ✅ Resource-level permissions

## References

### AWS Documentation
- [Configuring OpenID Connect in AWS](https://docs.aws.amazon.com/IAM/latest/UserGuide/id_roles_providers_create_oidc.html)
- [GitHub Actions OIDC with AWS](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-amazon-web-services)
- [aws-actions/configure-aws-credentials](https://github.com/aws-actions/configure-aws-credentials)

### Azure Documentation
- [Workload identity federation](https://learn.microsoft.com/en-us/azure/active-directory/develop/workload-identity-federation)
- [GitHub Actions OIDC with Azure](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/configuring-openid-connect-in-azure)
- [azure/login action](https://github.com/Azure/login)

### GitHub Documentation
- [About security hardening with OIDC](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/about-security-hardening-with-openid-connect)
- [Using OIDC with reusable workflows](https://docs.github.com/en/actions/deployment/security-hardening-your-deployments/using-openid-connect-with-reusable-workflows)

---

**Status:** ✅ **COMPLETE**  
**Date:** 2026-01-09  
**Impact:** Eliminates long-lived credentials, improves security posture, and aligns with compliance requirements
