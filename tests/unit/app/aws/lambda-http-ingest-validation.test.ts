import type { APIGatewayProxyEvent, Context } from 'aws-lambda';
import { createLambdaIngestHandler } from '../../../../src/app/aws/lambda-http-ingest.js';
import type { Logger } from '../../../../src/utils/logger.js';
import type { QueuePublisher, RawEventStore } from '../../../../src/infra/interfaces.js';

describe('Lambda HTTP Ingest - Invalid JSON Handling', () => {
  let mockLogger: Logger;
  let mockQueueAdapter: QueuePublisher;
  let mockRawStorage: RawEventStore;
  let handler: ReturnType<typeof createLambdaIngestHandler>;

  beforeEach(() => {
    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      child: jest.fn().mockReturnThis(),
    } as unknown as Logger;

    mockQueueAdapter = {
      publish: jest.fn(),
    } as unknown as QueuePublisher;

    mockRawStorage = {
      storeRawEvents: jest.fn(),
    } as unknown as RawEventStore;

    handler = createLambdaIngestHandler({
      logger: mockLogger,
      queueAdapter: mockQueueAdapter,
      rawStorage: mockRawStorage,
    });
  });

  it('should return 400 for missing request body', async () => {
    const event: APIGatewayProxyEvent = {
      body: null, // Missing body
      headers: {
        'x-analytics-write-key': 'test-key',
      },
      httpMethod: 'POST',
      path: '/v1/ingest',
      isBase64Encoded: false,
      queryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };

    const context: Context = {
      awsRequestId: 'test-request-id',
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      memoryLimitInMB: '128',
      logGroupName: '/aws/lambda/test',
      logStreamName: '2024/01/01/[$LATEST]abc123',
      callbackWaitsForEmptyEventLoop: true,
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };

    const response = await handler(event, context);

    expect(response.statusCode).toBe(400);
    expect(response.headers?.['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Missing request body');
    expect(body.requestId).toBe('test-request-id');
  });

  it('should return 400 for invalid JSON', async () => {
    const event: APIGatewayProxyEvent = {
      body: '{ invalid json }', // Invalid JSON
      headers: {
        'x-analytics-write-key': 'test-key',
      },
      httpMethod: 'POST',
      path: '/v1/ingest',
      isBase64Encoded: false,
      queryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };

    const context: Context = {
      awsRequestId: 'test-request-id-2',
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      memoryLimitInMB: '128',
      logGroupName: '/aws/lambda/test',
      logStreamName: '2024/01/01/[$LATEST]abc123',
      callbackWaitsForEmptyEventLoop: true,
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };

    const response = await handler(event, context);

    expect(response.statusCode).toBe(400);
    expect(response.headers?.['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Invalid JSON');
    expect(body.requestId).toBe('test-request-id-2');
  });

  it('should return 400 for empty string body', async () => {
    const event: APIGatewayProxyEvent = {
      body: '', // Empty string
      headers: {
        'x-analytics-write-key': 'test-key',
      },
      httpMethod: 'POST',
      path: '/v1/ingest',
      isBase64Encoded: false,
      queryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };

    const context: Context = {
      awsRequestId: 'test-request-id-3',
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      memoryLimitInMB: '128',
      logGroupName: '/aws/lambda/test',
      logStreamName: '2024/01/01/[$LATEST]abc123',
      callbackWaitsForEmptyEventLoop: true,
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };

    const response = await handler(event, context);

    expect(response.statusCode).toBe(400);
    expect(response.headers?.['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.requestId).toBe('test-request-id-3');
  });

  it('should include requestId in error response', async () => {
    const event: APIGatewayProxyEvent = {
      body: null,
      headers: {},
      httpMethod: 'POST',
      path: '/v1/ingest',
      isBase64Encoded: false,
      queryStringParameters: null,
      pathParameters: null,
      stageVariables: null,
      requestContext: {} as any,
      resource: '',
      multiValueHeaders: {},
      multiValueQueryStringParameters: null,
    };

    const context: Context = {
      awsRequestId: 'unique-request-id-123',
      functionName: 'test-function',
      functionVersion: '1',
      invokedFunctionArn: 'arn:aws:lambda:us-east-1:123456789012:function:test',
      memoryLimitInMB: '128',
      logGroupName: '/aws/lambda/test',
      logStreamName: '2024/01/01/[$LATEST]abc123',
      callbackWaitsForEmptyEventLoop: true,
      getRemainingTimeInMillis: () => 30000,
      done: jest.fn(),
      fail: jest.fn(),
      succeed: jest.fn(),
    };

    const response = await handler(event, context);

    const body = JSON.parse(response.body);
    expect(body.requestId).toBe('unique-request-id-123');
  });
});
