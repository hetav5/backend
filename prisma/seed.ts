/**
 * Seed realistic data for "Daybreak Coffee" — a D2C coffee brand.
 * Generates ~2,000 customers across deliberate RFM cohorts (lapsed, VIP,
 * regular, first-timer, dormant) and ~12k orders, so segments like
 * "lapsed 60d" / "VIP" / "first-time buyers" are meaningful.
 */
import { PrismaClient, Prisma } from '@prisma/client';

const prisma = new PrismaClient();

const CITIES = ['Mumbai', 'Delhi', 'Bangalore', 'Pune', 'Hyderabad', 'Chennai'];
const TAGS = ['espresso', 'cold-brew', 'single-origin', 'decaf', 'subscriber', 'gifting'];
const PRODUCTS = [
  { sku: 'house-blend-250g', price: 549 },
  { sku: 'ethiopia-yirgacheffe-250g', price: 899 },
  { sku: 'cold-brew-pack-6', price: 720 },
  { sku: 'decaf-colombia-250g', price: 649 },
  { sku: 'espresso-roast-1kg', price: 1799 },
  { sku: 'pour-over-kit', price: 1299 },
];
const FIRST = ['Aarav','Vivaan','Aditya','Diya','Ananya','Ishaan','Saanvi','Kabir','Myra','Arjun','Riya','Vihaan','Anika','Reyansh','Aadhya','Krishna','Sara','Dev','Naina','Rohan','Tara','Yash','Kiara','Aryan','Meera','Veer','Zara','Ayaan','Pari','Advait'];
const LAST = ['Sharma','Verma','Patel','Reddy','Nair','Iyer','Khan','Mehta','Gupta','Singh','Rao','Das','Bose','Chopra','Kapoor','Joshi','Menon','Pillai','Shah','Banerjee'];

type Profile = 'lapsed' | 'vip' | 'regular' | 'firstTimer' | 'dormant';

function pick<T>(arr: T[]): T {
  return arr[Math.floor(Math.random() * arr.length)];
}
function rand(min: number, max: number): number {
  return Math.floor(Math.random() * (max - min + 1)) + min;
}
function daysAgo(n: number): Date {
  return new Date(Date.now() - n * 24 * 60 * 60 * 1000);
}
function chunk<T>(arr: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
}

function profileFor(i: number): Profile {
  const r = i % 100;
  if (r < 25) return 'lapsed';
  if (r < 40) return 'vip';
  if (r < 70) return 'regular';
  if (r < 90) return 'firstTimer';
  return 'dormant';
}

/** Returns { count, recencyDays-range } describing the order pattern. */
function orderPlan(profile: Profile): { count: number; spreadDays: [number, number] } {
  switch (profile) {
    case 'lapsed':
      return { count: rand(1, 4), spreadDays: [60, 300] };
    case 'vip':
      return { count: rand(6, 20), spreadDays: [1, 90] };
    case 'regular':
      return { count: rand(2, 8), spreadDays: [1, 120] };
    case 'firstTimer':
      return { count: 1, spreadDays: [1, 45] };
    case 'dormant':
      return { count: 1, spreadDays: [90, 220] };
  }
}

async function main() {
  const TOTAL = 2000;
  console.log(`Seeding ${TOTAL} customers...`);

  // Wipe (idempotent reseed).
  await prisma.orderAttribution.deleteMany();
  await prisma.communicationEvent.deleteMany();
  await prisma.communication.deleteMany();
  await prisma.campaign.deleteMany();
  await prisma.segment.deleteMany();
  await prisma.agentMessage.deleteMany();
  await prisma.agentConversation.deleteMany();
  await prisma.order.deleteMany();
  await prisma.customer.deleteMany();

  const customers: Prisma.CustomerCreateManyInput[] = [];
  const profileByEmail = new Map<string, Profile>();

  for (let i = 0; i < TOTAL; i++) {
    const first = pick(FIRST);
    const last = pick(LAST);
    const email = `${first.toLowerCase()}.${last.toLowerCase()}.${i}@example.com`;
    const profile = profileFor(i);
    profileByEmail.set(email, profile);
    customers.push({
      name: `${first} ${last}`,
      email,
      phone: `+9198${rand(10000000, 99999999)}`,
      attributes: {
        city: pick(CITIES),
        tags: [pick(TAGS), ...(profile === 'vip' ? ['subscriber'] : [])],
      },
    });
  }

  for (const c of chunk(customers, 500)) {
    await prisma.customer.createMany({ data: c });
  }

  const created = await prisma.customer.findMany({ select: { id: true, email: true } });
  console.log(`Created ${created.length} customers. Generating orders...`);

  const orders: Prisma.OrderCreateManyInput[] = [];
  for (const cust of created) {
    const profile = profileByEmail.get(cust.email) ?? 'regular';
    const plan = orderPlan(profile);
    const valueMult = profile === 'vip' ? 1.8 : 1;
    for (let k = 0; k < plan.count; k++) {
      const lineCount = rand(1, 3);
      const items: { sku: string; qty: number; price: number }[] = [];
      let total = 0;
      for (let l = 0; l < lineCount; l++) {
        const p = pick(PRODUCTS);
        const qty = rand(1, 2);
        items.push({ sku: p.sku, qty, price: p.price });
        total += p.price * qty;
      }
      orders.push({
        customerId: cust.id,
        total: Math.round(total * valueMult),
        items: items as unknown as Prisma.InputJsonValue,
        placedAt: daysAgo(rand(plan.spreadDays[0], plan.spreadDays[1])),
      });
    }
  }

  for (const o of chunk(orders, 1000)) {
    await prisma.order.createMany({ data: o });
  }

  console.log(`Created ${orders.length} orders. Seed complete.`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
