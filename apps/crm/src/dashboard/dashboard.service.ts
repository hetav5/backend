import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

/** Display hint so the frontend can format the raw number correctly. */
export type KpiFormat = 'currency' | 'number' | 'percent';

export interface DashboardKpi {
  key: string;
  label: string;
  value: number;
  format: KpiFormat;
  delta: number; // % change vs the previous comparable period
  spark: number[];
}

export interface RevenuePoint {
  label: string;
  revenue: number;
  orders: number;
}
export interface EngagementPoint {
  day: string;
  delivered: number;
  opened: number;
  clicked: number;
}
export interface SegmentSlice {
  name: string;
  value: number;
}
export interface ChannelPerfPoint {
  channel: string;
  key: string;
  sent: number;
  ctr: number;
}
export interface ActivityItem {
  id: string;
  kind: 'launch' | 'draft' | 'delivered' | 'order';
  title: string;
  meta: string;
  when: string;
}

export interface DashboardData {
  kpis: DashboardKpi[];
  revenueSeries: RevenuePoint[];
  audienceSplit: SegmentSlice[];
  engagementSeries: EngagementPoint[];
  channelPerf: ChannelPerfPoint[];
  activity: ActivityItem[];
}

const CHANNEL_LABEL: Record<string, string> = {
  WHATSAPP: 'WhatsApp',
  EMAIL: 'Email',
  SMS: 'SMS',
  RCS: 'RCS',
};

function pctDelta(curr: number, prev: number): number {
  if (prev === 0) return curr > 0 ? 100 : 0;
  return Math.round(((curr - prev) / prev) * 1000) / 10;
}

function sum(xs: number[]): number {
  return xs.reduce((a, b) => a + b, 0);
}

@Injectable()
export class DashboardService {
  constructor(private readonly prisma: PrismaService) {}

  async overview(): Promise<DashboardData> {
    const [monthly, daily, dailyCampaigns, audience, channels, totals, comms, active, recent] =
      await Promise.all([
        this.monthlyRevenue(),
        this.dailyEngagement(),
        this.dailyCampaignsCreated(),
        this.audienceSplit(),
        this.channelPerf(),
        this.orderTotals(),
        this.commTotals(),
        this.activeCampaigns(),
        this.recentCampaigns(),
      ]);

    const revenueSeries: RevenuePoint[] = monthly.map((m) => ({
      label: m.label,
      revenue: m.revenue,
      orders: m.orders,
    }));
    const engagementSeries: EngagementPoint[] = daily.map((d, i) => ({
      day: String(i + 1),
      delivered: d.delivered,
      opened: d.opened,
      clicked: d.clicked,
    }));

    // --- KPI sparks/deltas derived from the series above ---
    const revSpark = revenueSeries.map((r) => r.revenue);
    const ordSpark = revenueSeries.map((r) => r.orders);
    const deliveredSpark = engagementSeries.map((e) => e.delivered);
    const campaignSpark = dailyCampaigns;

    const last7 = (xs: number[]) => sum(xs.slice(-7));
    const prev7 = (xs: number[]) => sum(xs.slice(-14, -7));
    const lastOf = (xs: number[]) => (xs.length ? xs[xs.length - 1] : 0);
    const prevOf = (xs: number[]) => (xs.length > 1 ? xs[xs.length - 2] : 0);

    const ctr = comms.delivered > 0 ? Math.round((comms.clicked / comms.delivered) * 1000) / 10 : 0;

    const kpis: DashboardKpi[] = [
      {
        key: 'revenue',
        label: 'Total revenue',
        value: totals.revenue,
        format: 'currency',
        delta: pctDelta(lastOf(revSpark), prevOf(revSpark)),
        spark: revSpark,
      },
      {
        key: 'orders',
        label: 'Total orders',
        value: totals.orders,
        format: 'number',
        delta: pctDelta(lastOf(ordSpark), prevOf(ordSpark)),
        spark: ordSpark,
      },
      {
        key: 'delivered',
        label: 'Messages delivered',
        value: comms.delivered,
        format: 'number',
        delta: pctDelta(last7(deliveredSpark), prev7(deliveredSpark)),
        spark: deliveredSpark,
      },
      {
        key: 'campaigns',
        label: 'Active campaigns',
        value: active,
        format: 'number',
        delta: pctDelta(last7(campaignSpark), prev7(campaignSpark)),
        spark: campaignSpark.length ? campaignSpark : [0, 0],
      },
    ];

    return {
      kpis,
      revenueSeries,
      audienceSplit: audience,
      engagementSeries,
      channelPerf: channels,
      activity: recent,
    };
  }

  /** Total order revenue + count per month for the last 6 months (gaps filled). */
  private monthlyRevenue() {
    return this.prisma.$queryRawUnsafe<{ label: string; revenue: number; orders: number }[]>(
      `
      SELECT to_char(m, 'Mon') AS label,
             COALESCE(SUM(o.total), 0)::float AS revenue,
             COUNT(o.id)::int AS orders
      FROM generate_series(
             date_trunc('month', now()) - interval '5 months',
             date_trunc('month', now()),
             interval '1 month'
           ) m
      LEFT JOIN "Order" o ON date_trunc('month', o."placedAt") = m
      GROUP BY m
      ORDER BY m ASC
      `,
    );
  }

  /** Delivered / opened / clicked events per day for the last 14 days (gaps filled). */
  private dailyEngagement() {
    return this.prisma.$queryRawUnsafe<{ delivered: number; opened: number; clicked: number }[]>(
      `
      SELECT
        COALESCE(COUNT(e.id) FILTER (WHERE e.type = 'delivered'), 0)::int AS delivered,
        COALESCE(COUNT(e.id) FILTER (WHERE e.type = 'opened'), 0)::int AS opened,
        COALESCE(COUNT(e.id) FILTER (WHERE e.type = 'clicked'), 0)::int AS clicked
      FROM generate_series(
             date_trunc('day', now()) - interval '13 days',
             date_trunc('day', now()),
             interval '1 day'
           ) d
      LEFT JOIN "CommunicationEvent" e ON date_trunc('day', e."occurredAt") = d
      GROUP BY d
      ORDER BY d ASC
      `,
    );
  }

  /** Campaigns created per day for the last 14 days (drives the active-campaigns spark). */
  private async dailyCampaignsCreated(): Promise<number[]> {
    const rows = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
      `
      SELECT COALESCE(COUNT(c.id), 0)::int AS n
      FROM generate_series(
             date_trunc('day', now()) - interval '13 days',
             date_trunc('day', now()),
             interval '1 day'
           ) d
      LEFT JOIN "Campaign" c ON date_trunc('day', c."createdAt") = d
      GROUP BY d
      ORDER BY d ASC
      `,
    );
    return rows.map((r) => r.n);
  }

  /** Mutually-exclusive RFM buckets that sum to the total customer count. */
  private audienceSplit(): Promise<SegmentSlice[]> {
    return this.prisma.$queryRawUnsafe<SegmentSlice[]>(
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
  }

  /** Per-channel sent count + click-through rate. */
  private async channelPerf(): Promise<ChannelPerfPoint[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      { channel: string; sent: number; delivered: number; clicked: number }[]
    >(
      `
      SELECT channel,
        COUNT(*) FILTER (WHERE status <> 'QUEUED')::int AS sent,
        COUNT(*) FILTER (WHERE status IN ('DELIVERED','OPENED','READ','CLICKED'))::int AS delivered,
        COUNT(*) FILTER (WHERE status = 'CLICKED')::int AS clicked
      FROM "Communication"
      GROUP BY channel
      `,
    );
    return rows.map((r) => ({
      channel: CHANNEL_LABEL[r.channel] ?? r.channel,
      key: r.channel.toLowerCase(),
      sent: r.sent,
      ctr: r.delivered > 0 ? Math.round((r.clicked / r.delivered) * 100) : 0,
    }));
  }

  private async orderTotals(): Promise<{ revenue: number; orders: number }> {
    const rows = await this.prisma.$queryRawUnsafe<{ revenue: number; orders: number }[]>(
      `SELECT COALESCE(SUM(total), 0)::float AS revenue, COUNT(*)::int AS orders FROM "Order"`,
    );
    return rows[0] ?? { revenue: 0, orders: 0 };
  }

  private async commTotals(): Promise<{ delivered: number; clicked: number }> {
    const rows = await this.prisma.$queryRawUnsafe<{ delivered: number; clicked: number }[]>(
      `
      SELECT
        COUNT(*) FILTER (WHERE status IN ('DELIVERED','OPENED','READ','CLICKED'))::int AS delivered,
        COUNT(*) FILTER (WHERE status = 'CLICKED')::int AS clicked
      FROM "Communication"
      `,
    );
    return rows[0] ?? { delivered: 0, clicked: 0 };
  }

  private async activeCampaigns(): Promise<number> {
    const rows = await this.prisma.$queryRawUnsafe<{ n: number }[]>(
      `SELECT COUNT(*)::int AS n FROM "Campaign" WHERE status IN ('APPROVED','SENDING')`,
    );
    return rows[0]?.n ?? 0;
  }

  /** Recent campaigns rendered as activity-feed items. */
  private async recentCampaigns(): Promise<ActivityItem[]> {
    const rows = await this.prisma.$queryRawUnsafe<
      { id: string; name: string; channel: string; status: string; createdAt: Date }[]
    >(
      `SELECT id, name, channel, status, "createdAt" FROM "Campaign" ORDER BY "createdAt" DESC LIMIT 6`,
    );
    return rows.map((r) => ({
      id: r.id,
      kind: r.status === 'SENT' || r.status === 'SENDING' ? 'launch' : 'draft',
      title: r.status === 'DRAFT' ? 'Draft staged by agent' : 'Campaign launched',
      meta: `${r.name} · ${CHANNEL_LABEL[r.channel] ?? r.channel}`,
      when: this.relativeTime(r.createdAt),
    }));
  }

  private relativeTime(d: Date): string {
    const diffMs = Date.now() - new Date(d).getTime();
    const mins = Math.round(diffMs / 60000);
    if (mins < 1) return 'just now';
    if (mins < 60) return `${mins}m ago`;
    const hrs = Math.round(mins / 60);
    if (hrs < 24) return `${hrs}h ago`;
    const days = Math.round(hrs / 24);
    return days === 1 ? 'yesterday' : `${days}d ago`;
  }
}
