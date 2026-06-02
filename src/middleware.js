import { NextResponse } from 'next/server';
import { RateLimiter } from '@/lib/server/rate-limiter.js';

const authRateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60 * 1000 });
const webhookRateLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60 * 1000 });
const apiRateLimiter = new RateLimiter({ maxRequests: 60, windowMs: 60 * 1000 });
const keyBackupRateLimiter = new RateLimiter({ maxRequests: 5, windowMs: 60 * 60 * 1000 });

function getClientIp(request) {
  return (
    request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ||
    request.headers.get('x-real-ip') ||
    'unknown'
  );
}

function rateLimitedResponse() {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429 }
  );
}

export function middleware(request) {
  const { pathname, host } = request.nextUrl;

  // WWW redirect
  if (host && host.startsWith('www.')) {
    const url = request.nextUrl.clone();
    url.host = host.slice(4);
    return NextResponse.redirect(url, 301);
  }

  const ip = getClientIp(request);

  // Rate limiting
  if (pathname === '/api/auth/key-backup' && request.method === 'GET') {
    const { allowed } = keyBackupRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/auth/')) {
    const { allowed } = authRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/webhooks/')) {
    const { allowed } = webhookRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/')) {
    const { allowed } = apiRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  }

  return NextResponse.next();
}

export const config = {
  matcher: ['/api/:path*', '/:path*'],
};
