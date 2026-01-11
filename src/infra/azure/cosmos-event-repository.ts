import { CosmosClient, Container, type OperationInput, type SqlQuerySpec } from '@azure/cosmos';
import type { EventRepository, QueryEventsResult } from '../interfaces.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
import type { QueryEventsInput } from '../../domain/query-types.js';
import type { Logger } from '../../utils/logger.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';
import { calculateCosmosDbTtl } from '../../config/retention.js';

export interface CosmosEventRepositoryConfig {
  connectionString: string;
  databaseId: string;
  containerId: string;
  logger: Logger;
}

/**
 * Cosmos DB implementation of EventRepository
 * 
 * Container schema:
 * - Partition key: /pk (top-level field set to appId for efficient queries)
 * - Composite indexes on occurredAt, userId, sessionId for query performance
 * - TTL enabled for automatic data expiration (optional)
 */
export class CosmosEventRepository implements EventRepository {
  private container: Container;
  private logger: Logger;

  constructor(config: CosmosEventRepositoryConfig) {
    this.logger = config.logger;
    const client = new CosmosClient(config.connectionString);
    this.container = client.database(config.databaseId).container(config.containerId);
  }

  async storeEvents(events: StoredEvent[]): Promise<void> {
    try {
      // Use bulk operations for efficiency
      // Azure Cosmos SDK has overly strict JSONValue types, so we use unknown cast
      const operations = events.map((event) => ({
        operationType: 'Create' as const,
        resourceBody: {
          id: event.eventId,
          pk: event.source.appId, // Partition key field
          ttl: calculateCosmosDbTtl(event.occurredAt), // TTL in seconds (12 months from occurredAt)
          ...event,
        } as unknown,
      })) as unknown as OperationInput[];

      const response = await this.container.items.bulk(operations);

      // Check for failures
      const failures = response.filter((r: { statusCode: number }) => r.statusCode >= 400);
      if (failures.length > 0) {
        this.logger.error(
          { failures, eventCount: events.length },
          'Some events failed to store in Cosmos DB'
        );
        throw new Error(`Failed to store ${failures.length} events`);
      }

      this.logger.info(
        { eventCount: events.length, containerId: this.container.id },
        'Stored events in Cosmos DB'
      );
    } catch (error) {
      this.logger.error(
        { err: error, eventCount: events.length },
        'Failed to store events in Cosmos DB'
      );
      throw error;
    }
  }

  async queryEvents(input: QueryEventsInput): Promise<QueryEventsResult> {
    try {
      const { appId, from, to, userId, sessionId, types, names, limit = 50, cursor } = input;

      // Build SQL query - query by pk (partition key) for efficiency
      let query = 'SELECT * FROM c WHERE c.pk = @appId';
      const parameters: Array<{ name: string; value: unknown }> = [
        { name: '@appId', value: appId },
      ];

      // Add time range filter
      if (from) {
        query += ' AND c.occurredAt >= @from';
        parameters.push({ name: '@from', value: from });
      }
      if (to) {
        query += ' AND c.occurredAt <= @to';
        parameters.push({ name: '@to', value: to });
      }

      // Add user filter
      if (userId) {
        query += ' AND c.actor.userId = @userId';
        parameters.push({ name: '@userId', value: userId });
      }

      // Add session filter
      if (sessionId) {
        query += ' AND c.context.sessionId = @sessionId';
        parameters.push({ name: '@sessionId', value: sessionId });
      }

      // Add type filter
      if (types && types.length > 0) {
        query += ' AND ARRAY_CONTAINS(@types, c.type)';
        parameters.push({ name: '@types', value: types });
      }

      // Add name filter
      if (names && names.length > 0) {
        query += ' AND ARRAY_CONTAINS(@names, c.name)';
        parameters.push({ name: '@names', value: names });
      }

      // Add ordering
      query += ` ORDER BY c.occurredAt ${input.sort === 'asc' ? 'ASC' : 'DESC'}`;

      // Execute query with pagination
      const querySpec: SqlQuerySpec = {
        query,
        parameters: parameters as unknown as SqlQuerySpec['parameters'], // Azure Cosmos SDK has overly strict JSONValue types
      };

      // Parse cursor if provided (Cosmos uses native continuation tokens, but we wrap them)
      let continuationToken: string | undefined;
      if (cursor) {
        try {
          const cursorData = decodeCursor(cursor);
          // For Cosmos, we store the continuation token in the sk field
          // pk is used for validation/consistency
          continuationToken = cursorData.sk;
        } catch (error) {
          this.logger.warn({ error: error instanceof Error ? error.message : 'Unknown' }, 'Invalid cursor provided');
          throw new Error('Invalid pagination cursor');
        }
      }

      const iterator = await this.container.items
        .query<StoredEvent>(querySpec, {
          maxItemCount: limit + 1, // Fetch one extra to determine hasMore
          continuationToken,
          partitionKey: appId, // Partition key value (matches pk field)
        });

      const { resources: items, continuationToken: nextContinuationToken } = await iterator.fetchNext();

      const hasMore = items.length > limit;
      const events = hasMore ? items.slice(0, limit) : items;
      
      // Generate canonical cursor wrapping Cosmos continuation token
      let nextCursor: string | undefined;
      if (hasMore && nextContinuationToken) {
        // Wrap Cosmos continuation token in canonical cursor format
        // pk = appId for consistency, sk = continuation token
        nextCursor = encodeCursor(appId, nextContinuationToken);
      }

      this.logger.info(
        { appId, userId, sessionId, eventCount: events.length, hasMore },
        'Queried events from Cosmos DB'
      );

      return {
        events,
        hasMore,
        cursor: nextCursor,
      };
    } catch (error) {
      this.logger.error({ err: error, input }, 'Failed to query events from Cosmos DB');
      throw error;
    }
  }

  async checkEventExists(eventId: string): Promise<boolean> {
    try {
      // Query by document ID
      // Note: This requires knowing the partition key or doing a cross-partition query
      // For production, consider maintaining a separate container for deduplication
      
      const query = 'SELECT VALUE COUNT(1) FROM c WHERE c.id = @eventId';
      const { resources } = await this.container.items
        .query({
          query,
          parameters: [{ name: '@eventId', value: eventId }],
        })
        .fetchAll();

      const count = resources[0] || 0;
      return count > 0;
    } catch (error) {
      this.logger.error({ err: error, eventId }, 'Failed to check event existence');
      throw error;
    }
  }
}
