import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CommsService } from '../comms/comms.service';
import { SegmentsService } from '../segments/segments.service';
import { LlmService } from '../agent/llm.service';

export interface CampaignMetrics {
  audience: number;
  sent: number;
  delivered: number;
  opened: number;
  read: number;
  clicked: number;
  failed: number;
  deliveryRate: number; // delivered / sent
  openRate: number; // opened / delivered
  clickRate: number; // clicked / delivered
  failureRate: number; // failed / (sent + failed)
  conversionRate: number; // attributedOrders / delivered
  attributedOrders: number;
  attributedRevenue: number;
}

export interface CampaignAnalysis {
  headline: string;
  summary: string;
  assessment: 'strong' | 'moderate' | 'weak';
  highlights: string[];
  concerns: string[];
  recommendations: { action: string; rationale: string; priority: 'high' | 'medium' | 'low' }[];
}

export interface CampaignInsights {
  generatedAt: string;
  daysSinceLaunch: number;
  metrics: CampaignMetrics;
  analysis: CampaignAnalysis;
}

const SYSTEM = `You are a senior growth marketer reviewing a campaign for a D2C coffee brand.
You are given EXACT metrics — never invent or change numbers; reason only from what is provided.
Be concrete, honest, and specific. If the campaign failed or underperformed, say so plainly and explain the likely cause.
Recommendations must be actionable next steps the marketer can take (timing, audience, channel, message, cadence).
Respond ONLY with JSON matching this shape:
{
  "headline": string,                // one punchy sentence verdict
  "summary": string,                 // 2-3 sentences; reference how many days it has been running and the outcome
  "assessment": "strong" | "moderate" | "weak",
  "highlights": string[],            // what went well (may be empty)
  "concerns": string[],              // what underperformed (may be empty)
  "recommendations": [ { "action": string, "rationale": string, "priority": "high" | "medium" | "low" } ]
}`;

function pct(numerator: number, denominator: number): number {
  if (denominator <= 0) return 0;
  return Math.round((numerator / denominator) * 1000) / 10;
}

@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly comms: CommsService,
    private readonly segments: SegmentsService,
    private readonly llm: LlmService,
  ) {}

  async forCampaign(campaignId: string): Promise<CampaignInsights> {
    const campaign = await this.prisma.campaign.findUnique({
      where: { id: campaignId },
      include: { segment: true },
    });
    if (!campaign) throw new NotFoundException('Campaign not found');

    const analytics = await this.comms.analytics(campaignId);
    const audience = await this.segments.count(
      (campaign.segment?.definition as never) ?? undefined,
    );
    const f = analytics.funnel;

    const metrics: CampaignMetrics = {
      audience,
      sent: f.sent,
      delivered: f.delivered,
      opened: f.opened,
      read: f.read,
      clicked: f.clicked,
      failed: f.failed,
      deliveryRate: pct(f.delivered, f.sent),
      openRate: pct(f.opened, f.delivered),
      clickRate: pct(f.clicked, f.delivered),
      failureRate: pct(f.failed, f.sent + f.failed),
      conversionRate: pct(analytics.attributedOrders, f.delivered),
      attributedOrders: analytics.attributedOrders,
      attributedRevenue: analytics.attributedRevenue,
    };

    const daysSinceLaunch = Math.max(
      0,
      Math.floor((Date.now() - new Date(campaign.createdAt).getTime()) / 86_400_000),
    );

    const analysis = await this.analyze(
      {
        name: campaign.name,
        channel: campaign.channel,
        goal: campaign.goalText ?? '(none stated)',
        status: campaign.status,
        daysSinceLaunch,
      },
      metrics,
    );

    return {
      generatedAt: new Date().toISOString(),
      daysSinceLaunch,
      metrics,
      analysis,
    };
  }

  private async analyze(
    ctx: {
      name: string;
      channel: string;
      goal: string;
      status: string;
      daysSinceLaunch: number;
    },
    m: CampaignMetrics,
  ): Promise<CampaignAnalysis> {
    const prompt = `Campaign: "${ctx.name}"
Goal: ${ctx.goal}
Channel: ${ctx.channel}
Status: ${ctx.status}
Days since launch: ${ctx.daysSinceLaunch}

Metrics (exact):
- Audience targeted: ${m.audience}
- Sent: ${m.sent}
- Delivered: ${m.delivered} (${m.deliveryRate}% of sent)
- Opened: ${m.opened} (${m.openRate}% of delivered)
- Read: ${m.read}
- Clicked: ${m.clicked} (${m.clickRate}% of delivered)
- Failed: ${m.failed} (${m.failureRate}% of attempted)
- Attributed orders: ${m.attributedOrders}
- Attributed revenue: ₹${m.attributedRevenue}
- Conversion: ${m.conversionRate}% of delivered

Write the performance review as JSON.`;

    const raw = await this.llm.completeJson(SYSTEM, prompt);
    return this.parse(raw);
  }

  /** Defensively parse the model's JSON; fall back to a safe shape on failure. */
  private parse(raw: string): CampaignAnalysis {
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
      const obj = JSON.parse(cleaned) as Partial<CampaignAnalysis>;
      return {
        headline: obj.headline ?? 'Performance review',
        summary: obj.summary ?? '',
        assessment:
          obj.assessment === 'strong' || obj.assessment === 'weak'
            ? obj.assessment
            : 'moderate',
        highlights: Array.isArray(obj.highlights) ? obj.highlights : [],
        concerns: Array.isArray(obj.concerns) ? obj.concerns : [],
        recommendations: Array.isArray(obj.recommendations)
          ? obj.recommendations.filter((r) => r && r.action)
          : [],
      };
    } catch (e) {
      this.logger.warn(`Failed to parse analysis JSON: ${(e as Error).message}`);
      return {
        headline: 'Could not generate analysis',
        summary:
          'The AI analysis could not be parsed this time. The metrics above are accurate; try regenerating.',
        assessment: 'moderate',
        highlights: [],
        concerns: [],
        recommendations: [],
      };
    }
  }
}
