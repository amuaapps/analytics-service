import { SQSClient, SendMessageCommand } from '@aws-sdk/client-sqs';
import type { QueuePublisher, QueueMessage } from '../interfaces.js';
import type { Logger } from '../../utils/logger.js';

export interface SQSQueuePublisherConfig {
  queueUrl: string;
  region: string;
  logger: Logger;
}

/**
 * SQS implementation of QueuePublisher
 *
 * Assumptions:
 * - Queue is configured with appropriate visibility timeout (e.g., 5 minutes)
 * - Dead-letter queue (DLQ) is configured for poison messages
 * - Lambda function is triggered by SQS events
 */
export class SQSQueuePublisher implements QueuePublisher {
  private client: SQSClient;
  private queueUrl: string;
  private logger: Logger;

  constructor(config: SQSQueuePublisherConfig) {
    this.queueUrl = config.queueUrl;
    this.logger = config.logger;
    this.client = new SQSClient({ region: config.region });
  }

  async enqueue(message: QueueMessage): Promise<void> {
    try {
      const command = new SendMessageCommand({
        QueueUrl: this.queueUrl,
        MessageBody: JSON.stringify(message),
        MessageAttributes: {
          requestId: {
            DataType: 'String',
            StringValue: message.requestId,
          },
          batchId: {
            DataType: 'String',
            StringValue: message.batchId,
          },
          storageLocation: {
            DataType: 'String',
            StringValue: message.storageLocation,
          },
        },
        // Use batchId as deduplication ID for FIFO queues
        // MessageDeduplicationId: message.batchId, // Uncomment for FIFO queues
        // MessageGroupId: message.events[0]?.source?.appId || 'default', // Uncomment for FIFO queues
      });

      const response = await this.client.send(command);

      this.logger.debug(
        {
          queueUrl: this.queueUrl,
          messageId: response.MessageId,
          batchId: message.batchId,
          storageLocation: message.storageLocation,
        },
        'Enqueued message to SQS'
      );
    } catch (error) {
      this.logger.error(
        { err: error, batchId: message.batchId },
        'Failed to enqueue message to SQS'
      );
      throw error;
    }
  }
}
