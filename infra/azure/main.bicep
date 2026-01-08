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

@description('Secret write key for API authentication')
@secure()
param analyticsWriteKey string

@description('Comma-separated CORS allowed origins')
param corsAllowedOrigins string = '*'

@description('Logging level')
@allowed([
  'debug'
  'info'
  'warn'
  'error'
])
param logLevel string = 'info'

@description('Cosmos DB throughput (RU/s)')
@minValue(400)
@maxValue(100000)
param cosmosDbThroughput int = 400

@description('Enable Cosmos DB autoscale')
param cosmosDbAutoscale bool = true

@description('Event retention in days (TTL)')
param eventRetentionDays int = 90

@description('Raw event retention in days (blob lifecycle)')
param rawEventRetentionDays int = 365

@description('Function App SKU')
@allowed([
  'Y1'  // Consumption
  'EP1' // Elastic Premium
  'EP2'
  'EP3'
])
param functionAppSku string = 'Y1'

@description('Tags for all resources')
param tags object = {
  Project: projectName
  Environment: environment
  ManagedBy: 'Bicep'
  Service: 'analytics-service'
}

// Generate unique suffix for globally unique names
var uniqueSuffix = uniqueString(resourceGroup().id, projectName, environment)

// Resource names
var cosmosDbAccountName = '${projectName}-cosmos-${environment}'
var storageAccountName = toLower('${projectName}st${environment}${take(uniqueSuffix, 6)}')
var functionAppName = '${projectName}-func-${environment}'
var appServicePlanName = '${projectName}-plan-${environment}'
var keyVaultName = '${projectName}-kv-${take(uniqueSuffix, 6)}'
var applicationInsightsName = '${projectName}-ai-${environment}'
var logAnalyticsWorkspaceName = '${projectName}-law-${environment}'

// Cosmos DB
module cosmosDb 'modules/cosmosdb.bicep' = {
  name: 'cosmosdb-deployment'
  params: {
    accountName: cosmosDbAccountName
    location: location
    throughput: cosmosDbThroughput
    enableAutoscale: cosmosDbAutoscale
    defaultTtl: eventRetentionDays * 86400 // Convert days to seconds
    tags: tags
  }
}

// Storage Account
module storage 'modules/storage.bicep' = {
  name: 'storage-deployment'
  params: {
    storageAccountName: storageAccountName
    location: location
    rawEventRetentionDays: rawEventRetentionDays
    tags: tags
  }
}

// Key Vault
module keyVault 'modules/keyvault.bicep' = {
  name: 'keyvault-deployment'
  params: {
    keyVaultName: keyVaultName
    location: location
    analyticsWriteKey: analyticsWriteKey
    tags: tags
  }
}

// Application Insights
module appInsights 'modules/appinsights.bicep' = {
  name: 'appinsights-deployment'
  params: {
    applicationInsightsName: applicationInsightsName
    logAnalyticsWorkspaceName: logAnalyticsWorkspaceName
    location: location
    tags: tags
  }
}

// Function App with Deployment Slots
module functionApp 'modules/functionapp.bicep' = {
  name: 'functionapp-deployment'
  params: {
    functionAppName: functionAppName
    appServicePlanName: appServicePlanName
    location: location
    sku: functionAppSku
    storageAccountName: storage.outputs.storageAccountName
    storageAccountKey: storage.outputs.storageAccountKey
    cosmosDbConnectionString: cosmosDb.outputs.connectionString
    cosmosDbDatabaseName: cosmosDb.outputs.databaseName
    cosmosDbContainerName: cosmosDb.outputs.containerName
    queueConnectionString: storage.outputs.queueConnectionString
    queueName: storage.outputs.queueName
    blobConnectionString: storage.outputs.blobConnectionString
    blobContainerName: storage.outputs.blobContainerName
    keyVaultName: keyVault.outputs.keyVaultName
    applicationInsightsConnectionString: appInsights.outputs.connectionString
    applicationInsightsInstrumentationKey: appInsights.outputs.instrumentationKey
    analyticsWriteKey: analyticsWriteKey
    corsAllowedOrigins: corsAllowedOrigins
    logLevel: logLevel
    environment: environment
    tags: tags
  }
}

// Outputs for CI/CD
output functionAppName string = functionApp.outputs.functionAppName
output productionUrl string = functionApp.outputs.productionUrl
output stagingUrl string = functionApp.outputs.stagingUrl
output cosmosDbAccountName string = cosmosDb.outputs.accountName
output cosmosDbDatabaseName string = cosmosDb.outputs.databaseName
output cosmosDbContainerName string = cosmosDb.outputs.containerName
output storageAccountName string = storage.outputs.storageAccountName
output queueName string = storage.outputs.queueName
output blobContainerName string = storage.outputs.blobContainerName
output keyVaultName string = keyVault.outputs.keyVaultName
output applicationInsightsName string = appInsights.outputs.applicationInsightsName
output resourceGroupName string = resourceGroup().name
output location string = location
output environment string = environment

// Deployment summary for CI/CD
output deploymentSummary object = {
  functionAppName: functionApp.outputs.functionAppName
  productionUrl: functionApp.outputs.productionUrl
  stagingUrl: functionApp.outputs.stagingUrl
  productionSlot: 'production'
  stagingSlot: 'staging'
  cosmosDbAccount: cosmosDb.outputs.accountName
  storageAccount: storage.outputs.storageAccountName
  keyVault: keyVault.outputs.keyVaultName
  applicationInsights: appInsights.outputs.applicationInsightsName
  resourceGroup: resourceGroup().name
  location: location
  environment: environment
}
