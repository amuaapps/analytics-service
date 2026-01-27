# Azure Refactoring Summary

## Objective
Refactor Azure deployment infrastructure and pipelines to align with Amua Apps standardized templates while maintaining analytics service functionality.

## Files Created

### Infrastructure
- ✅ `infra/azure/main-new.bicep` - Consolidated Bicep template (ready to replace `main.bicep`)
  - Single-file infrastructure definition
  - Provisions: Storage Account, Cosmos DB, Key Vault, App Insights, Function App with staging slot
  - Outputs: `functionAppName`, `productionUrl`, `stagingUrl`, `stagingSlotName`
  - Extends standard template with analytics-specific resources

### CI/CD Scripts
- ✅ `scripts/ci/deploy-azure-green.sh` - Deploy infrastructure and code to GREEN (staging slot)
  - Idempotent Bicep deployment
  - ZIP deployment to staging slot
  - Outputs: `green_url`, `green_id`, `blue_id`, `active_url` to `$GITHUB_OUTPUT`
  
- ✅ `scripts/ci/switch-azure-bluegreen.sh` - Perform slot swap (GREEN → production)
  - Swaps staging and production slots
  - Promotes GREEN to live traffic
  
- ✅ `scripts/ci/rollback-azure-bluegreen.sh` - Rollback via slot swap
  - Reverts to previous version
  - Swaps slots back

### Pipeline
- ✅ `.github/workflows/deploy-new.yml` - 4-stage pipeline (ready to replace `deploy.yml`)
  - Stage 0: Context & Decide (environment detection, cloud selection)
  - Stage 1: Test (lint, typecheck, tests, security, CodeQL)
  - Stage 2: Build (TypeScript build, deployment ZIP)
  - Stage 3: Deploy GREEN (infrastructure + code to staging slot)
  - Stage 4: Verify & Switch (health checks + slot swap)

### Documentation
- ✅ `MIGRATION.md` - Complete migration guide with step-by-step instructions
- ✅ `REFACTORING_SUMMARY.md` - This file

## Key Improvements

### 1. Alignment with Templates
- ✅ Follows `docs/infra-templates` Bicep structure
- ✅ Follows `docs/pipeline-templates` 4-stage pattern
- ✅ Implements `docs/infra-templates/docs/infra-contract.md` outputs
- ✅ Implements `docs/pipeline-templates/pipeline-contract.md` stages

### 2. Simplified Infrastructure
- **Before:** 5 separate module files + main orchestrator
- **After:** Single consolidated Bicep file
- **Benefit:** Easier to understand, modify, and maintain

### 3. Automated Blue/Green Deployment
- **Before:** Manual slot swap required
- **After:** Fully automated with health checks
- **Benefit:** Safer deployments, faster rollback

### 4. Clear Stage Separation
- **Before:** Monolithic workflow with mixed concerns
- **After:** 4 distinct stages with clear responsibilities
- **Benefit:** Better visibility, easier debugging

### 5. Standardized Job Names
- **Before:** Custom job names (`setup`, `detect-cloud`, `test`, `build`, `deploy-azure-green`)
- **After:** Standard names (`context`, `decide`, `test`, `build`, `deploy_azure`, `verify_switch_azure`)
- **Benefit:** Consistency across all Amua services

## What Was Preserved

### Analytics Service Requirements
- ✅ Cosmos DB for event storage (with TTL)
- ✅ Storage Queue for async processing
- ✅ Storage Blob for raw event backup
- ✅ Key Vault for secrets management
- ✅ Application Insights for monitoring
- ✅ Function App with staging slot
- ✅ All environment-specific configuration parameters

### Security & Compliance
- ✅ OIDC authentication (no long-lived credentials)
- ✅ Managed identities for Key Vault access
- ✅ HTTPS-only endpoints
- ✅ TLS 1.2 minimum
- ✅ Security scanning (CodeQL, npm audit)
- ✅ Least privilege permissions

### Configuration Flexibility
- ✅ Environment-specific variables (dev/staging/prod)
- ✅ Configurable SKU, retention, limits
- ✅ CORS configuration
- ✅ Log level control
- ✅ Multi-cloud support (Azure + AWS stubs)

## What Was Removed

### Unnecessary Complexity
- ❌ Deployer Object ID parameter (now uses managed identity)
- ❌ Resource provider validation in workflow (moved to docs)
- ❌ Automatic resource group cleanup (permission issues)
- ❌ Separate module files (consolidated)
- ❌ Complex parameter passing between modules

### Manual Steps
- ❌ Manual slot swap
- ❌ Manual health verification
- ❌ Manual rollback process

## Issues & Conflicts Identified

### ✅ Resolved Issues

1. **Database Requirement**
   - **Issue:** Template assumes stateless functions; analytics needs Cosmos DB
   - **Resolution:** Extended template to include Cosmos DB with proper configuration

2. **Secrets Management**
   - **Issue:** Template doesn't address secrets handling
   - **Resolution:** Added Key Vault with managed identity access

3. **Environment Configuration**
   - **Issue:** Analytics has many environment-specific settings
   - **Resolution:** Preserved all parameters as Bicep inputs with sensible defaults

### ⚠️ Potential Issues

1. **First Deployment**
   - New resource names if location changed (includes location in unique suffix)
   - May need to purge soft-deleted Key Vault if name conflicts occur
   - **Mitigation:** Documented in MIGRATION.md

2. **Health Endpoint**
   - Pipeline expects `/api/health` endpoint
   - **Mitigation:** Ensure function app implements health check

3. **AWS Support**
   - AWS deployment scripts are stubs (not implemented)
   - **Mitigation:** Documented as TODO, Azure-first approach

## Testing Recommendations

### Pre-Deployment Checks
```bash
# 1. Validate Bicep syntax
az bicep build --file infra/azure/main-new.bicep

# 2. Check environment variables
gh variable list --env dev
gh secret list --env dev

# 3. Verify OIDC configuration
az ad sp show --id $AZURE_CLIENT_ID
```

### Deployment Testing
```bash
# 1. Test on dev environment first
gh workflow run deploy.yml --ref develop

# 2. Monitor pipeline stages
gh run watch

# 3. Verify deployment
az functionapp show \
  --resource-group analytics-service-dev-rg \
  --name analytics-service-func-dev

# 4. Test health endpoint
curl https://analytics-service-func-dev.azurewebsites.net/api/health
```

### Rollback Testing
```bash
# Test rollback script
export AZURE_RESOURCE_GROUP="analytics-service-dev-rg"
export AZURE_FUNCTION_APP_NAME="analytics-service-func-dev"
export GREEN_ID="staging"
export BLUE_ID="production"
./scripts/ci/rollback-azure-bluegreen.sh
```

## Next Actions

### Immediate (Ready to Execute)
1. ✅ Review new files (completed)
2. ⏳ Replace old files with new versions
3. ⏳ Test deployment on dev environment
4. ⏳ Verify blue/green deployment works
5. ⏳ Test rollback mechanism

### Short-term
1. ⏳ Deploy to staging environment
2. ⏳ Deploy to production environment
3. ⏳ Update README.md with new instructions
4. ⏳ Remove backup files after validation

### Long-term
1. ⏳ Implement AWS deployment scripts
2. ⏳ Add more comprehensive health checks
3. ⏳ Consider adding smoke tests in verify stage
4. ⏳ Archive old module files

## Compliance Checklist

### Amua Apps Standards (`docs/agents.md`)
- ✅ MACH principles (Microservices, API-first, Cloud-native, Headless)
- ✅ Independent component (single repo)
- ✅ Loose coupling (API-based communication)
- ✅ Secure by design (OIDC, managed identities, least privilege)
- ✅ Automation & testability (CI/CD, automated tests)
- ✅ TypeScript strict mode
- ✅ Multi-cloud support (Azure implemented, AWS stubbed)

### Infrastructure Contract (`docs/infra-templates/docs/infra-contract.md`)
- ✅ Stage 3 outputs: `green_url`, `green_id`, `blue_id`, `active_url`
- ✅ OIDC authentication (no long-lived credentials)
- ✅ Idempotent deployments
- ✅ Blue/green deployment pattern
- ✅ Rollback capability

### Pipeline Contract (`docs/pipeline-templates/pipeline-contract.md`)
- ✅ Branch to environment mapping (develop→dev, release→staging, main→prod)
- ✅ Cloud selection logic (auto-detect or explicit)
- ✅ Standard job names (context, decide, test, build, deploy_*, verify_switch_*)
- ✅ 4-stage structure (Context/Decide → Test → Build → Deploy → Verify/Switch)
- ✅ Path-based triggers for `infra/**`

## Summary

The refactoring successfully aligns the analytics service with Amua Apps standards while preserving all necessary functionality. The new setup is:

- **Simpler** - Single Bicep file vs multiple modules
- **Safer** - Automated blue/green with health checks
- **Standardized** - Follows template patterns
- **Maintainable** - Clear separation of concerns
- **Extensible** - Easy to add AWS support later

All files are ready for deployment. Recommend testing on dev environment first, then proceeding to staging and production.
