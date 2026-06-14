import { BadRequestException, Injectable, NotFoundException } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateOrderDto } from './dto/create-order.dto';

@Injectable()
export class OrdersService {
  constructor(private readonly prisma: PrismaService) {}

  /** Create a single order, resolving the customer by id or email. */
  async create(dto: CreateOrderDto) {
    const customerId = await this.resolveCustomerId(dto);
    return this.prisma.order.create({
      data: {
        customerId,
        total: dto.total,
        items: (dto.items ?? []) as unknown as Prisma.InputJsonValue,
        placedAt: dto.placedAt ? new Date(dto.placedAt) : new Date(),
      },
    });
  }

  /**
   * Bulk ingest. Resolves all customer references in one pass, inserts the
   * resolvable orders with createMany, and reports any that were skipped
   * (unknown customer) so a partial upload is transparent rather than silent.
   */
  async createMany(dtos: CreateOrderDto[]): Promise<{ count: number; skipped: number }> {
    // Resolve emails → ids in a single query.
    const emails = [
      ...new Set(dtos.map((d) => d.customerEmail).filter((e): e is string => !!e)),
    ];
    const byEmail = new Map<string, string>();
    if (emails.length) {
      const found = await this.prisma.customer.findMany({
        where: { email: { in: emails } },
        select: { id: true, email: true },
      });
      for (const c of found) byEmail.set(c.email, c.id);
    }

    // Validate that any explicit customerIds exist.
    const ids = [...new Set(dtos.map((d) => d.customerId).filter((id): id is string => !!id))];
    const knownIds = new Set<string>();
    if (ids.length) {
      const found = await this.prisma.customer.findMany({
        where: { id: { in: ids } },
        select: { id: true },
      });
      for (const c of found) knownIds.add(c.id);
    }

    const data: Prisma.OrderCreateManyInput[] = [];
    let skipped = 0;
    for (const dto of dtos) {
      const customerId = dto.customerId
        ? knownIds.has(dto.customerId)
          ? dto.customerId
          : undefined
        : dto.customerEmail
          ? byEmail.get(dto.customerEmail)
          : undefined;
      if (!customerId) {
        skipped++;
        continue;
      }
      data.push({
        customerId,
        total: dto.total,
        items: (dto.items ?? []) as unknown as Prisma.InputJsonValue,
        placedAt: dto.placedAt ? new Date(dto.placedAt) : new Date(),
      });
    }

    if (data.length) await this.prisma.order.createMany({ data });
    return { count: data.length, skipped };
  }

  private async resolveCustomerId(dto: CreateOrderDto): Promise<string> {
    if (!dto.customerId && !dto.customerEmail) {
      throw new BadRequestException('Provide customerId or customerEmail');
    }
    if (dto.customerId) {
      const exists = await this.prisma.customer.findUnique({
        where: { id: dto.customerId },
        select: { id: true },
      });
      if (!exists) throw new NotFoundException(`Customer ${dto.customerId} not found`);
      return dto.customerId;
    }
    const customer = await this.prisma.customer.findUnique({
      where: { email: dto.customerEmail },
      select: { id: true },
    });
    if (!customer) throw new NotFoundException(`Customer ${dto.customerEmail} not found`);
    return customer.id;
  }
}
