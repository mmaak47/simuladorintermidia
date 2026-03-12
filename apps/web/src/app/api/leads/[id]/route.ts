import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ALLOWED_STATUS = new Set(['new', 'contacted', 'proposal_sent', 'closed']);

// PATCH /api/leads/[id] — update lead status in admin panel
export async function PATCH(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> },
) {
  const { id } = await params;
  const body = await req.json();
  const status = typeof body?.status === 'string' ? body.status : '';

  if (!ALLOWED_STATUS.has(status)) {
    return NextResponse.json({ error: 'invalid status' }, { status: 400 });
  }

  const updated = await prisma.lead.update({
    where: { id },
    data: { status },
  });

  return NextResponse.json(updated);
}
