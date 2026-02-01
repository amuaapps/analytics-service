import { app, InvocationContext } from '@azure/functions';
import { createLogger } from '../utils/logger.js';
import { createAzureFunctionQueueProcessorHandler } from '../app/azure/function-queue-processor.js';
import { CosmosEventRepository } from '../infra/azure/cosmos-event-repository.js';
import { BlobRawEventStore } from '../infra/azure/blob-raw-event-store.js';
import { loadLimitsConfig } from '../config/limits.js';
import { getRequiredEnvVar } from '../config/env-loader.js';

// Lazy initialization - dependencies created on first request
let handlerInstance: ReturnType<typeof createAzureFunctionQueueProcessorHandler> | null = null;
let initError: Error | null = null;

function getOrCreateHandler(): ReturnType<typeof createAzureFunctionQueueProcessorHandler> {
  if (initError) {
    throw initError;
  }

  if (!handlerInstance) {
    try {
      const logger = createLogger({
        serviceName: 'analytics-service-azure',
        env: (process.env.NODE_ENV as 'dev' | 'staging' | 'prod' | 'test') || 'prod',
        level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
      });

      const cosmosConnectionString = getRequiredEnvVar('AZURE_COSMOS_CONNECTION_STRING');
      const cosmosDatabaseId = getRequiredEnvVar('AZURE_COSMOS_DATABASE_NAME');
      const cosmosContainerId = getRequiredEnvVar('AZURE_COSMOS_CONTAINER_NAME');
      const storageConnectionString = getRequiredEnvVar('AZURE_STORAGE_CONNECTION_STRING');
      const blobContainerName = getRequiredEnvVar('AZURE_BLOB_CONTAINER_NAME');

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

      handlerInstance = createAzureFunctionQueueProcessorHandler({
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });
    } catch (error) {
      initError = error instanceof Error ? error : new Error(String(error));
      throw initError;
    }
  }

  return handlerInstance;
}

// Safe wrapper that logs errors but doesn't crash the worker
async function safeHandler(queueItem: unknown, context: InvocationContext): Promise<void> {
  try {
    const handler = getOrCreateHandler();
    return await handler(queueItem, context);
  } catch (error) {
    context.error('Failed to initialize or execute processor function', error);
    // For queue triggers, we throw to move message to poison queue
    throw error;
  }
}

// Register queue trigger - note queueName is read at registration time
// If AZURE_QUEUE_NAME is missing, this will fail gracefully without preventing other functions
let queueName: string;
try {
  queueName = getRequiredEnvVar('AZURE_QUEUE_NAME');

  app.storageQueue('processor', {
    queueName,
    connection: 'AZURE_STORAGE_CONNECTION_STRING',
    handler: safeHandler,
  });
} catch (error) {
  // Queue trigger registration failed - log but don't crash
  // This allows health and other functions to still register
  // Using process.stderr since we don't have context at module-level
  const errorMessage = error instanceof Error ? error.message : String(error);
  process.stderr.write(`Failed to register processor queue trigger: ${errorMessage}\n`);
}
