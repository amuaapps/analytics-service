import { app, HttpRequest, HttpResponseInit, InvocationContext } from '@azure/functions';

interface HealthStatus {
  status: 'healthy' | 'degraded' | 'unhealthy';
  service: string;
  version: string;
  timestamp: string;
  checks?: {
    cosmos?: { status: 'ok' | 'error'; message?: string };
    storage?: { status: 'ok' | 'error'; message?: string };
    queue?: { status: 'ok' | 'error'; message?: string };
  };
}

function checkConfiguration(): HealthStatus {
  const checks: HealthStatus['checks'] = {};
  let overallStatus: 'healthy' | 'degraded' | 'unhealthy' = 'healthy';

  // Check Cosmos DB configuration
  const cosmosConn = process.env.AZURE_COSMOS_CONNECTION_STRING;
  const cosmosDb = process.env.AZURE_COSMOS_DATABASE_NAME;
  const cosmosContainer = process.env.AZURE_COSMOS_CONTAINER_NAME;

  if (!cosmosConn || !cosmosDb || !cosmosContainer) {
    checks.cosmos = {
      status: 'error',
      message: 'Missing Cosmos DB configuration',
    };
    overallStatus = 'degraded';
  } else {
    checks.cosmos = { status: 'ok' };
  }

  // Check Storage configuration
  const storageConn = process.env.AZURE_STORAGE_CONNECTION_STRING;
  const blobContainer = process.env.AZURE_BLOB_CONTAINER_NAME;

  if (!storageConn || !blobContainer) {
    checks.storage = {
      status: 'error',
      message: 'Missing Storage configuration',
    };
    overallStatus = 'degraded';
  } else {
    checks.storage = { status: 'ok' };
  }

  // Check Queue configuration
  const queueName = process.env.AZURE_QUEUE_NAME;

  if (!queueName) {
    checks.queue = {
      status: 'error',
      message: 'Missing Queue configuration',
    };
    overallStatus = 'degraded';
  } else {
    checks.queue = { status: 'ok' };
  }

  return {
    status: overallStatus,
    service: 'analytics-service',
    version: '1.0.0',
    timestamp: new Date().toISOString(),
    checks,
  };
}

function healthHandler(_request: HttpRequest, context: InvocationContext): HttpResponseInit {
  context.log('Health check requested');

  const health = checkConfiguration();

  // Return 200 even if degraded - health endpoint is reachable
  // Return 503 only if completely unhealthy
  const statusCode = health.status === 'unhealthy' ? 503 : 200;

  return {
    status: statusCode,
    jsonBody: health,
  };
}

app.http('health', {
  methods: ['GET'],
  authLevel: 'anonymous',
  route: 'v1/health',
  handler: healthHandler,
});
