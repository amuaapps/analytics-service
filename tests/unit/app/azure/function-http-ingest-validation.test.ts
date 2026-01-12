import { jest } from '@jest/globals';
import type { HttpRequest, InvocationContext } from '@azure/functions';
import { createAzureFunctionIngestHandler } from '../../../../src/app/azure/function-http-ingest.js';
import type { Logger } from '../../../../src/utils/logger.js';
import type { QueuePublisher, RawEventStore } from '../../../../src/infra/interfaces.js';
import { loadLimitsConfig } from '../../../../src/config/limits.js';

// Mock auth middleware
jest.mock('../../../../src/app/azure/auth-middleware.js', () => ({
  validateWriteKey: (jest.fn() as any).mockResolvedValue({ valid: true }),
}));

describe('Azure Function HTTP Ingest - Invalid JSON Handling', () => {
  let mockLogger: Logger;
  let mockQueueAdapter: QueuePublisher;
  let mockRawStorage: RawEventStore;
  let handler: ReturnType<typeof createAzureFunctionIngestHandler>;

  beforeEach(() => {
    // Set required environment variables
    process.env.ANALYTICS_WRITE_KEY = 'test-key';

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

    handler = createAzureFunctionIngestHandler({
      logger: mockLogger,
      queueAdapter: mockQueueAdapter,
      rawStorage: mockRawStorage,
      limits: loadLimitsConfig(),
    });
  });

  it('should return 400 for missing request body', async () => {
    const request = {
      method: 'POST',
      url: 'https://example.com/v1/ingest',
      headers: new Map([['x-analytics-write-key', 'test-key']]),
      text: (jest.fn() as any).mockResolvedValue(''), // Empty body
    } as unknown as HttpRequest;

    const context = {
      invocationId: 'test-invocation-id',
    } as InvocationContext;

    const response = await handler(request, context);

    expect(response.status).toBe(400);
    expect((response.headers as any)['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body as string);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Missing request body');
    expect(body.requestId).toBe('test-invocation-id');
  });

  it('should return 400 for invalid JSON', async () => {
    const request = {
      method: 'POST',
      url: 'https://example.com/v1/ingest',
      headers: new Map([['x-analytics-write-key', 'test-key']]),
      text: (jest.fn() as any).mockResolvedValue('{ invalid json }'), // Invalid JSON
    } as unknown as HttpRequest;

    const context = {
      invocationId: 'test-invocation-id-2',
    } as InvocationContext;

    const response = await handler(request, context);

    expect(response.status).toBe(400);
    expect((response.headers as any)['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body as string);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Invalid JSON');
    expect(body.requestId).toBe('test-invocation-id-2');
  });

  it('should return 400 for malformed JSON with trailing comma', async () => {
    const request = {
      method: 'POST',
      url: 'https://example.com/v1/ingest',
      headers: new Map([['x-analytics-write-key', 'test-key']]),
      text: (jest.fn() as any).mockResolvedValue('{"events": [],}'), // Trailing comma
    } as unknown as HttpRequest;

    const context = {
      invocationId: 'test-invocation-id-3',
    } as InvocationContext;

    const response = await handler(request, context);

    expect(response.status).toBe(400);
    expect((response.headers as any)['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body as string);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.error.message).toContain('Invalid JSON');
    expect(body.requestId).toBe('test-invocation-id-3');
  });

  it('should return 400 for null body', async () => {
    const request = {
      method: 'POST',
      url: 'https://example.com/v1/ingest',
      headers: new Map([['x-analytics-write-key', 'test-key']]),
      text: (jest.fn() as any).mockResolvedValue(null), // Null body
    } as unknown as HttpRequest;

    const context = {
      invocationId: 'test-invocation-id-4',
    } as InvocationContext;

    const response = await handler(request, context);

    expect(response.status).toBe(400);
    expect((response.headers as any)['Content-Type']).toBe('application/json');

    const body = JSON.parse(response.body as string);
    expect(body.error.code).toBe('VALIDATION_ERROR');
    expect(body.requestId).toBe('test-invocation-id-4');
  });

  it('should include requestId in error response', async () => {
    const request = {
      method: 'POST',
      url: 'https://example.com/v1/ingest',
      headers: new Map([['x-analytics-write-key', 'test-key']]),
      text: (jest.fn() as any).mockResolvedValue(''),
    } as unknown as HttpRequest;

    const context = {
      invocationId: 'unique-invocation-id-456',
    } as InvocationContext;

    const response = await handler(request, context);

    const body = JSON.parse(response.body as string);
    expect(body.requestId).toBe('unique-invocation-id-456');
  });
});
