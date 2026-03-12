import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';

/**
 * Hide admin routes from public/network access.
 * Admin is only served from localhost on the host machine.
 */
export function middleware(request: NextRequest) {
  const host = (request.headers.get('host') ?? '').split(':')[0].toLowerCase();
  const isLocalhost = host === 'localhost' || host === '127.0.0.1' || host === '::1';

  if (!isLocalhost) {
    const url = request.nextUrl.clone();
    url.pathname = '/simulator';
    url.search = '';
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/admin/:path*'],
};
