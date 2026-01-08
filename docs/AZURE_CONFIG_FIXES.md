# Azure Configuration Fixes

## Issues Identified

### 1. Environment Variable Mismatches

**Cosmos DB Configuration:**
- **Bicep provides:** `AZURE_COSMOS_CONNECTION_STRING` (full connection string)
- **Code expects:** `AZURE_COSMOS_ENDPOINT` + `AZURE_COSMOS_KEY` (separate values)
- **Impact:** Cloud provider detection fails, Cosmos client cannot initialize

**Queue Configuration:**
- **Bicep provides:** `AZURE_QUEUE_CONNECTION_STRING`
- **Code expects:** `AZURE_STORAGE_CONNECTION_STRING` (for cloud detection)
- **Impact:** Cloud provider detection fails to recognize Azure

### 2. Cosmos Partition Key Mismatch

**Infrastructure (Bicep):**
- Partition key path: `/pk`
- Expects a top-level `pk` field on documents

**Application Code:**
- Writes: `partitionKey: event.source.appId` (adds field but doesn't use `/pk`)
- Queries: Uses `partitionKey: appId` parameter
- **Impact:** Writes will fail because documents don't have a `pk` field at the root level

## Solutions Implemented

### Solution 1: Update Bicep to Match Code Expectations

**Option A (Chosen):** Parse connection string in code
- Keep Bicep using connection string (more secure, single secret)
- Update code to parse endpoint and key from connection string
- Update cloud detection to use `AZURE_COSMOS_CONNECTION_STRING`

### Solution 2: Fix Cosmos Partition Key

**Option A (Chosen):** Add top-level `pk` field in code
- Update `CosmosEventRepository` to add `pk: event.source.appId` to documents
- Keep Bicep partition key as `/pk`
- Simpler, follows Cosmos best practices (flat partition key)

**Option B (Alternative):** Change Bicep partition key to `/source/appId`
- Would require nested partition key
- Less efficient for Cosmos queries
- Not recommended

## Files Modified

1. `src/config/cloud.ts` - Updated Azure detection to use connection string
2. `src/config/types.ts` - Updated AzureConfig interface
3. `src/infra/azure/cosmos-event-repository.ts` - Added pk field, parse connection string
4. `infra/azure/modules/functionapp.bicep` - Updated env var names for consistency
