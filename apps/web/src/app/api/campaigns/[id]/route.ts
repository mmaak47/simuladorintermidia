import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const row = await prisma.campaign.findUnique({
    where: { id },
    include: {
      simulations: {
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
      },
    },
  });

  if (!row) return NextResponse.json({ error: 'Not found' }, { status: 404 });

  return NextResponse.json({
    id: row.id,
    name: row.name,
    client: row.client,
    description: row.description,
    creativeUrl: row.creativeUrl,
    creativeType: row.creativeType,
    creativeWidth: row.creativeWidth,
    creativeHeight: row.creativeHeight,
    status: row.status,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    simulations: row.simulations.map((s) => ({
      id: s.id,
      campaignId: s.campaignId,
      pointId: s.pointId,
      point: s.point,
      renderUrl: s.renderUrl,
      renderType: s.renderType,
      status: s.status,
      createdAt: s.createdAt.toISOString(),
    })),
  });
}

export async function PATCH(req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  const body = await req.json();

  const data: Record<string, unknown> = {};
  if (typeof body.name === 'string') data.name = body.name.trim();
  if (typeof body.client === 'string') data.client = body.client.trim();
  if (typeof body.description === 'string') data.description = body.description.trim();
  if (typeof body.creativeUrl === 'string') data.creativeUrl = body.creativeUrl.trim();
  if (body.creativeType === 'image' || body.creativeType === 'video') data.creativeType = body.creativeType;
  if (typeof body.creativeWidth === 'number') data.creativeWidth = body.creativeWidth;
  if (typeof body.creativeHeight === 'number') data.creativeHeight = body.creativeHeight;
  if (typeof body.status === 'string') data.status = body.status;

  const row = await prisma.campaign.update({ where: { id }, data });
  return NextResponse.json({
    ...row,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  });
}

export async function DELETE(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;
  await prisma.campaign.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
