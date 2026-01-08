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
import { createLogger } from '../../utils/logger.js';
import { SQSQueuePublisher } from '../../infra/aws/sqs-queue-publisher.js';
import { DynamoDBEventRepository } from '../../infra/aws/dynamodb-event-repository.js';
import { S3RawEventStore } from '../../infra/aws/s3-raw-event-store.js';

// Load configuration from environment variables
function loadConfig() {
  const requiredEnvVars = {
    NODE_ENV: process.env.NODE_ENV || 'development',
    LOG_LEVEL: process.env.LOG_LEVEL || 'info',
    ANALYTICS_WRITE_KEY: process.env.ANALYTICS_WRITE_KEY,
  };

  // Validate required environment variables
  if (!requiredEnvVars.ANALYTICS_WRITE_KEY) {
    throw new Error('ANALYTICS_WRITE_KEY environment variable is required');
  }

  return requiredEnvVars;
}

// Validate authentication
function validateAuth(event: APIGatewayProxyEvent): void {
  const config = loadConfig();
  const authHeader = event.headers['x-analytics-write-key'] || event.headers['X-Analytics-Write-Key'];

  if (!authHeader) {
    throw new Error('Missing X-Analytics-Write-Key header');
  }

  if (authHeader !== config.ANALYTICS_WRITE_KEY) {
    throw new Error('Invalid write key');
  }
}

// Create error response for auth failures
function createAuthErrorResponse(error: Error): APIGatewayProxyResult {
  const isAuthError = error.message.includes('write key') || error.message.includes('Missing X-Analytics-Write-Key');
  
  return {
    statusCode: isAuthError ? 401 : 500,
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      error: isAuthError ? 'Unauthorized' : 'Internal Server Error',
      message: error.message,
    }),
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
  try {
    // Validate authentication
    validateAuth(event);

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

      const region = process.env.AWS_REGION || 'us-east-1';
      const queueAdapter = new SQSQueuePublisher({ queueUrl, region, logger });
      ingestHandlerInstance = createLambdaIngestHandler({ logger, queueAdapter });
    }

    return await ingestHandlerInstance(event, context);
  } catch (error) {
    if (error instanceof Error && (error.message.includes('write key') || error.message.includes('Missing X-Analytics-Write-Key'))) {
      return createAuthErrorResponse(error);
    }
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
