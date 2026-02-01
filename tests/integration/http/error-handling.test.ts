import { describe, it, expect, beforeEach } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '../../../src/app/http/server.js';
import { createLogger } from '../../../src/utils/logger.js';
import { InMemoryQueueAdapter } from '../../../src/infra/queue/in-memory-queue-adapter.js';
import { InMemoryOperationalStorage } from '../../../src/infra/storage/in-memory-operational-storage.js';
import { InMemoryRawStorage } from '../../../src/infra/storage/in-memory-raw-storage.js';
import type { Config } from '../../../src/config/types.js';

describe('Error Handling Integration Tests', () => {
  let server: Express;
  let logger: ReturnType<typeof createLogger>;
  let queueAdapter: InMemoryQueueAdapter;
  let storageAdapter: InMemoryOperationalStorage;
  let rawStorage: InMemoryRawStorage;
  let config: Config;

  beforeEach(() => {
    logger = createLogger({
      serviceName: 'test-analytics-service',
      level: 'error',
      env: 'test',
    });

    queueAdapter = new InMemoryQueueAdapter(logger);
    storageAdapter = new InMemoryOperationalStorage(logger);
    rawStorage = new InMemoryRawStorage(logger);

    config = {
      service: {
        serviceName: 'test-analytics-service',
        env: 'test',
        logLevel: 'error',
      },
      limits: {
        maxPayloadSizeBytes: 1048576,
        maxEventsPerBatch: 100,
        minEventsPerBatch: 1,
        maxPropertyDepth: 10,
        maxKeysPerLevel: 50,
        maxStringLength: 2048,
        maxArrayLength: 100,
        maxQueryWindowDays: 31,
        defaultQueryLimit: 50,
        maxQueryLimit: 200,
      },
      security: {
        analyticsWriteKey: 'test-write-key',
        corsAllowedOrigins: ['*'],
      },
    };

    server = createServer({
      logger,
      queueAdapter,
      storageAdapter,
      rawStorage,
      config,
    });
  });

  describe('Consistent Error Response Format', () => {
    it('should return consistent 401 error format for missing auth', async () => {
      const response = await request(server).post('/api/v1/events').send({
        schemaVersion: '1.0.0',
        events: [],
      });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('should return consistent 401 error format for invalid auth', async () => {
      const response = await request(server)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'invalid-key')
        .send({
          schemaVersion: '1.0.0',
          events: [],
        });

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('AUTHENTICATION_ERROR');
      expect(response.body.error.message).toContain('Invalid write key');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('should return consistent 400 error format for validation errors', async () => {
      const response = await request(server)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-write-key')
        .send({
          schemaVersion: '1.0.0',
          events: 'not-an-array',
        });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error).toHaveProperty('code');
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('should return consistent 400 error format for query validation', async () => {
      const response = await request(server).get('/api/v1/events').query({
        // Missing required appId
        from: '2026-01-01T00:00:00Z',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body).toHaveProperty('requestId');
      expect(response.body).not.toHaveProperty('stack');
    });

    it('should return consistent 400 error for invalid cursor', async () => {
      const recentDate = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();

      const response = await request(server).get('/api/v1/events').query({
        appId: 'test-app',
        from: recentDate,
        cursor: 'invalid-cursor-format',
      });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('error');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
      expect(response.body.error.message).toContain('Invalid');
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  describe('Error Response Should Not Leak Sensitive Information', () => {
    it('should not expose stack traces in error responses', async () => {
      const response = await request(server)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-write-key')
        .send({
          schemaVersion: '1.0.0',
          events: [],
        });

      expect(response.body).not.toHaveProperty('stack');
      expect(response.body).not.toHaveProperty('stackTrace');
      // Check for stack trace patterns (not "at least" from validation messages)
      expect(JSON.stringify(response.body)).not.toMatch(/\bat\s+\w+\./);
      expect(JSON.stringify(response.body)).not.toContain('.ts:');
    });

    it('should sanitize validation error details', async () => {
      const response = await request(server)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-write-key')
        .send({
          schemaVersion: '1.0.0',
          events: [
            {
              // Missing required fields
              eventId: '550e8400-e29b-41d4-a716-446655440000',
            },
          ],
        });

      expect(response.status).toBe(400);
      expect(response.body.error).toHaveProperty('message');
      expect(response.body.error.message).toBeTruthy();
      expect(response.body).not.toHaveProperty('stack');
    });
  });

  describe('Error Responses Include Request ID', () => {
    it('should include requestId in 401 responses', async () => {
      const response = await request(server)
        .post('/api/v1/events')
        .set('X-Request-ID', 'test-request-123')
        .send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('requestId');
      expect(response.headers['x-request-id']).toBeTruthy();
    });

    it('should include requestId in 400 responses', async () => {
      const response = await request(server)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-write-key')
        .set('X-Request-ID', 'test-request-456')
        .send({ invalid: 'data' });

      expect(response.status).toBe(400);
      expect(response.body).toHaveProperty('requestId');
    });

    it('should generate requestId if not provided', async () => {
      const response = await request(server).post('/api/v1/events').send({});

      expect(response.status).toBe(401);
      expect(response.body).toHaveProperty('requestId');
      expect(response.body.requestId).toBeTruthy();
      expect(typeof response.body.requestId).toBe('string');
    });
  });

  describe('Deterministic Error Messages for Tests', () => {
    it('should return consistent error messages for same validation error', async () => {
      const payload = {
        schemaVersion: '1.0.0',
        events: [],
      };

      const response1 = await request(server)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-write-key')
        .send(payload);

      const response2 = await request(server)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-write-key')
        .send(payload);

      expect(response1.status).toBe(response2.status);
      expect(response1.body.error.code).toBe(response2.body.error.code);
      expect(response1.body.error.message).toBe(response2.body.error.message);
    });

    it('should return consistent auth error messages', async () => {
      const response1 = await request(server).post('/api/v1/events').send({});
      const response2 = await request(server).post('/api/v1/events').send({});

      expect(response1.body.error.message).toBe(response2.body.error.message);
      expect(response1.body.error.code).toBe(response2.body.error.code);
    });
  });
});
