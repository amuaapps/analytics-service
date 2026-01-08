# Deployment Guide

This document provides detailed instructions for deploying the Analytics Service to AWS or Azure.

## Quick Start

### Prerequisites

1. **Repository Setup**
   - Fork or clone the repository
   - Configure GitHub Secrets (see below)
   - Create GitHub Environments (dev, staging, prod)

2. **Cloud Provider Setup**
   - Choose AWS or Azure (or both)
   - Set up cloud credentials
   - Configure infrastructure backend (Terraform state or Azure subscription)

3. **Deploy**
   - Push to `develop` branch → deploys to dev
   - Push to `release` branch → deploys to staging
   - Push to `main` branch → deploys to prod

## GitHub Secrets Configuration

### For AWS Deployment

Navigate to: Settings → Secrets and variables → Actions → New repository secret

**Required Secrets:**
```
AWS_ACCESS_KEY_ID
  Description: AWS access key for deployment
  Value: AKIA...

AWS_SECRET_ACCESS_KEY
  Description: AWS secret access key
  Value: wJalr...

ANALYTICS_WRITE_KEY
  Description: Secret key for API authentication
  Value: your-secret-key-here
```

**Optional Variables:**
```
AWS_REGION
  Description: AWS region for deployment
  Value: us-east-1
```

### For Azure Deployment

**Required Secrets:**
```
AZURE_CREDENTIALS
  Description: Service principal credentials (JSON)
  Value: {
    "clientId": "...",
    "clientSecret": "...",
    "subscriptionId": "...",
    "tenantId": "..."
  }

ANALYTICS_WRITE_KEY
  Description: Secret key for API authentication
  Value: your-secret-key-here
```

### Creating Azure Service Principal

```bash
# Login to Azure
az login

# Create service principal
az ad sp create-for-rbac \
  --name "analytics-service-github" \
  --role contributor \
  --scopes /subscriptions/{subscription-id} \
  --sdk-auth

# Copy the JSON output to AZURE_CREDENTIALS secret
```

## GitHub Environments Setup

### Create Environments

1. Go to Settings → Environments
2. Click "New environment"
3. Create three environments:
   - `dev`
   - `staging`
   - `prod`

### Configure Production Protection

For the `prod` environment:

1. Enable "Required reviewers"
   - Add team members who can approve production deployments
   - Require at least 1 approval

2. Enable "Wait timer" (optional)
   - Set delay before deployment (e.g., 5 minutes)

3. Restrict deployment branches
   - Select "Selected branches"
   - Add `main` branch only

## AWS Infrastructure Setup

### 1. Create Terraform State Backend

```bash
# Set variables
BUCKET_NAME="your-terraform-state-bucket"
REGION="us-east-1"

# Create S3 bucket
aws s3api create-bucket \
  --bucket $BUCKET_NAME \
  --region $REGION

# Enable versioning
aws s3api put-bucket-versioning \
  --bucket $BUCKET_NAME \
  --versioning-configuration Status=Enabled

# Enable encryption
aws s3api put-bucket-encryption \
  --bucket $BUCKET_NAME \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {
        "SSEAlgorithm": "AES256"
      }
    }]
  }'

# Create DynamoDB table for state locking
aws dynamodb create-table \
  --table-name terraform-state-lock \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region $REGION
```

### 2. Configure Terraform Backend

Create `infra/aws/backend.hcl`:

```hcl
bucket         = "your-terraform-state-bucket"
key            = "analytics-service/terraform.tfstate"
region         = "us-east-1"
encrypt        = true
dynamodb_table = "terraform-state-lock"
```

**Important**: Do not commit `backend.hcl` to git (it's in .gitignore)

### 3. Create Parameter Files

Create `infra/aws/terraform.tfvars` for each environment:

```hcl
# terraform.tfvars.dev
environment         = "dev"
aws_region         = "us-east-1"
project_name       = "analytics-service"
analytics_write_key = "dev-write-key"

# terraform.tfvars.staging
environment         = "staging"
aws_region         = "us-east-1"
project_name       = "analytics-service"
analytics_write_key = "staging-write-key"

# terraform.tfvars.prod
environment         = "prod"
aws_region         = "us-east-1"
project_name       = "analytics-service"
analytics_write_key = "prod-write-key"
```

## Azure Infrastructure Setup

### 1. Create Resource Groups

```bash
# Create resource groups for each environment
az group create \
  --name analytics-service-dev-rg \
  --location eastus

az group create \
  --name analytics-service-staging-rg \
  --location eastus

az group create \
  --name analytics-service-prod-rg \
  --location eastus
```

### 2. Create Parameter Files

Create parameter files for each environment:

```json
// parameters.dev.json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environment": { "value": "dev" },
    "location": { "value": "eastus" },
    "projectName": { "value": "analytics-service" },
    "analyticsWriteKey": { "value": "dev-write-key" }
  }
}
```

## Deployment Workflow

### Automatic Deployment (Recommended)

1. **Develop and test locally**
   ```bash
   npm run validate
   npm test
   ```

2. **Create feature branch**
   ```bash
   git checkout -b feature/my-feature
   # Make changes
   git commit -am "Add feature"
   git push origin feature/my-feature
   ```

3. **Create Pull Request**
   - Open PR to `develop` (for dev deployment)
   - Review and approve
   - Merge PR

4. **Automatic deployment**
   - Merge to `develop` → deploys to dev
   - Merge to `release` → deploys to staging
   - Merge to `main` → deploys to prod

### Manual Deployment

1. Go to Actions → Deploy Analytics Service
2. Click "Run workflow"
3. Configure:
   - **Branch**: develop/release/main
   - **Cloud**: auto/aws/azure
   - **Environment**: auto/dev/staging/prod
4. Click "Run workflow"
5. Monitor progress in Actions tab

## Deployment Process

### Stage 1: Test (2-5 minutes)

**What happens:**
- Code checkout
- Dependency installation
- Linting and type checking
- Unit tests with coverage
- CodeQL security analysis
- npm audit

**If fails:**
- Pipeline stops
- No deployment occurs
- Fix issues and retry

### Stage 2: Build (1-2 minutes)

**What happens:**
- TypeScript compilation
- Production dependencies installation
- Deployment package creation
- Artifact upload

**If fails:**
- Pipeline stops
- No deployment occurs
- Check build logs

### Stage 3: Deploy GREEN (3-10 minutes)

**What happens:**

**AWS:**
- Terraform infrastructure update
- New Lambda versions published
- GREEN candidate ready
- Production traffic still on BLUE

**Azure:**
- Bicep infrastructure update
- Code deployed to staging slot
- GREEN slot ready
- Production traffic still on BLUE

**If fails:**
- Pipeline stops
- Production unaffected
- Check deployment logs

### Stage 4: Test & Switch (2-5 minutes)

**What happens:**
- Integration tests against GREEN
- IaC security scans
- **If all pass**: Traffic switched to GREEN
- **If any fail**: Traffic stays on BLUE

**AWS - Traffic Switch:**
```bash
# Update Lambda aliases to new version
aws lambda update-alias \
  --function-name analytics-ingest-prod \
  --name live \
  --function-version 2
```

**Azure - Slot Swap:**
```bash
# Swap staging → production
az functionapp deployment slot swap \
  --resource-group analytics-service-prod-rg \
  --name analytics-func-prod \
  --slot staging
```

## Monitoring Deployments

### During Deployment

1. **GitHub Actions**
   - Watch workflow progress
   - View logs for each stage
   - Check for errors

2. **Cloud Console**
   - AWS: Lambda console, CloudWatch
   - Azure: Function App portal, Application Insights

### After Deployment

1. **Verify Deployment**
   ```bash
   # Test API endpoint
   curl https://your-api-url/health
   
   # Send test event
   curl -X POST https://your-api-url/api/v1/events \
     -H "Content-Type: application/json" \
     -H "X-Analytics-Write-Key: your-key" \
     -d '{"schemaVersion":"1.0.0","events":[...]}'
   ```

2. **Check Metrics**
   - AWS: CloudWatch dashboards
   - Azure: Application Insights

3. **Review Logs**
   - AWS: CloudWatch Logs
   - Azure: Log Analytics

## Rollback Procedures

### Automatic Rollback

If Stage 4 fails, traffic automatically remains on BLUE (previous version).

### Manual Rollback

**AWS:**
```bash
# Get previous version
aws lambda list-versions-by-function \
  --function-name analytics-ingest-prod

# Update alias to previous version
aws lambda update-alias \
  --function-name analytics-ingest-prod \
  --name live \
  --function-version 1
```

**Azure:**
```bash
# Swap slots back
az functionapp deployment slot swap \
  --resource-group analytics-service-prod-rg \
  --name analytics-func-prod \
  --slot staging \
  --target-slot production
```

### Emergency Rollback

If production is broken:

1. **Immediate**: Swap back to previous version (commands above)
2. **Investigate**: Check logs and metrics
3. **Fix**: Create hotfix branch
4. **Deploy**: Push hotfix through pipeline

## Troubleshooting

### Deployment Fails at Stage 1

**Symptoms**: Tests or linting fail

**Solutions:**
```bash
# Run locally
npm run validate
npm test

# Fix issues
npm run lint:fix
npm run format

# Commit and push
git commit -am "Fix tests"
git push
```

### Deployment Fails at Stage 3

**Symptoms**: Infrastructure or deployment errors

**AWS Solutions:**
- Check Terraform state
- Verify AWS credentials
- Check resource quotas
- Review CloudFormation events

**Azure Solutions:**
- Check resource group
- Verify service principal permissions
- Check subscription quotas
- Review deployment logs

### Stage 4 Integration Tests Fail

**Symptoms**: GREEN deployment works but tests fail

**Solutions:**
- Check GREEN endpoint accessibility
- Verify environment variables
- Review test configuration
- Check network connectivity

### Traffic Not Switching

**Symptoms**: Stage 4 passes but traffic still on BLUE

**Solutions:**
- Verify alias/slot status
- Check permissions
- Review workflow logs
- Manually trigger switch

## Best Practices

### Development Workflow

1. **Feature branches**
   - Create from `develop`
   - Name: `feature/description`
   - PR to `develop`

2. **Hotfix branches**
   - Create from `main`
   - Name: `hotfix/description`
   - PR to `main` and `develop`

3. **Release branches**
   - Create from `develop`
   - Name: `release/v1.2.3`
   - PR to `main`

### Testing Strategy

1. **Local testing**
   ```bash
   npm run validate
   npm test
   npm run test:integration
   ```

2. **Dev environment**
   - Deploy frequently
   - Test new features
   - Validate integrations

3. **Staging environment**
   - Production-like testing
   - Performance testing
   - Security testing

4. **Production environment**
   - Stable releases only
   - Require approvals
   - Monitor closely

### Security Practices

1. **Secrets rotation**
   - Rotate regularly (90 days)
   - Use different keys per environment
   - Never commit secrets

2. **Access control**
   - Limit who can deploy to prod
   - Use environment protection
   - Require approvals

3. **Monitoring**
   - Enable alerts
   - Review logs regularly
   - Track security events

## Support

### Getting Help

1. **Check documentation**
   - README.md
   - infra/aws/README.md
   - infra/azure/README.md

2. **Review logs**
   - GitHub Actions logs
   - CloudWatch/Application Insights
   - Infrastructure logs

3. **Contact team**
   - Create GitHub issue
   - Slack channel
   - Email support

### Reporting Issues

When reporting deployment issues, include:
- Workflow run URL
- Error messages
- Environment (dev/staging/prod)
- Cloud provider (AWS/Azure)
- Steps to reproduce
