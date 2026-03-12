import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAspectRatio } from '@/services/aspect_ratio_utils';

/** Convert DB row (JSON strings) → PointPreset-compatible shape */
function toPointResponse(row: Record<string, unknown>) {
  return {
    ...row,
    screenSelection: JSON.parse((row.screenSelection as string) || '{}'),
    renderPreset: JSON.parse((row.renderPreset as string) || '{}'),
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

// GET /api/points — list all points (optional ?published=true)
export async function GET(req: NextRequest) {
  const published = req.nextUrl.searchParams.get('published');
  const where = published === 'true' ? { published: true } : {};
  const rows = await prisma.point.findMany({ where, orderBy: { createdAt: 'asc' } });
  return NextResponse.json(rows.map((r) => toPointResponse(r as unknown as Record<string, unknown>)));
}

// POST /api/points — create a new point
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name, slug, type, screenWidth = 0, screenHeight = 0, screenAspect,
    city, address, description,
    insertionType, minimumInsertions, targetAudience, audienceClassification,
    thumbnailUrl, baseMediaUrl, baseMediaType, baseWidth, baseHeight,
    fitMode, screenSelection, renderPreset, environmentType, published,
  } = body;

  if (!name || !slug || !type) {
    return NextResponse.json({ error: 'name, slug, and type are required' }, { status: 400 });
  }

  // Derive screenAspect from resolution if not explicitly provided
  const derivedAspect = screenAspect || (screenWidth > 0 && screenHeight > 0
    ? calculateAspectRatio(screenWidth, screenHeight).aspectLabel
    : '16:9');

  const row = await prisma.point.create({
    data: {
      name,
      slug,
      type,
      screenWidth: screenWidth || 0,
      screenHeight: screenHeight || 0,
      screenAspect: derivedAspect,
      city: city || '',
      address: address || '',
      description: description || '',
      insertionType: insertionType || '',
      minimumInsertions: minimumInsertions ?? null,
      targetAudience: targetAudience || '',
      audienceClassification: audienceClassification || '',
      thumbnailUrl: thumbnailUrl || '',
      baseMediaUrl: baseMediaUrl || '',
      baseMediaType: baseMediaType || 'image',
      baseWidth: baseWidth || 0,
      baseHeight: baseHeight || 0,
      fitMode: fitMode || 'cover',
      screenSelection: screenSelection ? JSON.stringify(screenSelection) : '{}',
      renderPreset: renderPreset ? JSON.stringify(renderPreset) : '{}',
      environmentType: environmentType || 'street',
      published: published ?? false,
    },
  });

  return NextResponse.json(toPointResponse(row as unknown as Record<string, unknown>), { status: 201 });
}
