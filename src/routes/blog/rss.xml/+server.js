import { buildRssXml } from '@profullstack/autoblog/feeds';
import { loadAllPosts } from '$lib/blog/posts.js';

export async function GET() {
  const posts = await loadAllPosts();
  const siteUrl = (process.env.PUBLIC_APP_URL ?? 'https://qrypt.chat').replace(/\/$/, '');

  const xml = buildRssXml({
    title: 'QryptChat Blog',
    description: 'Encrypted messaging, privacy, and security from the QryptChat team.',
    siteUrl,
    posts: posts.map((p) => ({
      slug: p.slug,
      title: p.title,
      publishedAt: p.date,
      excerpt: p.excerpt,
      html: p.html ?? null,
      imageUrl: p.image_url ?? null,
    })),
  });

  return new Response(xml, {
    headers: {
      'content-type': 'application/rss+xml; charset=utf-8',
      'cache-control': 'public, max-age=60, s-maxage=60',
    },
  });
}
