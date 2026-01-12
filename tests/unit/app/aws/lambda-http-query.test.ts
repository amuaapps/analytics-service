import { describe, it, expect, jest, beforeEach } from '@jest/globals';
import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { createLambdaQueryHandler } from '../../../../src/app/aws/lambda-http-query.js';
import type { EventRepository } from '../../../../src/infra/interfaces.js';
import type { Logger } from '../../../../src/utils/logger.js';

describe('Lambda HTTP Query Handler', () => {
  let mockLogger: Logger;
  let mockStorageAdapter: EventRepository;
  let mockContext: Context;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      error: jest.fn(),
      warn: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as Logger;

    mockStorageAdapter = {
      queryEvents: jest.fn(),
    } as unknown as EventRepository;

    mockContext = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      memoryLimitInMB: '128',
      logGroupName: '/aws/lambda/test',
      logStreamName: '2024/01/01/[$LATEST]test',
      getRemainingTimeInMillis: () => 3000,
      callbackWaitsForEmptyEventLoop: true,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };
  });

  describe('Parameter Parsing', () => {
    it('should parse all spec-defined query parameters', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-02T00:00:00Z',
          types: 'track,page',
          names: 'button_click,page_view',
          userId: 'user-123',
          anonymousId: 'anon-456',
          sessionId: 'session-789',
          limit: '100',
          cursor: Buffer.from(
            JSON.stringify({ pk: 'test-app', sk: '2024-01-01T00:00:00Z#event-123' }),
            'utf-8'
          ).toString('base64url'),
          sort: 'asc',
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      (mockStorageAdapter.queryEvents as any).mockResolvedValue({
        events: [],
        cursor: undefined,
        hasMore: false,
      });

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      expect(mockStorageAdapter.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          appId: 'test-app',
          from: '2024-01-01T00:00:00Z',
          to: '2024-01-02T00:00:00Z',
          types: ['track', 'page'],
          names: ['button_click', 'page_view'],
          userId: 'user-123',
          anonymousId: 'anon-456',
          sessionId: 'session-789',
          limit: 100,
          cursor: Buffer.from(
            JSON.stringify({ pk: 'test-app', sk: '2024-01-01T00:00:00Z#event-123' }),
            'utf-8'
          ).toString('base64url'),
          sort: 'asc',
        })
      );
    });

    it('should require appId parameter', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          from: '2024-01-01T00:00:00Z',
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Required');
    });

    it('should require from parameter', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('Required');
    });

    it('should apply default limit of 50', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      (mockStorageAdapter.queryEvents as any).mockResolvedValue({
        events: [],
        cursor: undefined,
        hasMore: false,
      });

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      await handler(event, mockContext);

      expect(mockStorageAdapter.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          limit: 50,
        })
      );
    });

    it('should apply default sort of desc', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      (mockStorageAdapter.queryEvents as any).mockResolvedValue({
        events: [],
        cursor: undefined,
        hasMore: false,
      });

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      await handler(event, mockContext);

      expect(mockStorageAdapter.queryEvents).toHaveBeenCalledWith(
        expect.objectContaining({
          sort: 'desc',
        })
      );
    });

    it('should reject limit exceeding 200', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: '2024-01-01T00:00:00Z',
          limit: '250',
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('200');
    });

    it('should reject date range exceeding 31 days', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: '2024-01-01T00:00:00Z',
          to: '2024-02-15T00:00:00Z',
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
      expect(body.error.message).toContain('31 days');
    });
  });

  describe('Response Format', () => {
    it('should return response with items and nextCursor', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      const mockEvents = [
        { eventId: 'event-1', type: 'track' },
        { eventId: 'event-2', type: 'page' },
      ];

      const expectedCursor = Buffer.from(
        JSON.stringify({ pk: 'test-app', sk: '2024-01-02T00:00:00Z#event-456' }),
        'utf-8'
      ).toString('base64url');

      (mockStorageAdapter.queryEvents as any).mockResolvedValue({
        events: mockEvents,
        cursor: expectedCursor,
        hasMore: true,
      });

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('items');
      expect(body).toHaveProperty('nextCursor');
      expect(body).not.toHaveProperty('events');
      expect(body).not.toHaveProperty('hasMore');

      expect(body.items).toEqual(mockEvents);
      expect(body.nextCursor).toBe(expectedCursor);
    });

    it('should omit nextCursor when no more results', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      (mockStorageAdapter.queryEvents as any).mockResolvedValue({
        events: [{ eventId: 'event-1', type: 'track' }],
        cursor: undefined,
        hasMore: false,
      });

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(200);
      const body = JSON.parse(result.body);

      expect(body).toHaveProperty('items');
      expect(body).not.toHaveProperty('nextCursor');
    });
  });

  describe('Error Handling', () => {
    it('should return 400 for validation errors', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: 'invalid-date',
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid cursor', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: '2024-01-01T00:00:00Z',
          cursor: 'invalid-cursor',
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      (mockStorageAdapter.queryEvents as any).mockRejectedValue(
        new Error('Invalid pagination cursor')
      );

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(400);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 500 for internal errors', async () => {
      const event: APIGatewayProxyEvent = {
        httpMethod: 'GET',
        path: '/api/v1/events',
        headers: {},
        queryStringParameters: {
          appId: 'test-app',
          from: new Date(Date.now() - 5 * 24 * 60 * 60 * 1000).toISOString(),
        },
        body: null,
        isBase64Encoded: false,
        pathParameters: null,
        stageVariables: null,
        requestContext: {} as any,
        resource: '',
        multiValueHeaders: {},
        multiValueQueryStringParameters: null,
      };

      (mockStorageAdapter.queryEvents as any).mockRejectedValue(
        new Error('Database connection failed')
      );

      const handler = createLambdaQueryHandler({
        logger: mockLogger,
        storageAdapter: mockStorageAdapter,
      });

      const result = await handler(event, mockContext);

      expect(result.statusCode).toBe(500);
      const body = JSON.parse(result.body);
      expect(body.error.code).toBe('INTERNAL_SERVER_ERROR');
    });
  });
});
