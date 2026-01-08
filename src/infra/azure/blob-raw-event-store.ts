import { BlobServiceClient } from '@azure/storage-blob';
import type { RawEventStore, RawBatch } from '../interfaces.js';
import type { Logger } from '../../utils/logger.js';

export interface BlobRawEventStoreConfig {
  connectionString: string;
  containerName: string;
  logger: Logger;
  blobPrefix?: string; // Optional prefix for organizing blobs (e.g., 'raw-events/')
}

/**
 * Azure Blob Storage implementation of RawEventStore
 * 
 * Blob name structure: {blobPrefix}{appId}/{year}/{month}/{day}/{batchId}_{timestamp}.json
 * This allows for efficient partitioning and lifecycle policies
 */
export class BlobRawEventStore implements RawEventStore {
  private blobServiceClient: BlobServiceClient;
  private containerName: string;
  private blobPrefix: string;
  private logger: Logger;

  constructor(config: BlobRawEventStoreConfig) {
    this.containerName = config.containerName;
    this.blobPrefix = config.blobPrefix || 'raw-events/';
    this.logger = config.logger;
    this.blobServiceClient = BlobServiceClient.fromConnectionString(config.connectionString);
  }

  async storeRawBatch(batch: RawBatch): Promise<void> {
    try {
      const blobName = this.generateBlobName(batch);
      const containerClient = this.blobServiceClient.getContainerClient(this.containerName);
      const blockBlobClient = containerClient.getBlockBlobClient(blobName);

      const content = JSON.stringify({
        batchId: batch.batchId,
        requestId: batch.requestId,
        receivedAt: batch.receivedAt,
        eventCount: batch.events.length,
        events: batch.events,
      });

      await blockBlobClient.upload(content, content.length, {
        blobHTTPHeaders: {
          blobContentType: 'application/json',
        },
        metadata: {
          batchId: batch.batchId,
          requestId: batch.requestId,
          receivedAt: batch.receivedAt,
          eventCount: batch.events.length.toString(),
        },
      });

      this.logger.info(
        {
          container: this.containerName,
          blobName,
          batchId: batch.batchId,
          eventCount: batch.events.length,
        },
        'Stored raw batch in Azure Blob Storage'
      );
    } catch (error) {
      this.logger.error(
        { err: error, batchId: batch.batchId },
        'Failed to store raw batch in Azure Blob Storage'
      );
      throw error;
    }
  }

  private generateBlobName(batch: RawBatch): string {
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
    
    // Construct full blob name: prefix/appId/year/month/day/filename
    return `${this.blobPrefix}${appId}/${year}/${month}/${day}/${filename}`;
  }
}
