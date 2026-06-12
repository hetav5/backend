import {
  BadRequestException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { SegmentsService } from '../segments/segments.service';
import { CommsService } from '../comms/comms.service';
import { Channel, Rule } from '@shared';

export interface CreateDraftInput {
  name: string;
  ruleTree: Rule;
  channel: string; // accepted as a lowercase wire slug; normalized to the enum
  message: string;
  goalText?: string;
}

/** Wire contract uses lowercase channel slugs; Prisma/internal uses the enum. */
const toWire = (c: string): string => c.toLowerCase();
const toEnum = (c: string): Channel => c.toUpperCase() as Channel;

@Injectable()
export class CampaignsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly segments: SegmentsService,
    private readonly comms: CommsService,
  ) {}

  async list() {
    const rows = await this.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        name: true,
        channel: true,
        status: true,
        createdAt: true,
      },
    });
    return rows.map((r) => ({ ...r, channel: toWire(r.channel) }));
  }

  async get(id: string) {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id },
      include: { segment: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');
    const segmentCount = await this.segments.count(
      (campaign.segment?.definition as never) ?? undefined,
    );
    return {
      id: campaign.id,
      name: campaign.name,
      goalText: campaign.goalText,
      channel: toWire(campaign.channel),
      message: campaign.message,
      status: campaign.status,
      segmentCount,
    };
  }

  /** Create a DRAFT campaign + its segment. Returns ids + audience size. */
  async createDraft(input: CreateDraftInput) {
    const segment = await this.prisma.segment.create({
      data: { name: `${input.name} — audience`, definition: input.ruleTree as never },
    });
    const campaign = await this.prisma.campaign.create({
      data: {
        name: input.name,
        goalText: input.goalText,
        segmentId: segment.id,
        channel: toEnum(input.channel),
        message: input.message,
        status: 'DRAFT',
      },
    });
    const segmentCount = await this.segments.count(input.ruleTree);
    return {
      campaignId: campaign.id,
      name: campaign.name,
      channel: toWire(campaign.channel),
      segmentCount,
    };
  }

  /** The ONLY commit path: DRAFT/APPROVED -> SENDING + enqueue sends. */
  async launch(id: string) {
    const campaign = await this.prisma.campaign.findUnique({ where: { id } });
    if (!campaign) throw new NotFoundException('Campaign not found');
    if (campaign.status !== 'DRAFT' && campaign.status !== 'APPROVED') {
      throw new BadRequestException(
        `Campaign cannot be launched from status ${campaign.status}`,
      );
    }
    const recipientCount = await this.comms.dispatchCampaign(id);
    return { status: 'SENDING' as const, recipientCount };
  }

  analytics(id: string) {
    return this.comms.analytics(id);
  }
}
