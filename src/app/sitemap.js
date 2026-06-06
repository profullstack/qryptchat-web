import { loadAllPosts } from '@/lib/blog/posts';

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'https://qrypt.chat').replace(/\/$/, '');

export default async function sitemap() {
  const staticRoutes = [
    { url: `${BASE}/`, priority: 1.0, changeFrequency: 'weekly' },
    { url: `${BASE}/blog`, priority: 0.9, changeFrequency: 'daily' },
    { url: `${BASE}/about`, priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE}/security`, priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE}/plugins`, priority: 0.7, changeFrequency: 'weekly' },
    { url: `${BASE}/premium`, priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE}/contact`, priority: 0.6, changeFrequency: 'monthly' },
    { url: `${BASE}/privacy`, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${BASE}/terms`, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${BASE}/warrant-canary`, priority: 0.4, changeFrequency: 'monthly' },
  ];

  let postRoutes = [];
  try {
    const posts = await loadAllPosts();
    postRoutes = posts.map((p) => ({
      url: `${BASE}/blog/${p.slug}`,
      lastModified: p.date ? new Date(p.date) : undefined,
      changeFrequency: 'weekly',
      priority: 0.7,
    }));
  } catch {
    // return static routes only if blog fetch fails
  }

  return [...staticRoutes, ...postRoutes];
}
