import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { calculateAspectRatio } from '@/services/aspect_ratio_utils';

function toPointResponse(row: Record<string, unknown>) {
  return {
    ...row,
    screenSelection: JSON.parse((row.screenSelection as string) || '{}'),
    renderPreset: JSON.parse((row.renderPreset as string) || '{}'),
    createdAt: (row.createdAt as Date).toISOString(),
    updatedAt: (row.updatedAt as Date).toISOString(),
  };
}

type RouteContext = { params: Promise<{ id: string }> };

// GET /api/points/[id]
export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const row = await prisma.point.findUnique({ where: { id } });
  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(toPointResponse(row as unknown as Record<string, unknown>));
}

// PATCH /api/points/[id] — partial update
export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = await req.json();

  // Stringify JSON fields if present
  const data: Record<string, unknown> = { ...body };
  if (body.screenSelection && typeof body.screenSelection === 'object') {
    data.screenSelection = JSON.stringify(body.screenSelection);
  }
  if (body.renderPreset && typeof body.renderPreset === 'object') {
    data.renderPreset = JSON.stringify(body.renderPreset);
  }

  // Re-derive screenAspect when resolution is updated
  if (typeof data.screenWidth === 'number' && typeof data.screenHeight === 'number' && (data.screenWidth as number) > 0 && (data.screenHeight as number) > 0) {
    data.screenAspect = calculateAspectRatio(data.screenWidth as number, data.screenHeight as number).aspectLabel;
  }

  // Never allow changing id
  delete data.id;
  delete data.createdAt;

  const row = await prisma.point.update({ where: { id }, data });
  return NextResponse.json(toPointResponse(row as unknown as Record<string, unknown>));
}

// DELETE /api/points/[id]
export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  await prisma.point.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
