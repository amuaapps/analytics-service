import {
  DynamoDBClient,
  PutItemCommand,
  QueryCommand,
} from '@aws-sdk/client-dynamodb';
import { marshall, unmarshall } from '@aws-sdk/util-dynamodb';
import type { EventRepository, QueryEventsResult } from '../interfaces.js';
import type { StoredEvent } from '../../domain/stored-event-types.js';
import type { QueryEventsInput } from '../../domain/query-types.js';
import type { Logger } from '../../utils/logger.js';
import { decodeCursor, encodeCursor } from '../../utils/cursor.js';
import { calculateExpiresAt } from '../../config/retention.js';

export interface DynamoDBEventRepositoryConfig {
  tableName: string;
  region: string;
  logger: Logger;
}

/**
 * DynamoDB implementation of EventRepository
 * 
 * Table schema (multi-tenant safe):
 * - PK: appId (partition key)
 * - SK: occurredAt#eventId (sort key for time-based queries)
 * - GSI1PK: appId#userId (composite key for user-based queries, scoped to app)
 * - GSI1SK: occurredAt#eventId
 * - GSI2PK: appId#sessionId (composite key for session-based queries, scoped to app)
 * - GSI2SK: occurredAt#eventId
 * 
 * Security: All GSI partition keys include appId to prevent cross-app data leakage
 */
export class DynamoDBEventRepository implements EventRepository {
  private client: DynamoDBClient;
  private tableName: string;
  private logger: Logger;

  constructor(config: DynamoDBEventRepositoryConfig) {
    this.tableName = config.tableName;
    this.logger = config.logger;
    this.client = new DynamoDBClient({ region: config.region });
  }

  async storeEvents(events: StoredEvent[]): Promise<void> {
    try {
      // Use batch write for efficiency (max 25 items per batch)
      const batches = this.chunkArray(events, 25);

      for (const batch of batches) {
        await Promise.all(
          batch.map((event) => this.putEvent(event))
        );
      }

      this.logger.info(
        { eventCount: events.length, tableName: this.tableName },
        'Stored events in DynamoDB'
      );
    } catch (error) {
      this.logger.error(
        { err: error, eventCount: events.length },
        'Failed to store events in DynamoDB'
      );
      throw error;
    }
  }

  async queryEvents(input: QueryEventsInput): Promise<QueryEventsResult> {
    try {
      const { appId, from, to, userId, sessionId, limit = 50, cursor } = input;

      // Determine which index to use and the appropriate sort key attribute
      let indexName: string | undefined;
      let sortKeyAttribute: string;
      let keyConditionExpression: string;
      let expressionAttributeValues: Record<string, unknown>;

      if (userId) {
        // Query by user (scoped to appId for multi-tenant safety)
        indexName = 'GSI1';
        sortKeyAttribute = 'GSI1SK';
        const compositeKey = `${appId}#${userId}`;
        keyConditionExpression = 'GSI1PK = :compositeKey';
        expressionAttributeValues = { ':compositeKey': compositeKey };
      } else if (sessionId) {
        // Query by session (scoped to appId for multi-tenant safety)
        indexName = 'GSI2';
        sortKeyAttribute = 'GSI2SK';
        const compositeKey = `${appId}#${sessionId}`;
        keyConditionExpression = 'GSI2PK = :compositeKey';
        expressionAttributeValues = { ':compositeKey': compositeKey };
      } else {
        // Query by appId (primary index)
        sortKeyAttribute = 'SK';
        keyConditionExpression = 'PK = :appId';
        expressionAttributeValues = { ':appId': appId };
      }

      // Add time range to sort key condition
      // Note: 'to' is exclusive, so we use < instead of <=
      if (from && to) {
        // Use BETWEEN for both bounds (DynamoDB BETWEEN is inclusive on both ends)
        // To make 'to' exclusive, we need to subtract 1ms from the timestamp
        const exclusiveTo = new Date(new Date(to).getTime() - 1).toISOString();
        keyConditionExpression += ` AND ${sortKeyAttribute} BETWEEN :from AND :to`;
        expressionAttributeValues[':from'] = from;
        expressionAttributeValues[':to'] = exclusiveTo;
      } else if (from) {
        keyConditionExpression += ` AND ${sortKeyAttribute} >= :from`;
        expressionAttributeValues[':from'] = from;
      } else if (to) {
        // 'to' is exclusive, so use < instead of <=
        keyConditionExpression += ` AND ${sortKeyAttribute} < :to`;
        expressionAttributeValues[':to'] = to;
      }

      // Parse cursor if provided
      let exclusiveStartKey: Record<string, unknown> | undefined;
      if (cursor) {
        try {
          const cursorData = decodeCursor(cursor);
          
          // Cursor stores table PK (appId) and SK (occurredAt#eventId)
          // For backward compatibility, detect old format with composite keys
          let tablePK = cursorData.pk;
          if (tablePK.includes('#')) {
            // Old format: extract appId from composite key
            tablePK = tablePK.split('#')[0];
          }
          
          // Build ExclusiveStartKey with all required keys
          exclusiveStartKey = {
            PK: tablePK,
            SK: cursorData.sk,
          };
          
          // Add GSI keys if querying by index
          if (indexName === 'GSI1' && userId) {
            exclusiveStartKey.GSI1PK = `${tablePK}#${userId}`;
            exclusiveStartKey.GSI1SK = cursorData.sk;
          } else if (indexName === 'GSI2' && sessionId) {
            exclusiveStartKey.GSI2PK = `${tablePK}#${sessionId}`;
            exclusiveStartKey.GSI2SK = cursorData.sk;
          }
        } catch (error) {
          this.logger.warn({ error: error instanceof Error ? error.message : 'Unknown' }, 'Invalid cursor provided');
          throw new Error('Invalid pagination cursor');
        }
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        Limit: limit + 1, // Fetch one extra to determine hasMore
        ExclusiveStartKey: exclusiveStartKey ? marshall(exclusiveStartKey) : undefined,
        ScanIndexForward: input.sort === 'asc',
      });

      const response = await this.client.send(command);
      const items = (response.Items || []).map((item) => unmarshall(item) as StoredEvent);

      const hasMore = items.length > limit;
      const events = hasMore ? items.slice(0, limit) : items;
      
      // Generate canonical cursor from last item if hasMore
      let nextCursor: string | undefined;
      if (hasMore && events.length > 0) {
        const lastEvent = events[events.length - 1];
        // Cursor always uses table PK (appId) - composite keys are derived from request params
        const pk = appId;
        const sk = `${lastEvent.occurredAt}#${lastEvent.eventId}`;
        nextCursor = encodeCursor(pk, sk);
      }

      this.logger.info(
        { appId, userId, sessionId, eventCount: events.length, hasMore },
        'Queried events from DynamoDB'
      );

      return { events, hasMore, cursor: nextCursor };
    } catch (error) {
      this.logger.error({ err: error, input }, 'Failed to query events from DynamoDB');
      throw error;
    }
  }

  async checkEventExists(eventId: string): Promise<boolean> {
    try {
      // Note: This requires a GSI on eventId or a scan (expensive)
      // For production, consider maintaining a separate deduplication table
      // or using eventId as part of the primary key structure
      
      // Simplified implementation - in production, use a dedicated GSI
      this.logger.warn(
        { eventId },
        'checkEventExists using scan - consider adding eventId GSI for production'
      );
      
      // For now, return false to allow processing
      // TODO: Implement proper eventId lookup with GSI
      return false;
    } catch (error) {
      this.logger.error({ err: error, eventId }, 'Failed to check event existence');
      throw error;
    }
  }

  private async putEvent(event: StoredEvent): Promise<void> {
    const appId = event.source.appId;
    const item = {
      PK: appId,
      SK: `${event.occurredAt}#${event.eventId}`,
      eventId: event.eventId,
      type: event.type,
      name: event.type !== 'identify' ? event.name : undefined,
      occurredAt: event.occurredAt,
      receivedAt: event.receivedAt,
      processedAt: event.processedAt,
      source: event.source,
      actor: event.actor,
      context: event.context,
      schemaVersion: event.schemaVersion,
      // TTL: Calculate expiration timestamp (12 months from occurredAt)
      expiresAt: calculateExpiresAt(event.occurredAt),
      // Add GSI keys with appId prefix for multi-tenant safety
      GSI1PK: event.actor.userId ? `${appId}#${event.actor.userId}` : `${appId}#anonymous`,
      GSI1SK: `${event.occurredAt}#${event.eventId}`,
      GSI2PK: (event.context as { sessionId?: string })?.sessionId 
        ? `${appId}#${(event.context as { sessionId?: string }).sessionId}` 
        : `${appId}#no-session`,
      GSI2SK: `${event.occurredAt}#${event.eventId}`,
      // Type-specific fields
      ...(event.type === 'track' && { properties: event.properties }),
      ...(event.type === 'page' && { properties: event.properties }),
      ...(event.type === 'identify' && { traits: event.traits }),
    };

    const command = new PutItemCommand({
      TableName: this.tableName,
      Item: marshall(item, { removeUndefinedValues: true }),
    });

    await this.client.send(command);
  }

  private chunkArray<T>(array: T[], size: number): T[][] {
    const chunks: T[][] = [];
    for (let i = 0; i < array.length; i += size) {
      chunks.push(array.slice(i, i + size));
    }
    return chunks;
  }
}
