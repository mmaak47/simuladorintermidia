import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { generateCampaignProposalPdf } from '@/lib/proposal-pdf';

type RouteContext = { params: Promise<{ id: string }> };

export async function GET(_req: NextRequest, ctx: RouteContext) {
  const { id } = await ctx.params;

  const campaign = await prisma.campaign.findUnique({
    where: { id },
    include: {
      simulations: {
        include: {
          point: {
            select: {
              name: true,
              city: true,
              type: true,
            },
          },
        },
        orderBy: { createdAt: 'asc' },
      },
    },
  });

  if (!campaign) {
    return NextResponse.json({ error: 'Campaign not found' }, { status: 404 });
  }

  const totals = {
    points: campaign.simulations.length,
    rendered: campaign.simulations.filter((s) => s.status === 'rendered' || s.status === 'exported').length,
    exported: campaign.simulations.filter((s) => s.status === 'exported').length,
  };

  const pdf = generateCampaignProposalPdf({
    campaign: {
      id: campaign.id,
      name: campaign.name,
      client: campaign.client,
      description: campaign.description,
      status: campaign.status,
      createdAtIso: campaign.createdAt.toISOString(),
    },
    totals,
    items: campaign.simulations.map((s) => ({
      pointName: s.point.name,
      city: s.point.city,
      type: s.point.type,
      status: s.status,
      renderType: s.renderType,
      renderUrl: s.renderUrl,
    })),
  });

  const safeName = [
    'Proposta Intermidia',
    campaign.name,
    campaign.client,
  ]
    .filter((part) => part && part.trim())
    .join(' - ')
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[<>:"/\\|?*]/g, '')
    .replace(/\s+/g, ' ')
    .trim();

  return new NextResponse(Buffer.from(pdf), {
    status: 200,
    headers: {
      'Content-Type': 'application/pdf',
      'Content-Disposition': `attachment; filename="${safeName || 'Proposta Intermidia'}.pdf"`,
      'Cache-Control': 'no-store',
    },
  });
}
