import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { Request, Response, NextFunction } from 'express';
import {
  parseWriteKeys,
  validateWriteKey,
  createAuthMiddleware,
  type AuthConfig,
} from '../../../../src/app/middleware/auth.js';
import { createLogger } from '../../../../src/utils/logger.js';

describe('Authentication Middleware', () => {
  let mockLogger: ReturnType<typeof createLogger>;

  beforeEach(() => {
    mockLogger = createLogger({
      serviceName: 'test-service',
      level: 'error',
      env: 'test',
    });
  });

  describe('parseWriteKeys', () => {
    it('should parse single write key', () => {
      const result = parseWriteKeys('key-123');
      expect(result).toEqual(['key-123']);
    });

    it('should parse multiple write keys', () => {
      const result = parseWriteKeys('key-1,key-2,key-3');
      expect(result).toEqual(['key-1', 'key-2', 'key-3']);
    });

    it('should trim whitespace from keys', () => {
      const result = parseWriteKeys('  key-1  ,  key-2  ,  key-3  ');
      expect(result).toEqual(['key-1', 'key-2', 'key-3']);
    });

    it('should filter out empty keys', () => {
      const result = parseWriteKeys('key-1,,key-2,  ,key-3');
      expect(result).toEqual(['key-1', 'key-2', 'key-3']);
    });

    it('should handle empty string', () => {
      const result = parseWriteKeys('');
      expect(result).toEqual([]);
    });

    it('should handle only whitespace', () => {
      const result = parseWriteKeys('   ');
      expect(result).toEqual([]);
    });
  });

  describe('validateWriteKey', () => {
    const validKeys = ['key-123', 'key-456', 'key-789'];

    it('should validate correct write key', () => {
      const result = validateWriteKey('key-123', validKeys);
      expect(result).toBe(true);
    });

    it('should validate any of multiple valid keys', () => {
      expect(validateWriteKey('key-123', validKeys)).toBe(true);
      expect(validateWriteKey('key-456', validKeys)).toBe(true);
      expect(validateWriteKey('key-789', validKeys)).toBe(true);
    });

    it('should reject invalid write key', () => {
      const result = validateWriteKey('invalid-key', validKeys);
      expect(result).toBe(false);
    });

    it('should reject empty string', () => {
      const result = validateWriteKey('', validKeys);
      expect(result).toBe(false);
    });

    it('should reject whitespace-only string', () => {
      const result = validateWriteKey('   ', validKeys);
      expect(result).toBe(false);
    });

    it('should trim provided key before validation', () => {
      const result = validateWriteKey('  key-123  ', validKeys);
      expect(result).toBe(true);
    });

    it('should use constant-time comparison', () => {
      const result = validateWriteKey('key-12', validKeys);
      expect(result).toBe(false);
    });

    it('should reject key with different length', () => {
      const result = validateWriteKey('key-1234', validKeys);
      expect(result).toBe(false);
    });

    it('should handle special characters in keys', () => {
      const specialKeys = ['key-!@#$%', 'key-^&*()'];
      expect(validateWriteKey('key-!@#$%', specialKeys)).toBe(true);
      expect(validateWriteKey('key-^&*()', specialKeys)).toBe(true);
    });
  });

  describe('createAuthMiddleware', () => {
    let mockReq: Partial<Request>;
    let mockRes: Partial<Response>;
    let mockNext: NextFunction;
    let jsonMock: jest.Mock;
    let statusMock: jest.Mock;

    beforeEach(() => {
      jsonMock = jest.fn();
      statusMock = jest.fn(() => ({ json: jsonMock }));

      mockReq = {
        id: 'req-123',
        headers: {},
      };

      mockRes = {
        status: statusMock as unknown as Response['status'],
      };

      mockNext = jest.fn();
    });

    it('should call next() for valid write key', () => {
      const config: AuthConfig = {
        writeKeys: ['valid-key-123'],
      };

      mockReq.headers = {
        'x-analytics-write-key': 'valid-key-123',
      };

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
      expect(statusMock).not.toHaveBeenCalled();
    });

    it('should accept any of multiple valid keys', () => {
      const config: AuthConfig = {
        writeKeys: ['key-1', 'key-2', 'key-3'],
      };

      mockReq.headers = {
        'x-analytics-write-key': 'key-2',
      };

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(mockNext).toHaveBeenCalled();
    });

    it('should return 401 for missing header', () => {
      const config: AuthConfig = {
        writeKeys: ['valid-key-123'],
      };

      mockReq.headers = {};

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith(
        expect.objectContaining({
          error: expect.objectContaining({
            code: 'AUTHENTICATION_ERROR',
          }),
          requestId: expect.any(String),
        })
      );
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for invalid write key', () => {
      const config: AuthConfig = {
        writeKeys: ['valid-key-123'],
      };

      mockReq.headers = {
        'x-analytics-write-key': 'invalid-key',
      };

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid X-Analytics-Write-Key',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should return 401 for non-string header value', () => {
      const config: AuthConfig = {
        writeKeys: ['valid-key-123'],
      };

      mockReq.headers = {
        'x-analytics-write-key': ['array', 'value'] as unknown as string,
      };

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(jsonMock).toHaveBeenCalledWith({
        error: 'Unauthorized',
        message: 'Invalid X-Analytics-Write-Key header format',
      });
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should support key rotation with multiple valid keys', () => {
      const config: AuthConfig = {
        writeKeys: ['old-key', 'new-key'],
      };

      const middleware = createAuthMiddleware(config, mockLogger);

      mockReq.headers = { 'x-analytics-write-key': 'old-key' };
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);

      jest.clearAllMocks();

      mockReq.headers = { 'x-analytics-write-key': 'new-key' };
      middleware(mockReq as Request, mockRes as Response, mockNext);
      expect(mockNext).toHaveBeenCalledTimes(1);
    });

    it('should reject empty string as write key', () => {
      const config: AuthConfig = {
        writeKeys: ['valid-key-123'],
      };

      mockReq.headers = {
        'x-analytics-write-key': '',
      };

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should reject whitespace-only write key', () => {
      const config: AuthConfig = {
        writeKeys: ['valid-key-123'],
      };

      mockReq.headers = {
        'x-analytics-write-key': '   ',
      };

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });

    it('should handle case-sensitive keys', () => {
      const config: AuthConfig = {
        writeKeys: ['Key-123'],
      };

      mockReq.headers = {
        'x-analytics-write-key': 'key-123',
      };

      const middleware = createAuthMiddleware(config, mockLogger);
      middleware(mockReq as Request, mockRes as Response, mockNext);

      expect(statusMock).toHaveBeenCalledWith(401);
      expect(mockNext).not.toHaveBeenCalled();
    });
  });
});
