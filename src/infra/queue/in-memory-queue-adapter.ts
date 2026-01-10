import type { QueuePublisher, QueueMessage } from '../interfaces.js';
import type { Logger } from '../../utils/logger.js';

export class InMemoryQueueAdapter implements QueuePublisher {
  private queue: QueueMessage[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  enqueue(message: QueueMessage): Promise<void> {
    const enrichedMessage = {
      ...message,
      enqueuedAt: new Date().toISOString(),
    };

    this.queue.push(enrichedMessage);

    this.logger.debug(
      {
        batchId: enrichedMessage.batchId,
        requestId: enrichedMessage.requestId,
        storageLocation: enrichedMessage.storageLocation,
        queueSize: this.queue.length,
      },
      'Message enqueued to in-memory queue'
    );

    return Promise.resolve();
  }

  getQueue(): QueueMessage[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }

  size(): number {
    return this.queue.length;
  }
}
