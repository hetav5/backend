import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';

export interface CustomerListItem {
  id: string;
  name: string;
  email: string;
  city: string | null;
  orderCount: number;
  lifetimeValue: number;
  lastOrderDaysAgo: number;
}

@Injectable()
export class CustomersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Cursor-paginated list with RFM summary per customer. */
  async list(cursor: string | undefined, limit: number) {
    const take = Math.min(Math.max(limit, 1), 100);
    const rows = await this.prisma.$queryRawUnsafe<CustomerListItem[]>(
      `
      SELECT c.id, c.name, c.email,
        (c.attributes ->> 'city') AS city,
        COUNT(o.id)::int AS "orderCount",
        COALESCE(SUM(o.total), 0)::float AS "lifetimeValue",
        COALESCE(EXTRACT(DAY FROM (now() - MAX(o."placedAt")))::int, 999999) AS "lastOrderDaysAgo"
      FROM "Customer" c
      LEFT JOIN "Order" o ON o."customerId" = c.id
      ${cursor ? 'WHERE c.id > $2' : ''}
      GROUP BY c.id
      ORDER BY c.id ASC
      LIMIT $1
      `,
      take + 1,
      ...(cursor ? [cursor] : []),
    );
    const hasMore = rows.length > take;
    const items = hasMore ? rows.slice(0, take) : rows;
    return {
      items,
      nextCursor: hasMore ? items[items.length - 1].id : null,
    };
  }

  async get(id: string) {
    const customer = await this.prisma.customer.findUnique({
      where: { id },
      include: { orders: { orderBy: { placedAt: 'desc' }, take: 20 } },
    });
    if (!customer) throw new NotFoundException('Customer not found');
    return customer;
  }
}
