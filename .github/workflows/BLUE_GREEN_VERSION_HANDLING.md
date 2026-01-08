# Blue/Green Alias Version Handling for AWS Lambda

This document explains how Lambda function versions and aliases are managed in the blue/green deployment process.

## Problem (Before Fix)

**Issue:**
- All three Lambda functions (ingest, query, processor) shared a single `new_version` output
- The switch step used the same version number for all three aliases
- If functions had different version numbers, aliases would point to incorrect versions

**Example of the problem:**
```yaml
# Stage 3 outputs (WRONG)
outputs:
  new_version: "42"  # Only ingest version captured

# Stage 4 switch (WRONG)
aws lambda update-alias --function-name ingest --function-version 42    # ✅ Correct
aws lambda update-alias --function-name query --function-version 42     # ❌ Wrong (actual: 38)
aws lambda update-alias --function-name processor --function-version 42 # ❌ Wrong (actual: 51)
```

**Risk:**
- Aliases could point to non-existent versions
- Aliases could point to old/wrong versions
- Deployment would fail or behave incorrectly

## Solution (After Fix)

### 1. Capture Individual Versions

**Stage 3: Deploy GREEN (AWS)**

Each function's version is captured separately:

```yaml
outputs:
  ingest_function: ${{ steps.deploy.outputs.ingest_function }}
  query_function: ${{ steps.deploy.outputs.query_function }}
  processor_function: ${{ steps.deploy.outputs.processor_function }}
  ingest_version: ${{ steps.deploy.outputs.ingest_version }}        # ✅ Separate
  query_version: ${{ steps.deploy.outputs.query_version }}          # ✅ Separate
  processor_version: ${{ steps.deploy.outputs.processor_version }}  # ✅ Separate
```

**Deploy step:**
```bash
# Extract version numbers for each function
INGEST_VERSION=$(jq -r '.Version' /tmp/ingest-version.json)
QUERY_VERSION=$(jq -r '.Version' /tmp/query-version.json)
PROCESSOR_VERSION=$(jq -r '.Version' /tmp/processor-version.json)

# Output individual versions
echo "ingest_version=$INGEST_VERSION" >> $GITHUB_OUTPUT
echo "query_version=$QUERY_VERSION" >> $GITHUB_OUTPUT
echo "processor_version=$PROCESSOR_VERSION" >> $GITHUB_OUTPUT
```

### 2. Update Aliases with Correct Versions

**Stage 4: Test & Switch (AWS)**

Each alias is updated with its own function-specific version:

```yaml
env:
  INGEST_VERSION: ${{ needs.deploy-aws-green.outputs.ingest_version }}
  QUERY_VERSION: ${{ needs.deploy-aws-green.outputs.query_version }}
  PROCESSOR_VERSION: ${{ needs.deploy-aws-green.outputs.processor_version }}

run: |
  # Each function uses its own version
  aws lambda update-alias \
    --function-name ${INGEST_FUNCTION} \
    --name live \
    --function-version ${INGEST_VERSION}  # ✅ Correct version
  
  aws lambda update-alias \
    --function-name ${QUERY_FUNCTION} \
    --name live \
    --function-version ${QUERY_VERSION}  # ✅ Correct version
  
  aws lambda update-alias \
    --function-name ${PROCESSOR_FUNCTION} \
    --name live \
    --function-version ${PROCESSOR_VERSION}  # ✅ Correct version
```

### 3. Sanity Check

After switching, verify each alias points to the expected version:

```bash
# Get actual versions from aliases
ACTUAL_INGEST=$(aws lambda get-alias \
  --function-name ${INGEST_FUNCTION} \
  --name live \
  --query 'FunctionVersion' \
  --output text)

ACTUAL_QUERY=$(aws lambda get-alias \
  --function-name ${QUERY_FUNCTION} \
  --name live \
  --query 'FunctionVersion' \
  --output text)

ACTUAL_PROCESSOR=$(aws lambda get-alias \
  --function-name ${PROCESSOR_FUNCTION} \
  --name live \
  --query 'FunctionVersion' \
  --output text)

# Compare expected vs actual
if [ "${ACTUAL_INGEST}" != "${EXPECTED_INGEST_VERSION}" ]; then
  echo "❌ ERROR: Ingest alias version mismatch!"
  exit 1
fi

# ... same for query and processor
```

## Version Flow

```
┌─────────────────────────────────────────────────────────────┐
│ Stage 3: Deploy GREEN                                        │
└─────────────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────┼───────────────────────┐
    ↓                       ↓                       ↓
Ingest v42             Query v38              Processor v51
    ↓                       ↓                       ↓
ingest_version=42      query_version=38       processor_version=51
    │                       │                       │
    └───────────────────────┴───────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Stage 4: Switch to GREEN                                     │
└─────────────────────────────────────────────────────────────┘
                            ↓
    ┌───────────────────────┼───────────────────────┐
    ↓                       ↓                       ↓
Ingest alias → v42     Query alias → v38      Processor alias → v51
    │                       │                       │
    └───────────────────────┴───────────────────────┘
                            ↓
┌─────────────────────────────────────────────────────────────┐
│ Sanity Check: Verify each alias points to correct version   │
└─────────────────────────────────────────────────────────────┘
```

## Example Scenarios

### Scenario 1: All Functions Same Version

```
Deploy:
  Ingest: v10
  Query: v10
  Processor: v10

Switch:
  Ingest alias → v10 ✅
  Query alias → v10 ✅
  Processor alias → v10 ✅

Sanity Check: ✅ PASS
```

### Scenario 2: Different Versions (Common Case)

```
Deploy:
  Ingest: v42 (new code)
  Query: v38 (no changes, reused existing)
  Processor: v51 (new code)

Switch:
  Ingest alias → v42 ✅
  Query alias → v38 ✅
  Processor alias → v51 ✅

Sanity Check: ✅ PASS
```

### Scenario 3: Version Mismatch (Would Fail Before Fix)

**Before fix:**
```
Deploy:
  Ingest: v42
  Query: v38
  Processor: v51
  new_version: v42 (only ingest captured)

Switch:
  Ingest alias → v42 ✅
  Query alias → v42 ❌ (should be v38)
  Processor alias → v42 ❌ (should be v51)

Result: ❌ Aliases point to wrong versions
```

**After fix:**
```
Deploy:
  ingest_version: v42
  query_version: v38
  processor_version: v51

Switch:
  Ingest alias → v42 ✅
  Query alias → v38 ✅
  Processor alias → v51 ✅

Sanity Check: ✅ PASS
```

## Sanity Check Details

### What It Checks

1. **Retrieves actual alias versions** from AWS
2. **Compares** actual vs expected for each function
3. **Fails deployment** if any mismatch detected
4. **Provides clear error messages** for debugging

### Example Output (Success)

```
Verifying alias versions...
Expected vs Actual:
  Ingest: 42 vs 42
  Query: 38 vs 38
  Processor: 51 vs 51

✅ Sanity check passed: All aliases point to correct versions
```

### Example Output (Failure)

```
Verifying alias versions...
Expected vs Actual:
  Ingest: 42 vs 42
  Query: 38 vs 42
  Processor: 51 vs 51

❌ ERROR: Query alias version mismatch!

❌ Sanity check failed: 1 alias(es) pointing to wrong version
```

## Benefits

### ✅ Correctness
- Each alias points to its own function's version
- No version number confusion
- Handles different version numbers correctly

### ✅ Safety
- Sanity check catches mismatches immediately
- Deployment fails fast if versions wrong
- Clear error messages for debugging

### ✅ Flexibility
- Functions can have different version numbers
- No assumption that all versions are the same
- Supports independent function updates

### ✅ Reliability
- Automated verification after switch
- No manual checks needed
- Catches configuration errors

## Lambda Versioning Basics

### How Lambda Versions Work

```
Function: analytics-ingest-dev
├── $LATEST (mutable, always points to latest code)
├── Version 1 (immutable snapshot)
├── Version 2 (immutable snapshot)
├── Version 42 (immutable snapshot) ← New deployment
└── Aliases:
    ├── live → Version 41 (BLUE, current production)
    └── green → Version 42 (GREEN, testing)
```

### Version Numbers

- **Auto-incrementing**: Each publish creates a new version
- **Immutable**: Once published, version cannot be changed
- **Independent**: Each function has its own version sequence

**Example:**
```
Ingest function:
  v1, v2, v3, ..., v42 (latest)

Query function:
  v1, v2, v3, ..., v38 (latest)

Processor function:
  v1, v2, v3, ..., v51 (latest)
```

### Why Versions Can Differ

1. **Code changes**: Only modified functions get new versions
2. **Deployment frequency**: Functions deployed at different times
3. **Rollbacks**: Reverting to older versions
4. **Hotfixes**: Emergency fixes to specific functions

## Troubleshooting

### Error: "Alias version mismatch"

**Cause:** Alias points to wrong version after switch

**Solution:**
```bash
# Check actual alias versions
aws lambda get-alias \
  --function-name analytics-ingest-dev \
  --name live \
  --query 'FunctionVersion'

# Check expected version from deployment
# (Look in GitHub Actions logs for "Deployed versions")

# Manual fix if needed
aws lambda update-alias \
  --function-name analytics-ingest-dev \
  --name live \
  --function-version 42
```

### Error: "Invalid function version"

**Cause:** Trying to point alias to non-existent version

**Solution:**
```bash
# List available versions
aws lambda list-versions-by-function \
  --function-name analytics-ingest-dev \
  --query 'Versions[].Version'

# Use valid version number
aws lambda update-alias \
  --function-name analytics-ingest-dev \
  --name live \
  --function-version <valid-version>
```

### Sanity Check Fails

**Cause:** Alias update didn't complete or used wrong version

**Investigation:**
```bash
# 1. Check GitHub Actions logs for "Switch to GREEN" step
# 2. Verify versions in "Deployed versions" output
# 3. Check "Verify alias versions" step for mismatch details
# 4. Manually verify aliases in AWS Console
```

**Manual Fix:**
```bash
# Update alias to correct version
aws lambda update-alias \
  --function-name <function-name> \
  --name live \
  --function-version <correct-version>

# Verify
aws lambda get-alias \
  --function-name <function-name> \
  --name live
```

## Best Practices

### 1. Always Capture Individual Versions
```bash
# ✅ Good
echo "ingest_version=$INGEST_VERSION" >> $GITHUB_OUTPUT
echo "query_version=$QUERY_VERSION" >> $GITHUB_OUTPUT
echo "processor_version=$PROCESSOR_VERSION" >> $GITHUB_OUTPUT

# ❌ Bad
echo "new_version=$INGEST_VERSION" >> $GITHUB_OUTPUT
```

### 2. Use Function-Specific Variables
```bash
# ✅ Good
--function-version ${INGEST_VERSION}
--function-version ${QUERY_VERSION}
--function-version ${PROCESSOR_VERSION}

# ❌ Bad
--function-version ${NEW_VERSION}  # Same for all
```

### 3. Always Run Sanity Check
```bash
# ✅ Good - verify after switch
- name: Switch to GREEN
  run: |
    # Update aliases...

- name: Verify alias versions
  run: |
    # Check versions match...

# ❌ Bad - no verification
- name: Switch to GREEN
  run: |
    # Update aliases...
    # (no verification)
```

### 4. Log Version Information
```bash
# ✅ Good - clear logging
echo "✅ Deployed versions:"
echo "  Ingest: $INGEST_VERSION"
echo "  Query: $QUERY_VERSION"
echo "  Processor: $PROCESSOR_VERSION"

# ❌ Bad - unclear logging
echo "Deployed version: $NEW_VERSION"
```

## References

- [AWS Lambda Versioning](https://docs.aws.amazon.com/lambda/latest/dg/configuration-versions.html)
- [AWS Lambda Aliases](https://docs.aws.amazon.com/lambda/latest/dg/configuration-aliases.html)
- [Blue/Green Deployments with Lambda](https://docs.aws.amazon.com/lambda/latest/dg/lambda-traffic-shifting-using-aliases.html)
