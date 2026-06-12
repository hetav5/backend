import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { Rule } from '@shared';
import { SegmentCompiler } from './segment-compiler';

export interface AudienceMember {
  id: string;
  name: string;
  email: string;
  lastOrderDaysAgo: number;
  orderCount: number;
  lifetimeValue: number;
}

export interface AudiencePreview {
  count: number;
  sample: AudienceMember[];
}

@Injectable()
export class SegmentsService {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * The per-customer aggregate query. The compiled HAVING clause filters on
   * derived RFM metrics. Grouping by the PK lets us reference c.attributes in
   * HAVING (functional dependency).
   */
  private buildQuery(
    rule: Rule | undefined,
    select: string,
    extra = '',
  ): { sql: string; params: unknown[] } {
    const { sql: having, params } = SegmentCompiler.compile(rule);
    const sql = `
      SELECT ${select}
      FROM "Customer" c
      LEFT JOIN "Order" o ON o."customerId" = c.id
      GROUP BY c.id
      HAVING ${having}
      ${extra}
    `;
    return { sql, params };
  }

  /** Count + a 10-row sample for the agent's preview card. */
  async preview(rule: Rule | undefined): Promise<AudiencePreview> {
    const memberSelect = `
      c.id, c.name, c.email,
      COALESCE(EXTRACT(DAY FROM (now() - MAX(o."placedAt")))::int, 999999) AS "lastOrderDaysAgo",
      COUNT(o.id)::int AS "orderCount",
      COALESCE(SUM(o.total), 0)::float AS "lifetimeValue"
    `;
    const sample = await this.runMembers(rule, memberSelect, 'ORDER BY "lifetimeValue" DESC LIMIT 10');
    const count = await this.count(rule);
    return { count, sample };
  }

  /** Total audience size. */
  async count(rule: Rule | undefined): Promise<number> {
    const { sql, params } = this.buildQuery(rule, 'c.id');
    const wrapped = `SELECT COUNT(*)::int AS count FROM (${sql}) sub`;
    const rows = await this.prisma.$queryRawUnsafe<{ count: number }[]>(
      wrapped,
      ...params,
    );
    return rows[0]?.count ?? 0;
  }

  /** Resolve the audience to customer ids (for campaign launch). */
  async resolveCustomerIds(rule: Rule | undefined): Promise<string[]> {
    const { sql, params } = this.buildQuery(rule, 'c.id AS id');
    const rows = await this.prisma.$queryRawUnsafe<{ id: string }[]>(
      sql,
      ...params,
    );
    return rows.map((r) => r.id);
  }

  private async runMembers(
    rule: Rule | undefined,
    select: string,
    extra: string,
  ): Promise<AudienceMember[]> {
    const { sql, params } = this.buildQuery(rule, select, extra);
    return this.prisma.$queryRawUnsafe<AudienceMember[]>(sql, ...params);
  }
}
