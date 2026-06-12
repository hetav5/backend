import { PrismaClient, Prisma } from '@prisma/client';
const p = new PrismaClient();
(async () => {
  const seg = await p.segment.create({
    data: {
      name: 'lapsed',
      definition: {
        all: [
          { field: 'lastOrderDaysAgo', op: '>', value: 60 },
          { field: 'orderCount', op: '>=', value: 1 },
        ],
      } as unknown as Prisma.InputJsonValue,
    },
  });
  const c = await p.campaign.create({
    data: {
      name: 'Winback test',
      channel: 'EMAIL',
      message: 'Hey {{first_name}}, we miss you — 20% off your next bag.',
      segmentId: seg.id,
      status: 'DRAFT',
    },
  });
  console.log(c.id);
  await p.$disconnect();
})();
