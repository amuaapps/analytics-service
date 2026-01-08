import type { QueueAdapter, CoreProcessorRequest } from '../../app/core/types.js';
import type { Logger } from '../../utils/logger.js';

export class InMemoryQueueAdapter implements QueueAdapter {
  private queue: CoreProcessorRequest[] = [];
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  enqueue(message: CoreProcessorRequest): Promise<void> {
    const enrichedMessage = {
      ...message,
      enqueuedAt: new Date().toISOString(),
    };

    this.queue.push(enrichedMessage);

    this.logger.debug(
      {
        requestId: message.requestId,
        batchId: message.batchId,
        eventCount: message.events.length,
        queueSize: this.queue.length,
      },
      'Message enqueued'
    );

    return Promise.resolve();
  }

  getQueue(): CoreProcessorRequest[] {
    return [...this.queue];
  }

  clear(): void {
    this.queue = [];
  }

  size(): number {
    return this.queue.length;
  }
}
