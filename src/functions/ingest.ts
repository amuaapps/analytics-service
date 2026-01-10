import { app } from '@azure/functions';
import { createLogger } from '../utils/logger.js';
import { createAzureFunctionIngestHandler } from '../app/azure/function-http-ingest.js';
import { AzureQueuePublisher } from '../infra/azure/queue-publisher.js';
import { BlobRawEventStore } from '../infra/azure/blob-raw-event-store.js';
import { loadLimitsConfig } from '../config/limits.js';
import { getRequiredEnvVar } from '../config/env-loader.js';

// Initialize dependencies
const logger = createLogger({
  serviceName: 'analytics-service-azure',
  env: (process.env.NODE_ENV as 'development' | 'staging' | 'production') || 'production',
  level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
});

const queueConnectionString = getRequiredEnvVar('AZURE_STORAGE_CONNECTION_STRING');
const queueName = getRequiredEnvVar('AZURE_QUEUE_NAME');
const blobContainerName = getRequiredEnvVar('AZURE_BLOB_CONTAINER_NAME');

const queueAdapter = new AzureQueuePublisher({
  connectionString: queueConnectionString,
  queueName,
  logger,
});

const rawStorage = new BlobRawEventStore({
  connectionString: queueConnectionString, // Same storage account
  containerName: blobContainerName,
  logger,
});

const limits = loadLimitsConfig();

// Create handler
const handler = createAzureFunctionIngestHandler({
  logger,
  queueAdapter,
  rawStorage,
  limits,
});

// Register HTTP trigger
app.http('ingest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'events',
  handler,
});
