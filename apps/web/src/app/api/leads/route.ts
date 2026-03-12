import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

const ALLOWED_STATUS = new Set(['new', 'contacted', 'proposal_sent', 'closed']);

// POST /api/leads — capture lead from simulator flow
export async function POST(req: NextRequest) {
  const body = await req.json();
  const {
    name,
    company,
    email,
    whatsapp,
    pointName,
    pointsSimulated,
    creativeUploaded,
    videoRequest,
    imageExport,
    source,
    sessionId,
    status,
  } = body;

  if (!name || !whatsapp) {
    return NextResponse.json({ error: 'name and whatsapp are required' }, { status: 400 });
  }

  const nextStatus = typeof status === 'string' && ALLOWED_STATUS.has(status) ? status : 'new';

  const lead = await prisma.lead.create({
    data: {
      name: String(name).trim(),
      company: typeof company === 'string' ? company.trim() : '',
      email: typeof email === 'string' ? email.trim() : '',
      whatsapp: String(whatsapp).trim(),
      pointName: typeof pointName === 'string' ? pointName.trim() : '',
      pointsSimulated: Number.isFinite(pointsSimulated) ? Math.max(0, Number(pointsSimulated)) : 0,
      creativeUploaded: Boolean(creativeUploaded),
      videoRequest: Boolean(videoRequest),
      imageExport: Boolean(imageExport),
      source: typeof source === 'string' ? source : 'unknown',
      sessionId: typeof sessionId === 'string' ? sessionId : '',
      status: nextStatus,
    },
  });

  return NextResponse.json(lead, { status: 201 });
}

// GET /api/leads — list leads (admin)
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const search = searchParams.get('search')?.trim() ?? '';
  const status = searchParams.get('status')?.trim() ?? '';

  const leads = await prisma.lead.findMany({
    where: {
      ...(status && ALLOWED_STATUS.has(status) ? { status } : {}),
      ...(search
        ? {
            OR: [
              { name: { contains: search } },
              { company: { contains: search } },
              { email: { contains: search } },
              { whatsapp: { contains: search } },
              { pointName: { contains: search } },
            ],
          }
        : {}),
    },
    orderBy: { dateCreated: 'desc' },
  });

  return NextResponse.json(leads);
}
