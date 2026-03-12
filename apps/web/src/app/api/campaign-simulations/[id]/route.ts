import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.renderUrl === 'string') data.renderUrl = body.renderUrl.trim();
  if (body.renderType === 'image' || body.renderType === 'video') data.renderType = body.renderType;
  if (typeof body.status === 'string') data.status = body.status;

  const row = await prisma.campaignSimulation.update({ where: { id }, data });

  return NextResponse.json({
    id: row.id,
    campaignId: row.campaignId,
    pointId: row.pointId,
    renderUrl: row.renderUrl,
    renderType: row.renderType,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  await prisma.campaignSimulation.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
