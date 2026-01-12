# Azure Infrastructure (Bicep)

This directory contains Bicep templates for deploying the Analytics Service to Azure.

## Architecture

- **Function App**: Node.js functions for HTTP triggers (ingest/query) and queue trigger (processor)
- **Cosmos DB**: NoSQL database for operational event storage with TTL
- **Storage Account**:
  - **Queue**: Event processing queue with poison message handling
  - **Blob Container**: Raw event storage with lifecycle management
- **Key Vault**: Secure storage for secrets (write keys)
- **Application Insights**: Monitoring and telemetry

## Blue/Green Deployment

The infrastructure supports blue/green deployments using **deployment slots**:
- **Production slot** (BLUE): Receives live traffic
- **Staging slot** (GREEN): New version deployed here first
- After validation in Stage 4, slots are **swapped** to promote GREEN to production
- Instant rollback by swapping slots back

## Prerequisites

- Azure CLI >= 2.50.0
- Azure subscription
- Appropriate permissions to create resources
- Bicep CLI (included with Azure CLI)

## Deployment

### Automated Deployment (Recommended)

**The GitHub Actions workflow automatically generates parameter files from GitHub variables.**

No manual parameter file creation needed! Just configure GitHub secrets and variables:

#### Required GitHub Secrets
- `ANALYTICS_WRITE_KEY` - API authentication key

#### Required GitHub Variables
- `AZURE_CLIENT_ID` - Service principal client ID (for OIDC)
- `AZURE_TENANT_ID` - Azure tenant ID
- `AZURE_SUBSCRIPTION_ID` - Azure subscription ID

#### Optional GitHub Variables (with defaults)
- `AZURE_LOCATION` - Azure region (default: `eastus`)
- `AZURE_PROJECT_NAME` - Project name (default: `analytics-service`)
- `CORS_ALLOWED_ORIGINS` - CORS origins (default: `*`)
- `LOG_LEVEL` - Logging level (default: `debug` for dev/staging, `info` for prod)
- `AZURE_COSMOS_THROUGHPUT` - Cosmos DB RU/s (default: `400`)
- `AZURE_COSMOS_AUTOSCALE` - Enable autoscale (default: `true`)
- `EVENT_RETENTION_DAYS` - Operational storage TTL (default: `90`)
- `RAW_EVENT_RETENTION_DAYS` - Raw storage retention (default: `365`)
- `AZURE_FUNCTION_SKU` - Function App SKU (default: `Y1`)

**The workflow generates `parameters.json` dynamically from these variables.**

See `.github/workflows/deploy.yml` for the parameter generation logic.

---

### Manual Deployment

For local testing or manual deployments:

#### 1. Login to Azure

```bash
az login
az account set --subscription "your-subscription-id"
```

#### 2. Create Resource Group

```bash
az group create \
  --name analytics-service-dev-rg \
  --location eastus
```

#### 3. Deploy with Inline Parameters

**Option A: Inline parameters (recommended for manual deployment)**

```bash
az deployment group create \
  --resource-group analytics-service-dev-rg \
  --template-file main.bicep \
  --parameters \
    environment=dev \
    location=eastus \
    projectName=analytics-service \
    analyticsWriteKey="your-secret-key" \
    corsAllowedOrigins="*" \
    logLevel=debug \
    cosmosDbThroughput=400 \
    cosmosDbAutoscale=true \
    eventRetentionDays=90 \
    rawEventRetentionDays=365 \
    functionAppSku=Y1 \
  --name analytics-deployment-$(date +%Y%m%d-%H%M%S)
```

**Option B: Create a local parameters file**

Create `parameters.local.json` (not committed to Git):

```json
{
  "$schema": "https://schema.management.azure.com/schemas/2019-04-01/deploymentParameters.json#",
  "contentVersion": "1.0.0.0",
  "parameters": {
    "environment": { "value": "dev" },
    "location": { "value": "eastus" },
    "projectName": { "value": "analytics-service" },
    "analyticsWriteKey": { "value": "your-secret-write-key" },
    "corsAllowedOrigins": { "value": "*" },
    "logLevel": { "value": "debug" },
    "cosmosDbThroughput": { "value": 400 },
    "cosmosDbAutoscale": { "value": true },
    "eventRetentionDays": { "value": 90 },
    "rawEventRetentionDays": { "value": 365 },
    "functionAppSku": { "value": "Y1" }
  }
}
```

Then deploy:

```bash
az deployment group create \
  --resource-group analytics-service-dev-rg \
  --template-file main.bicep \
  --parameters parameters.local.json \
  --name analytics-deployment-$(date +%Y%m%d-%H%M%S)
```

**Note:** The `parameters.dev.json` file in this directory is a **reference example only**. The GitHub Actions workflow does not use it.

#### 4. Get Outputs

```bash
az deployment group show \
  --resource-group analytics-service-dev-rg \
  --name analytics-deployment-YYYYMMDD-HHMMSS \
  --query properties.outputs
```

## Blue/Green Deployment Process

### Deploy New Version (GREEN)

```bash
# 1. Deploy infrastructure (creates/updates staging slot)
az deployment group create \
  --resource-group analytics-service-dev-rg \
  --template-file main.bicep \
  --parameters parameters.dev.json

# 2. Deploy application code to staging slot
az functionapp deployment source config-zip \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev \
  --src deployment.zip \
  --slot staging

# 3. Staging slot is now running new version
# Production slot still running old version
```

### Test GREEN Slot

```bash
# Get staging slot URL
STAGING_URL=$(az functionapp show \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev \
  --slot staging \
  --query defaultHostName -o tsv)

# Run integration tests against staging
curl https://$STAGING_URL/api/v1/events
```

### Swap Slots (Promote GREEN to Production)

```bash
# Swap staging → production
az functionapp deployment slot swap \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev \
  --slot staging \
  --target-slot production
```

**Result:**
- Staging slot (GREEN) becomes production
- Production slot (BLUE) becomes staging
- Zero downtime
- Instant rollback available

### Rollback

```bash
# Swap back to previous version
az functionapp deployment slot swap \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev \
  --slot staging \
  --target-slot production
```

## Parameters

| Parameter | Description | Required | Default |
|-----------|-------------|----------|---------|
| `environment` | Environment name (dev, staging, prod) | Yes | - |
| `location` | Azure region | Yes | eastus |
| `projectName` | Project name for resource naming | Yes | analytics-service |
| `analyticsWriteKey` | Secret write key for API authentication | Yes | - |
| `corsAllowedOrigins` | Comma-separated CORS origins | No | * |
| `logLevel` | Logging level | No | info |
| `cosmosDbThroughput` | Cosmos DB RU/s | No | 400 |
| `eventRetentionDays` | Cosmos DB TTL in days | No | 90 |
| `rawEventRetentionDays` | Blob lifecycle retention | No | 365 |
| `functionAppSku` | Function App SKU | No | Y1 (Consumption) |

## Outputs

| Output | Description |
|--------|-------------|
| `functionAppName` | Name of the Function App |
| `productionUrl` | Production slot URL |
| `stagingUrl` | Staging slot URL |
| `cosmosDbAccountName` | Cosmos DB account name |
| `storageAccountName` | Storage account name |
| `keyVaultName` | Key Vault name |
| `applicationInsightsName` | Application Insights name |
| `resourceGroupName` | Resource group name |

## Resources Created

### Function App
- **Name**: `{projectName}-func-{environment}`
- **Runtime**: Node.js 20
- **Plan**: Consumption (Y1) or Premium
- **Slots**: Production + Staging

### Cosmos DB
- **Account**: `{projectName}-cosmos-{environment}`
- **Database**: `analytics`
- **Container**: `events`
- **Partition Key**: `/pk`
- **TTL**: Enabled (90 days default)

### Storage Account
- **Name**: `{projectName}st{environment}{uniqueId}`
- **Queue**: `events` (with poison queue)
- **Blob Container**: `raw-events` (with lifecycle policy)

### Key Vault
- **Name**: `{projectName}-kv-{environment}`
- **Secrets**: `analytics-write-key`

### Application Insights
- **Name**: `{projectName}-ai-{environment}`
- **Workspace-based**: Yes

## Monitoring

### Application Insights

View metrics and logs:
```bash
az monitor app-insights component show \
  --app analytics-ai-dev \
  --resource-group analytics-service-dev-rg
```

### Function App Logs

Stream logs:
```bash
az functionapp log tail \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev
```

### Cosmos DB Metrics

```bash
az cosmosdb show \
  --resource-group analytics-service-dev-rg \
  --name analytics-cosmos-dev
```

## Cost Optimization

- Function App uses Consumption plan (pay per execution)
- Cosmos DB uses autoscale (scales to zero when idle)
- Storage uses cool tier for older blobs
- Application Insights has daily cap

## Security

- All secrets stored in Key Vault
- Function App uses managed identity
- Storage account has firewall rules
- Cosmos DB has IP filtering
- HTTPS only for all endpoints

## Troubleshooting

### Deployment Fails

Check deployment logs:
```bash
az deployment group show \
  --resource-group analytics-service-dev-rg \
  --name deployment-name \
  --query properties.error
```

### Function App Not Starting

Check logs:
```bash
az functionapp log tail \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev
```

### Slot Swap Fails

Ensure both slots are running and healthy:
```bash
az functionapp show \
  --resource-group analytics-service-dev-rg \
  --name analytics-func-dev \
  --slot staging
```

## Cleanup

```bash
az group delete \
  --name analytics-service-dev-rg \
  --yes --no-wait
```

**Warning**: This deletes all resources including data.

## CI/CD Integration

The outputs from this deployment are used by GitHub Actions:
- `productionUrl`: For production traffic
- `stagingUrl`: For integration tests before swap
- `functionAppName`: For deployment
- Resource identifiers: For configuration

See `.github/workflows/` for CI/CD pipeline configuration.

## Additional Resources

- [Azure Functions Documentation](https://docs.microsoft.com/azure/azure-functions/)
- [Cosmos DB Documentation](https://docs.microsoft.com/azure/cosmos-db/)
- [Bicep Documentation](https://docs.microsoft.com/azure/azure-resource-manager/bicep/)
- [Deployment Slots](https://docs.microsoft.com/azure/azure-functions/functions-deployment-slots)
