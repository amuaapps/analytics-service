import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import type { RawEventStore, RawBatch, RawBatchPointer } from '../interfaces.js';
import type { Logger } from '../../utils/logger.js';

export interface S3RawEventStoreConfig {
  bucketName: string;
  region: string;
  logger: Logger;
  keyPrefix?: string; // Optional prefix for organizing objects (e.g., 'raw-events/')
}

/**
 * S3 implementation of RawEventStore
 *
 * Object key structure: {keyPrefix}{appId}/{year}/{month}/{day}/{batchId}_{timestamp}.json
 * This allows for efficient partitioning and lifecycle policies
 */
export class S3RawEventStore implements RawEventStore {
  private client: S3Client;
  private bucketName: string;
  private keyPrefix: string;
  private logger: Logger;

  constructor(config: S3RawEventStoreConfig) {
    this.bucketName = config.bucketName;
    this.keyPrefix = config.keyPrefix || 'raw-events/';
    this.logger = config.logger;
    this.client = new S3Client({ region: config.region });
  }

  async storeRawBatch(batch: RawBatch): Promise<RawBatchPointer> {
    try {
      const key = this.generateKey(batch);
      const body = JSON.stringify({
        batchId: batch.batchId,
        requestId: batch.requestId,
        receivedAt: batch.receivedAt,
        eventCount: batch.events.length,
        events: batch.events,
      });

      const command = new PutObjectCommand({
        Bucket: this.bucketName,
        Key: key,
        Body: body,
        ContentType: 'application/json',
        Metadata: {
          batchId: batch.batchId,
          requestId: batch.requestId,
          receivedAt: batch.receivedAt,
          eventCount: batch.events.length.toString(),
        },
      });

      await this.client.send(command);

      this.logger.info(
        {
          bucket: this.bucketName,
          key,
          batchId: batch.batchId,
          eventCount: batch.events.length,
        },
        'Stored raw batch in S3'
      );

      return {
        batchId: batch.batchId,
        storageLocation: key,
      };
    } catch (error) {
      this.logger.error({ err: error, batchId: batch.batchId }, 'Failed to store raw batch in S3');
      throw error;
    }
  }

  async getRawBatch(pointer: RawBatchPointer): Promise<RawBatch> {
    try {
      const command = new GetObjectCommand({
        Bucket: this.bucketName,
        Key: pointer.storageLocation,
      });

      const response = await this.client.send(command);

      if (!response.Body) {
        throw new Error('Empty response body from S3');
      }

      const bodyString = await response.Body.transformToString();
      const data = JSON.parse(bodyString);

      this.logger.debug(
        {
          bucket: this.bucketName,
          key: pointer.storageLocation,
          batchId: pointer.batchId,
          eventCount: data.eventCount,
        },
        'Retrieved raw batch from S3'
      );

      return {
        batchId: data.batchId,
        requestId: data.requestId,
        receivedAt: data.receivedAt,
        events: data.events,
      };
    } catch (error) {
      this.logger.error(
        { err: error, batchId: pointer.batchId, storageLocation: pointer.storageLocation },
        'Failed to retrieve raw batch from S3'
      );
      throw error;
    }
  }

  private generateKey(batch: RawBatch): string {
    // Extract appId from first event (all events in batch should have same appId)
    const appId = batch.events[0]?.source?.appId || 'unknown';

    // Parse receivedAt to create date-based partitioning
    const date = new Date(batch.receivedAt);
    const year = date.getUTCFullYear();
    const month = String(date.getUTCMonth() + 1).padStart(2, '0');
    const day = String(date.getUTCDate()).padStart(2, '0');

    // Create unique filename with timestamp
    const timestamp = date.getTime();
    const filename = `${batch.batchId}_${timestamp}.json`;

    // Construct full key: prefix/appId/year/month/day/filename
    return `${this.keyPrefix}${appId}/${year}/${month}/${day}/${filename}`;
  }
}
