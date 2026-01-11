# Retention Configuration Cleanup - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-11  
**Goal:** Clean up retention configuration drift and ensure consistent 12-month policy

---

## Summary

Successfully cleaned up retention configuration inconsistencies:
- ✅ **Azure eventRetentionDays** - Fixed default from 90 to 365 days
- ✅ **AWS event_retention_days** - Removed unused variable, added documentation
- ✅ **Consistent policy** - All infrastructure now reflects 12-month retention
- ✅ **Clear documentation** - Single source of truth established

---

## Acceptance Criteria

- [x] **Cosmos container default TTL reflects 365 days**
  - ✅ Azure main.bicep now defaults to `eventRetentionDays = 365`
  - ✅ Cosmos module receives correct 365-day TTL (31536000 seconds)
  - ✅ Can be overridden per environment if needed

- [x] **No misleading unused "90 days" knobs remain**
  - ✅ AWS unused `event_retention_days` variable removed
  - ✅ Replaced with documentation explaining application-level TTL
  - ✅ Azure 90-day default corrected to 365 days

---

## Problem Analysis

### Issue: Configuration Drift

**Intended Policy (from TTL_RETENTION_COMPLETE.md):**
- 12 months (365 days) retention from event occurrence
- Defined in `src/config/retention.ts`
- Applied per-event in application code

**Actual Infrastructure:**
- ❌ Azure Bicep: `eventRetentionDays = 90` (wrong default)
- ❌ AWS Terraform: `event_retention_days = 90` (unused variable)
- ✅ Application code: Correctly uses 365 days

**Result:** Infrastructure defaults didn't match documented policy

---

## Changes Made

### 1. Azure Bicep - Fixed eventRetentionDays Default

**File:** `infra/azure/main.bicep`

**Before:**
```bicep
@description('Event retention in days (TTL)')
param eventRetentionDays int = 90  // ❌ Wrong default
```

**After:**
```bicep
@description('Event retention in days (TTL) - 12 months per retention policy')
param eventRetentionDays int = 365  // ✅ Correct default
```

**Impact:**
- Cosmos container now defaults to 365-day TTL
- Converts to seconds: `365 * 86400 = 31536000`
- Matches application code behavior
- Can still be overridden per environment if needed

---

### 2. AWS Terraform - Removed Unused Variable

**File:** `infra/aws/variables.tf`

**Before:**
```terraform
variable "event_retention_days" {
  description = "Number of days to retain events in DynamoDB (TTL)"
  type        = number
  default     = 90  // ❌ Unused, misleading
}
```

**After:**
```terraform
# NOTE: DynamoDB TTL is calculated per-event in application code (src/config/retention.ts)
# using the event's occurredAt timestamp + 365 days. This variable is not used by Terraform.
# Retention policy: 12 months (365 days) from event occurrence.
# See: TTL_RETENTION_COMPLETE.md for implementation details.
```

**Why removed:**
- Variable was never referenced in any Terraform resources
- DynamoDB TTL is set per-item in application code, not via Terraform
- Having unused variable was misleading for future changes
- Documentation now explains where TTL is actually configured

---

## Retention Policy - Single Source of Truth

### Application Code (Authoritative)

**File:** `src/config/retention.ts`

```typescript
export const RETENTION_DAYS = 365;  // 12 months
export const RETENTION_SECONDS = 31536000;  // 365 days in seconds
```

**Used by:**
- `src/infra/aws/dynamodb-event-repository.ts` - Sets `expiresAt` per event
- `src/infra/azure/cosmos-event-repository.ts` - Sets `ttl` per event

---

### Infrastructure Configuration

**Azure Bicep:**
```bicep
param eventRetentionDays int = 365  // ✅ Matches application
param rawEventRetentionDays int = 365  // ✅ Consistent
```

**AWS Terraform:**
```terraform
variable "raw_event_retention_days" {
  description = "Number of days to retain raw events in S3"
  type        = number
  default     = 365  // ✅ Matches application
}
```

**Note:** DynamoDB TTL not configured via Terraform (per-event in code)

---

## How TTL Works

### DynamoDB (AWS)

**Implementation:**
```typescript
// src/infra/aws/dynamodb-event-repository.ts
import { calculateExpiresAt } from '../../config/retention.js';

const item = {
  PK: appId,
  SK: `${event.occurredAt}#${event.eventId}`,
  expiresAt: calculateExpiresAt(event.occurredAt),  // Unix timestamp
  ...event
};
```

**Behavior:**
- `expiresAt` = `occurredAt` + 365 days (Unix timestamp)
- DynamoDB automatically deletes when current time > `expiresAt`
- Deletion within 48 hours of expiration
- No Terraform configuration needed

---

### Cosmos DB (Azure)

**Implementation:**
```typescript
// src/infra/azure/cosmos-event-repository.ts
import { calculateCosmosDbTtl } from '../../config/retention.js';

const operations = events.map((event) => ({
  operationType: 'Upsert' as const,
  resourceBody: {
    id: event.eventId,
    pk: event.source.appId,
    ttl: calculateCosmosDbTtl(event.occurredAt),  // Seconds until expiration
    ...event
  }
}));
```

**Behavior:**
- `ttl` = seconds remaining until expiration
- Cosmos automatically deletes when TTL expires
- Container `defaultTtl` is fallback (not used since we set per-document)

---

### Container-Level TTL (Cosmos DB)

**Purpose:** Fallback for documents without explicit `ttl` field

**Configuration:**
```bicep
// infra/azure/modules/cosmosdb.bicep
param defaultTtl int = 31536000  // 365 days in seconds

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  properties: {
    resource: {
      defaultTtl: defaultTtl  // Applied to documents without explicit ttl
    }
  }
}
```

**Note:** Our application sets `ttl` per-document, so `defaultTtl` is rarely used

---

## Retention Periods Summary

| Component | Retention | Configuration Location |
|-----------|-----------|------------------------|
| **DynamoDB Events** | 365 days | Application code (`expiresAt` per event) |
| **Cosmos DB Events** | 365 days | Application code (`ttl` per event) |
| **Cosmos Container Default** | 365 days | Azure Bicep (`eventRetentionDays = 365`) |
| **S3 Raw Events** | 365 days | AWS Terraform (`raw_event_retention_days = 365`) |
| **Azure Blob Raw Events** | 365 days | Azure Bicep (`rawEventRetentionDays = 365`) |
| **SQS Messages** | 14 days | AWS Terraform (`sqs_message_retention`) |
| **CloudWatch Logs** | 30 days | AWS Terraform (`log_retention_days`) |

---

## Why Per-Event TTL?

### Advantages

**1. Precise Retention**
- Each event expires exactly 365 days after it occurred
- Not 365 days from when it was stored
- Handles late-arriving events correctly

**2. Consistent Across Clouds**
- DynamoDB and Cosmos DB both use per-event TTL
- Same logic in application code
- No infrastructure differences

**3. No Batch Expiration**
- Events expire individually as they age
- No sudden large deletions
- Smooth, continuous cleanup

---

### Example

**Event Timeline:**
```
Event occurred:  2026-01-11T12:00:00Z
Event stored:    2026-01-11T12:00:05Z  (5 seconds later)
Event expires:   2027-01-11T12:00:00Z  (365 days from occurrence)
```

**With per-event TTL:**
- ✅ Expires exactly 365 days from occurrence
- ✅ Consistent regardless of storage delay

**With container-level TTL only:**
- ❌ Would expire 365 days from storage time
- ❌ Inconsistent for late-arriving events

---

## Infrastructure Override Options

### Azure - Per Environment

**Development:**
```bash
# Use default 365 days
az deployment group create \
  --template-file main.bicep \
  --parameters environment=dev
```

**Staging (shorter retention for testing):**
```bash
# Override to 90 days
az deployment group create \
  --template-file main.bicep \
  --parameters environment=staging eventRetentionDays=90
```

**Production:**
```bash
# Use default 365 days
az deployment group create \
  --template-file main.bicep \
  --parameters environment=prod
```

---

### AWS - Per Environment

**S3 raw event retention can be overridden:**
```bash
# Development - shorter retention
terraform apply \
  -var="environment=dev" \
  -var="raw_event_retention_days=90"

# Production - full retention
terraform apply \
  -var="environment=prod" \
  -var="raw_event_retention_days=365"
```

**Note:** DynamoDB event TTL cannot be overridden via Terraform (application code)

---

## Documentation Updates

### TTL_RETENTION_COMPLETE.md

**Already correct:**
- ✅ Documents 12-month (365-day) policy
- ✅ Explains per-event TTL implementation
- ✅ Shows code examples

**No changes needed**

---

### Infrastructure README

**Should document:**
- Default retention is 365 days
- Can be overridden per environment
- DynamoDB TTL is application-managed
- Cosmos DB TTL is application-managed with container fallback

---

## Files Modified

1. **`infra/azure/main.bicep`** - Fixed `eventRetentionDays` default from 90 to 365
2. **`infra/aws/variables.tf`** - Removed unused `event_retention_days` variable, added documentation
3. **`RETENTION_CONFIG_CLEANUP_COMPLETE.md`** - This documentation

**Not modified (already correct):**
- `src/config/retention.ts` - Already uses 365 days
- `src/infra/aws/dynamodb-event-repository.ts` - Already uses per-event TTL
- `src/infra/azure/cosmos-event-repository.ts` - Already uses per-event TTL
- `infra/azure/modules/cosmosdb.bicep` - Already defaults to 365 days

---

## Verification Commands

**Check Azure Bicep default:**
```bash
grep -A 1 "eventRetentionDays" infra/azure/main.bicep
# Should show: param eventRetentionDays int = 365
```

**Check AWS Terraform (no event_retention_days variable):**
```bash
grep "event_retention_days" infra/aws/variables.tf
# Should show documentation comment only
```

**Check application code:**
```bash
grep "RETENTION_DAYS" src/config/retention.ts
# Should show: export const RETENTION_DAYS = 365;
```

**Check DynamoDB usage:**
```bash
grep "calculateExpiresAt" src/infra/aws/dynamodb-event-repository.ts
# Should show per-event TTL calculation
```

**Check Cosmos DB usage:**
```bash
grep "calculateCosmosDbTtl" src/infra/azure/cosmos-event-repository.ts
# Should show per-event TTL calculation
```

---

## Benefits

### 1. Consistency

**Before:** Infrastructure defaults (90 days) didn't match application (365 days)  
**After:** All defaults aligned at 365 days

### 2. Clarity

**Before:** Unused AWS variable suggested Terraform controlled TTL  
**After:** Documentation clearly explains application-level TTL

### 3. Correctness

**Before:** Azure deployments would default to 90-day container TTL  
**After:** Azure deployments default to 365-day container TTL

### 4. Maintainability

**Before:** Multiple conflicting retention values  
**After:** Single source of truth in application code

---

## Migration Notes

**No migration needed:**
- Application code already uses 365 days
- Existing events have correct per-event TTL
- Container-level TTL is fallback only

**For new deployments:**
- Azure: Will use 365-day default automatically
- AWS: No change (TTL is application-managed)

**For existing deployments:**
- Azure: Can update parameter to 365 if currently using 90
- AWS: No action needed (variable was unused)

---

## Notes

- **No breaking changes** - Application code unchanged
- **Infrastructure alignment** - Defaults now match documented policy
- **Clear documentation** - Explains where TTL is actually configured
- **Flexibility maintained** - Can still override per environment

---

## Remaining Work

**None** - All acceptance criteria met:
- ✅ Cosmos container default TTL reflects 365 days
- ✅ No misleading unused "90 days" knobs remain
- ✅ Documentation and infrastructure communicate consistent policy
