# Terraform Secret Management Fix - Complete ✅

## Problem

The GitHub Actions workflow was failing with:

```
Error: Missing required variable: analytics_write_key
```

**Root Cause:**
- Terraform Plan step included `TF_VAR_analytics_write_key`
- Terraform Apply step did NOT include `TF_VAR_analytics_write_key`
- Terraform requires all variables referenced in configuration to be set during apply

**Security Issue:**
- Passing secrets through Terraform variables stores them in Terraform state
- Secret values appear in Terraform plan output (visible in CI logs)

## Solution

Implemented best-practice secret management following agents.md Section 8.4:

### 1. Terraform Creates Secret Resource (No Value)

Removed `aws_secretsmanager_secret_version` resource. Terraform only manages secret structure.

### 2. Removed Variable from Terraform

Removed `analytics_write_key` variable from `infra/aws/variables.tf`.

### 3. Updated Workflow to Set Secret Value

Added dedicated step "Update Analytics Write Key Secret" that:
- Gets secret name from Terraform output
- Sets secret value via AWS CLI
- Runs after Terraform Apply

## Benefits

✅ **Deterministic Terraform Apply** - Plan and apply use identical variables
✅ **Secret Never in State** - Terraform state only contains resource metadata
✅ **Secret Never in Logs** - AWS CLI auto-masks secret values
✅ **Compliance** - Meets agents.md Section 8.4 requirements

## Files Changed

1. `infra/aws/secrets.tf` - Removed secret_version resource
2. `infra/aws/variables.tf` - Removed analytics_write_key variable
3. `.github/workflows/deploy.yml` - Added secret update step
4. `docs/SECRET_MANAGEMENT.md` - Updated documentation

---

**Status:** ✅ **COMPLETE**  
**Date:** 2026-01-09
