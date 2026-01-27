# Azure Infrastructure & Pipeline Migration

## Overview

This document describes the migration from the original Azure infrastructure setup to the new standardized template-based approach that aligns with Amua Apps coding standards.

## What Changed

### 1. Infrastructure (Bicep)

**Before:**
- Multi-module setup with separate files for each resource type
- Complex parameter passing between modules
- Located in `infra/azure/main.bicep` + `infra/azure/modules/`

**After:**
- Single consolidated `infra/azure/main-new.bicep` file
- All resources defined inline for better visibility
- Maintains all necessary resources: Cosmos DB, Storage (Queue + Blob), Key Vault, App Insights, Function App with staging slot
- Simplified parameters while keeping analytics-specific configuration

**Key improvements:**
- ✅ Follows template pattern from `docs/infra-templates`
- ✅ Outputs required for blue/green orchestration (`functionAppName`, `productionUrl`, `stagingUrl`, `stagingSlotName`)
- ✅ Removed unnecessary complexity (deployer object ID checks, resource provider validation in Bicep)
- ✅ Cleaner resource naming with consistent unique suffix generation

### 2. CI/CD Scripts

**Before:**
- No dedicated deployment scripts
- All logic embedded in GitHub Actions workflow
- Manual slot swap process

**After:**
- `scripts/ci/deploy-azure-green.sh` - Deploys infrastructure and code to GREEN (staging slot)
- `scripts/ci/switch-azure-bluegreen.sh` - Performs slot swap to promote GREEN to production
- `scripts/ci/rollback-azure-bluegreen.sh` - Rolls back by swapping slots again

**Key improvements:**
- ✅ Follows pipeline contract from `docs/pipeline-templates`
- ✅ Outputs required variables to `$GITHUB_OUTPUT` for pipeline orchestration
- ✅ Idempotent infrastructure deployment
- ✅ Clear separation of concerns (deploy vs switch vs rollback)

### 3. GitHub Actions Workflow

**Before:**
- Monolithic workflow with mixed concerns
- Complex job dependencies
- No clear stage separation
- Manual verification required

**After:**
- Clear 4-stage pipeline: Context/Decide → Test → Build → Deploy GREEN → Verify & Switch
- Standard job names: `context`, `decide`, `test`, `build`, `deploy_azure`, `verify_switch_azure`
- Automated health checks and verification
- Blue/green deployment with automated slot swap

**Key improvements:**
- ✅ Follows template pattern from `docs/pipeline-templates`
- ✅ Path-based triggers for `infra/**` changes
- ✅ Automated verification before traffic switch
- ✅ Environment protection gates via GitHub Environments
- ✅ Cleaner job outputs and dependencies

## Migration Steps

### Step 1: Review New Files

Review the following new files:
- `infra/azure/main-new.bicep` - Consolidated infrastructure
- `scripts/ci/deploy-azure-green.sh` - Deploy script
- `scripts/ci/switch-azure-bluegreen.sh` - Switch script
- `scripts/ci/rollback-azure-bluegreen.sh` - Rollback script
- `.github/workflows/deploy-new.yml` - New 4-stage workflow

### Step 2: Backup Current Setup

```bash
# Backup current files
cp infra/azure/main.bicep infra/azure/main.bicep.backup
cp .github/workflows/deploy.yml .github/workflows/deploy.yml.backup
```

### Step 3: Replace Files

```bash
# Replace infrastructure
mv infra/azure/main-new.bicep infra/azure/main.bicep

# Replace workflow
mv .github/workflows/deploy-new.yml .github/workflows/deploy.yml

# Remove old module files (optional - can keep for reference)
# rm -rf infra/azure/modules/
```

### Step 4: Update Environment Variables

Ensure the following GitHub Environment variables are set for each environment (dev, staging, prod):

**Required:**
- `AZURE_CLIENT_ID` - Service principal client ID for OIDC
- `AZURE_TENANT_ID` - Azure tenant ID
- `AZURE_SUBSCRIPTION_ID` - Azure subscription ID
- `ANALYTICS_WRITE_KEY` (secret) - API authentication key

**Optional (with defaults):**
- `AZURE_LOCATION` - Default: `northeurope`
- `AZURE_FUNCTION_APP_NAME` - Default: `analytics-service-func-{environment}`
- `AZURE_FUNCTION_SKU` - Default: `Y1`
- `LOG_LEVEL` - Default: `debug` (dev/staging), `info` (prod)
- `CORS_ALLOWED_ORIGINS` - Default: `*`
- `EVENT_RETENTION_DAYS` - Default: `365`
- `RAW_EVENT_RETENTION_DAYS` - Default: `365`

### Step 5: Test Deployment

1. **Test on dev environment first:**
   ```bash
   # Trigger workflow manually
   gh workflow run deploy.yml --ref develop
   ```

2. **Monitor the pipeline:**
   - Stage 1 (Test): Runs tests, linting, security checks
   - Stage 2 (Build): Builds TypeScript and creates deployment ZIP
   - Stage 3 (Deploy GREEN): Deploys to staging slot
   - Stage 4 (Verify & Switch): Health checks and slot swap

3. **Verify deployment:**
   ```bash
   # Check function app
   az functionapp show \
     --resource-group analytics-service-dev-rg \
     --name analytics-service-func-dev
   
   # Test health endpoint
   curl https://analytics-service-func-dev.azurewebsites.net/api/health
   ```

### Step 6: Rollback (if needed)

If the deployment fails, you can rollback:

```bash
# Manual rollback via Azure CLI
az functionapp deployment slot swap \
  --resource-group analytics-service-dev-rg \
  --name analytics-service-func-dev \
  --slot staging \
  --target-slot production

# Or use the rollback script
export AZURE_RESOURCE_GROUP="analytics-service-dev-rg"
export AZURE_FUNCTION_APP_NAME="analytics-service-func-dev"
export GREEN_ID="staging"
export BLUE_ID="production"
./scripts/ci/rollback-azure-bluegreen.sh
```

## Breaking Changes

### Removed Features

1. **Deployer Object ID parameter** - No longer needed; Function App managed identity is used for Key Vault access
2. **Resource provider validation in workflow** - Moved to pre-deployment setup documentation
3. **Automatic resource group cleanup** - Removed due to permission issues; manual cleanup if needed
4. **Separate module files** - Consolidated into single Bicep file

### Changed Behavior

1. **Resource naming** - Unique suffix now includes location, so resources will have different names if you change regions
2. **Slot swap** - Now automated in Stage 4 instead of manual
3. **Health checks** - Now automated with retry logic
4. **Deployment artifacts** - Single ZIP file instead of separate packages for AWS/Azure

## Compatibility Notes

### Existing Deployments

The new infrastructure is **compatible** with existing deployments:
- Resource names remain the same (unless you change location)
- All app settings and configuration preserved
- Cosmos DB, Storage, and Key Vault data unchanged
- Function App slots remain intact

### First Deployment with New Setup

On first deployment with the new setup:
1. Infrastructure will be updated in-place (idempotent)
2. New staging slot deployment will occur
3. Slot swap will promote staging to production
4. Previous production code moves to staging slot

## Troubleshooting

### Issue: Deployment fails with "VaultAlreadyExists"

**Solution:** The Key Vault name includes location in the unique suffix. If you changed regions, the vault name changed but a soft-deleted vault may exist. Either:
- Wait 90 days for auto-purge
- Manually purge: `az keyvault purge --name <vault-name>`
- Use a different project name

### Issue: Slot swap fails

**Solution:** Ensure both slots are healthy before swapping:
```bash
# Check staging slot
az functionapp show --resource-group <rg> --name <app> --slot staging

# Check production slot
az functionapp show --resource-group <rg> --name <app>
```

### Issue: Health check fails

**Solution:** Ensure your function app has a health endpoint at `/api/health` that returns 200 OK.

### Issue: Missing environment variables

**Solution:** Check GitHub Environment settings:
```bash
gh variable list --env dev
gh secret list --env dev
```

## Benefits of New Approach

1. **Standardization** - Aligns with Amua Apps templates and coding standards
2. **Automation** - Fully automated blue/green deployments with verification
3. **Safety** - Automated health checks before traffic switch
4. **Simplicity** - Single Bicep file, clear stage separation
5. **Maintainability** - Easier to understand and modify
6. **Consistency** - Same pattern across all Amua services
7. **Rollback** - Easy rollback via slot swap

## Next Steps

1. ✅ Review and test on dev environment
2. ⏳ Deploy to staging environment
3. ⏳ Deploy to production environment
4. ⏳ Remove backup files after successful deployment
5. ⏳ Update README.md with new deployment instructions
6. ⏳ Archive old module files if desired

## Questions or Issues?

If you encounter any issues during migration, refer to:
- `docs/infra-templates/README.md` - Infrastructure template documentation
- `docs/pipeline-templates/README.md` - Pipeline template documentation
- `docs/infra-templates/docs/infra-contract.md` - Infrastructure contract specification
- `docs/pipeline-templates/pipeline-contract.md` - Pipeline contract specification
