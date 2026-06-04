// Autoblog webhook receiver for QryptChat blog.
// Bearer token in Authorization header doubles as the HMAC secret.

import { NextResponse } from 'next/server';
import { timingSafeEqual } from 'node:crypto';
import { verifyAndParse } from '@profullstack/autoblog';
import { gatePost } from '@profullstack/autoblog/quality';
import { getServiceRoleClient } from '@/lib/supabase/service-role';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function tokensMatch(a, b) {
  const ab = Buffer.from(a);
  const bb = Buffer.from(b);
  if (ab.length !== bb.length) return false;
  return timingSafeEqual(ab, bb);
}

function stripAnchorLinks(html) {
  return html.replace(
    /<a\b[^>]*\bhref\s*=\s*(?:"#[^"]*"|'#[^']*'|#[^\s>]+)[^>]*>([\s\S]*?)<\/a>/gi,
    '$1',
  );
}

export async function POST(req) {
  const body = await req.text();
  const bearer = (req.headers.get('authorization') ?? '').replace(/^Bearer\s+/i, '').trim();
  if (!bearer) return NextResponse.json({ error: 'Missing access token' }, { status: 401 });

  const svc = getServiceRoleClient();

  const { data: integrations, error: lookupErr } = await svc
    .from('autoblog_integrations')
    .select('id, access_token, allowed_niches, min_word_count, banned_terms, min_quality_score');
  if (lookupErr) return NextResponse.json({ error: 'Lookup failed' }, { status: 500 });

  const integration = (integrations ?? []).find((row) => tokensMatch(row.access_token, bearer));
  if (!integration) return NextResponse.json({ error: 'Invalid access token' }, { status: 401 });

  const headers = {};
  req.headers.forEach((v, k) => { headers[k] = v; });

  const parsed = verifyAndParse({ headers, body, opts: { secret: integration.access_token } });
  if (!parsed.ok) return NextResponse.json({ error: parsed.reason }, { status: parsed.status });

  const gate = await gatePost(
    { ...parsed.post, html: stripAnchorLinks(parsed.post.html) },
    {
      allowedNiches: integration.allowed_niches ?? [],
      heuristics: {
        minWordCount: integration.min_word_count ?? 500,
        maxLinkDensity: Number.POSITIVE_INFINITY,
        bannedTerms: integration.banned_terms ?? [],
      },
      minQualityScore: integration.min_quality_score ?? undefined,
      anthropicApiKey: process.env.ANTHROPIC_API_KEY ?? undefined,
    },
  );
  if (!gate.ok) {
    return NextResponse.json(
      { error: `gate ${gate.stage} reject`, reasons: gate.reasons },
      { status: gate.stage === 'niche' ? 403 : 422 },
    );
  }

  const { post } = parsed;
  const { error: upsertErr } = await svc.from('blog_posts').upsert(
    [{
      source: 'crawlproof',
      source_id: post.id,
      slug: post.slug,
      title: post.title,
      content_markdown: post.markdown ?? null,
      content_html: post.html,
      meta_description: post.excerpt ?? null,
      image_url: post.featured_image?.url ?? null,
      tags: post.tags,
      source_created_at: post.published_at,
      published_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    }],
    { onConflict: 'source,source_id' },
  );
  if (upsertErr) {
    console.error('[autoblog webhook] upsert failed:', upsertErr.message);
    return NextResponse.json({ error: 'Failed to persist article' }, { status: 500 });
  }

  try {
    await svc.rpc('bump_autoblog_integration', { integration_id: integration.id });
  } catch { /* best-effort counter */ }

  return NextResponse.json({ message: 'ok', slug: post.slug });
}
