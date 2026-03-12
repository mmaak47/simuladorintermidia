import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  const rendered = await prisma.campaignSimulation.findMany({
    where: {
      OR: [
        { status: 'rendered' },
        { status: 'exported' },
        { renderUrl: { not: '' } },
      ],
    },
    include: {
      campaign: {
        select: {
          id: true,
          name: true,
          client: true,
          status: true,
        },
      },
      point: {
        select: {
          id: true,
          name: true,
          city: true,
          slug: true,
        },
      },
    },
    orderBy: { createdAt: 'desc' },
  });

  const grouped = new Map<string, {
    campaign: { id: string; name: string; client: string; status: string };
    items: Array<{
      id: string;
      pointId: string;
      pointName: string;
      city: string;
      renderUrl: string;
      renderType: string;
      status: string;
      createdAt: string;
    }>;
  }>();

  for (const row of rendered) {
    if (!grouped.has(row.campaignId)) {
      grouped.set(row.campaignId, {
        campaign: row.campaign,
        items: [],
      });
    }

    grouped.get(row.campaignId)!.items.push({
      id: row.id,
      pointId: row.pointId,
      pointName: row.point.name,
      city: row.point.city,
      renderUrl: row.renderUrl,
      renderType: row.renderType,
      status: row.status,
      createdAt: row.createdAt.toISOString(),
    });
  }

  return NextResponse.json(Array.from(grouped.values()));
}
