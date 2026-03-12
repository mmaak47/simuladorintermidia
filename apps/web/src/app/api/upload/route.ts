import { NextRequest, NextResponse } from 'next/server';
import { writeFile, mkdir, unlink } from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

function getLocalUploadPath(rawUrl: string): string | null {
  try {
    const parsed = new URL(rawUrl, 'http://localhost');
    if (!parsed.pathname.startsWith('/uploads/')) return null;

    const fileName = path.basename(parsed.pathname);
    if (!fileName) return null;

    const filePath = path.join(UPLOAD_DIR, fileName);
    const normalizedUploadDir = path.resolve(UPLOAD_DIR) + path.sep;
    const normalizedFilePath = path.resolve(filePath);

    if (!normalizedFilePath.startsWith(normalizedUploadDir)) return null;
    return normalizedFilePath;
  } catch {
    return null;
  }
}

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get('file') as File | null;

  if (!file) {
    return NextResponse.json({ error: 'No file provided' }, { status: 400 });
  }

  // Validate file type
  const allowedTypes = [
    'image/jpeg', 'image/png', 'image/webp',
    'video/mp4', 'video/webm', 'video/quicktime',
  ];
  if (!allowedTypes.includes(file.type)) {
    return NextResponse.json({ error: 'Invalid file type' }, { status: 400 });
  }

  // Validate file size (100MB max)
  const MAX_SIZE = 100 * 1024 * 1024;
  if (file.size > MAX_SIZE) {
    return NextResponse.json({ error: 'File too large' }, { status: 400 });
  }

  await mkdir(UPLOAD_DIR, { recursive: true });

  const ext = path.extname(file.name) || (file.type.startsWith('video/') ? '.mp4' : '.jpg');
  const safeName = `${crypto.randomUUID()}${ext}`;
  const filePath = path.join(UPLOAD_DIR, safeName);

  const bytes = await file.arrayBuffer();
  await writeFile(filePath, Buffer.from(bytes));

  return NextResponse.json({
    url: `/uploads/${safeName}`,
    type: file.type.startsWith('video/') ? 'video' : 'image',
    name: file.name,
  });
}

export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => null) as { url?: string } | null;
  if (!body?.url) {
    return NextResponse.json({ error: 'url is required' }, { status: 400 });
  }

  const filePath = getLocalUploadPath(body.url);
  if (!filePath) {
    return NextResponse.json({ error: 'invalid upload url' }, { status: 400 });
  }

  try {
    await unlink(filePath);
    return NextResponse.json({ ok: true });
  } catch {
    return NextResponse.json({ ok: true });
  }
}
