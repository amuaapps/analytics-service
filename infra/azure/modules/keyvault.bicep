@description('Key Vault name')
param keyVaultName string

@description('Location for resources')
param location string

@description('Tags for resources')
param tags object

@description('Analytics write key')
@secure()
param analyticsWriteKey string

@description('Object ID of the service principal or user deploying (optional)')
param deployerObjectId string = ''

// Key Vault
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
    enabledForDeployment: false
    enabledForDiskEncryption: false
    enabledForTemplateDeployment: true
    enableSoftDelete: true
    softDeleteRetentionInDays: 90
    enableRbacAuthorization: false
    accessPolicies: deployerObjectId != '' ? [
      {
        tenantId: subscription().tenantId
        objectId: deployerObjectId
        permissions: {
          secrets: [
            'get'
            'list'
            'set'
            'delete'
          ]
        }
      }
    ] : []
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Secret: Analytics Write Key
resource analyticsWriteKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'analytics-write-key'
  properties: {
    value: analyticsWriteKey
    contentType: 'text/plain'
    attributes: {
      enabled: true
    }
  }
}

// Outputs
output keyVaultName string = keyVault.name
output keyVaultId string = keyVault.id
output keyVaultUri string = keyVault.properties.vaultUri
output analyticsWriteKeySecretUri string = analyticsWriteKeySecret.properties.secretUri
