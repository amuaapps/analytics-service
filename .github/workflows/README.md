# GitHub Actions Workflows

This directory contains CI/CD workflows for the Analytics Service with multi-cloud support.

## Overview

The deployment pipeline supports both AWS and Azure with automatic cloud detection and a four-stage deployment process with blue/green deployment.

## Workflows

### Main Deployment Workflow (`deploy.yml`)

**Triggers:**
- Push to `develop` → deploys to `dev` environment
- Push to `release` → deploys to `staging` environment
- Push to `main` → deploys to `prod` environment
- Manual dispatch with optional cloud and environment selection

**Four-Stage Pipeline:**

1. **Stage 1 - Test**
   - Linting (ESLint)
   - Type checking (TypeScript)
   - Format checking (Prettier)
   - Unit tests with coverage thresholds
   - CodeQL security analysis
   - npm audit for vulnerabilities

2. **Stage 2 - Build**
   - Build TypeScript to JavaScript
   - Create deployment packages
   - Package for AWS Lambda (zip)
   - Package for Azure Functions (zip)
   - Upload artifacts

3. **Stage 3 - Deploy GREEN**
   - **AWS**: Deploy new Lambda versions without switching traffic
   - **Azure**: Deploy to staging slot without swapping
   - Apply infrastructure changes (Terraform/Bicep)
   - Production traffic remains on BLUE

4. **Stage 4 - Test & Switch**
   - Run integration tests against GREEN
   - Run IaC security scans
   - **If all pass**: Switch traffic to GREEN
     - AWS: Update Lambda aliases to new version
     - Azure: Swap staging → production slots
   - **If any fail**: Keep traffic on BLUE, rollback if needed

## Cloud Provider Detection

The workflow automatically detects which cloud provider to use:

### Auto-Detection Logic

1. **Manual selection** (workflow_dispatch): Use specified cloud
2. **Auto-detect**:
   - If only AWS configured → use AWS
   - If only Azure configured → use Azure
   - If both configured → fail (must specify)
   - If neither configured → fail with instructions

### Required Secrets

**AWS:**
- `AWS_ACCESS_KEY_ID`
- `AWS_SECRET_ACCESS_KEY`
- `ANALYTICS_WRITE_KEY`

**Azure:**
- `AZURE_CREDENTIALS` (service principal JSON)
- `ANALYTICS_WRITE_KEY`

**Both:**
- `CODECOV_TOKEN` (optional, for coverage reporting)

### Required Variables

**AWS:**
- `AWS_REGION` (default: us-east-1)

**Azure:**
- `AZURE_RESOURCE_GROUP_PREFIX` (optional)

## Environment Configuration

### GitHub Environments

Create three environments in your repository settings:
- `dev` - Development environment
- `staging` - Staging environment
- `prod` - Production environment (with protection rules)

### Protection Rules (Recommended for `prod`)

- Require approval from designated reviewers
- Restrict to specific branches (`main` only)
- Wait timer (optional delay before deployment)

## Usage

### Automatic Deployment

Push to the appropriate branch:

```bash
# Deploy to dev
git push origin develop

# Deploy to staging
git push origin release

# Deploy to prod
git push origin main
```

### Manual Deployment

1. Go to Actions → Deploy Analytics Service
2. Click "Run workflow"
3. Select:
   - **Branch**: develop/release/main
   - **Cloud**: auto/aws/azure
   - **Environment**: auto/dev/staging/prod
4. Click "Run workflow"

## Blue/Green Deployment

### AWS (Lambda Aliases)

**Before Stage 4:**
```
Lambda v1 → Alias "live" → API Gateway (BLUE - production traffic)
Lambda v2 (deployed, not receiving traffic)
```

**After Stage 4 passes:**
```
Lambda v1 (kept for rollback)
Lambda v2 → Alias "live" → API Gateway (GREEN - production traffic)
```

**Rollback:**
```bash
aws lambda update-alias \
  --function-name analytics-ingest-prod \
  --name live \
  --function-version 1
```

### Azure (Deployment Slots)

**Before Stage 4:**
```
Production slot (BLUE - production traffic)
Staging slot (GREEN - new version, no traffic)
```

**After Stage 4 passes:**
```
Production slot (GREEN - production traffic, was staging)
Staging slot (BLUE - previous version, was production)
```

**Rollback:**
```bash
az functionapp deployment slot swap \
  --resource-group analytics-service-prod-rg \
  --name analytics-func-prod \
  --slot staging \
  --target-slot production
```

## Failure Handling

### Stage 1 Failure (Test)
- Pipeline stops
- No deployment occurs
- Fix issues and push again

### Stage 2 Failure (Build)
- Pipeline stops
- No deployment occurs
- Fix build issues and push again

### Stage 3 Failure (Deploy GREEN)
- Pipeline stops
- Production traffic unaffected (still on BLUE)
- Fix infrastructure/deployment issues

### Stage 4 Failure (Test & Switch)
- **Critical**: Traffic remains on BLUE
- GREEN deployment exists but not receiving traffic
- Manual intervention may be needed
- Check logs and fix issues
- Re-run workflow or rollback

## Monitoring Deployments

### View Workflow Runs

1. Go to Actions tab
2. Click on "Deploy Analytics Service"
3. Select a workflow run
4. View logs for each job

### Check Deployment Status

**AWS:**
```bash
# Check Lambda alias
aws lambda get-alias \
  --function-name analytics-ingest-prod \
  --name live

# Check API Gateway
aws apigatewayv2 get-apis
```

**Azure:**
```bash
# Check Function App slots
az functionapp show \
  --resource-group analytics-service-prod-rg \
  --name analytics-func-prod

# Check which slot is production
az functionapp deployment slot list \
  --resource-group analytics-service-prod-rg \
  --name analytics-func-prod
```

## Troubleshooting

### Cloud Detection Fails

**Error**: "Both AWS and Azure are configured"
- **Solution**: Use workflow_dispatch and specify cloud explicitly

**Error**: "No cloud provider configured"
- **Solution**: Configure required secrets (AWS or Azure)

### Stage 1 Failures

**Linting errors:**
```bash
npm run lint:fix
```

**Type errors:**
```bash
npm run typecheck
```

**Test failures:**
```bash
npm test
```

**Security vulnerabilities:**
```bash
npm audit fix
```

### Stage 3 Failures

**Terraform/Bicep errors:**
- Check infrastructure code
- Verify cloud credentials
- Check resource quotas

**Lambda/Function App deployment:**
- Verify artifact was created
- Check function app configuration
- Review deployment logs

### Stage 4 Failures

**Integration tests fail:**
- Check GREEN endpoint is accessible
- Verify environment variables
- Review test logs

**Traffic not switching:**
- Check alias/slot status
- Verify permissions
- Review workflow logs

## Security Considerations

### Secrets Management

- Never commit secrets to repository
- Use GitHub Secrets for sensitive data
- Rotate secrets regularly
- Use least-privilege IAM roles

### Infrastructure Security

- IaC scanning in Stage 4
- CodeQL analysis in Stage 1
- npm audit in Stage 1
- Regular dependency updates

### Deployment Security

- Blue/green ensures zero-downtime
- Failed deployments don't affect production
- Rollback capability maintained
- Environment protection rules

## Performance Optimization

### Caching

- Node modules cached between runs
- Terraform state cached
- Build artifacts cached

### Parallel Execution

- Test and CodeQL run in parallel
- Independent cloud deployments

### Artifact Reuse

- Build once, deploy multiple times
- Immutable artifacts ensure consistency

## Cost Optimization

### AWS

- Lambda: Pay per invocation
- API Gateway: Pay per request
- DynamoDB: On-demand billing
- S3: Lifecycle policies

### Azure

- Function App: Consumption plan
- Cosmos DB: Serverless
- Storage: Lifecycle management
- Application Insights: Sampling

## Compliance & Auditing

### Deployment Tracking

- All deployments logged in Actions
- Commit SHA tracked
- Deployment time recorded
- Approvals tracked (prod)

### Rollback History

- Previous versions retained
- Quick rollback capability
- Audit trail maintained

## Best Practices

1. **Always test locally first**
   ```bash
   npm run validate
   ```

2. **Use feature branches**
   - Create PR to develop/release/main
   - Review before merging
   - Automatic deployment on merge

3. **Monitor after deployment**
   - Check Application Insights/CloudWatch
   - Verify metrics
   - Watch for errors

4. **Plan rollbacks**
   - Know rollback procedure
   - Test rollback in dev/staging
   - Document rollback steps

5. **Protect production**
   - Enable environment protection
   - Require approvals
   - Limit who can deploy

## Additional Resources

- [GitHub Actions Documentation](https://docs.github.com/en/actions)
- [AWS Lambda Aliases](https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html)
- [Azure Deployment Slots](https://docs.microsoft.com/azure/azure-functions/functions-deployment-slots)
- [Blue/Green Deployments](https://martinfowler.com/bliki/BlueGreenDeployment.html)
