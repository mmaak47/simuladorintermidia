import { NextRequest, NextResponse } from 'next/server';

const VISION_BASE = process.env.NEXT_PUBLIC_VISION_API_URL ?? 'http://localhost:8000';

export async function POST(req: NextRequest) {
  const incoming = await req.formData();
  const file = incoming.get('file');

  if (!(file instanceof File)) {
    return NextResponse.json({ error: 'file is required' }, { status: 400 });
  }

  const forward = new FormData();
  forward.append('file', file);

  const res = await fetch(`${VISION_BASE}/api/vision/attention-heatmap`, {
    method: 'POST',
    body: forward,
  });

  const text = await res.text();
  let data: unknown = null;
  try {
    data = JSON.parse(text);
  } catch {
    data = { raw: text };
  }

  if (!res.ok) {
    return NextResponse.json({ error: 'Vision request failed', details: data }, { status: res.status });
  }

  return NextResponse.json(data);
}
