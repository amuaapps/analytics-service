import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';
import type { Logger } from 'pino';
import {
  createLogger,
  createChildLogger,
  sanitizeLogContext,
  type LogContext,
} from '../../../src/utils/logger.js';

describe('Logger Module', () => {
  let logger: Logger;

  beforeEach(() => {
    logger = createLogger({
      serviceName: 'test-service',
      level: 'info',
      env: 'test',
    });
  });

  afterEach(() => {
    logger.flush();
  });

  describe('createLogger', () => {
    it('should create a logger with correct base fields', () => {
      const testLogger = createLogger({
        serviceName: 'analytics-service',
        level: 'debug',
        env: 'dev',
      });

      expect(testLogger).toBeDefined();
      expect(testLogger.level).toBe('debug');
    });

    it('should create logger with info level for production', () => {
      const prodLogger = createLogger({
        serviceName: 'analytics-service',
        level: 'info',
        env: 'prod',
      });

      expect(prodLogger.level).toBe('info');
    });

    it('should create logger with warn level', () => {
      const warnLogger = createLogger({
        serviceName: 'analytics-service',
        level: 'warn',
        env: 'staging',
      });

      expect(warnLogger.level).toBe('warn');
    });

    it('should create logger with error level', () => {
      const errorLogger = createLogger({
        serviceName: 'analytics-service',
        level: 'error',
        env: 'prod',
      });

      expect(errorLogger.level).toBe('error');
    });
  });

  describe('createChildLogger', () => {
    it('should create child logger with request context', () => {
      const context: LogContext = {
        requestId: 'req-123',
        correlationId: 'corr-456',
      };

      const childLogger = createChildLogger(logger, context);

      expect(childLogger).toBeDefined();
      expect(childLogger).not.toBe(logger);
    });

    it('should create child logger with event context', () => {
      const context: LogContext = {
        requestId: 'req-123',
        eventId: 'evt-789',
        batchId: 'batch-456',
      };

      const childLogger = createChildLogger(logger, context);

      expect(childLogger).toBeDefined();
    });

    it('should create child logger with user context', () => {
      const context: LogContext = {
        requestId: 'req-123',
        userId: 'user-456',
        appId: 'web-storefront',
      };

      const childLogger = createChildLogger(logger, context);

      expect(childLogger).toBeDefined();
    });
  });

  describe('sanitizeLogContext', () => {
    it('should redact sensitive fields', () => {
      const context: LogContext = {
        requestId: 'req-123',
        password: 'secret123',
        token: 'bearer-token',
        apiKey: 'api-key-123',
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.password).toBe('[REDACTED]');
      expect(sanitized.token).toBe('[REDACTED]');
      expect(sanitized.apiKey).toBe('[REDACTED]');
    });

    it('should redact PII fields', () => {
      const context: LogContext = {
        requestId: 'req-123',
        email: 'user@example.com',
        phone: '+1234567890',
        ipAddress: '192.168.1.1',
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.email).toBe('[REDACTED]');
      expect(sanitized.phone).toBe('[REDACTED]');
      expect(sanitized.ipAddress).toBe('[REDACTED]');
    });

    it('should redact nested sensitive fields', () => {
      const context: LogContext = {
        requestId: 'req-123',
        user: {
          id: 'user-123',
          email: 'user@example.com',
          password: 'secret',
        },
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect((sanitized.user as Record<string, unknown>).id).toBe('user-123');
      expect((sanitized.user as Record<string, unknown>).email).toBe('[REDACTED]');
      expect((sanitized.user as Record<string, unknown>).password).toBe('[REDACTED]');
    });

    it('should handle arrays with sensitive data', () => {
      const context: LogContext = {
        requestId: 'req-123',
        users: [
          { id: 'user-1', email: 'user1@example.com' },
          { id: 'user-2', email: 'user2@example.com' },
        ],
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      const users = sanitized.users as Array<Record<string, unknown>>;
      expect(users[0].id).toBe('user-1');
      expect(users[0].email).toBe('[REDACTED]');
      expect(users[1].id).toBe('user-2');
      expect(users[1].email).toBe('[REDACTED]');
    });

    it('should preserve safe fields', () => {
      const context: LogContext = {
        requestId: 'req-123',
        eventId: 'evt-456',
        batchId: 'batch-789',
        appId: 'web-storefront',
        eventType: 'track',
        eventName: 'button.clicked',
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized).toEqual(context);
    });

    it('should handle null and undefined values', () => {
      const context: LogContext = {
        requestId: 'req-123',
        nullValue: null,
        undefinedValue: undefined,
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.nullValue).toBeNull();
      expect(sanitized.undefinedValue).toBeUndefined();
    });

    it('should redact fields with case-insensitive matching', () => {
      const context: LogContext = {
        requestId: 'req-123',
        Password: 'secret',
        API_KEY: 'key-123',
        userEmail: 'user@example.com',
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.Password).toBe('[REDACTED]');
      expect(sanitized.API_KEY).toBe('[REDACTED]');
      expect(sanitized.userEmail).toBe('[REDACTED]');
    });

    it('should redact authorization headers', () => {
      const context: LogContext = {
        requestId: 'req-123',
        authorization: 'Bearer token-123',
        cookie: 'session=abc123',
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.authorization).toBe('[REDACTED]');
      expect(sanitized.cookie).toBe('[REDACTED]');
    });

    it('should redact analytics write key', () => {
      const context: LogContext = {
        requestId: 'req-123',
        analyticsWriteKey: 'secret-key-123',
        writeKey: 'another-secret',
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.analyticsWriteKey).toBe('[REDACTED]');
      expect(sanitized.writeKey).toBe('[REDACTED]');
    });

    it('should handle deeply nested objects', () => {
      const context: LogContext = {
        requestId: 'req-123',
        level1: {
          level2: {
            level3: {
              password: 'secret',
              safeField: 'safe-value',
            },
          },
        },
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      const level3 = (sanitized.level1 as Record<string, unknown>).level2 as Record<string, unknown>;
      const level3Data = level3.level3 as Record<string, unknown>;
      expect(level3Data.password).toBe('[REDACTED]');
      expect(level3Data.safeField).toBe('safe-value');
    });

    it('should handle empty objects', () => {
      const context: LogContext = {
        requestId: 'req-123',
        emptyObject: {},
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.emptyObject).toEqual({});
    });

    it('should handle empty arrays', () => {
      const context: LogContext = {
        requestId: 'req-123',
        emptyArray: [],
      };

      const sanitized = sanitizeLogContext(context);

      expect(sanitized.requestId).toBe('req-123');
      expect(sanitized.emptyArray).toEqual([]);
    });
  });
});
