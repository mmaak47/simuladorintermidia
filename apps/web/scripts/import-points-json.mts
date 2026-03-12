import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { PrismaBetterSqlite3 } from '@prisma/adapter-better-sqlite3';
const { PrismaClient } = await import('../generated/prisma/client.ts');

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(__dirname, '..', 'dev.db');
const adapter = new PrismaBetterSqlite3({ url: `file:${dbPath}` });
const prisma = new PrismaClient({ adapter });

const inputPath = process.argv[2];
if (!inputPath) {
  console.error('Uso: npx tsx scripts/import-points-json.mts <caminho-json>');
  process.exit(1);
}

const absoluteInput = path.resolve(inputPath);
const raw = fs.readFileSync(absoluteInput, 'utf-8');
const normalizedRaw = raw.replace(/^\uFEFF/, '');
const records = JSON.parse(normalizedRaw) as Array<Record<string, unknown>>;

function asString(value: unknown): string {
  return typeof value === 'string' ? value : '';
}

function asInt(value: unknown, fallback = 0): number {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : fallback;
}

function asNullableInt(value: unknown): number | null {
  return typeof value === 'number' && Number.isFinite(value) ? Math.round(value) : null;
}

function gcd(a: number, b: number): number {
  let x = Math.abs(a);
  let y = Math.abs(b);
  while (y !== 0) {
    const t = y;
    y = x % y;
    x = t;
  }
  return x || 1;
}

function aspectLabel(width: number, height: number): string {
  if (width <= 0 || height <= 0) return '16:9';
  const d = gcd(width, height);
  return `${Math.round(width / d)}:${Math.round(height / d)}`;
}

const now = new Date();
let inserted = 0;
let updated = 0;

for (const item of records) {
  const slug = asString(item.slug);
  if (!slug) continue;

  const data = {
    screenWidth: asInt(item.screenWidth),
    screenHeight: asInt(item.screenHeight),
    name: asString(item.name),
    slug,
    type: asString(item.type) || 'Indoors',
    city: asString(item.city),
    address: asString(item.address),
    description: asString(item.description),
    insertionType: asString(item.insertionType),
    minimumInsertions: asNullableInt(item.minimumInsertions),
    targetAudience: asString(item.targetAudience),
    audienceClassification: asString(item.audienceClassification),
    thumbnailUrl: asString(item.thumbnailUrl),
    baseMediaUrl: asString(item.baseMediaUrl),
    baseMediaType: (asString(item.baseMediaType) || 'image') as 'image' | 'video',
    baseWidth: asInt(item.baseWidth),
    baseHeight: asInt(item.baseHeight),
    screenAspect: aspectLabel(asInt(item.screenWidth), asInt(item.screenHeight)),
    fitMode: asString(item.fitMode) || 'cover',
    screenSelection: JSON.stringify(item.screenSelection ?? { mode: 'quad' }),
    renderPreset: JSON.stringify(item.renderPreset ?? {}),
    environmentType: asString(item.environmentType) || 'street',
    published: Boolean(item.published),
    updatedAt: now,
  };

  const existing = await prisma.point.findUnique({ where: { slug } });
  if (existing) {
    await prisma.point.update({
      where: { slug },
      data,
    });
    updated += 1;
  } else {
    await prisma.point.create({
      data: {
        ...data,
        createdAt: now,
      },
    });
    inserted += 1;
  }
}

console.log(`Importacao concluida. Inseridos: ${inserted}. Atualizados: ${updated}. Total processado: ${records.length}.`);
await prisma.$disconnect();
