import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentsService } from '../segments/segments.service';
import {
  CommStatus,
  ReceiptEvent,
  shouldAdvance,
  statusForEvent,
} from '@shared';
import { SEND_QUEUE, SendJobData } from '../queue/queue.constants';

/** Map a status to the timestamp key recorded in Communication.timestamps. */
const TS_KEY: Partial<Record<CommStatus, string>> = {
  SENT: 'sentAt',
  DELIVERED: 'deliveredAt',
  OPENED: 'openedAt',
  READ: 'readAt',
  CLICKED: 'clickedAt',
  FAILED: 'failedAt',
};

@Injectable()
export class CommsService {
  private readonly logger = new Logger(CommsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
    @InjectQueue(SEND_QUEUE) private readonly sendQueue: Queue<SendJobData>,
  ) {}

  private personalize(template: string, name: string): string {
    const first = name.split(' ')[0] ?? name;
    return template.replace(/\{\{\s*first_name\s*\}\}/g, first);
  }

  /**
   * Materialize the audience, create QUEUED communications in one transaction,
   * flip the campaign to SENDING, then enqueue one send job per recipient.
   * Returns the recipient count.
   */
  async dispatchCampaign(campaignId: string): Promise<number> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { segment: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const rule = (campaign.segment?.definition as never) ?? undefined;
    const customerIds = await this.segments.resolveCustomerIds(rule);
    if (customerIds.length === 0) return 0;

    const customers = await this.prisma.customer.findMany({
      where: { id: { in: customerIds } },
      select: { id: true, name: true },
    });

    // Create communications + flip status atomically.
    const created = await this.prisma.$transaction(async (tx) => {
      await tx.communication.createMany({
        data: customers.map((c) => ({
          campaignId: campaign.id,
          customerId: c.id,
          channel: campaign.channel,
          renderedMessage: this.personalize(campaign.message, c.name),
          status: 'QUEUED',
        })),
      });
      await tx.campaign.update({
        where: { id: campaign.id },
        data: { status: 'SENDING' },
      });
      return tx.communication.findMany({
        where: { campaignId: campaign.id },
        select: { id: true },
      });
    });

    // Enqueue sends with retry/backoff (BullMQ handles the retry loop).
    // The retry window must outlast a channel-service cold start: on free-tier
    // hosting the channel can be spun down and take ~30-50s to wake. With
    // exponential backoff at delay=2000ms, 6 attempts wait 2+4+8+16+32 ≈ 62s
    // before giving up, so a waking channel doesn't fail an entire send.
    await this.sendQueue.addBulk(
      created.map((comm) => ({
        name: 'send',
        data: { communicationId: comm.id },
        opts: {
          attempts: 6,
          backoff: { type: 'exponential', delay: 2000 },
          removeOnComplete: 1000,
          removeOnFail: 1000,
        },
      })),
    );

    return created.length;
  }

  /** Mark all of a campaign's comms sent → flip campaign to SENT when drained. */
  async markCampaignSentIfDone(campaignId: string): Promise<void> {
    const remaining = await this.prisma.communication.count({
      where: { campaignId, status: 'QUEUED' },
    });
    if (remaining === 0) {
      await this.prisma.campaign.updateMany({
        where: { id: campaignId, status: 'SENDING' },
        data: { status: 'SENT' },
      });
    }
  }

  /**
   * Apply a receipt event idempotently and order-safely.
   * - Insert into the append-only event log; a duplicate eventId is a no-op.
   * - Advance Communication.status only if the state machine allows it.
   * - For 'converted', create the resulting order + attribution.
   */
  async applyReceipt(event: ReceiptEvent): Promise<void> {
    const comm = await this.prisma.communication.findUnique({
      where: { id: event.communicationId },
    });
    if (!comm) {
      this.logger.warn(`Receipt for unknown communication ${event.communicationId}`);
      return;
    }

    // 1) Idempotent append to the event log (unique eventId).
    try {
      await this.prisma.communicationEvent.create({
        data: {
          communicationId: comm.id,
          eventId: event.eventId,
          type: event.type,
          occurredAt: new Date(event.occurredAt),
          raw: (event.raw ?? {}) as never,
        },
      });
    } catch (e: unknown) {
      // Unique violation => duplicate delivery; safe to drop.
      if (this.isUniqueViolation(e)) return;
      throw e;
    }

    // 2) Conversion => create order + attribution (the "order because of comm").
    if (event.type === 'converted') {
      await this.attributeConversion(comm.id, comm.customerId, event);
      return;
    }

    // 3) Project status via the monotonic state machine.
    const next = statusForEvent(event.type);
    if (!next) return;
    if (shouldAdvance(comm.status as CommStatus, next)) {
      const tsKey = TS_KEY[next];
      const timestamps = {
        ...(comm.timestamps as Record<string, unknown>),
        ...(tsKey ? { [tsKey]: event.occurredAt } : {}),
      };
      await this.prisma.communication.update({
        where: { id: comm.id },
        data: { status: next, timestamps: timestamps as never },
      });
      if (next === 'SENT') {
        await this.markCampaignSentIfDone(comm.campaignId);
      }
    }
  }

  private async attributeConversion(
    communicationId: string,
    customerId: string,
    event: ReceiptEvent,
  ): Promise<void> {
    const amount = Number((event.raw as { amount?: number })?.amount ?? 0);
    await this.prisma.$transaction(async (tx) => {
      const order = await tx.order.create({
        data: {
          customerId,
          total: amount,
          items: [],
          placedAt: new Date(event.occurredAt),
        },
      });
      await tx.orderAttribution.create({
        data: { orderId: order.id, communicationId },
      });
    });
  }

  /** Funnel + attribution analytics for a campaign. */
  async analytics(campaignId: string) {
    const grouped = await this.prisma.communication.groupBy({
      by: ['status'],
      where: { campaignId },
      _count: { _all: true },
    });
    const byStatus: Record<string, number> = {};
    for (const g of grouped) byStatus[g.status] = g._count._all;

    // Funnel counts are cumulative down the engagement chain.
    const at = (s: CommStatus) => byStatus[s] ?? 0;
    const failed = at('FAILED');
    const clicked = at('CLICKED');
    const read = at('READ') + clicked;
    const opened = at('OPENED') + read;
    const delivered = at('DELIVERED') + opened;
    const sent = at('SENT') + delivered;

    const attribution = await this.prisma.orderAttribution.findMany({
      where: { communication: { campaignId } },
      include: { order: { select: { total: true } } },
    });
    const attributedOrders = attribution.length;
    const attributedRevenue = attribution.reduce(
      (sum, a) => sum + a.order.total,
      0,
    );

    return {
      funnel: { sent, delivered, opened, read, clicked, failed },
      attributedOrders,
      attributedRevenue,
    };
  }

  async markFailed(communicationId: string): Promise<void> {
    await this.prisma.communication.updateMany({
      where: { id: communicationId, status: 'QUEUED' },
      data: { status: 'FAILED' },
    });
  }

  private isUniqueViolation(e: unknown): boolean {
    return (
      typeof e === 'object' &&
      e !== null &&
      'code' in e &&
      (e as { code?: string }).code === 'P2002'
    );
  }
}
