// Azure Functions with staging slot (blue/green)
// Deploy code to staging slot in Stage 3, swap slots in Stage 4
targetScope = 'resourceGroup'

@description('Azure region for resources')
param location string = resourceGroup().location

@description('Deployment environment: dev|staging|prod')
param environment string

@description('Project name (used for resource naming)')
param projectName string

@description('Function app name override (optional)')
param functionAppName string = '${projectName}-func-${environment}'

@description('Consumption plan SKU (Y1 recommended)')
param functionAppSku string = 'Y1'

@description('CORS allowed origins (tighten for prod)')
param corsAllowedOrigins array = [
  '*'
]

@description('Log level (app setting)')
param logLevel string = 'info'

@description('Node runtime version')
param nodeVersion string = '20'

var storageNameBase = toLower(replace(replace(projectName, '-', ''), '_', ''))
var storageAccountName = substring('${storageNameBase}${environment}${uniqueString(resourceGroup().id)}', 0, 24)

resource storage 'Microsoft.Storage/storageAccounts@2023-01-01' = {
  name: storageAccountName
  location: location
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

resource plan 'Microsoft.Web/serverfarms@2022-09-01' = {
  name: '${projectName}-plan-${environment}'
  location: location
  sku: {
    name: functionAppSku
    tier: 'Dynamic'
  }
  kind: 'functionapp'
  properties: {}
}

var storageConnString = 'DefaultEndpointsProtocol=https;AccountName=${storage.name};AccountKey=${listKeys(storage.id, storage.apiVersion).keys[0].value};EndpointSuffix=${environment().suffixes.storage}'

resource functionApp 'Microsoft.Web/sites@2022-09-01' = {
  name: functionAppName
  location: location
  kind: 'functionapp'
  properties: {
    httpsOnly: true
    serverFarmId: plan.id
    siteConfig: {
      ftpsState: 'Disabled'
      minTlsVersion: '1.2'
      linuxFxVersion: 'NODE|${nodeVersion}'
      appSettings: [
        {
          name: 'FUNCTIONS_EXTENSION_VERSION'
          value: '~4'
        }
        {
          name: 'FUNCTIONS_WORKER_RUNTIME'
          value: 'node'
        }
        {
          name: 'WEBSITE_RUN_FROM_PACKAGE'
          value: '1'
        }
        {
          name: 'AzureWebJobsStorage'
          value: storageConnString
        }
        {
          name: 'AMUA_ENV'
          value: environment
        }
        {
          name: 'LOG_LEVEL'
          value: logLevel
        }
      ]
      cors: {
        allowedOrigins: corsAllowedOrigins
        supportCredentials: false
      }
    }
  }
}

resource stagingSlot 'Microsoft.Web/sites/slots@2022-09-01' = {
  name: '${functionApp.name}/staging'
  location: location
  kind: 'functionapp'
  properties: {
    serverFarmId: plan.id
    siteConfig: functionApp.properties.siteConfig
  }
}

output functionAppName string = functionApp.name
output productionUrl string = 'https://${functionApp.properties.defaultHostName}'
output stagingUrl string = 'https://${stagingSlot.properties.defaultHostName}'
output stagingSlotName string = 'staging'
