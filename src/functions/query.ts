import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';
import { createLogger } from '../utils/logger.js';
import { createAzureFunctionQueryHandler } from '../app/azure/function-http-query.js';
import { CosmosEventRepository } from '../infra/azure/cosmos-event-repository.js';
import { getRequiredEnvVar } from '../config/env-loader.js';

// Lazy initialization - dependencies created on first request
let handlerInstance: ReturnType<typeof createAzureFunctionQueryHandler> | null = null;
let initError: Error | null = null;

function getOrCreateHandler(): ReturnType<typeof createAzureFunctionQueryHandler> {
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

      const storageAdapter = new CosmosEventRepository({
        connectionString: cosmosConnectionString,
        databaseId: cosmosDatabaseId,
        containerId: cosmosContainerId,
        logger,
      });

      handlerInstance = createAzureFunctionQueryHandler({
        logger,
        storageAdapter,
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
    context.error('Failed to initialize query function', error);
    return {
      status: 500,
      jsonBody: {
        error: {
          code: 'INITIALIZATION_ERROR',
          message: 'Service configuration error - query function unavailable',
        },
      },
    };
  }
}

// Register HTTP trigger
app.http('query', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v1/events',
  handler: safeHandler,
});
