/**
 * AWS Lambda Entrypoints
 * 
 * This file exports the Lambda handlers that match the Terraform handler configuration.
 * Each handler is initialized with the appropriate dependencies and configuration.
 */

import type { APIGatewayProxyEvent, APIGatewayProxyResult, Context, SQSEvent } from 'aws-lambda';
import { createLambdaIngestHandler } from './lambda-http-ingest.js';
import { createLambdaQueryHandler } from './lambda-http-query.js';
import { createLambdaSQSProcessorHandler } from './lambda-sqs-processor.js';
import { loadLimitsConfig } from '../../config/limits.js';
import { createLogger } from '../../utils/logger.js';
import { SQSQueuePublisher } from '../../infra/aws/sqs-queue-publisher.js';
import { DynamoDBEventRepository } from '../../infra/aws/dynamodb-event-repository.js';
import { S3RawEventStore } from '../../infra/aws/s3-raw-event-store.js';
import { loadAnalyticsWriteKey } from '../../config/secrets.js';

// Cache for write key (loaded once per Lambda instance)
let cachedWriteKey: string | null = null;

// Load configuration from environment variables
function loadConfig() {
  return {
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
  };
}

// Load and cache write key from Secrets Manager
async function getWriteKey(): Promise<string> {
  if (cachedWriteKey) {
    return cachedWriteKey;
  }

  // Fetch from Secrets Manager (with internal caching)
  cachedWriteKey = await loadAnalyticsWriteKey('aws');
  return cachedWriteKey;
}

// Validate authentication with constant-time comparison
async function validateAuth(event: APIGatewayProxyEvent): Promise<void> {
  const authHeader = event.headers['x-analytics-write-key'] || event.headers['X-Analytics-Write-Key'];

  if (!authHeader || typeof authHeader !== 'string') {
    throw new Error('AUTHENTICATION_ERROR: Missing or invalid write key');
  }

  const validKey = await getWriteKey();
  
  // Constant-time comparison to prevent timing attacks
  if (validKey.length !== authHeader.length) {
    throw new Error('AUTHENTICATION_ERROR: Invalid write key');
  }
  
  let matches = true;
  for (let i = 0; i < validKey.length; i++) {
    if (validKey.charCodeAt(i) !== authHeader.charCodeAt(i)) {
      matches = false;
    }
  }
  
  if (!matches) {
    throw new Error('AUTHENTICATION_ERROR: Invalid write key');
  }
}

// Create canonical error response
function createErrorResponse(
  error: unknown,
  statusCode: number = 500,
  requestId?: string
): APIGatewayProxyResult {
  const message = error instanceof Error ? error.message.replace(/^[A-Z_]+:\s*/, '') : 'Internal server error';
  const errorCode = error instanceof Error && error.message.startsWith('AUTHENTICATION_ERROR')
    ? 'AUTHENTICATION_ERROR'
    : statusCode === 400
    ? 'VALIDATION_ERROR'
    : statusCode === 413
    ? 'PAYLOAD_TOO_LARGE'
    : 'INTERNAL_SERVER_ERROR';

  const body: { error: { code: string; message: string }; requestId?: string } = {
    error: {
      code: errorCode,
      message,
    },
  };

  if (requestId) {
    body.requestId = requestId;
  }

  return {
    statusCode,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(body),
  };
}

// Initialize shared dependencies (lazy initialization)
let ingestHandlerInstance: ReturnType<typeof createLambdaIngestHandler> | null = null;
let queryHandlerInstance: ReturnType<typeof createLambdaQueryHandler> | null = null;
let processorHandlerInstance: ReturnType<typeof createLambdaSQSProcessorHandler> | null = null;

/**
 * Ingest Lambda Handler
 * Terraform handler: "dist/app/aws/entrypoints.ingestHandler"
 */
export async function ingestHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  const requestId = context.awsRequestId;

  try {
    // Validate authentication (async - fetches from Secrets Manager)
    await validateAuth(event);

    // Lazy initialize handler
    if (!ingestHandlerInstance) {
      const config = loadConfig();
      const logger = createLogger({
        serviceName: 'analytics-ingest',
        env: config.NODE_ENV,
        level: config.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error',
      });

      const queueUrl = process.env.SQS_QUEUE_URL;
      if (!queueUrl) {
        throw new Error('SQS_QUEUE_URL environment variable is required');
      }

      const bucketName = process.env.S3_RAW_EVENTS_BUCKET;
      if (!bucketName) {
        throw new Error('S3_RAW_EVENTS_BUCKET environment variable is required');
      }

      const region = process.env.AWS_REGION || 'us-east-1';
      const queueAdapter = new SQSQueuePublisher({ queueUrl, region, logger });
      const rawStorage = new S3RawEventStore({ bucketName, region, logger });
      ingestHandlerInstance = createLambdaIngestHandler({ logger, queueAdapter, rawStorage });
    }

    return await ingestHandlerInstance(event, context);
  } catch (error) {
    // Handle authentication errors with canonical 401 response
    if (error instanceof Error && error.message.startsWith('AUTHENTICATION_ERROR')) {
      return createErrorResponse(error, 401, requestId);
    }
    // Re-throw other errors to be handled by Lambda error handling
    throw error;
  }
}

/**
 * Query Lambda Handler
 * Terraform handler: "dist/app/aws/entrypoints.queryHandler"
 */
export async function queryHandler(
  event: APIGatewayProxyEvent,
  context: Context
): Promise<APIGatewayProxyResult> {
  try {
    // Lazy initialize handler
    if (!queryHandlerInstance) {
      const config = loadConfig();
      const logger = createLogger({
        serviceName: 'analytics-query',
        env: config.NODE_ENV,
        level: config.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error',
      });

      const tableName = process.env.DYNAMODB_TABLE_NAME;
      if (!tableName) {
        throw new Error('DYNAMODB_TABLE_NAME environment variable is required');
      }

      const region = process.env.AWS_REGION || 'us-east-1';
      const storageAdapter = new DynamoDBEventRepository({ tableName, region, logger });
      queryHandlerInstance = createLambdaQueryHandler({ logger, storageAdapter });
    }

    return await queryHandlerInstance(event, context);
  } catch (error) {
    const logger = createLogger({
      serviceName: 'analytics-query',
      env: process.env.NODE_ENV || 'development',
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    });
    logger.error({ err: error, requestId: context.awsRequestId }, 'Query handler initialization error');
    throw error;
  }
}

/**
 * Processor Lambda Handler (SQS Trigger)
 * Terraform handler: "dist/app/aws/entrypoints.processorHandler"
 */
export async function processorHandler(
  event: SQSEvent,
  context: Context
): Promise<void> {
  try {
    // Lazy initialize handler
    if (!processorHandlerInstance) {
      const config = loadConfig();
      const limits = loadLimitsConfig();
      const logger = createLogger({
        serviceName: 'analytics-processor',
        env: config.NODE_ENV,
        level: config.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error',
      });

      const tableName = process.env.DYNAMODB_TABLE_NAME;
      const bucketName = process.env.S3_RAW_BUCKET_NAME;

      if (!tableName) {
        throw new Error('DYNAMODB_TABLE_NAME environment variable is required');
      }
      if (!bucketName) {
        throw new Error('S3_RAW_BUCKET_NAME environment variable is required');
      }

      const region = process.env.AWS_REGION || 'us-east-1';
      const operationalStorage = new DynamoDBEventRepository({ tableName, region, logger });
      const rawStorage = new S3RawEventStore({ bucketName, region, logger });

      processorHandlerInstance = createLambdaSQSProcessorHandler({
        logger,
        operationalStorage,
        rawStorage,
        limits,
      });
    }

    return await processorHandlerInstance(event, context);
  } catch (error) {
    const logger = createLogger({
      serviceName: 'analytics-processor',
      env: process.env.NODE_ENV || 'development',
      level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
    });
    logger.error({ err: error, requestId: context.awsRequestId }, 'Processor handler initialization error');
    throw error;
  }
}
