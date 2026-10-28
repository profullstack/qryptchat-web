import { NextResponse } from 'next/server';
import { getClientIp, RateLimiter } from '@/lib/server/rate-limiter.js';
import { gate } from '@/lib/server/crawl-gateway.js';

const authRateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 60 * 1000 });
const webhookRateLimiter = new RateLimiter({ maxRequests: 100, windowMs: 60 * 1000 });
// The chat app alone polls conversations every few seconds and reloads after
// each send, so 60/min starved a signed-in tab: the next send's key lookup got
// 429 and showed as "no encryption keys" (2026-10-28). House rule is 5x headroom.
const apiRateLimiter = new RateLimiter({ maxRequests: 300, windowMs: 60 * 1000 });
// Typing indicators are cheap and chatty; they must never eat the API budget.
const typingRateLimiter = new RateLimiter({ maxRequests: 120, windowMs: 60 * 1000 });
const keyBackupRateLimiter = new RateLimiter({ maxRequests: 10, windowMs: 15 * 60 * 1000 });

function rateLimitedResponse() {
  return NextResponse.json(
    { error: 'Too many requests. Please try again later.' },
    { status: 429, headers: { 'Retry-After': '10' } }
  );
}

export async function proxy(request) {
  const { pathname, host } = request.nextUrl;

  // WWW redirect
  if (host && host.startsWith('www.')) {
    const url = request.nextUrl.clone();
    url.host = host.slice(4);
    return NextResponse.redirect(url, 301);
  }

  // Crawl gateway: AI training crawlers get 402 Payment Required (or the pass
  // page at /crawl) unless they present a paid pass. People, Googlebot and AI
  // chat fetchers fall through to everything below.
  const answer = await gate(request);
  if (answer) return answer;

  // Health checks (status.profullstack.com) are never rate limited.
  if (pathname === '/api/health') return NextResponse.next();

  const ip = getClientIp(request);

  // Rate limiting
  if (pathname === '/api/auth/key-backup' && request.method === 'GET') {
    const { allowed } = keyBackupRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/auth/hooks/')) {
    // Supabase Auth calls these from one address for every user's code, so the
    // per-IP auth limit would cap the whole site at 10 SMS a minute. They are
    // signature-checked; the webhook limit still bounds them.
    const { allowed } = webhookRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/auth/')) {
    const { allowed } = authRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/webhooks/') || pathname === '/api/phone/webhook' || pathname === '/api/phone/coinpay-webhook' || pathname.startsWith('/api/phone/agent-')) {
    const { allowed } = webhookRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/typing/')) {
    const { allowed } = typingRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  } else if (pathname.startsWith('/api/')) {
    const { allowed } = apiRateLimiter.check(ip);
    if (!allowed) return rateLimitedResponse();
  }

  // Pages must be revalidated on every open. Next sends prerendered pages with
  // `s-maxage=300, stale-while-revalidate=<a year>`: browsers ignore s-maxage
  // but honour the stale-while-revalidate, so an installed iOS app kept opening
  // a year-old cached page (and the old build it loads) after every deploy.
  // Hashed /_next/static files are untouched and stay cached for good.
  if (isPage(pathname)) {
    const res = NextResponse.next();
    res.headers.set('Cache-Control', 'no-cache');
    return res;
  }

  return NextResponse.next();
}

/** A page route: not an API, a Next.js asset or a file with an extension. */
export function isPage(pathname) {
  return !pathname.startsWith('/api/') && !pathname.startsWith('/_next/') && !/\.[a-z0-9]+$/i.test(pathname);
}

export const config = {
  matcher: ['/api/:path*', '/:path*'],
};
