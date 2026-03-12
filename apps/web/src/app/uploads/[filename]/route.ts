import { stat } from 'fs/promises';
import { createReadStream } from 'fs';
import path from 'path';
import { Readable } from 'stream';

export const runtime = 'nodejs';

const UPLOAD_DIR = path.join(process.cwd(), 'public', 'uploads');

function getContentType(fileName: string): string {
  const ext = path.extname(fileName).toLowerCase();
  if (ext === '.jpg' || ext === '.jpeg') return 'image/jpeg';
  if (ext === '.png') return 'image/png';
  if (ext === '.webp') return 'image/webp';
  if (ext === '.mp4') return 'video/mp4';
  if (ext === '.webm') return 'video/webm';
  if (ext === '.mov') return 'video/quicktime';
  return 'application/octet-stream';
}

export async function GET(
  _req: Request,
  { params }: { params: { filename: string } },
) {
  const fileName = path.basename(params.filename || '');
  if (!fileName) {
    return new Response('Not found', { status: 404 });
  }

  const filePath = path.join(UPLOAD_DIR, fileName);
  const normalizedUploadDir = path.resolve(UPLOAD_DIR) + path.sep;
  const normalizedFilePath = path.resolve(filePath);

  if (!normalizedFilePath.startsWith(normalizedUploadDir)) {
    return new Response('Invalid path', { status: 400 });
  }

  try {
    const info = await stat(normalizedFilePath);
    const stream = createReadStream(normalizedFilePath);

    return new Response(Readable.toWeb(stream) as ReadableStream, {
      status: 200,
      headers: {
        'Content-Type': getContentType(fileName),
        'Content-Length': String(info.size),
        'Cache-Control': 'public, max-age=31536000, immutable',
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET',
        'Vary': 'Origin',
      },
    });
  } catch {
    return new Response('Not found', { status: 404 });
  }
}
