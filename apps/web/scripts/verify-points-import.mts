import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const { PrismaClient } = await import('../generated/prisma/client.ts');

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

const total = await prisma.point.count();
const pendingMedia = await prisma.point.count({
  where: {
    OR: [{ baseMediaUrl: '' }, { thumbnailUrl: '' }],
  },
});

const sample = await prisma.point.findMany({
  orderBy: { createdAt: 'desc' },
  take: 5,
  select: {
    name: true,
    city: true,
    slug: true,
    type: true,
    screenWidth: true,
    screenHeight: true,
    published: true,
  },
});

console.log(JSON.stringify({ total, pendingMedia, sample }, null, 2));
await prisma.$disconnect();
