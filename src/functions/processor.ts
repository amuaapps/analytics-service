import { app } from '@azure/functions';
import { createLogger } from '../utils/logger.js';
import { createAzureFunctionQueueProcessorHandler } from '../app/azure/function-queue-processor.js';
import { CosmosEventRepository } from '../infra/azure/cosmos-event-repository.js';
import { BlobRawEventStore } from '../infra/azure/blob-raw-event-store.js';
import { loadLimitsConfig } from '../config/limits.js';
import { getRequiredEnvVar } from '../config/env-loader.js';

// Initialize dependencies
const logger = createLogger({
  serviceName: 'analytics-service-azure',
  env: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'production',
  level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
});

const cosmosConnectionString = getRequiredEnvVar('AZURE_COSMOS_CONNECTION_STRING');
const cosmosDatabaseId = getRequiredEnvVar('AZURE_COSMOS_DATABASE_NAME');
const cosmosContainerId = getRequiredEnvVar('AZURE_COSMOS_CONTAINER_NAME');
const storageConnectionString = getRequiredEnvVar('AZURE_STORAGE_CONNECTION_STRING');
const blobContainerName = getRequiredEnvVar('AZURE_BLOB_CONTAINER_NAME');
const queueName = getRequiredEnvVar('AZURE_QUEUE_NAME');

const operationalStorage = new CosmosEventRepository({
  connectionString: cosmosConnectionString,
  databaseId: cosmosDatabaseId,
  containerId: cosmosContainerId,
  logger,
});

const rawStorage = new BlobRawEventStore({
  connectionString: storageConnectionString,
  containerName: blobContainerName,
  logger,
});

const limits = loadLimitsConfig();

// Create handler
const handler = createAzureFunctionQueueProcessorHandler({
  logger,
  operationalStorage,
  rawStorage,
  limits,
});

// Register queue trigger
app.storageQueue('processor', {
  queueName,
  connection: 'AZURE_STORAGE_CONNECTION_STRING',
  handler,
});
