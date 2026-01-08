@description('Key Vault name')
param keyVaultName string

@description('Location for resources')
param location string

@description('Analytics write key secret value')
@secure()
param analyticsWriteKey string

@description('Tags for resources')
param tags object

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
    accessPolicies: []
    publicNetworkAccess: 'Enabled'
    networkAcls: {
      defaultAction: 'Allow'
      bypass: 'AzureServices'
    }
  }
}

// Secret: Analytics Write Key
resource writeKeySecret 'Microsoft.KeyVault/vaults/secrets@2023-02-01' = {
  parent: keyVault
  name: 'analytics-write-key'
  properties: {
    value: analyticsWriteKey
    contentType: 'text/plain'
  }
}

// Outputs
output keyVaultName string = keyVault.name
output keyVaultId string = keyVault.id
output keyVaultUri string = keyVault.properties.vaultUri
output writeKeySecretName string = writeKeySecret.name
output writeKeySecretUri string = writeKeySecret.properties.secretUri
