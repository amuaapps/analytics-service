import { QueueClient } from '@azure/storage-queue';
import type { QueuePublisher, QueueMessage } from '../interfaces.js';
import type { Logger } from '../../utils/logger.js';

export interface AzureQueuePublisherConfig {
  connectionString: string;
  queueName: string;
  logger: Logger;
}

/**
 * Azure Storage Queue implementation of QueuePublisher
 * 
 * Assumptions:
 * - Queue is configured with appropriate visibility timeout (e.g., 5 minutes)
 * - Poison message handling is configured (max dequeue count)
 * - Azure Function is triggered by queue messages
 */
export class AzureQueuePublisher implements QueuePublisher {
  private queueClient: QueueClient;
  private logger: Logger;

  constructor(config: AzureQueuePublisherConfig) {
    this.logger = config.logger;
    this.queueClient = new QueueClient(config.connectionString, config.queueName);
  }

  async enqueue(message: QueueMessage): Promise<void> {
    try {
      // Ensure queue exists
      await this.queueClient.createIfNotExists();

      // Encode message as base64 (required by Azure Storage Queue)
      const messageText = JSON.stringify(message);
      const encodedMessage = Buffer.from(messageText).toString('base64');

      const response = await this.queueClient.sendMessage(encodedMessage, {
        // Optional: Set message TTL (time-to-live)
        // messageTimeToLive: 7 * 24 * 60 * 60, // 7 days in seconds
        
        // Optional: Set visibility timeout (delay before message is visible)
        // visibilityTimeout: 0,
      });

      this.logger.debug(
        {
          queueName: this.queueClient.name,
          messageId: response.messageId,
          batchId: message.batchId,
          storageLocation: message.storageLocation,
        },
        'Enqueued message to Azure Storage Queue'
      );
    } catch (error) {
      this.logger.error(
        { err: error, batchId: message.batchId },
        'Failed to enqueue message to Azure Storage Queue'
      );
      throw error;
    }
  }
}
