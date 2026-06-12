import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { CommsService } from './comms.service';
import { RECEIPT_QUEUE, ReceiptJobData } from '../queue/queue.constants';
import { ReceiptEvent } from '@shared';

/**
 * Applies queued receipt events to the communication state machine.
 * The heavy lifting (idempotency, ordering, attribution) lives in CommsService.
 */
@Processor(RECEIPT_QUEUE, { concurrency: 10 })
export class ReceiptProcessor extends WorkerHost {
  constructor(private readonly comms: CommsService) {
    super();
  }

  async process(job: Job<ReceiptJobData>): Promise<void> {
    const event: ReceiptEvent = {
      eventId: job.data.eventId,
      communicationId: job.data.communicationId,
      type: job.data.type as ReceiptEvent['type'],
      occurredAt: job.data.occurredAt,
      raw: job.data.raw,
    };
    await this.comms.applyReceipt(event);
  }
}
