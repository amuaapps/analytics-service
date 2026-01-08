import type { AwsConfig, AzureConfig, CloudProvider } from './types.js';
import {
  getRequiredEnvVar,
  getOptionalEnvVar,
  validateCloudProvider,
  ConfigurationError,
} from './env-loader.js';

export function detectCloudProvider(): CloudProvider | undefined {
  const explicit = getOptionalEnvVar('CLOUD_PROVIDER');
  if (explicit) {
    return validateCloudProvider(explicit);
  }

  const hasAwsConfig =
    getOptionalEnvVar('AWS_REGION') &&
    getOptionalEnvVar('DYNAMODB_TABLE_NAME') &&
    getOptionalEnvVar('S3_RAW_BUCKET_NAME') &&
    getOptionalEnvVar('SQS_QUEUE_URL');

  const hasAzureConfig =
    getOptionalEnvVar('AZURE_COSMOS_CONNECTION_STRING') &&
    getOptionalEnvVar('AZURE_STORAGE_CONNECTION_STRING') &&
    getOptionalEnvVar('AZURE_QUEUE_NAME');

  if (hasAwsConfig && hasAzureConfig) {
    throw new ConfigurationError(
      'Both AWS and Azure configurations detected. Please set CLOUD_PROVIDER explicitly to "aws" or "azure".'
    );
  }

  if (hasAwsConfig) {
    return 'aws';
  }

  if (hasAzureConfig) {
    return 'azure';
  }

  return undefined;
}

export function loadAwsConfig(): AwsConfig {
  return {
    region: getRequiredEnvVar('AWS_REGION'),
    dynamoDbTableName: getRequiredEnvVar('DYNAMODB_TABLE_NAME'),
    s3RawBucketName: getRequiredEnvVar('S3_RAW_BUCKET_NAME'),
    sqsQueueUrl: getRequiredEnvVar('SQS_QUEUE_URL'),
  };
}

export function loadAzureConfig(): AzureConfig {
  return {
    cosmosConnectionString: getRequiredEnvVar('AZURE_COSMOS_CONNECTION_STRING'),
    cosmosDatabaseName: getRequiredEnvVar('AZURE_COSMOS_DATABASE_NAME'),
    cosmosContainerName: getRequiredEnvVar('AZURE_COSMOS_CONTAINER_NAME'),
    storageConnectionString: getRequiredEnvVar('AZURE_STORAGE_CONNECTION_STRING'),
    queueName: getRequiredEnvVar('AZURE_QUEUE_NAME'),
    blobContainerName: getRequiredEnvVar('AZURE_BLOB_CONTAINER_NAME'),
  };
}
