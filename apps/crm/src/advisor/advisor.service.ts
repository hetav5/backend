import { Injectable, Logger } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { LlmService } from '../agent/llm.service';

export interface AudienceSnapshot {
  total: number;
  active: number;
  lapsed: number;
  vip: number;
  new: number;
}

export interface BriefingItem {
  title: string;
  detail: string;
}
export interface OpportunityItem extends BriefingItem {
  priority: 'high' | 'medium' | 'low';
}

export interface Briefing {
  trends: BriefingItem[];
  competitorMoves: BriefingItem[];
  opportunities: OpportunityItem[];
}

export interface AdvisorBriefing {
  generatedAt: string;
  audience: AudienceSnapshot;
  briefing: Briefing;
}

const SYSTEM = `You are a strategy advisor for "Crema", a direct-to-consumer specialty coffee brand running a CRM.
You produce a short strategy briefing to help the marketer decide what campaign to run next.

IMPORTANT honesty rules:
- "trends" and "competitorMoves" are your INFORMED GENERAL KNOWLEDGE of the D2C coffee / e-commerce CRM space. They are advisory, NOT real-time data — do not fabricate specific live statistics, named competitors' private numbers, or today's headlines.
- "opportunities" MUST be grounded in the brand's own audience snapshot provided below (reference the actual segment counts).
- Be concrete and practical. Keep each detail to 1-2 sentences.

Respond ONLY with JSON of this exact shape:
{
  "trends": [ { "title": string, "detail": string } ],
  "competitorMoves": [ { "title": string, "detail": string } ],
  "opportunities": [ { "title": string, "detail": string, "priority": "high" | "medium" | "low" } ]
}
Aim for 3 items in each array.`;

@Injectable()
export class AdvisorService {
  private readonly logger = new Logger(AdvisorService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly llm: LlmService,
  ) {}

  async briefing(): Promise<AdvisorBriefing> {
    const [audience, recent] = await Promise.all([
      this.audienceSnapshot(),
      this.recentCampaigns(),
    ]);

    const briefing = await this.generate(audience, recent);
    return {
      generatedAt: new Date().toISOString(),
      audience,
      briefing,
    };
  }

  private async audienceSnapshot(): Promise<AudienceSnapshot> {
    const rows = await this.prisma.$queryRawUnsafe<{ name: string; value: number }[]>(
      `
      SELECT bucket AS name, COUNT(*)::int AS value
      FROM (
        SELECT c.id,
          CASE
            WHEN COUNT(o.id) >= 6 THEN 'VIP'
            WHEN COALESCE(EXTRACT(DAY FROM (now() - MAX(o."placedAt"))), 999999) >= 60 THEN 'Lapsed'
            WHEN COUNT(o.id) <= 1 THEN 'New'
            ELSE 'Active'
          END AS bucket
        FROM "Customer" c
        LEFT JOIN "Order" o ON o."customerId" = c.id
        GROUP BY c.id
      ) sub
      GROUP BY bucket
      `,
    );
    const by = (n: string) => rows.find((r) => r.name === n)?.value ?? 0;
    const active = by('Active');
    const lapsed = by('Lapsed');
    const vip = by('VIP');
    const fresh = by('New');
    return { total: active + lapsed + vip + fresh, active, lapsed, vip, new: fresh };
  }

  private recentCampaigns() {
    return this.prisma.campaign.findMany({
      orderBy: { createdAt: 'desc' },
      take: 5,
      select: { name: true, channel: true, status: true },
    });
  }

  private async generate(
    audience: AudienceSnapshot,
    recent: { name: string; channel: string; status: string }[],
  ): Promise<Briefing> {
    const recentText = recent.length
      ? recent.map((c) => `- "${c.name}" (${c.channel}, ${c.status})`).join('\n')
      : '- (no campaigns run yet)';

    const prompt = `Brand: Crema — D2C specialty coffee.

Audience snapshot (real, from our database):
- Total customers: ${audience.total}
- Active: ${audience.active}
- Lapsed (60+ days no order): ${audience.lapsed}
- VIP (6+ orders): ${audience.vip}
- New (0-1 orders): ${audience.new}

Recent campaigns:
${recentText}

Write the strategy briefing as JSON. Ground "opportunities" in the audience counts above.`;

    const raw = await this.llm.completeJson(SYSTEM, prompt);
    return this.parse(raw);
  }

  private parse(raw: string): Briefing {
    try {
      const cleaned = raw.trim().replace(/^```(?:json)?/i, '').replace(/```$/, '');
      const obj = JSON.parse(cleaned) as Partial<Briefing>;
      const items = (a: unknown): BriefingItem[] =>
        Array.isArray(a)
          ? (a as BriefingItem[]).filter((x) => x && x.title).map((x) => ({ title: x.title, detail: x.detail ?? '' }))
          : [];
      const opps: OpportunityItem[] = Array.isArray(obj.opportunities)
        ? obj.opportunities
            .filter((x) => x && x.title)
            .map((x) => ({
              title: x.title,
              detail: x.detail ?? '',
              priority:
                x.priority === 'high' || x.priority === 'low'
                  ? x.priority
                  : ('medium' as const),
            }))
        : [];
      return {
        trends: items(obj.trends),
        competitorMoves: items(obj.competitorMoves),
        opportunities: opps,
      };
    } catch (e) {
      this.logger.warn(`Failed to parse briefing JSON: ${(e as Error).message}`);
      return { trends: [], competitorMoves: [], opportunities: [] };
    }
  }
}
