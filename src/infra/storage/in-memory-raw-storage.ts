import type { RawEventStore, RawBatch } from '../interfaces.js';
import type { Logger } from '../../utils/logger.js';

export class InMemoryRawStorage implements RawEventStore {
  private batches: Map<string, RawBatch> = new Map();
  private logger: Logger;

  constructor(logger: Logger) {
    this.logger = logger;
  }

  async storeRawBatch(batch: RawBatch): Promise<void> {
    // Generate unique filename using batchId and timestamp
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const filename = `${batch.batchId}_${timestamp}.json`;

    // In real implementation, this would write to S3/Blob with unique key
    // For in-memory, we use batchId as key (idempotent)
    if (this.batches.has(batch.batchId)) {
      this.logger.debug({ batchId: batch.batchId }, 'Raw batch already exists, skipping');
      return;
    }

    // Store the batch
    const storedBatch: RawBatch = {
      batchId: batch.batchId,
      requestId: batch.requestId,
      receivedAt: batch.receivedAt,
      events: batch.events,
    };
    this.batches.set(batch.batchId, storedBatch);

    this.logger.info(
      {
        batchId: batch.batchId,
        filename,
        eventCount: batch.events.length,
        totalBatches: this.batches.size,
      },
      'Raw batch stored'
    );
  }

  // Test helpers
  getBatch(batchId: string): RawBatch | undefined {
    return this.batches.get(batchId);
  }

  getAll(): RawBatch[] {
    return Array.from(this.batches.values());
  }

  clear(): void {
    this.batches.clear();
  }

  size(): number {
    return this.batches.size;
  }
}
