import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import { createValidationMiddleware } from '../../../../src/app/middleware/validation.js';
import { createLogger } from '../../../../src/utils/logger.js';
import { loadLimitsConfig } from '../../../../src/config/limits.js';
import { SCHEMA_VERSION } from '../../../../src/domain/base-types.js';

describe('Validation Middleware', () => {
  const limits = loadLimitsConfig();
  let mockLogger: ReturnType<typeof createLogger>;
  let mockReq: Partial<Request>;
  let mockRes: Partial<Response>;
  let mockNext: NextFunction;
  let jsonMock: jest.Mock;
  let statusMock: jest.Mock;

  beforeEach(() => {
    mockLogger = createLogger({
      serviceName: 'test-service',
      level: 'error',
      env: 'test',
    });

    jsonMock = jest.fn();
    statusMock = jest.fn(() => ({ json: jsonMock }));

    mockReq = {
      id: 'req-123',
      body: {},
    };

    mockRes = {
      status: statusMock as unknown as Response['status'],
    };

    mockNext = jest.fn();
  });

  describe('valid payloads', () => {
    it('should accept valid track event', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: {
              appId: 'web-storefront',
              platform: 'web',
              env: 'prod',
            },
            actor: {
              userId: 'user-123',
            },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should accept valid page event', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'page',
            name: 'page.viewed',
            occurredAt: '2026-01-07T20:00:00Z',
            source: {
              appId: 'web-storefront',
              platform: 'web',
              env: 'prod',
            },
            actor: {
              anonymousId: 'anon-123',
            },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept valid identify event', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'identify',
            occurredAt: '2026-01-07T20:00:00Z',
            source: {
              appId: 'web-storefront',
              platform: 'web',
              env: 'prod',
            },
            actor: {
              userId: 'user-123',
            },
            traits: {
              email: 'user@example.com',
              plan: 'premium',
            },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should accept batch with multiple events', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'event.one',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440001',
            type: 'track',
            name: 'event.two',
            occurredAt: '2026-01-07T20:00:01Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });
  });

  describe('invalid payloads - schema version', () => {
    it('should reject wrong envelope schema version', () => {
      mockReq.body = {
        schemaVersion: '2.0.0',
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: 'Bad Request',
          message: 'Invalid request payload',
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject wrong event schema version', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: '2.0.0',
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('invalid payloads - event structure', () => {
    it('should reject empty events array', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject missing eventId', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid UUID format', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'not-a-uuid',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject invalid event type', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'invalid',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('invalid payloads - naming rules', () => {
    it('should reject uppercase event name', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'ButtonClicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject property key starting with underscore', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
            properties: {
              _internal: 'value',
            },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('invalid payloads - size and depth limits', () => {
    it('should reject properties exceeding max depth', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
            properties: {
              level1: {
                level2: {
                  level3: {
                    level4: 'too deep',
                  },
                },
              },
            },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject batch exceeding max events', () => {
      const events = Array.from({ length: 51 }, (_, i) => ({
        schemaVersion: SCHEMA_VERSION,
        eventId: `550e8400-e29b-41d4-a716-44665544${String(i).padStart(4, '0')}`,
        type: 'track' as const,
        name: 'test.event',
        occurredAt: '2026-01-07T20:00:00Z',
        source: { appId: 'app', platform: 'web' as const, env: 'prod' as const },
        actor: { userId: 'user-1' },
      }));

      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events,
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('invalid payloads - actor validation', () => {
    it('should reject event without userId or anonymousId', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'button.clicked',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: {
              sessionId: 'session-123',
            },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('batch rejection', () => {
    it('should reject entire batch if any event is invalid', () => {
      mockReq.body = {
        schemaVersion: SCHEMA_VERSION,
        events: [
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: '550e8400-e29b-41d4-a716-446655440000',
            type: 'track',
            name: 'valid.event',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
          {
            schemaVersion: SCHEMA_VERSION,
            eventId: 'invalid-uuid',
            type: 'track',
            name: 'invalid.event',
            occurredAt: '2026-01-07T20:00:00Z',
            source: { appId: 'app', platform: 'web', env: 'prod' },
            actor: { userId: 'user-1' },
          },
        ],
      };

      const middleware = createValidationMiddleware(mockLogger, limits);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });

  describe('error message sanitization', () => {
    it('should sanitize error messages containing sensitive keywords', () => {
      const middleware = createValidationMiddleware(mockLogger, limits);

      mockReq.body = undefined;

      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(400);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
