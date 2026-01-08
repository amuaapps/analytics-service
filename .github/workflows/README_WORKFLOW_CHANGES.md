# GitHub Actions Workflow Changes - Hardening Update

This document explains the changes made to `.github/workflows/deploy.yml` to improve reliability and security.

## Changes Summary

### 1. Concurrency Control

**Added:**
```yaml
concurrency:
  group: deploy-${{ github.ref_name }}-${{ github.event.inputs.environment || 'auto' }}
  cancel-in-progress: false
```

**Purpose:**
- Prevents concurrent deployments to the same environment
- Serializes deployments triggered in quick succession
- Avoids race conditions in Terraform applies and Lambda alias updates

**Behavior:**
- Two deploys to `develop` branch will queue (second waits for first)
- Deploys to different branches run in parallel (e.g., `develop` and `main`)
- `cancel-in-progress: false` ensures in-flight deployments complete (no cancellation)

**Example:**
```
Time 0s:  Push to develop (Deploy A starts)
Time 5s:  Push to develop (Deploy B queued, waits)
Time 60s: Deploy A completes
Time 61s: Deploy B starts
```

### 2. Minimal Permissions (Least Privilege)

**Added:**
```yaml
permissions:
  contents: read
  id-token: write  # For OIDC if needed in future
  actions: read
```

**Purpose:**
- Follows principle of least privilege
- Limits workflow permissions to only what's needed
- Reduces security risk if workflow is compromised

**Permissions Explained:**
- `contents: read` - Read repository code (required for checkout)
- `id-token: write` - Generate OIDC tokens (for future AWS/Azure OIDC auth)
- `actions: read` - Read workflow artifacts (required for download-artifact)

**CodeQL Job Override:**
```yaml
permissions:
  security-events: write  # Required for CodeQL
  actions: read
  contents: read
  packages: read
```

### 3. Fixed Dependency Installation (Dev vs Prod)

**Problem:**
- Build job was using `npm ci --production` which excludes dev dependencies
- TypeScript, ESLint, Jest are dev dependencies
- Build, lint, and typecheck commands were failing

**Solution:**

**Build Job (Stage 2):**
```yaml
# Before (BROKEN)
- name: Install dependencies
  run: npm ci --production

# After (FIXED)
- name: Install dependencies (with dev dependencies for build tools)
  run: npm ci
```

**Deployment Package:**
```yaml
- name: Create deployment package (prod dependencies only)
  run: |
    mkdir -p dist/deployment
    cp -r dist/* dist/deployment/
    cp package.json package-lock.json dist/deployment/
    cd dist/deployment
    npm ci --production --ignore-scripts  # Prod-only in package
    cd ../..
```

**Key Points:**
- Build job uses `npm ci` (all dependencies) for TypeScript/ESLint/Jest
- Deployment package uses `npm ci --production` (slim package)
- Separation ensures build tools available but deployment stays lean

**Test/Switch Jobs (Stage 4):**
```yaml
# Already correct - uses npm ci for Jest
- name: Install dependencies
  run: npm ci
```

## Dependency Installation Strategy

### Stage 1: Test
```yaml
npm ci  # All dependencies (dev + prod)
```
**Needs:** ESLint, TypeScript, Jest, Prettier
**Result:** Full test suite runs

### Stage 2: Build
```yaml
npm ci  # All dependencies (dev + prod)
```
**Needs:** TypeScript compiler, build tools
**Result:** TypeScript compiles successfully

**Then create slim package:**
```yaml
cd dist/deployment
npm ci --production  # Prod-only
```
**Result:** Deployment zip contains only runtime dependencies

### Stage 4: Test & Switch
```yaml
npm ci  # All dependencies (dev + prod)
```
**Needs:** Jest for post-deploy integration tests
**Result:** Integration tests run against GREEN

## Deployment Package Size Comparison

**Before (BROKEN):**
- Build failed (no TypeScript compiler)

**After (FIXED):**
- Build succeeds with dev dependencies
- Deployment package: ~5-10MB (prod-only)
- Full node_modules: ~150MB (dev + prod)

## Concurrency Examples

### Example 1: Rapid Pushes to Same Branch
```
10:00:00 - Push to develop (Commit A)
10:00:05 - Push to develop (Commit B)

Result:
- Deploy A starts immediately
- Deploy B queued (waits for A)
- Deploy A completes at 10:05:00
- Deploy B starts at 10:05:01
```

### Example 2: Pushes to Different Branches
```
10:00:00 - Push to develop
10:00:05 - Push to main

Result:
- Both deploy in parallel (different concurrency groups)
- develop → dev environment
- main → prod environment
```

### Example 3: Manual Dispatch
```
10:00:00 - Workflow dispatch (develop, dev)
10:00:10 - Workflow dispatch (develop, staging)

Result:
- Both deploy in parallel (different environments)
- First deploys to dev
- Second deploys to staging
```

## Security Improvements

### Before
```yaml
# No permissions block - defaults to permissive
```

### After
```yaml
permissions:
  contents: read      # Minimal read access
  id-token: write     # OIDC tokens only
  actions: read       # Artifact access only
```

**Benefits:**
- Cannot write to repository
- Cannot modify workflow files
- Cannot access secrets beyond what's explicitly used
- Follows GitHub security best practices

## Testing the Changes

### Test 1: Build Job
```bash
# Locally simulate build job
npm ci
npm run build
npm run lint
npm run typecheck

# All should succeed
```

### Test 2: Deployment Package
```bash
# Simulate deployment package creation
npm ci
npm run build
mkdir -p dist/deployment
cp -r dist/* dist/deployment/
cp package.json package-lock.json dist/deployment/
cd dist/deployment
npm ci --production --ignore-scripts
ls -lh node_modules  # Should be smaller

# Verify only prod dependencies
npm ls --production
```

### Test 3: Concurrency
```bash
# Trigger two deploys quickly
git commit --allow-empty -m "Test 1"
git push origin develop

# Within 5 seconds
git commit --allow-empty -m "Test 2"
git push origin develop

# Check Actions tab - second should queue
```

## Troubleshooting

### Build Job Fails with "tsc: command not found"
**Cause:** Using `npm ci --production` in build job
**Fix:** Use `npm ci` (without --production flag)

### Deployment Package Too Large
**Cause:** Including dev dependencies in deployment package
**Fix:** Ensure `npm ci --production` in deployment directory

### Concurrent Deploys Racing
**Cause:** Missing concurrency block
**Fix:** Concurrency block added at workflow level

### Permission Denied Errors
**Cause:** Insufficient permissions
**Fix:** Add required permission to permissions block or job-level override

## Migration Notes

### For Existing Deployments
- No migration needed
- Changes are backward compatible
- Next deployment will use new concurrency rules

### For Contributors
- No changes to local development workflow
- `npm ci` continues to work as before
- Deployment artifacts automatically optimized

## References

- [GitHub Actions Concurrency](https://docs.github.com/en/actions/using-jobs/using-concurrency)
- [GitHub Actions Permissions](https://docs.github.com/en/actions/security-guides/automatic-token-authentication#permissions-for-the-github_token)
- [npm ci documentation](https://docs.npmjs.com/cli/v10/commands/npm-ci)
