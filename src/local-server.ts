#!/usr/bin/env node
/**
 * Local Development Server
 * 
 * Runs the analytics service with in-memory implementations for local development.
 * No cloud dependencies required.
 * 
 * Usage:
 *   npm run dev
 *   or
 *   node --loader ts-node/esm src/local-server.ts
 */

import { createServer } from './app/http/server.js';
import { createLogger } from './utils/logger.js';
import { InMemoryQueueAdapter } from './infra/queue/in-memory-queue-adapter.js';
import { InMemoryOperationalStorage } from './infra/storage/in-memory-operational-storage.js';
import type { Config } from './config/types.js';

const PORT = process.env.PORT ? parseInt(process.env.PORT, 10) : 3000;

// Create logger
const logger = createLogger({
  serviceName: 'analytics-service',
  level: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  env: 'development',
});

// Create in-memory implementations (no cloud dependencies)
const queueAdapter = new InMemoryQueueAdapter(logger);
const storageAdapter = new InMemoryOperationalStorage(logger);

// Local development configuration
const config: Config = {
  service: {
    serviceName: 'analytics-service',
    env: 'dev',
    logLevel: (process.env.LOG_LEVEL as 'debug' | 'info' | 'warn' | 'error') || 'info',
  },
  limits: {
    maxPayloadSizeBytes: parseInt(process.env.MAX_PAYLOAD_SIZE_BYTES || '1048576', 10),
    maxEventsPerBatch: parseInt(process.env.MAX_EVENTS_PER_BATCH || '100', 10),
    minEventsPerBatch: parseInt(process.env.MIN_EVENTS_PER_BATCH || '1', 10),
    maxPropertyDepth: parseInt(process.env.MAX_PROPERTY_DEPTH || '10', 10),
    maxKeysPerLevel: parseInt(process.env.MAX_KEYS_PER_LEVEL || '50', 10),
    maxStringLength: parseInt(process.env.MAX_STRING_LENGTH || '2048', 10),
    maxArrayLength: parseInt(process.env.MAX_ARRAY_LENGTH || '100', 10),
    maxQueryWindowDays: parseInt(process.env.MAX_QUERY_WINDOW_DAYS || '31', 10),
    defaultQueryLimit: parseInt(process.env.DEFAULT_QUERY_LIMIT || '50', 10),
    maxQueryLimit: parseInt(process.env.MAX_QUERY_LIMIT || '200', 10),
  },
  security: {
    analyticsWriteKey: process.env.ANALYTICS_WRITE_KEY || 'local-dev-key-12345',
    corsAllowedOrigins: process.env.CORS_ALLOWED_ORIGINS?.split(',') || ['*'],
  },
};

// Create and start server
const app = createServer({
  logger,
  queueAdapter,
  storageAdapter,
  config,
});

const server = app.listen(PORT, () => {
  logger.info(
    {
      port: PORT,
      env: 'development',
      mode: 'in-memory',
      writeKey: config.security.analyticsWriteKey,
    },
    '🚀 Analytics Service started (local development mode)'
  );
  
  logger.info(
    {
      ingest: `http://localhost:${PORT}/api/v1/events`,
      query: `http://localhost:${PORT}/api/v1/events?appId=test&from=2026-01-01T00:00:00Z`,
      health: `http://localhost:${PORT}/health`,
    },
    '📍 Available endpoints'
  );
  
  logger.info(
    {
      writeKey: config.security.analyticsWriteKey,
    },
    '🔑 Use this write key in X-Analytics-Write-Key header'
  );
  
  logger.info('💡 Press Ctrl+C to stop');
});

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  server.close(() => {
    logger.info('Server closed');
    process.exit(0);
  });
});

// Handle uncaught errors
process.on('uncaughtException', (error) => {
  logger.error({ err: error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.error({ reason }, 'Unhandled rejection');
  process.exit(1);
});
