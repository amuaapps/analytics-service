@description('Function App name')
param functionAppName string

@description('App Service Plan name')
param appServicePlanName string

@description('Location for resources')
param location string

@description('App Service Plan SKU')
param sku string

@description('Storage account name')
param storageAccountName string

@description('Storage account key')
@secure()
param storageAccountKey string

@description('Cosmos DB connection string')
@secure()
param cosmosDbConnectionString string

@description('Cosmos DB database name')
param cosmosDbDatabaseName string

@description('Cosmos DB container name')
param cosmosDbContainerName string

@description('Queue connection string')
@secure()
param queueConnectionString string

@description('Queue name')
param queueName string

@description('Blob connection string')
@secure()
param blobConnectionString string

@description('Blob container name')
param blobContainerName string

@description('Key Vault name')
param keyVaultName string

@description('Application Insights connection string')
@secure()
param applicationInsightsConnectionString string

@description('Application Insights instrumentation key')
@secure()
param applicationInsightsInstrumentationKey string

@description('Analytics write key')
@secure()
param analyticsWriteKey string

@description('CORS allowed origins')
param corsAllowedOrigins string

@description('Log level')
param logLevel string

@description('Environment')
param environment string

@description('Tags for resources')
param tags object

// App Service Plan
resource appServicePlan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: appServicePlanName
  location: location
  tags: tags
  sku: {
    name: sku
    tier: sku == 'Y1' ? 'Dynamic' : 'ElasticPremium'
  }
  kind: 'functionapp'
  properties: {
    reserved: false // Windows
  }
}

// Function App (Production Slot)
resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: functionAppName
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      nodeVersion: '~20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccountKey};EndpointSuffix=${environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccountKey};EndpointSuffix=${environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: toLower(functionAppName)
        }
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
          value: '~20'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: applicationInsightsInstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsightsConnectionString
        }
        // Application Configuration
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
          value: analyticsWriteKey
        }
        {
          name: 'CORS_ALLOWED_ORIGINS'
          value: corsAllowedOrigins
        }
        // Cosmos DB
        {
          name: 'AZURE_COSMOS_CONNECTION_STRING'
          value: cosmosDbConnectionString
        }
        {
          name: 'AZURE_COSMOS_DATABASE_NAME'
          value: cosmosDbDatabaseName
        }
        {
          name: 'AZURE_COSMOS_CONTAINER_NAME'
          value: cosmosDbContainerName
        }
        // Storage Queue
        {
          name: 'AZURE_QUEUE_CONNECTION_STRING'
          value: queueConnectionString
        }
        {
          name: 'AZURE_QUEUE_NAME'
          value: queueName
        }
        // Storage Blob
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: blobConnectionString
        }
        {
          name: 'AZURE_BLOB_CONTAINER_NAME'
          value: blobContainerName
        }
        // Limits
        {
          name: 'MAX_PAYLOAD_SIZE_BYTES'
          value: '1048576'
        }
        {
          name: 'MAX_EVENTS_PER_BATCH'
          value: '100'
        }
        {
          name: 'MAX_QUERY_LIMIT'
          value: '200'
        }
      ]
      cors: {
        allowedOrigins: split(corsAllowedOrigins, ',')
        supportCredentials: false
      }
      use32BitWorkerProcess: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// Staging Slot (GREEN)
resource stagingSlot 'Microsoft.Web/sites/slots@2022-09-01' = {
  parent: functionApp
  name: 'staging'
  location: location
  tags: tags
  kind: 'functionapp'
  identity: {
    type: 'SystemAssigned'
  }
  properties: {
    serverFarmId: appServicePlan.id
    httpsOnly: true
    siteConfig: {
      nodeVersion: '~20'
      appSettings: [
        {
          name: 'AzureWebJobsStorage'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccountKey};EndpointSuffix=${environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTAZUREFILECONNECTIONSTRING'
          value: 'DefaultEndpointsProtocol=https;AccountName=${storageAccountName};AccountKey=${storageAccountKey};EndpointSuffix=${environment().suffixes.storage}'
        }
        {
          name: 'WEBSITE_CONTENTSHARE'
          value: '${toLower(functionAppName)}-staging'
        }
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
          value: '~20'
        }
        {
          name: 'APPINSIGHTS_INSTRUMENTATIONKEY'
          value: applicationInsightsInstrumentationKey
        }
        {
          name: 'APPLICATIONINSIGHTS_CONNECTION_STRING'
          value: applicationInsightsConnectionString
        }
        // Application Configuration
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
          value: analyticsWriteKey
        }
        {
          name: 'CORS_ALLOWED_ORIGINS'
          value: corsAllowedOrigins
        }
        // Cosmos DB
        {
          name: 'AZURE_COSMOS_CONNECTION_STRING'
          value: cosmosDbConnectionString
        }
        {
          name: 'AZURE_COSMOS_DATABASE_NAME'
          value: cosmosDbDatabaseName
        }
        {
          name: 'AZURE_COSMOS_CONTAINER_NAME'
          value: cosmosDbContainerName
        }
        // Storage Queue
        {
          name: 'AZURE_QUEUE_CONNECTION_STRING'
          value: queueConnectionString
        }
        {
          name: 'AZURE_QUEUE_NAME'
          value: queueName
        }
        // Storage Blob
        {
          name: 'AZURE_STORAGE_CONNECTION_STRING'
          value: blobConnectionString
        }
        {
          name: 'AZURE_BLOB_CONTAINER_NAME'
          value: blobContainerName
        }
        // Limits
        {
          name: 'MAX_PAYLOAD_SIZE_BYTES'
          value: '1048576'
        }
        {
          name: 'MAX_EVENTS_PER_BATCH'
          value: '100'
        }
        {
          name: 'MAX_QUERY_LIMIT'
          value: '200'
        }
      ]
      cors: {
        allowedOrigins: split(corsAllowedOrigins, ',')
        supportCredentials: false
      }
      use32BitWorkerProcess: false
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
    }
  }
}

// Grant Function App access to Key Vault (Production)
resource keyVaultAccessPolicyProduction 'Microsoft.KeyVault/vaults/accessPolicies@2023-02-01' = {
  name: '${keyVaultName}/add'
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
    ]
  }
}

// Grant Function App access to Key Vault (Staging)
resource keyVaultAccessPolicyStaging 'Microsoft.KeyVault/vaults/accessPolicies@2023-02-01' = {
  name: '${keyVaultName}/add'
  properties: {
    accessPolicies: [
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
  dependsOn: [
    keyVaultAccessPolicyProduction
  ]
}

// Outputs
output functionAppName string = functionApp.name
output functionAppId string = functionApp.id
output productionUrl string = 'https://${functionApp.properties.defaultHostName}'
output stagingUrl string = 'https://${stagingSlot.properties.defaultHostName}'
output productionPrincipalId string = functionApp.identity.principalId
output stagingPrincipalId string = stagingSlot.identity.principalId
