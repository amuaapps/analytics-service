@description('Cosmos DB account name')
param accountName string

@description('Location for resources')
param location string

@description('Throughput (RU/s)')
param throughput int = 400

@description('Enable autoscale')
param enableAutoscale bool = true

@description('Default TTL in seconds')
param defaultTtl int = 7776000 // 90 days

@description('Tags for resources')
param tags object

// Cosmos DB Account
resource cosmosDbAccount 'Microsoft.DocumentDB/databaseAccounts@2023-04-15' = {
  name: accountName
  location: location
  kind: 'GlobalDocumentDB'
  tags: tags
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
    capabilities: [
      {
        name: 'EnableServerless'
      }
    ]
    enableAutomaticFailover: false
    enableMultipleWriteLocations: false
    publicNetworkAccess: 'Enabled'
    enableFreeTier: false
  }
}

// Database
resource database 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases@2023-04-15' = {
  parent: cosmosDbAccount
  name: 'analytics'
  properties: {
    resource: {
      id: 'analytics'
    }
  }
}

// Container
resource container 'Microsoft.DocumentDB/databaseAccounts/sqlDatabases/containers@2023-04-15' = {
  parent: database
  name: 'events'
  properties: {
    resource: {
      id: 'events'
      partitionKey: {
        paths: [
          '/pk'
        ]
        kind: 'Hash'
      }
      indexingPolicy: {
        indexingMode: 'consistent'
        automatic: true
        includedPaths: [
          {
            path: '/*'
          }
        ]
        excludedPaths: [
          {
            path: '/"_etag"/?'
          }
        ]
      }
      defaultTtl: defaultTtl
      uniqueKeyPolicy: {
        uniqueKeys: []
      }
    }
  }
}

// Outputs
output accountName string = cosmosDbAccount.name
output accountId string = cosmosDbAccount.id
output databaseName string = database.name
output containerName string = container.name
output endpoint string = cosmosDbAccount.properties.documentEndpoint
output connectionString string = 'AccountEndpoint=${cosmosDbAccount.properties.documentEndpoint};AccountKey=${cosmosDbAccount.listKeys().primaryMasterKey}'
