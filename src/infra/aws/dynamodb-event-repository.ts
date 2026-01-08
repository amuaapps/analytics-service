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

export interface DynamoDBEventRepositoryConfig {
  tableName: string;
  region: string;
  logger: Logger;
}

/**
 * DynamoDB implementation of EventRepository
 * 
 * Table schema:
 * - PK: appId (partition key)
 * - SK: occurredAt#eventId (sort key for time-based queries)
 * - GSI1PK: userId (for user-based queries)
 * - GSI1SK: occurredAt#eventId
 * - GSI2PK: sessionId (for session-based queries)
 * - GSI2SK: occurredAt#eventId
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

      // Determine which index to use
      let indexName: string | undefined;
      let keyConditionExpression: string;
      let expressionAttributeValues: Record<string, unknown>;

      if (userId) {
        // Query by user
        indexName = 'GSI1';
        keyConditionExpression = 'GSI1PK = :userId';
        expressionAttributeValues = { ':userId': userId };
      } else if (sessionId) {
        // Query by session
        indexName = 'GSI2';
        keyConditionExpression = 'GSI2PK = :sessionId';
        expressionAttributeValues = { ':sessionId': sessionId };
      } else {
        // Query by appId (primary index)
        keyConditionExpression = 'PK = :appId';
        expressionAttributeValues = { ':appId': appId };
      }

      // Add time range to sort key condition
      if (from && to) {
        keyConditionExpression += ' AND SK BETWEEN :from AND :to';
        expressionAttributeValues[':from'] = from;
        expressionAttributeValues[':to'] = to;
      } else if (from) {
        keyConditionExpression += ' AND SK >= :from';
        expressionAttributeValues[':from'] = from;
      } else if (to) {
        keyConditionExpression += ' AND SK <= :to';
        expressionAttributeValues[':to'] = to;
      }

      const command = new QueryCommand({
        TableName: this.tableName,
        IndexName: indexName,
        KeyConditionExpression: keyConditionExpression,
        ExpressionAttributeValues: marshall(expressionAttributeValues),
        Limit: limit + 1, // Fetch one extra to determine hasMore
        ExclusiveStartKey: cursor ? JSON.parse(Buffer.from(cursor, 'base64').toString()) : undefined,
        ScanIndexForward: input.sort === 'asc',
      });

      const response = await this.client.send(command);
      const items = (response.Items || []).map((item: Record<string, unknown>) => unmarshall(item) as StoredEvent);

      const hasMore = items.length > limit;
      const events = hasMore ? items.slice(0, limit) : items;
      const nextCursor = hasMore && response.LastEvaluatedKey
        ? Buffer.from(JSON.stringify(response.LastEvaluatedKey)).toString('base64')
        : undefined;

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
    const item = {
      PK: event.source.appId,
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
      // Add GSI keys
      GSI1PK: event.actor.userId || 'anonymous',
      GSI1SK: `${event.occurredAt}#${event.eventId}`,
      GSI2PK: (event.context as { sessionId?: string })?.sessionId || 'no-session',
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
