import { describe, it, expect, beforeAll, afterAll, beforeEach } from '@jest/globals';
import request from 'supertest';
import type { Express } from 'express';
import { createServer } from '../../../src/app/http/server.js';
import { InMemoryQueueAdapter } from '../../../src/infra/queue/in-memory-queue-adapter.js';
import { createLogger } from '../../../src/utils/logger.js';
import { loadConfig } from '../../../src/config/config.js';
import { SCHEMA_VERSION } from '../../../src/domain/base-types.js';

describe('POST /api/v1/events - Integration', () => {
  let app: Express;
  let queueAdapter: InMemoryQueueAdapter;
  let config: ReturnType<typeof loadConfig>;

  beforeAll(() => {
    process.env.NODE_ENV = 'test';
    process.env.SERVICE_NAME = 'analytics-service-test';
    process.env.ANALYTICS_WRITE_KEY = 'test-key-123';
    process.env.CORS_ALLOWED_ORIGINS = '*';

    config = loadConfig();

    const logger = createLogger({
      serviceName: config.service.serviceName,
      level: 'error',
      env: config.service.env,
    });

    queueAdapter = new InMemoryQueueAdapter(logger);

    app = createServer({
      logger,
      queueAdapter,
      config,
    });
  });

  beforeEach(() => {
    queueAdapter.clear();
  });

  afterAll(() => {
    delete process.env.NODE_ENV;
    delete process.env.SERVICE_NAME;
    delete process.env.ANALYTICS_WRITE_KEY;
    delete process.env.CORS_ALLOWED_ORIGINS;
  });

  describe('successful ingestion', () => {
    it('should accept valid track event and return 202', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-08T06:00:00Z',
            source: {
              appId: 'web-storefront',
              platform: 'web',
              env: 'test',
            },
            actor: {
              userId: 'user-123',
            },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .send(payload);

      if (response.status !== 202) {
        console.log('Response status:', response.status);
        console.log('Response body:', JSON.stringify(response.body, null, 2));
      }

      expect(response.status).toBe(202);
      expect(response.body).toEqual({
        accepted: true,
        eventCount: 1,
      });

      expect(response.headers['x-request-id']).toBeDefined();
      expect(queueAdapter.size()).toBe(1);

      const queuedMessage = queueAdapter.getQueue()[0];
      expect(queuedMessage.requestId).toBeDefined();
      expect(queuedMessage.batchId).toBeDefined();
      expect(queuedMessage.events).toHaveLength(1);
      expect(queuedMessage.events[0].eventId).toBe('550e8400-e29b-41d4-a716-446655440000');
    });

    it('should accept multiple events in batch', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'event.one',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'track',
            name: 'event.two',
            occurredAt: '2026-01-08T06:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440002',
            type: 'page',
            name: 'page.viewed',
            occurredAt: '2026-01-08T06:00:02Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .send(payload)
        .expect(202);

      expect(response.body).toEqual({
        accepted: true,
        eventCount: 3,
      });

      expect(queueAdapter.size()).toBe(1);
      const queuedMessage = queueAdapter.getQueue()[0];
      expect(queuedMessage.events).toHaveLength(3);
    });

    it('should propagate X-Request-ID header', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .set('X-Request-ID', 'custom-req-id-123')
        .send(payload)
        .expect(202);

      expect(response.headers['x-request-id']).toBeDefined();

      const queuedMessage = queueAdapter.getQueue()[0];
      expect(queuedMessage.requestId).toBeDefined();
    });

    it('should enqueue one message per request (batch)', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'event.one',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'track',
            name: 'event.two',
            occurredAt: '2026-01-08T06:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .send(payload)
        .expect(202);

      expect(queueAdapter.size()).toBe(1);
    });
  });

  describe('authentication', () => {
    it('should reject request without write key', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const response = await request(app).post('/api/v1/events').send(payload).expect(401);

      expect(response.body).toEqual({
        error: 'Unauthorized',
        message: 'Missing X-Analytics-Write-Key header',
      });

      expect(queueAdapter.size()).toBe(0);
    });

    it('should reject request with invalid write key', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'wrong-key')
        .send(payload)
        .expect(401);

      expect(response.body).toEqual({
        error: 'Unauthorized',
        message: 'Invalid X-Analytics-Write-Key',
      });

      expect(queueAdapter.size()).toBe(0);
    });
  });

  describe('validation', () => {
    it('should reject invalid event schema', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'not-a-uuid',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .send(payload)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(response.body).toHaveProperty('message', 'Invalid request payload');
      expect(response.body).toHaveProperty('details');

      expect(queueAdapter.size()).toBe(0);
    });

    it('should reject batch exceeding max events', async () => {
      const events = Array.from({ length: 51 }, (_, i) => ({
        schemaVersion: SCHEMA_VERSION,
        eventId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        type: 'track' as const,
        name: 'test.event',
        occurredAt: '2026-01-08T06:00:00Z',
        source: { appId: 'app', platform: 'web' as const, env: 'test' as const },
        actor: { userId: 'user-1' },
      }));

      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events,
      };

      const response = await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .send(payload)
        .expect(400);

      expect(response.body).toHaveProperty('error', 'Bad Request');
      expect(queueAdapter.size()).toBe(0);
    });

    it('should reject entire batch if any event is invalid', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'valid.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'invalid-uuid',
            type: 'track',
            name: 'invalid.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .send(payload)
        .expect(400);

      expect(queueAdapter.size()).toBe(0);
    });
  });

  describe('CORS', () => {
    it('should handle preflight OPTIONS request', async () => {
      const response = await request(app)
        .options('/api/v1/events')
        .set('Origin', 'https://example.com')
        .expect(204);

      expect(response.headers['access-control-allow-origin']).toBe('*');
      expect(response.headers['access-control-allow-methods']).toContain('POST');
      expect(response.headers['access-control-allow-headers']).toContain('X-Analytics-Write-Key');
    });

    it('should set CORS headers on POST response', async () => {
      const payload = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'test.event',
            occurredAt: '2026-01-08T06:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'test' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const response = await request(app)
        .post('/api/v1/events')
        .set('X-Analytics-Write-Key', 'test-key-123')
        .set('Origin', 'https://example.com')
        .send(payload)
        .expect(202);

      expect(response.headers['access-control-allow-origin']).toBe('*');
    });
  });

  describe('health check', () => {
    it('should return 200 for health endpoint', async () => {
      const response = await request(app).get('/health').expect(200);

      expect(response.body).toEqual({
        status: 'healthy',
        service: config.service.serviceName,
        version: '1.0.0',
      });
    });
  });
});
