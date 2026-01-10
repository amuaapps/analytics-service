import { app } from '@azure/functions';
import { createLogger } from '../utils/logger.js';
import { createAzureFunctionQueryHandler } from '../app/azure/function-http-query.js';
import { CosmosEventRepository } from '../infra/azure/cosmos-event-repository.js';
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

const storageAdapter = new CosmosEventRepository({
  connectionString: cosmosConnectionString,
  databaseId: cosmosDatabaseId,
  containerId: cosmosContainerId,
  logger,
});

// Create handler
const handler = createAzureFunctionQueryHandler({
  logger,
  storageAdapter,
});

// Register HTTP trigger
app.http('query', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'events',
  handler,
});
