import fs from 'fs';
import path from 'path';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const { PrismaClient } = await import('../generated/prisma/client.ts');

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: npx tsx scripts/delete-points-by-json.mts <caminho-json>');
  process.exit(1);
}

const absoluteInput = path.resolve(inputPath);
const raw = fs.readFileSync(absoluteInput, 'utf-8').replace(/^\uFEFF/, '');
const records = JSON.parse(raw) as Array<{ slug?: string }>;
const slugs = records.map((r) => r.slug).filter((v): v is string => Boolean(v));

const adapter = new PrismaBetterSqlite3({ url: 'file:./dev.db' });
const prisma = new PrismaClient({ adapter });

if (slugs.length === 0) {
  console.log('Nenhum slug encontrado no JSON.');
  await prisma.$disconnect();
  process.exit(0);
}

const result = await prisma.point.deleteMany({
  where: {
    slug: { in: slugs },
  },
});

console.log(`Registros removidos: ${result.count}`);
await prisma.$disconnect();
