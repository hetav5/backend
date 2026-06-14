import {
  BadRequestException,
  Controller,
  Headers,
  HttpCode,
  Post,
  Req,
  UnauthorizedException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { Request } from 'express';
import { ReceiptEvent, SIGNATURE_HEADER, verifySignature } from '@shared';
import { RECEIPT_QUEUE, ReceiptJobData } from '../queue/queue.constants';
import { Public } from '../auth/public.decorator';

/**
 * Thin, fast webhook endpoint. Verifies the HMAC over the raw body, enqueues
 * the event for asynchronous processing, and returns 200 immediately so the
 * provider's callback loop isn't blocked on our processing (backpressure-safe).
 */
@Controller('receipts')
export class ReceiptsController {
  constructor(
    private readonly config: ConfigService,
    @InjectQueue(RECEIPT_QUEUE) private readonly queue: Queue<ReceiptJobData>,
  ) {}

  @Public()
  @Post()
  @HttpCode(200)
  async ingest(
    @Req() req: Request & { rawBody?: Buffer },
    @Headers(SIGNATURE_HEADER) signature?: string,
  ): Promise<{ ok: true }> {
    const raw = req.rawBody?.toString('utf8') ?? '';
    const secret = this.config.get<string>('RECEIPT_HMAC_SECRET', '');
    if (!verifySignature(raw, signature, secret)) {
      throw new UnauthorizedException('Bad signature');
    }

    let event: ReceiptEvent;
    try {
      event = JSON.parse(raw) as ReceiptEvent;
    } catch {
      throw new BadRequestException('Invalid JSON');
    }
    if (!event.eventId || !event.communicationId || !event.type) {
      throw new BadRequestException('Missing required fields');
    }

    // Dedupe at the queue layer too: jobId = eventId means a duplicate callback
    // won't even create a second job.
    await this.queue.add(
      'receipt',
      {
        eventId: event.eventId,
        communicationId: event.communicationId,
        type: event.type,
        occurredAt: event.occurredAt,
        raw: event.raw,
      },
      { jobId: event.eventId, removeOnComplete: 5000, removeOnFail: 5000 },
    );

    return { ok: true };
  }
}
