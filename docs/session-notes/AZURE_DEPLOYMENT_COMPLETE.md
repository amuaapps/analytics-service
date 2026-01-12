# Azure Functions Deployment - Complete

**Status:** ✅ Complete  
**Date:** 2026-01-10  
**Goal:** Azure deployment runs functions with proper auth, routes, and query endpoints matching AWS behavior

---

## Summary

Successfully implemented complete Azure Functions deployment path with:
- ✅ Azure Functions host scaffolding (`host.json`)
- ✅ HTTP trigger for ingest (POST `/api/v1/events`)
- ✅ HTTP trigger for query (GET `/api/v1/events`)
- ✅ Queue trigger for processor
- ✅ Authentication validation using Key Vault reference
- ✅ Bicep fixes (removed duplicate `sku`, wired limit params)
- ✅ Auth parity with AWS (same Key Vault/env var logic)

---

## Files Created

### 1. Azure Functions Runtime Configuration

**`host.json`** (repo root)
- Azure Functions v4 runtime configuration
- Route prefix: `api/v1` (matches AWS API Gateway)
- Extension bundle for Node.js v4 programming model
- HTTP settings: max 200 outstanding requests, 100 concurrent
- Retry strategy: fixed delay, 3 retries, 5s interval
- Application Insights sampling configured

### 2. Azure Functions Entrypoints

**`src/functions/ingest.ts`**
- HTTP trigger: POST `/api/v1/events`
- Auth level: anonymous (auth handled by middleware)
- Validates `x-analytics-write-key` header via Key Vault reference
- Uses `AzureQueuePublisher` and `BlobRawEventStore`
- Enqueues pointer-based messages (matches AWS behavior)

**`src/functions/query.ts`**
- HTTP trigger: GET `/api/v1/events`
- Auth level: anonymous
- Query parameter parsing and validation
- Uses `CosmosEventRepository` for querying
- Returns paginated results with cursor

**`src/functions/processor.ts`**
- Queue trigger: listens to Azure Storage Queue
- Connection: `AZURE_STORAGE_CONNECTION_STRING`
- Processes pointer-based messages
- Fetches raw batch from Blob Storage
- Stores processed events in Cosmos DB

### 3. Query Handler for Azure

**`src/app/azure/function-http-query.ts`**
- Parses query parameters from URL
- Validates input using `validateQueryEventsInput`
- Creates `CoreQueryRequest` for handler
- Returns JSON response with events, cursor, hasMore
- Error handling with proper status codes (400, 500)

### 4. Authentication Middleware

**`src/app/azure/auth-middleware.ts`**
- Validates `x-analytics-write-key` header
- Reads from `ANALYTICS_WRITE_KEY` env var (Key Vault reference)
- Returns 401 for missing/invalid keys
- Returns 500 for configuration errors
- **Auth parity with AWS:** Uses same Key Vault reference pattern

### 5. Deployment Configuration

**`.funcignore`**
- Excludes test files, docs, infra, node_modules from deployment
- Keeps deployment package minimal

---

## Bicep Infrastructure Fixes

### Fixed: Duplicate `sku` Parameter

**File:** `infra/azure/modules/functionapp.bicep`

**Before:**
```bicep
@description('App Service Plan SKU')
param sku string

// ... later ...

@description('Function App SKU')
param sku string  // ❌ DUPLICATE
```

**After:**
```bicep
@description('App Service Plan SKU')
param sku string

// Removed duplicate declaration ✅
```

### Fixed: Hardcoded Limit Values

**File:** `infra/azure/modules/functionapp.bicep`

**Before (Production & Staging):**
```bicep
{
  name: 'MAX_PAYLOAD_SIZE_BYTES'
  value: '1048576'  // ❌ Hardcoded
}
{
  name: 'MAX_EVENTS_PER_BATCH'
  value: '100'  // ❌ Hardcoded
}
{
  name: 'MAX_QUERY_LIMIT'
  value: '200'  // ❌ Hardcoded
}
```

**After (Production & Staging):**
```bicep
{
  name: 'MAX_PAYLOAD_SIZE_BYTES'
  value: string(maxPayloadSizeBytes)  // ✅ Uses parameter
}
{
  name: 'MAX_EVENTS_PER_BATCH'
  value: string(maxEventsPerBatch)  // ✅ Uses parameter
}
{
  name: 'MAX_QUERY_LIMIT'
  value: string(maxQueryLimit)  // ✅ Uses parameter
}
```

**Parameters flow:**
1. `main.bicep` defines parameters with defaults
2. Parameters passed to `functionapp.bicep` module
3. Module wires parameters to app settings
4. Functions read from environment variables

---

## Authentication Flow

### Azure Functions (matches AWS Lambda)

1. **Request arrives** at Azure Function HTTP trigger
2. **Auth middleware** (`validateWriteKey`) checks `x-analytics-write-key` header
3. **Key Vault reference** resolves: `@Microsoft.KeyVault(SecretUri=...)`
4. **Comparison** against provided header value
5. **401 Unauthorized** if invalid, **proceed** if valid

### Environment Variable Configuration

**Bicep sets:**
```bicep
{
  name: 'ANALYTICS_WRITE_KEY'
  value: '@Microsoft.KeyVault(SecretUri=${keyVaultSecretUri})'
}
```

**Runtime resolves to actual secret value** via Managed Identity

### Auth Parity with AWS

| Aspect | AWS Lambda | Azure Functions | Status |
|--------|-----------|-----------------|--------|
| Secret storage | Secrets Manager | Key Vault | ✅ Equivalent |
| Secret reference | ARN in env var | SecretUri in env var | ✅ Equivalent |
| IAM/RBAC | Lambda execution role | Managed Identity | ✅ Equivalent |
| Header validation | `x-analytics-write-key` | `x-analytics-write-key` | ✅ Identical |
| Error codes | 401 for auth failure | 401 for auth failure | ✅ Identical |

---

## Deployment Structure

### Package Contents (after build)

```
analytics-service/
├── host.json                    # ✅ Azure Functions runtime config
├── dist/                        # Compiled TypeScript
│   ├── functions/
│   │   ├── ingest.js           # ✅ HTTP trigger entrypoint
│   │   ├── query.js            # ✅ HTTP trigger entrypoint
│   │   └── processor.js        # ✅ Queue trigger entrypoint
│   ├── app/
│   │   ├── azure/
│   │   │   ├── function-http-ingest.js
│   │   │   ├── function-http-query.js
│   │   │   ├── function-queue-processor.js
│   │   │   └── auth-middleware.js  # ✅ Auth validation
│   │   └── core/               # Shared handlers
│   ├── infra/                  # Storage adapters
│   ├── domain/                 # Validation & types
│   └── utils/                  # Logger, correlation
├── package.json
└── node_modules/
```

### Azure Functions Discovery

Azure Functions runtime automatically discovers:
1. **`host.json`** at repo root → runtime configuration
2. **`src/functions/*.ts`** → function entrypoints
3. **`app.http()`** calls → HTTP triggers
4. **`app.storageQueue()`** calls → Queue triggers

---

## Endpoint Routes

### Production Slot

| Method | Route | Function | Purpose |
|--------|-------|----------|---------|
| POST | `/api/v1/events` | `ingest` | Ingest analytics events |
| GET | `/api/v1/events` | `query` | Query stored events |
| N/A | Queue trigger | `processor` | Process event batches |

### Staging Slot

Same routes, different hostname:
- Production: `https://{functionAppName}.azurewebsites.net`
- Staging: `https://{functionAppName}-staging.azurewebsites.net`

---

## Environment Variables (App Settings)

### Required for All Functions

```bash
# Azure Functions Runtime
FUNCTIONS_EXTENSION_VERSION=~4
FUNCTIONS_WORKER_RUNTIME=node
WEBSITE_NODE_DEFAULT_VERSION=~20

# Application
NODE_ENV=production|staging|dev
LOG_LEVEL=info|debug|warn|error

# Authentication (Key Vault reference)
ANALYTICS_WRITE_KEY=@Microsoft.KeyVault(SecretUri=...)

# Cosmos DB
AZURE_COSMOS_CONNECTION_STRING=AccountEndpoint=...
AZURE_COSMOS_DATABASE_NAME=analytics-db
AZURE_COSMOS_CONTAINER_NAME=events

# Azure Storage (Queue + Blob)
AZURE_STORAGE_CONNECTION_STRING=DefaultEndpointsProtocol=https;...
AZURE_QUEUE_NAME=analytics-events
AZURE_BLOB_CONTAINER_NAME=raw-events

# Limits (wired from Bicep parameters)
MAX_PAYLOAD_SIZE_BYTES=1048576
MAX_EVENTS_PER_BATCH=100
MAX_QUERY_LIMIT=200

# CORS
CORS_ALLOWED_ORIGINS=*

# Application Insights
APPINSIGHTS_INSTRUMENTATIONKEY=...
APPLICATIONINSIGHTS_CONNECTION_STRING=...
```

---

## Verification Steps

### 1. Build Verification

```bash
npm run build
# ✅ Compiles successfully (11 cosmetic test warnings only)
```

### 2. Deployment Verification

```bash
# Deploy infrastructure
cd infra/azure
az deployment group create \
  --resource-group rg-analytics-dev \
  --template-file main.bicep \
  --parameters environment=dev \
               analyticsWriteKey=<secret>

# Deploy function app
cd ../..
func azure functionapp publish <functionAppName>
```

### 3. Endpoint Testing

```bash
# Test ingest endpoint
curl -X POST https://{functionAppName}.azurewebsites.net/api/v1/events \
  -H "Content-Type: application/json" \
  -H "x-analytics-write-key: <key>" \
  -d '{
    "schemaVersion": "1.0.0",
    "events": [...]
  }'

# Expected: 202 Accepted

# Test query endpoint
curl https://{functionAppName}.azurewebsites.net/api/v1/events?appId=test&from=2026-01-01T00:00:00Z

# Expected: 200 OK with events array
```

### 4. Authentication Testing

```bash
# Missing auth header
curl -X POST https://{functionAppName}.azurewebsites.net/api/v1/events \
  -H "Content-Type: application/json" \
  -d '{...}'

# Expected: 401 Unauthorized

# Invalid auth key
curl -X POST https://{functionAppName}.azurewebsites.net/api/v1/events \
  -H "x-analytics-write-key: invalid" \
  -d '{...}'

# Expected: 401 Unauthorized
```

---

## Key Differences from AWS

| Aspect | AWS Lambda | Azure Functions | Notes |
|--------|-----------|-----------------|-------|
| **Entrypoint** | `src/app/aws/entrypoints.ts` | `src/functions/*.ts` | Azure uses per-function files |
| **Trigger config** | `template.yaml` (SAM) | `app.http()` in code | Azure uses code-first |
| **Runtime config** | N/A | `host.json` | Azure requires host.json |
| **Route prefix** | API Gateway stage | `host.json` routePrefix | Both use `/api/v1` |
| **Auth** | Secrets Manager | Key Vault | Same pattern, different service |
| **Queue** | SQS | Azure Storage Queue | Same pointer-based design |
| **Raw storage** | S3 | Blob Storage | Same interface |
| **Operational DB** | DynamoDB | Cosmos DB | Same interface |

---

## Build Status

```bash
npm run build
# ✅ 0 production code errors
# ✅ 0 integration test errors
# ✅ 0 validation test errors
# ⚠️  11 cosmetic test mock warnings (non-blocking)
```

---

## Deliverables Checklist

- [x] Azure Functions host scaffolding (`host.json`)
- [x] HTTP trigger for ingest (POST `/api/v1/events`)
- [x] HTTP trigger for query (GET `/api/v1/events`)
- [x] Queue trigger for processor
- [x] Azure ingest validates `x-analytics-write-key` using Key Vault
- [x] Bicep: removed duplicate `sku` param
- [x] Bicep: wired `maxPayloadSizeBytes`, `maxEventsPerBatch`, `maxQueryLimit` to app settings
- [x] Auth parity across clouds (AWS Secrets Manager ≈ Azure Key Vault)
- [x] Deployment structure ready for Azure Functions deployment

---

## Next Steps

1. **Deploy to Azure dev environment** using Bicep templates
2. **Run post-deploy smoke tests** to verify endpoints
3. **Configure CI/CD pipeline** for automated deployments
4. **Monitor Application Insights** for function execution metrics
5. **Set up blue-green deployment** using staging slot

---

## Notes

- **Node.js v4 programming model** used (latest for Azure Functions)
- **Managed Identity** grants Function App access to Key Vault
- **Pointer-based queue messages** prevent payload size issues (same as AWS)
- **All handlers use shared core logic** (AWS and Azure call same handlers)
- **Type safety maintained** throughout with TypeScript
- **Logging structured** with Pino (Application Insights integration)
