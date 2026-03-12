import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export async function GET() {
  const rows = await prisma.campaign.findMany({
    orderBy: { createdAt: 'desc' },
    include: {
      simulations: {
        select: {
          id: true,
          status: true,
          createdAt: true,
        },
      },
    },
  });

  const payload = rows.map((row) => {
    const rendered = row.simulations.filter((s) => s.status === 'rendered' || s.status === 'exported').length;
    const latest = row.simulations.length > 0
      ? row.simulations.reduce((acc, cur) => (cur.createdAt > acc ? cur.createdAt : acc), row.simulations[0].createdAt)
      : null;

    return {
      id: row.id,
      name: row.name,
      client: row.client,
      description: row.description,
      creativeUrl: row.creativeUrl,
      creativeType: row.creativeType,
      creativeWidth: row.creativeWidth,
      creativeHeight: row.creativeHeight,
      status: row.status,
      pointsCount: row.simulations.length,
      renderedCount: rendered,
      lastRenderAt: latest?.toISOString() ?? null,
      createdAt: row.createdAt.toISOString(),
      updatedAt: row.updatedAt.toISOString(),
    };
  });

  return NextResponse.json(payload);
}

export async function POST(req: NextRequest) {
  const body = await req.json();
  const name = typeof body.name === 'string' ? body.name.trim() : '';

  if (!name) {
    return NextResponse.json({ error: 'name is required' }, { status: 400 });
  }

  const campaign = await prisma.campaign.create({
    data: {
      name,
      client: typeof body.client === 'string' ? body.client.trim() : '',
      description: typeof body.description === 'string' ? body.description.trim() : '',
      creativeUrl: typeof body.creativeUrl === 'string' ? body.creativeUrl.trim() : '',
      creativeType: body.creativeType === 'video' ? 'video' : 'image',
      creativeWidth: typeof body.creativeWidth === 'number' ? body.creativeWidth : 0,
      creativeHeight: typeof body.creativeHeight === 'number' ? body.creativeHeight : 0,
      status: typeof body.status === 'string' ? body.status : 'draft',
    },
  });

  return NextResponse.json({
    ...campaign,
    createdAt: campaign.createdAt.toISOString(),
    updatedAt: campaign.updatedAt.toISOString(),
  }, { status: 201 });
}
