import { Processor, WorkerHost, OnWorkerEvent } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Job } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { CommsService } from './comms.service';
import { DispatchRequest, normalizeBaseUrl } from '@shared';
import { SEND_QUEUE, SendJobData } from '../queue/queue.constants';

/**
 * Dispatches each communication to the stubbed channel service.
 * Throwing makes BullMQ retry with exponential backoff; after the last attempt
 * the `failed` event marks the communication FAILED. Concurrency is bounded.
 */
@Processor(SEND_QUEUE, { concurrency: 10 })
export class SendProcessor extends WorkerHost {
  private readonly logger = new Logger(SendProcessor.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly comms: CommsService,
    private readonly config: ConfigService,
  ) {
    super();
  }

  async process(job: Job<SendJobData>): Promise<void> {
    const comm = await this.prisma.communication.findUnique({
      where: { id: job.data.communicationId },
      include: { customer: true },
    });
    if (!comm) return; // comm deleted; nothing to do

    const recipient =
      comm.channel === 'EMAIL' ? comm.customer.email : comm.customer.phone;

    const payload: DispatchRequest = {
      communicationId: comm.id,
      recipient,
      channel: comm.channel,
      message: comm.renderedMessage,
    };

    const base = normalizeBaseUrl(this.config.get<string>('CHANNEL_SERVICE_URL'));
    const res = await fetch(`${base}/dispatch`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (!res.ok) {
      throw new Error(`Channel /dispatch failed: ${res.status}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job<SendJobData>): Promise<void> {
    const maxAttempts = job.opts.attempts ?? 1;
    if (job.attemptsMade >= maxAttempts) {
      this.logger.warn(
        `Send permanently failed for ${job.data.communicationId} after ${job.attemptsMade} attempts`,
      );
      await this.comms.markFailed(job.data.communicationId);
      await this.comms.markCampaignSentIfDone(
        (
          await this.prisma.communication.findUnique({
            where: { id: job.data.communicationId },
            select: { campaignId: true },
          })
        )?.campaignId ?? '',
      );
    }
  }
}
