# Azure Deployment Guide

## Environment Variables

The Azure Function App is configured with the following environment variables via Bicep:

### Cosmos DB Configuration
- `AZURE_COSMOS_CONNECTION_STRING` - Full connection string (includes endpoint and key)
- `AZURE_COSMOS_DATABASE_NAME` - Database name (default: `analytics`)
- `AZURE_COSMOS_CONTAINER_NAME` - Container name (default: `events`)

### Storage Configuration
- `AZURE_STORAGE_CONNECTION_STRING` - Storage account connection string (used for both Queue and Blob)
- `AZURE_QUEUE_NAME` - Queue name for event processing
- `AZURE_BLOB_CONTAINER_NAME` - Blob container name for raw event storage

### Application Configuration
- `NODE_ENV` - Environment (development/staging/production)
- `LOG_LEVEL` - Logging level (debug/info/warn/error)
- `ANALYTICS_WRITE_KEY` - API authentication key
- `CORS_ALLOWED_ORIGINS` - Comma-separated list of allowed origins

### Limits Configuration
- `MAX_PAYLOAD_SIZE_BYTES` - Maximum request payload size (default: 1048576 = 1MB)
- `MAX_EVENTS_PER_BATCH` - Maximum events per batch (default: 100)
- `MAX_QUERY_LIMIT` - Maximum query result limit (default: 200)

## Cosmos DB Container Schema

The Cosmos DB container is configured with:

**Partition Key:** `/pk`
- The `pk` field is set to `appId` (from `event.source.appId`)
- This enables efficient queries scoped to a single application

**Indexes:**
- Automatic indexing on all paths
- Composite indexes recommended for:
  - `pk` + `occurredAt` (time-range queries)
  - `pk` + `userId` (user-specific queries)
  - `pk` + `sessionId` (session-specific queries)

**TTL:** 90 days (7776000 seconds)
- Events are automatically deleted after 90 days
- Configurable via Bicep parameter `defaultTtl`

## Cloud Provider Detection

The application automatically detects Azure when these environment variables are present:
- `AZURE_COSMOS_CONNECTION_STRING`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_QUEUE_NAME`

To force Azure mode, set: `CLOUD_PROVIDER=azure`

## Deployment

Deploy using Azure CLI:

```bash
cd infra/azure

# Login to Azure
az login

# Create resource group
az group create --name rg-analytics-prod --location eastus

# Deploy infrastructure
az deployment group create \
  --resource-group rg-analytics-prod \
  --template-file main.bicep \
  --parameters environment=production \
               analyticsWriteKey="your-secret-key"

# Deploy application code
func azure functionapp publish <function-app-name>
```

## Differences from AWS

| Feature | AWS | Azure |
|---------|-----|-------|
| Database | DynamoDB | Cosmos DB |
| Partition Key | `/pk` (top-level) | `/pk` (top-level) |
| Queue | SQS | Storage Queue |
| Blob Storage | S3 | Blob Storage |
| Connection | Endpoint + Key | Connection String |
| Functions | Lambda | Azure Functions |

## Troubleshooting

### Cloud Provider Not Detected

**Symptom:** Application fails to start with "Cloud provider not detected"

**Solution:** Ensure all required environment variables are set:
```bash
az functionapp config appsettings list \
  --name <function-app-name> \
  --resource-group <resource-group>
```

Verify these are present:
- `AZURE_COSMOS_CONNECTION_STRING`
- `AZURE_STORAGE_CONNECTION_STRING`
- `AZURE_QUEUE_NAME`

### Cosmos DB Write Failures

**Symptom:** Events fail to write with partition key errors

**Solution:** Verify the container partition key is `/pk`:
```bash
az cosmosdb sql container show \
  --account-name <cosmos-account> \
  --database-name analytics \
  --name events \
  --resource-group <resource-group> \
  --query "resource.partitionKey"
```

Should return: `{"paths": ["/pk"], "kind": "Hash"}`

### Queue Connection Issues

**Symptom:** Events not being queued for processing

**Solution:** Verify storage connection string is valid:
```bash
# Test connection
az storage queue list \
  --connection-string "<connection-string>"
```

## Performance Optimization

### Cosmos DB
- Use partition key (`pk` = `appId`) in all queries
- Limit cross-partition queries
- Consider increasing RU/s for high-traffic apps

### Azure Functions
- Use Premium plan for production (better cold start performance)
- Enable Application Insights for monitoring
- Configure auto-scaling based on queue depth

## Security Best Practices

1. **Use Managed Identity** for Cosmos DB and Storage access (future enhancement)
2. **Store secrets in Key Vault** (configured via Bicep)
3. **Enable HTTPS only** (enforced via Bicep)
4. **Restrict CORS origins** to known domains
5. **Rotate analytics write keys** regularly
6. **Enable diagnostic logging** to Log Analytics workspace
