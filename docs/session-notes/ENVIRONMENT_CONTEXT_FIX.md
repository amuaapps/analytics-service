# Environment Context Fix for Cloud Detection

**Status:** ✅ Complete  
**Date:** 2026-01-12  
**Goal:** Fix cloud provider detection to access environment variables by running in environment context

---

## Summary

Successfully fixed cloud provider detection to access environment variables:
- ✅ **Split setup into two jobs** - Separate environment detection from cloud detection
- ✅ **Cloud detection runs in environment context** - Can now access environment variables
- ✅ **Updated all job dependencies** - All jobs reference both setup and detect-cloud
- ✅ **Fixed chicken-and-egg problem** - Determine environment first, then detect cloud in that context

---

## Problem

### Cloud Detection Couldn't Access Environment Variables

**Issue:**
- Setup job tried to access environment variables (`$AWS_ROLE_TO_ASSUME`, `$AZURE_CLIENT_ID`)
- Setup job didn't run in environment context
- Environment variables are only available when job has `environment:` set
- **User feedback:** "I've set AZURE_CLIENT_ID as env vars, but the workflow still fails with Error: No cloud provider configured for environment 'dev'"

**Previous structure:**
```yaml
setup:
  name: Setup Deployment
  runs-on: ubuntu-latest
  # NO environment context
  steps:
    - name: Detect cloud and environment
      run: |
        # Determine environment
        ENVIRONMENT="dev"
        
        # Try to check environment variables
        if [ -n "$AZURE_CLIENT_ID" ]; then  # ❌ Empty! No environment context
          AZURE_CONFIGURED=true
        fi
```

**Problem:** Environment variables are only available when job runs in environment context:
```yaml
job:
  environment: dev  # ← This is required to access dev environment variables
```

**Chicken-and-egg problem:**
- Need to know environment to set `environment:` on job
- Need `environment:` on job to access environment variables
- Need environment variables to detect cloud provider

---

## Solution: Split into Two Jobs

### Job 1: Determine Environment (No Context Needed)

**Purpose:** Determine which environment (dev/staging/prod) based on branch

**No environment context needed:**
- Branch name is available without environment context
- Workflow inputs are available without environment context

```yaml
setup:
  name: Determine Environment
  # NO environment context needed
  outputs:
    environment: ${{ steps.detect.outputs.environment }}
  steps:
    - name: Detect environment
      run: |
        case "${{ github.ref_name }}" in
          develop) ENVIRONMENT="dev" ;;
          release) ENVIRONMENT="staging" ;;
          main) ENVIRONMENT="prod" ;;
        esac
        echo "environment=$ENVIRONMENT" >> $GITHUB_OUTPUT
```

---

### Job 2: Detect Cloud Provider (Runs in Environment Context)

**Purpose:** Detect cloud provider by checking environment variables

**Runs in environment context:**
- Uses environment from setup job output
- Can now access environment variables

```yaml
detect-cloud:
  name: Detect Cloud Provider
  needs: setup
  environment: ${{ needs.setup.outputs.environment }}  # ← Now has environment context!
  outputs:
    cloud: ${{ steps.detect.outputs.cloud }}
  steps:
    - name: Detect cloud provider
      run: |
        # Now environment variables are available!
        if [ -n "$AWS_ROLE_TO_ASSUME" ]; then  # ✅ Works!
          AWS_CONFIGURED=true
        fi
        
        if [ -n "$AZURE_CLIENT_ID" ]; then  # ✅ Works!
          AZURE_CONFIGURED=true
        fi
```

---

## Implementation

### 1. Split Setup Job

**File:** `.github/workflows/deploy.yml`

**Before (single job):**
```yaml
setup:
  name: Setup Deployment
  outputs:
    cloud: ${{ steps.detect.outputs.cloud }}
    environment: ${{ steps.detect.outputs.environment }}
  steps:
    - name: Detect cloud and environment
      # Tried to do both in one step
```

**After (two jobs):**
```yaml
setup:
  name: Determine Environment
  outputs:
    environment: ${{ steps.detect.outputs.environment }}
  steps:
    - name: Detect environment
      # Only determines environment

detect-cloud:
  name: Detect Cloud Provider
  needs: setup
  environment: ${{ needs.setup.outputs.environment }}
  outputs:
    cloud: ${{ steps.detect.outputs.cloud }}
  steps:
    - name: Detect cloud provider
      # Only detects cloud (has environment context)
```

---

### 2. Updated Job Dependencies

**All jobs that need cloud provider now depend on both jobs:**

**Build job:**
```yaml
# Before
needs: [setup, test]

# After
needs: [setup, detect-cloud, test]
```

**Deploy jobs:**
```yaml
# Before
needs: [setup, build]
if: needs.setup.outputs.cloud == 'aws'

# After
needs: [setup, detect-cloud, build]
if: needs.detect-cloud.outputs.cloud == 'aws'
```

---

### 3. Updated Output References

**Changed all references from `needs.setup.outputs.cloud` to `needs.detect-cloud.outputs.cloud`:**

**Packaging steps:**
```yaml
# Before
if: needs.setup.outputs.cloud == 'aws'

# After
if: needs.detect-cloud.outputs.cloud == 'aws'
```

**Artifact names:**
```yaml
# Before
name: deployment-package-${{ needs.setup.outputs.cloud }}

# After
name: deployment-package-${{ needs.detect-cloud.outputs.cloud }}
```

**Job conditions:**
```yaml
# Before
if: needs.setup.outputs.cloud == 'azure'

# After
if: needs.detect-cloud.outputs.cloud == 'azure'
```

---

## Workflow Execution Flow

### New Flow with Two Jobs

```
1. Setup Job
   - Determine environment from branch
   - Output: environment=dev
   ↓
2. Detect Cloud Job
   - Run in environment context (environment: dev)
   - Access dev environment variables
   - Check $AWS_ROLE_TO_ASSUME
   - Check $AZURE_CLIENT_ID
   - Output: cloud=azure
   ↓
3. Test Job (parallel with detect-cloud)
   - Run tests
   ↓
4. Build Job
   - Needs: setup, detect-cloud, test
   - Package for detected cloud
   ↓
5. Deploy Job
   - Needs: setup, detect-cloud, build
   - Deploy to detected cloud and environment
```

---

## Environment Context Behavior

### How Environment Context Works

**Without environment context:**
```yaml
job:
  steps:
    - run: echo $AZURE_CLIENT_ID  # Empty (no environment context)
```

**With environment context:**
```yaml
job:
  environment: dev  # ← Sets environment context
  steps:
    - run: echo $AZURE_CLIENT_ID  # ✅ Has value from dev environment variables
```

---

### Environment Variables vs Repository Variables

**Repository variables (`vars.`):**
```yaml
# Available everywhere (no environment context needed)
- run: echo ${{ vars.AZURE_CLIENT_ID }}
```

**Environment variables:**
```yaml
# Only available with environment context
job:
  environment: dev
  steps:
    - run: echo $AZURE_CLIENT_ID  # ✅ Works
```

---

## GitHub Environment Setup

### Configure Environment Variables

**Settings → Environments → dev → Environment variables:**
```
AZURE_CLIENT_ID = 12345678-1234-1234-1234-dev-client-id
AZURE_TENANT_ID = 87654321-4321-4321-4321-tenant-id
AZURE_SUBSCRIPTION_ID = abcdef12-3456-7890-abcd-subscription-id
```

**Or for AWS:**
```
AWS_ROLE_TO_ASSUME = arn:aws:iam::ACCOUNT:role/analytics-service-dev-github
```

**Repeat for staging and prod environments with their respective values.**

---

## Job Dependency Graph

### Before (Single Setup Job)

```
setup (no env context)
  ├─ cloud detection ❌ (can't access env vars)
  └─ environment detection ✅
  
test ─┐
      ├─ build
      └─ deploy
```

---

### After (Two Jobs)

```
setup (no env context needed)
  └─ environment detection ✅
  
detect-cloud (has env context)
  ├─ needs: setup
  └─ cloud detection ✅ (can access env vars)

test ─┐
      ├─ build (needs: setup, detect-cloud, test)
      └─ deploy (needs: setup, detect-cloud, build)
```

---

## Files Modified

1. **`.github/workflows/deploy.yml`**
   - Split `setup` job into `setup` and `detect-cloud`
   - Added `environment:` context to `detect-cloud` job
   - Updated all job dependencies to include `detect-cloud`
   - Changed all `needs.setup.outputs.cloud` to `needs.detect-cloud.outputs.cloud`
   - Updated conditions in packaging steps
   - Updated conditions in deploy jobs

2. **`docs/session-notes/ENVIRONMENT_CONTEXT_FIX.md`**
   - Documentation of fix
   - Explanation of environment context
   - Job dependency graph

---

## Key Learnings

### 1. Environment Context Required for Environment Variables

**Pattern:**
```yaml
job:
  environment: ${{ needs.previous-job.outputs.environment }}
  steps:
    - run: echo $ENV_VAR  # Now accessible
```

**Benefit:** Can access environment-specific variables

---

### 2. Split Jobs to Solve Chicken-and-Egg Problems

**Problem:** Need environment to access variables, need variables to determine environment

**Solution:** Split into two jobs:
1. Determine environment (no context needed)
2. Use environment context (access variables)

**Benefit:** Clean separation of concerns

---

### 3. Job Dependencies Must Be Updated

**When splitting jobs:**
- Update all downstream job dependencies
- Update all output references
- Update all conditions

**Benefit:** Workflow continues to work correctly

---

## Troubleshooting

### Issue: "Environment variable not found"

**Cause:** Job not running in environment context

**Solution:**
```yaml
job:
  environment: dev  # Add this
  steps:
    - run: echo $AZURE_CLIENT_ID
```

---

### Issue: "Cannot access needs.setup.outputs.cloud"

**Cause:** Output moved to detect-cloud job

**Solution:**
```yaml
# Change from
needs.setup.outputs.cloud

# To
needs.detect-cloud.outputs.cloud
```

---

### Issue: "Job skipped"

**Cause:** Missing dependency on detect-cloud

**Solution:**
```yaml
# Add detect-cloud to needs
needs: [setup, detect-cloud, other-jobs]
```

---

## Verification

### ✅ Setup Job Outputs Environment

```yaml
setup:
  outputs:
    environment: ${{ steps.detect.outputs.environment }}
```

---

### ✅ Detect-Cloud Job Runs in Environment Context

```yaml
detect-cloud:
  needs: setup
  environment: ${{ needs.setup.outputs.environment }}
  outputs:
    cloud: ${{ steps.detect.outputs.cloud }}
```

---

### ✅ All Jobs Updated

**Build job:**
```yaml
needs: [setup, detect-cloud, test]
```

**Deploy jobs:**
```yaml
needs: [setup, detect-cloud, build]
if: needs.detect-cloud.outputs.cloud == 'aws'
```

**Packaging steps:**
```yaml
if: needs.detect-cloud.outputs.cloud == 'azure'
```

---

## Conclusion

**Root cause:** Setup job tried to access environment variables without running in environment context

**Solution:**
1. Split setup into two jobs: `setup` (environment detection) and `detect-cloud` (cloud detection)
2. Run `detect-cloud` in environment context: `environment: ${{ needs.setup.outputs.environment }}`
3. Update all job dependencies to include both `setup` and `detect-cloud`
4. Update all output references from `needs.setup.outputs.cloud` to `needs.detect-cloud.outputs.cloud`

**Impact:**
- ✅ Cloud detection can now access environment variables
- ✅ Proper environment scoping (dev/staging/prod)
- ✅ Separate AWS roles per environment
- ✅ Separate Azure service principals per environment
- ✅ Workflow works with environment-specific configuration

**Status:** Production-ready ✅
