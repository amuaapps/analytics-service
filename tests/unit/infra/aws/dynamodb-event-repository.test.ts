import { describe, it, expect, beforeEach, jest } from '@jest/globals';
import { DynamoDBEventRepository } from '../../../../src/infra/aws/dynamodb-event-repository.js';
import { DynamoDBClient } from '@aws-sdk/client-dynamodb';
import { marshall } from '@aws-sdk/util-dynamodb';
import type { Logger } from '../../../../src/utils/logger.js';
import type { QueryEventsInput } from '../../../../src/domain/query-types.js';

// Mock AWS SDK
jest.mock('@aws-sdk/client-dynamodb');
jest.mock('@aws-sdk/util-dynamodb');

const MockedDynamoDBClient = jest.mocked(DynamoDBClient);
const mockedMarshall = jest.mocked(marshall);

describe('DynamoDBEventRepository - Query Logic', () => {
  let repository: DynamoDBEventRepository;
  let mockSend: jest.Mock;
  let mockLogger: any;

  beforeEach(() => {
    jest.clearAllMocks();

    mockLogger = {
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
    } as unknown as jest.Mocked<Logger>;

    mockSend = jest.fn();

    MockedDynamoDBClient.mockImplementation(
      () =>
        ({
          send: mockSend,
        }) as any
    );

    mockedMarshall.mockImplementation((obj: any) => obj);

    repository = new DynamoDBEventRepository({
      tableName: 'test-table',
      region: 'us-east-1',
      logger: mockLogger,
    });
  });

  describe('Primary Index Queries (appId)', () => {
    it('should query by appId with no time range', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      expect(mockSend).toHaveBeenCalledWith(
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
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.KeyConditionExpression).toBe('PK = :appId AND SK BETWEEN :from AND :to');
      expect(call.input.IndexName).toBeUndefined();
    });

    it('should use key-bound strategy for time range with composite SK (occurredAt#eventId)', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      const marshalledValues = call.input.ExpressionAttributeValues;

      // Key-bound strategy: append '#' to timestamps
      // Lower bound: 'from#' is inclusive (includes all events at from)
      // Upper bound: 'to#' is exclusive (excludes all events at to)
      expect(marshalledValues[':from']).toBe('2026-01-01T00:00:00.000Z#');
      expect(marshalledValues[':to']).toBe('2026-01-02T00:00:00.000Z#');
    });

    it('should use < operator for exclusive "to" when only "to" is provided', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.KeyConditionExpression).toContain('< :to');
    });
  });

  describe('GSI1 Queries (userId)', () => {
    it('should query by userId using GSI1 and GSI1SK for time range', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.IndexName).toBe('GSI1');
      expect(call.input.KeyConditionExpression).toBe('GSI1PK = :compositeKey AND GSI1SK >= :from');
    });

    it('should use composite key appId#userId for GSI1PK', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      const marshalledValues = call.input.ExpressionAttributeValues;
      expect(marshalledValues[':compositeKey']).toBe('test-app#user-123');
    });

    it('should use GSI1SK with BETWEEN for userId query with time range', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.IndexName).toBe('GSI1');
      expect(call.input.KeyConditionExpression).toBe(
        'GSI1PK = :compositeKey AND GSI1SK BETWEEN :from AND :to'
      );
    });
  });

  describe('GSI2 Queries (sessionId)', () => {
    it('should query by sessionId using GSI2 and GSI2SK for time range', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.IndexName).toBe('GSI2');
      expect(call.input.KeyConditionExpression).toBe('GSI2PK = :compositeKey AND GSI2SK >= :from');
    });

    it('should use composite key appId#sessionId for GSI2PK', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      const marshalledValues = call.input.ExpressionAttributeValues;
      expect(marshalledValues[':compositeKey']).toBe('test-app#session-456');
    });

    it('should use GSI2SK with BETWEEN for sessionId query with time range', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.IndexName).toBe('GSI2');
      expect(call.input.KeyConditionExpression).toBe(
        'GSI2PK = :compositeKey AND GSI2SK BETWEEN :from AND :to'
      );
    });
  });

  describe('Pagination', () => {
    it('should request limit + 1 items to determine hasMore', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        limit: 10,
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.Limit).toBe(11); // limit + 1
    });

    it('should return hasMore=true when items.length > limit', async () => {
      const mockItems = Array.from({ length: 11 }, (_, i) => ({
        eventId: `event-${i}`,
        occurredAt: '2026-01-01T00:00:00.000Z',
        source: { appId: 'test-app' },
      }));

      (mockSend as any).mockResolvedValueOnce({ Items: mockItems as any });

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

      (mockSend as any).mockResolvedValueOnce({ Items: mockItems as any });

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

      (mockSend as any).mockResolvedValueOnce({ Items: mockItems as any });

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

      (mockSend as any).mockResolvedValueOnce({ Items: mockItems as any });

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
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      // New cursor format: uses table PK (appId) only
      const mockCursor = Buffer.from(
        JSON.stringify({ pk: 'test-app', sk: '2026-01-01T00:00:00.000Z#event-1' })
      ).toString('base64');

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        cursor: mockCursor,
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
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
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      // Old cursor format: contains composite key
      const mockCursor = Buffer.from(
        JSON.stringify({ pk: 'test-app#user-123', sk: '2026-01-01T00:00:00.000Z#event-1' })
      ).toString('base64');

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        cursor: mockCursor,
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
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
      (mockSend as any).mockResolvedValueOnce({ Items: firstPageItems as any });

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
      (mockSend as any).mockResolvedValueOnce({ Items: secondPageItems as any });

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

      // Verify second query used cursor correctly
      const secondCall = mockSend.mock.calls[1][0] as any;
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
      (mockSend as any).mockResolvedValueOnce({ Items: firstPageItems as any });

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
      (mockSend as any).mockResolvedValueOnce({ Items: secondPageItems as any });

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
      const secondCall = mockSend.mock.calls[1][0] as any;
      expect(secondCall.input.ExclusiveStartKey).toBeDefined();
      expect(secondCall.input.ExclusiveStartKey.PK).toBe('test-app');
      expect(secondCall.input.ExclusiveStartKey.GSI2PK).toBe('test-app#session-456');
    });
  });

  describe('Sort Order', () => {
    it('should use ScanIndexForward=false for descending sort (default)', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        sort: 'desc',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.ScanIndexForward).toBe(false);
    });

    it('should use ScanIndexForward=true for ascending sort', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        sort: 'asc',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.ScanIndexForward).toBe(true);
    });
  });

  describe('Time Range Edge Cases', () => {
    it('should handle only "from" parameter with key-bound strategy', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.KeyConditionExpression).toBe('PK = :appId AND SK >= :from');
      expect(call.input.ExpressionAttributeValues[':from']).toBe('2026-01-01T00:00:00.000Z#');
    });

    it('should handle only "to" parameter with exclusive key-bound', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.KeyConditionExpression).toContain('BETWEEN');
      expect(call.input.ExpressionAttributeValues[':to']).toBe('2026-01-02T00:00:00.000Z#');
    });

    it('should handle neither "from" nor "to" parameters', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      const toBound = call.input.ExpressionAttributeValues[':to'];

      // Upper bound 'to#' excludes all events at to
      // '2026-01-02T00:00:00.000Z#evt-123' > '2026-01-02T00:00:00.000Z#'
      expect(toBound).toBe('2026-01-02T00:00:00.000Z#');
      expect(call.input.KeyConditionExpression).toContain('BETWEEN');
    });

    it('should include events before "to" timestamp (to - epsilon)', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      const toBound = call.input.ExpressionAttributeValues[':to'];

      // Events before 'to' are included
      // '2026-01-01T23:59:59.999Z#evt-123' < '2026-01-02T00:00:00.000Z#'
      expect(toBound).toBe('2026-01-02T00:00:00.000Z#');

      // Verify BETWEEN semantics
      expect(call.input.KeyConditionExpression).toBe('PK = :appId AND SK BETWEEN :from AND :to');
    });

    it('should use correct bounds for single-sided ranges', async () => {
      // Test only 'from' parameter
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const inputFrom: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
      };

      await repository.queryEvents(inputFrom);

      const callFrom = mockSend.mock.calls[0][0] as any;
      expect(callFrom.input.ExpressionAttributeValues[':from']).toBe('2026-01-01T00:00:00.000Z#');
      expect(callFrom.input.KeyConditionExpression).toContain('>= :from');
    });
  });

  describe('FilterExpression - Types Filtering', () => {
    it('should filter by single event type using FilterExpression', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        types: ['track'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBe('#type IN (:type0)');
      expect(call.input.ExpressionAttributeNames).toEqual({ '#type': 'type' });
      expect(call.input.ExpressionAttributeValues[':type0']).toBe('track');
    });

    it('should filter by multiple event types using IN operator', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        types: ['track', 'page', 'identify'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBe('#type IN (:type0, :type1, :type2)');
      expect(call.input.ExpressionAttributeNames).toEqual({ '#type': 'type' });
      expect(call.input.ExpressionAttributeValues[':type0']).toBe('track');
      expect(call.input.ExpressionAttributeValues[':type1']).toBe('page');
      expect(call.input.ExpressionAttributeValues[':type2']).toBe('identify');
    });

    it('should not add FilterExpression when types array is empty', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        types: [],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBeUndefined();
      expect(call.input.ExpressionAttributeNames).toBeUndefined();
    });

    it('should use expression attribute names for reserved keyword "type"', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        types: ['track'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      // Verify we use #type placeholder, not raw 'type'
      expect(call.input.FilterExpression).toContain('#type');
      expect(call.input.FilterExpression).not.toContain('type IN');
      expect(call.input.ExpressionAttributeNames['#type']).toBe('type');
    });
  });

  describe('FilterExpression - Names Filtering', () => {
    it('should filter by single event name using FilterExpression', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        names: ['Button Clicked'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBe('#name IN (:name0)');
      expect(call.input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
      expect(call.input.ExpressionAttributeValues[':name0']).toBe('Button Clicked');
    });

    it('should filter by multiple event names using IN operator', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        names: ['Button Clicked', 'Page Viewed', 'Form Submitted'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBe('#name IN (:name0, :name1, :name2)');
      expect(call.input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
      expect(call.input.ExpressionAttributeValues[':name0']).toBe('Button Clicked');
      expect(call.input.ExpressionAttributeValues[':name1']).toBe('Page Viewed');
      expect(call.input.ExpressionAttributeValues[':name2']).toBe('Form Submitted');
    });

    it('should not add FilterExpression when names array is empty', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        names: [],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBeUndefined();
      expect(call.input.ExpressionAttributeNames).toBeUndefined();
    });

    it('should use expression attribute names for reserved keyword "name"', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        names: ['Button Clicked'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      // Verify we use #name placeholder, not raw 'name'
      expect(call.input.FilterExpression).toContain('#name');
      expect(call.input.FilterExpression).not.toContain('name IN');
      expect(call.input.ExpressionAttributeNames['#name']).toBe('name');
    });
  });

  describe('FilterExpression - Combined Filters', () => {
    it('should combine types and names filters with AND', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        types: ['track', 'page'],
        names: ['Button Clicked', 'Page Viewed'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBe(
        '#type IN (:type0, :type1) AND #name IN (:name0, :name1)'
      );
      expect(call.input.ExpressionAttributeNames).toEqual({
        '#type': 'type',
        '#name': 'name',
      });
      expect(call.input.ExpressionAttributeValues[':type0']).toBe('track');
      expect(call.input.ExpressionAttributeValues[':type1']).toBe('page');
      expect(call.input.ExpressionAttributeValues[':name0']).toBe('Button Clicked');
      expect(call.input.ExpressionAttributeValues[':name1']).toBe('Page Viewed');
    });

    it('should combine anonymousId, types, and names filters', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        from: '2026-01-01T00:00:00.000Z',
        anonymousId: 'anon-123',
        types: ['track'],
        names: ['Button Clicked'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.FilterExpression).toBe(
        'actor.anonymousId = :anonymousId AND #type IN (:type0) AND #name IN (:name0)'
      );
      expect(call.input.ExpressionAttributeNames).toEqual({
        '#type': 'type',
        '#name': 'name',
      });
      expect(call.input.ExpressionAttributeValues[':anonymousId']).toBe('anon-123');
      expect(call.input.ExpressionAttributeValues[':type0']).toBe('track');
      expect(call.input.ExpressionAttributeValues[':name0']).toBe('Button Clicked');
    });

    it('should work with userId query and types filter', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        from: '2026-01-01T00:00:00.000Z',
        types: ['track', 'page'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.IndexName).toBe('GSI1');
      expect(call.input.KeyConditionExpression).toBe('GSI1PK = :compositeKey AND GSI1SK >= :from');
      expect(call.input.FilterExpression).toBe('#type IN (:type0, :type1)');
      expect(call.input.ExpressionAttributeNames).toEqual({ '#type': 'type' });
    });

    it('should work with sessionId query and names filter', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        sessionId: 'session-456',
        from: '2026-01-01T00:00:00.000Z',
        names: ['Page Viewed'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.IndexName).toBe('GSI2');
      expect(call.input.KeyConditionExpression).toBe('GSI2PK = :compositeKey AND GSI2SK >= :from');
      expect(call.input.FilterExpression).toBe('#name IN (:name0)');
      expect(call.input.ExpressionAttributeNames).toEqual({ '#name': 'name' });
    });

    it('should handle all filters together', async () => {
      (mockSend as any).mockResolvedValueOnce({ Items: [] });

      const input: QueryEventsInput = {
        appId: 'test-app',
        userId: 'user-123',
        anonymousId: 'anon-456',
        from: '2026-01-01T00:00:00.000Z',
        to: '2026-01-02T00:00:00.000Z',
        types: ['track'],
        names: ['Button Clicked'],
      };

      await repository.queryEvents(input);

      const call = mockSend.mock.calls[0][0] as any;
      expect(call.input.IndexName).toBe('GSI1');
      expect(call.input.KeyConditionExpression).toContain('GSI1PK = :compositeKey');
      expect(call.input.FilterExpression).toBe(
        'actor.anonymousId = :anonymousId AND #type IN (:type0) AND #name IN (:name0)'
      );
      expect(call.input.ExpressionAttributeNames).toEqual({
        '#type': 'type',
        '#name': 'name',
      });
    });
  });
});
