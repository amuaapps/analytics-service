import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createLogger } from '../utils/logger.js';
import { createAzureFunctionIngestHandler } from '../app/azure/function-http-ingest.js';
import { AzureQueuePublisher } from '../infra/azure/queue-publisher.js';
import { BlobRawEventStore } from '../infra/azure/blob-raw-event-store.js';
import { loadLimitsConfig } from '../config/limits.js';
import { getRequiredEnvVar } from '../config/env-loader.js';

// Lazy initialization - dependencies created on first request
let handlerInstance: ReturnType<typeof createAzureFunctionIngestHandler> | null = null;
let initError: Error | null = null;

function getOrCreateHandler(): ReturnType<typeof createAzureFunctionIngestHandler> {
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

      const queueConnectionString = getRequiredEnvVar('AZURE_STORAGE_CONNECTION_STRING');
      const queueName = getRequiredEnvVar('AZURE_QUEUE_NAME');
      const blobContainerName = getRequiredEnvVar('AZURE_BLOB_CONTAINER_NAME');

      const queueAdapter = new AzureQueuePublisher({
        connectionString: queueConnectionString,
        queueName,
        logger,
      });

      const rawStorage = new BlobRawEventStore({
        connectionString: queueConnectionString,
        containerName: blobContainerName,
        logger,
      });

      const limits = loadLimitsConfig();

      handlerInstance = createAzureFunctionIngestHandler({
        logger,
        queueAdapter,
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

// Safe wrapper that returns 500 on initialization errors
async function safeHandler(
  request: HttpRequest,
  context: InvocationContext
): Promise<HttpResponseInit> {
  try {
    const handler = getOrCreateHandler();
    return await handler(request, context);
  } catch (error) {
    context.error('Failed to initialize ingest function', error);
    return {
      status: 500,
      jsonBody: {
        error: {
          code: 'INITIALIZATION_ERROR',
          message: 'Service configuration error - ingest function unavailable',
        },
      },
    };
  }
}

// Register HTTP trigger
app.http('ingest', {
  methods: ['POST'],
  authLevel: 'anonymous',
  route: 'v1/events',
  handler: safeHandler,
});
