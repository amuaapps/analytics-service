import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DynamoDBEventRepository } from '../../../../src/infra/aws/dynamodb-event-repository.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { Logger } from '../../../../src/utils/logger.js';
import type { QueryEventsInput } from '../../../../src/domain/query-types.js';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/util-dynamodb');

describe('DynamoDBEventRepository - Query Logic', () => {
  let repository: DynamoDBEventRepository;
  let mockClient: jest.Mocked<DynamoDBClient>;
  let mockLogger: jest.Mocked<Logger>;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    mockClient = {
      send: jest.fn(),
    } as unknown as jest.Mocked<DynamoDBClient>;

    (DynamoDBClient as jest.MockedClass<typeof DynamoDBClient>).mockImplementation(() => mockClient);
    (marshall as jest.Mock).mockImplementation((obj) => obj as any);

    repository = new DynamoDBEventRepository({
      tableName: 'test-table',
      region: 'us-east-1',
      logger: mockLogger,
    });
  });

  describe('Primary Index Queries (appId)', () => {
    it('should query by appId with no time range', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      expect(mockClient.send).toHaveBeenCalledWith(
        expect.objectContaining({
          input: expect.objectContaining({
            TableName: 'test-table',
            IndexName: undefined,
            KeyConditionExpression: 'PK = :appId AND SK >= :from',
          }),
        })
      );
    });

    it('should query by appId with from and to time range using BETWEEN', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.KeyConditionExpression).toBe('PK = :appId AND SK BETWEEN :from AND :to');
      expect(call.input.IndexName).toBeUndefined();
    });

    it('should make "to" exclusive by subtracting 1ms when using BETWEEN', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      const marshalledValues = call.input.ExpressionAttributeValues;
      
      // The 'to' value should be 1ms before the original
      expect(marshalledValues[':to']).toBe('2026-01-01T23:59:59.999Z');
    });

    it('should use < operator for exclusive "to" when only "to" is provided', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.KeyConditionExpression).toContain('< :to');
    });
  });

  describe('GSI1 Queries (userId)', () => {
    it('should query by userId using GSI1 and GSI1SK for time range', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.IndexName).toBe('GSI1');
      expect(call.input.KeyConditionExpression).toBe('GSI1PK = :compositeKey AND GSI1SK >= :from');
    });

    it('should use composite key appId#userId for GSI1PK', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      const marshalledValues = call.input.ExpressionAttributeValues;
      expect(marshalledValues[':compositeKey']).toBe('test-app#user-123');
    });

    it('should use GSI1SK with BETWEEN for userId query with time range', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.IndexName).toBe('GSI1');
      expect(call.input.KeyConditionExpression).toBe('GSI1PK = :compositeKey AND GSI1SK BETWEEN :from AND :to');
    });
  });

  describe('GSI2 Queries (sessionId)', () => {
    it('should query by sessionId using GSI2 and GSI2SK for time range', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.IndexName).toBe('GSI2');
      expect(call.input.KeyConditionExpression).toBe('GSI2PK = :compositeKey AND GSI2SK >= :from');
    });

    it('should use composite key appId#sessionId for GSI2PK', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      const marshalledValues = call.input.ExpressionAttributeValues;
      expect(marshalledValues[':compositeKey']).toBe('test-app#session-456');
    });

    it('should use GSI2SK with BETWEEN for sessionId query with time range', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.IndexName).toBe('GSI2');
      expect(call.input.KeyConditionExpression).toBe('GSI2PK = :compositeKey AND GSI2SK BETWEEN :from AND :to');
    });
  });

  describe('Pagination', () => {
    it('should request limit + 1 items to determine hasMore', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.Limit).toBe(11); // limit + 1
    });

    it('should return hasMore=true when items.length > limit', async () => {
      const mockItems = Array.from({ length: 11 }, (_, i) => ({
        eventId: `event-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
      }));

      mockClient.send.mockResolvedValueOnce({ Items: mockItems as any });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      const result = await repository.queryEvents(input);

      expect(result.hasMore).toBe(true);
      expect(result.events).toHaveLength(10); // Should slice to limit
    });

    it('should return hasMore=false when items.length <= limit', async () => {
      const mockItems = Array.from({ length: 5 }, (_, i) => ({
        eventId: `event-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
      }));

      mockClient.send.mockResolvedValueOnce({ Items: mockItems as any });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      const result = await repository.queryEvents(input);

      expect(result.hasMore).toBe(false);
      expect(result.events).toHaveLength(5);
    });

    it('should include cursor when hasMore=true', async () => {
      const mockItems = Array.from({ length: 11 }, (_, i) => ({
        eventId: `event-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
      }));

      mockClient.send.mockResolvedValueOnce({ Items: mockItems as any });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      const result = await repository.queryEvents(input);

      expect(result.cursor).toBeDefined();
      expect(typeof result.cursor).toBe('string');
    });

    it('should use correct composite key in cursor for userId queries', async () => {
      const mockItems = Array.from({ length: 11 }, (_, i) => ({
        eventId: `event-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
        actor: { userId: 'user-123' },
      }));

      mockClient.send.mockResolvedValueOnce({ Items: mockItems as any });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      const result = await repository.queryEvents(input);

      expect(result.cursor).toBeDefined();
      // Cursor should encode appId#userId composite key
    });

    it('should parse cursor and set ExclusiveStartKey with all required keys for GSI1', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      // New cursor format: uses table PK (appId) only
      const mockCursor = Buffer.from(JSON.stringify({ pk: 'test-app', sk: '2026-01-01T00:00:00.000Z#event-1' })).toString('base64');

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        cursor: mockCursor,
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      const exclusiveStartKey = call.input.ExclusiveStartKey;

      expect(exclusiveStartKey).toBeDefined();
      // Table keys
      expect(exclusiveStartKey.PK).toBe('test-app');
      expect(exclusiveStartKey.SK).toBe('2026-01-01T00:00:00.000Z#event-1');
      // GSI1 keys (reconstructed from request params)
      expect(exclusiveStartKey.GSI1PK).toBe('test-app#user-123');
      expect(exclusiveStartKey.GSI1SK).toBe('2026-01-01T00:00:00.000Z#event-1');
    });

    it('should support backward compatibility with old cursor format (composite keys)', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      // Old cursor format: contains composite key
      const mockCursor = Buffer.from(JSON.stringify({ pk: 'test-app#user-123', sk: '2026-01-01T00:00:00.000Z#event-1' })).toString('base64');

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        cursor: mockCursor,
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      const exclusiveStartKey = call.input.ExclusiveStartKey;

      expect(exclusiveStartKey).toBeDefined();
      // Should extract appId from composite key
      expect(exclusiveStartKey.PK).toBe('test-app');
      expect(exclusiveStartKey.SK).toBe('2026-01-01T00:00:00.000Z#event-1');
      // GSI1 keys should still be correct
      expect(exclusiveStartKey.GSI1PK).toBe('test-app#user-123');
      expect(exclusiveStartKey.GSI1SK).toBe('2026-01-01T00:00:00.000Z#event-1');
    });

    it('should perform second query with returned cursor for userId pagination', async () => {
      // First query - returns items with cursor
      const firstPageItems = Array.from({ length: 11 }, (_, i) => ({
        eventId: `event-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
        actor: { userId: 'user-123' },
      }));
      mockClient.send.mockResolvedValueOnce({ Items: firstPageItems as any });

      const firstInput: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      const firstResult = await repository.queryEvents(firstInput);

      expect(firstResult.hasMore).toBe(true);
      expect(firstResult.cursor).toBeDefined();
      expect(firstResult.events).toHaveLength(10);

      // Second query - uses cursor from first query
      const secondPageItems = Array.from({ length: 5 }, (_, i) => ({
        eventId: `event-${i + 10}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
        actor: { userId: 'user-123' },
      }));
      mockClient.send.mockResolvedValueOnce({ Items: secondPageItems as any });

      const secondInput: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
        cursor: firstResult.cursor,
      };

      const secondResult = await repository.queryEvents(secondInput);

      expect(secondResult.hasMore).toBe(false);
      expect(secondResult.events).toHaveLength(5);

      // Verify second query used ExclusiveStartKey
      const secondCall = (mockClient.send as jest.Mock).mock.calls[1][0];
      expect(secondCall.input.ExclusiveStartKey).toBeDefined();
      expect(secondCall.input.ExclusiveStartKey.PK).toBe('test-app');
      expect(secondCall.input.ExclusiveStartKey.GSI1PK).toBe('test-app#user-123');
    });

    it('should perform second query with returned cursor for sessionId pagination', async () => {
      // First query
      const firstPageItems = Array.from({ length: 11 }, (_, i) => ({
        eventId: `event-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
        context: { sessionId: 'session-456' },
      }));
      mockClient.send.mockResolvedValueOnce({ Items: firstPageItems as any });

      const firstInput: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      const firstResult = await repository.queryEvents(firstInput);

      expect(firstResult.hasMore).toBe(true);
      expect(firstResult.cursor).toBeDefined();

      // Second query
      const secondPageItems = Array.from({ length: 3 }, (_, i) => ({
        eventId: `event-${i + 10}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
        context: { sessionId: 'session-456' },
      }));
      mockClient.send.mockResolvedValueOnce({ Items: secondPageItems as any });

      const secondInput: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
        cursor: firstResult.cursor,
      };

      const secondResult = await repository.queryEvents(secondInput);

      expect(secondResult.hasMore).toBe(false);
      expect(secondResult.events).toHaveLength(3);

      // Verify ExclusiveStartKey for GSI2
      const secondCall = (mockClient.send as jest.Mock).mock.calls[1][0];
      expect(secondCall.input.ExclusiveStartKey).toBeDefined();
      expect(secondCall.input.ExclusiveStartKey.PK).toBe('test-app');
      expect(secondCall.input.ExclusiveStartKey.GSI2PK).toBe('test-app#session-456');
    });
  });

  describe('Sort Order', () => {
    it('should use ScanIndexForward=false for descending sort (default)', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        sort: 'desc',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.ScanIndexForward).toBe(false);
    });

    it('should use ScanIndexForward=true for ascending sort', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        sort: 'asc',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.ScanIndexForward).toBe(true);
    });
  });

  describe('Time Range Edge Cases', () => {
    it('should handle only "from" parameter', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.KeyConditionExpression).toBe('PK = :appId AND SK >= :from');
    });

    it('should handle only "to" parameter with exclusive semantics', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.KeyConditionExpression).toContain('BETWEEN');
    });

    it('should handle neither "from" nor "to" parameters', async () => {
      mockClient.send.mockResolvedValueOnce({ Items: [] });

      const input = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = (mockClient.send as jest.Mock).mock.calls[0][0];
      expect(call.input.KeyConditionExpression).toBe('PK = :appId AND SK >= :from');
    });
  });
});
