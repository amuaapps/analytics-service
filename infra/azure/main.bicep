// Azure Functions Analytics Service with blue/green deployment
// Extends the standard template with Cosmos DB, Storage Queue, and Key Vault
targetScope = 'resourceGroup'

@description('Environment name (dev, staging, prod)')
@allowed([
  'dev'
  'staging'
  'prod'
])
param environment string

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Project name for resource naming')
param projectName string = 'analytics-service'

@description('Function App name override (optional)')
param functionAppName string = '${projectName}-func-${environment}'

@description('Function App SKU')
@allowed([
  'Y1'  // Consumption
  'EP1' // Elastic Premium
  'EP2'
  'EP3'
])
param functionAppSku string = 'Y1'

@description('Analytics write key for API authentication')
@secure()
param analyticsWriteKey string

@description('CORS allowed origins (comma-separated or array)')
param corsAllowedOrigins array = ['*']

@description('Log level')
@allowed([
  'debug'
  'info'
  'warn'
  'error'
])
param logLevel string = 'info'

@description('Event retention in days (TTL for Cosmos DB)')
param eventRetentionDays int = 365

@description('Raw event retention in days (blob lifecycle)')
param rawEventRetentionDays int = 365

@description('Maximum payload size in bytes')
@minValue(1024)
@maxValue(1048576)
param maxPayloadSizeBytes int = 1048576

@description('Maximum events per batch')
@minValue(1)
@maxValue(100)
param maxEventsPerBatch int = 100

@description('Maximum query result limit')
@minValue(1)
@maxValue(1000)
param maxQueryLimit int = 200

@description('Node runtime version')
param nodeVersion string = '20'

@description('Tags for all resources')
param tags object = {
  Project: projectName
  Environment: environment
  ManagedBy: 'Bicep'
  Service: 'analytics-service'
}

// Generate unique suffix for globally unique names
var uniqueSuffix = uniqueString(resourceGroup().id, projectName, environment, location)

// Resource names
var storageNameBase = toLower(replace(replace(projectName, '-', ''), '_', ''))
var storageAccountName = substring('${storageNameBase}${environment}${uniqueSuffix}', 0, 24)
var cosmosDbAccountName = '${projectName}-cosmos-${environment}'
var keyVaultName = toLower('${replace(take(projectName, 10), '-', '')}kv${take(uniqueSuffix, 10)}')
var appInsightsName = '${projectName}-ai-${environment}'
var logAnalyticsName = '${projectName}-law-${environment}'
var planName = '${projectName}-plan-${environment}'

// ============================================================================
// STORAGE ACCOUNT (for Function App + Queue + Blob)
// ============================================================================
resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
  tags: tags
  sku: {
    name: 'Standard_LRS'
  }
  kind: 'StorageV2'
  properties: {
    minimumTlsVersion: 'TLS1_2'
    supportsHttpsTrafficOnly: true
    accessTier: 'Hot'
  }
}

resource queueService 'Microsoft.Storage/storageAccounts/queueServices@2023-01-01' = {
  parent: storage
  name: 'default'
}

resource queue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'events-to-process'
}

resource poisonQueue 'Microsoft.Storage/storageAccounts/queueServices/queues@2023-01-01' = {
  parent: queueService
  name: 'events-poison'
}

resource blobService 'Microsoft.Storage/storageAccounts/blobServices@2023-01-01' = {
  parent: storage
  name: 'default'
  properties: {
    deleteRetentionPolicy: {
      enabled: true
      days: rawEventRetentionDays
    }
  }
}

resource blobContainer 'Microsoft.Storage/storageAccounts/blobServices/containers@2023-01-01' = {
  parent: blobService
  name: 'raw-events'
  properties: {
    publicAccess: 'None'
  }
}

var storageConnString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${listKeys(storage.id, storage.apiVersion).keys[0].value};EndpointSuffix=${az.environment().suffixes.storage}'

// ============================================================================
// COSMOS DB (for event storage)
// ============================================================================
resource cosmosDb 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: cosmosDbAccountName
  location: location
  tags: tags
  kind: 'GlobalDocumentDB'
  properties: {
    databaseAccountOfferType: 'Standard'
    consistencyPolicy: {
      defaultConsistencyLevel: 'Session'
    }
    locations: [
      {
        locationName: location
        failoverPriority: 0
        isZoneRedundant: false
      }
    ]
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
  }
}

resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosDb
  name: 'analytics'
  properties: {
    resource: {
      id: 'analytics'
    }
  }
}

resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'events'
  properties: {
    resource: {
      id: 'events'
      partitionKey: {
        paths: [
          '/userId'
        ]
        kind: 'Hash'
      }
      defaultTtl: eventRetentionDays * 86400
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
      }
    }
  }
}

var cosmosConnString = 'AccountEndpoint=${cosmosDb.properties.documentEndpoint};AccountKey=${listKeys(cosmosDb.id, cosmosDb.apiVersion).primaryMasterKey}'

// ============================================================================
// KEY VAULT (for secrets)
// ============================================================================
resource keyVault 'Microsoft.KeyVault/vaults@2023-02-01' = {
  name: keyVaultName
  location: location
  tags: tags
  properties: {
    sku: {
      family: 'A'
      name: 'standard'
    }
    tenantId: subscription().tenantId
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enableRbacAuthorization: false
    accessPolicies: []
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

resource analyticsWriteKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'analytics-write-key'
  properties: {
    value: analyticsWriteKey
    contentType: 'text/plain'
  }
}

// ============================================================================
// APPLICATION INSIGHTS
// ============================================================================
resource logAnalytics 'Microsoft.OperationalInsights/workspaces@2022-10-01' = {
  name: logAnalyticsName
  location: location
  tags: tags
  properties: {
    sku: {
      name: 'PerGB2018'
    }
    retentionInDays: 30
  }
}

resource appInsights 'Microsoft.Insights/components@2020-02-02' = {
  name: appInsightsName
  location: location
  tags: tags
  kind: 'web'
  properties: {
    Application_Type: 'web'
    WorkspaceResourceId: logAnalytics.id
  }
}

// ============================================================================
// FUNCTION APP (with staging slot for blue/green)
// ============================================================================
resource plan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: planName
  location: location
  tags: tags
  sku: {
    name: functionAppSku
    tier: functionAppSku == 'Y1' ? 'Dynamic' : 'ElasticPremium'
  }
  kind: 'functionapp'
  properties: {}
}

// App settings for Function App (defined after all dependent resources)
var appSettings = [
  {
    name: 'FUNCTIONS_EXTENSION_VERSION'
    value: '~4'
  }
  {
    name: 'FUNCTIONS_WORKER_RUNTIME'
    value: 'node'
  }
  {
    name: 'WEBSITE_NODE_DEFAULT_VERSION'
    value: '~${nodeVersion}'
  }
  {
    name: 'FUNCTIONS_NODE_BLOCK_ON_ENTRY_POINT_ERROR'
    value: 'true'
  }
  {
    name: 'WEBSITE_RUN_FROM_PACKAGE'
    value: '1'
  }
  {
    name: 'AzureWebJobsFeatureFlags'
    value: 'EnableWorkerIndexing'
  }
  {
    name: 'AzureWebJobsStorage'
    value: storageConnString
  }
  {
    name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
    value: appInsights.properties.ConnectionString
  }
  {
    name: 'NODE_ENV'
    value: environment
  }
  {
    name: 'LOG_LEVEL'
    value: logLevel
  }
  {
    name: 'ANALYTICS_WRITE_KEY'
    value: '@Microsoft.KeyVault(SecretUri=${analyticsWriteKeySecret.properties.secretUri})'
  }
  {
    name: 'AZURE_COSMOS_CONNECTION_STRING'
    value: cosmosConnString
  }
  {
    name: 'AZURE_COSMOS_DATABASE_NAME'
    value: database.name
  }
  {
    name: 'AZURE_COSMOS_CONTAINER_NAME'
    value: container.name
  }
  {
    name: 'AZURE_STORAGE_CONNECTION_STRING'
    value: storageConnString
  }
  {
    name: 'AZURE_QUEUE_NAME'
    value: queue.name
  }
  {
    name: 'AZURE_BLOB_CONTAINER_NAME'
    value: blobContainer.name
  }
  {
    name: 'MAX_PAYLOAD_SIZE_BYTES'
    value: string(maxPayloadSizeBytes)
  }
  {
    name: 'MAX_EVENTS_PER_BATCH'
    value: string(maxEventsPerBatch)
  }
  {
    name: 'MAX_QUERY_LIMIT'
    value: string(maxQueryLimit)
  }
]

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      nodeVersion: '~${nodeVersion}'
      appSettings: appSettings
      cors: {
        allowedOrigins: corsAllowedOrigins
        supportCredentials: false
      }
    }
  }
}

resource stagingSlot 'Microsoft.Web/sites/slots@2022-09-01' = {
  name: 'staging'
  parent: functionApp
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      nodeVersion: '~${nodeVersion}'
      appSettings: appSettings
      cors: {
        allowedOrigins: corsAllowedOrigins
        supportCredentials: false
      }
    }
  }
}

// Grant Function App (production) access to Key Vault
resource keyVaultAccessPolicyProduction 'Microsoft.KeyVault/vaults/accessPolicies@2023-02-01' = {
  name: '${keyVault.name}/add'
  properties: {
    accessPolicies: [
      {
        tenantId: subscription().tenantId
        objectId: functionApp.identity.principalId
        permissions: {
          secrets: [
            'get'
            'list'
          ]
        }
      }
      {
        tenantId: subscription().tenantId
        objectId: stagingSlot.identity.principalId
        permissions: {
          secrets: [
            'get'
            'list'
          ]
        }
      }
    ]
  }
}

// ============================================================================
// OUTPUTS (required for blue/green deployment pipeline)
// ============================================================================
output functionAppName string = functionApp.name
output productionUrl string = 'https://${functionApp.properties.defaultHostName}'
output stagingUrl string = 'https://${stagingSlot.properties.defaultHostName}'
output stagingSlotName string = 'staging'

// Additional outputs for reference
output cosmosDbAccountName string = cosmosDb.name
output cosmosDbDatabaseName string = database.name
output cosmosDbContainerName string = container.name
output storageAccountName string = storage.name
output queueName string = queue.name
output blobContainerName string = blobContainer.name
output keyVaultName string = keyVault.name
output applicationInsightsName string = appInsights.name
