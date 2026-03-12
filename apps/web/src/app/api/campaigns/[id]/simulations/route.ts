import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const rows = await prisma.campaignSimulation.findMany({
    where: { campaignId: id },
    include: {
      point: {
        select: {
          id: true,
          name: true,
          city: true,
          slug: true,
          type: true,
          minimumInsertions: true,
          insertionType: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    campaignId: r.campaignId,
    pointId: r.pointId,
    point: r.point,
    renderUrl: r.renderUrl,
    renderType: r.renderType,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  })));
}

export async function POST(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = (await req.json()) as { pointIds?: unknown };
  const rawPointIds = Array.isArray(body.pointIds) ? body.pointIds : [];
  const pointIds = rawPointIds.filter((p: unknown): p is string => typeof p === 'string');

  if (pointIds.length === 0) {
    return NextResponse.json({ error: 'pointIds is required' }, { status: 400 });
  }

  const campaign = await prisma.campaign.findUnique({ where: { id }, select: { id: true } });
  if (!campaign) return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });

  const existing = await prisma.campaignSimulation.findMany({
    where: { campaignId: id, pointId: { in: pointIds } },
    select: { pointId: true },
  });

  const existingSet = new Set(existing.map((e) => e.pointId));
  const toCreate = pointIds.filter((pointId: string) => !existingSet.has(pointId));

  if (toCreate.length > 0) {
    await prisma.campaignSimulation.createMany({
      data: toCreate.map((pointId: string) => ({
        campaignId: id,
        pointId,
        status: 'pending',
        renderType: 'image',
        renderUrl: '',
      })),
    });
  }

  const rows = await prisma.campaignSimulation.findMany({
    where: { campaignId: id },
    include: {
      point: {
        select: {
          id: true,
          name: true,
          city: true,
          slug: true,
          type: true,
        },
      },
    },
    orderBy: { createdAt: 'asc' },
  });

  return NextResponse.json(rows.map((r) => ({
    id: r.id,
    campaignId: r.campaignId,
    pointId: r.pointId,
    point: r.point,
    renderUrl: r.renderUrl,
    renderType: r.renderType,
    status: r.status,
    createdAt: r.createdAt.toISOString(),
  })), { status: 201 });
}
