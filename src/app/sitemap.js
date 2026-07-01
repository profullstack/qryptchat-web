import { loadAllPosts } from '@/lib/blog/posts';

const BASE = (process.env.NEXT_PUBLIC_APP_URL ?? process.env.NEXT_PUBLIC_BASE_URL ?? 'https://qrypt.chat').replace(/\/$/, '');

export default async function sitemap() {
  const lastModified = new Date();
  const staticRoutes = [
    { url: `${BASE}/`, priority: 1.0, changeFrequency: 'weekly', lastModified },
    { url: `${BASE}/blog`, priority: 0.9, changeFrequency: 'daily', lastModified },
    { url: `${BASE}/about`, priority: 0.8, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/security`, priority: 0.7, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/faq`, priority: 0.8, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/encryption-test`, priority: 0.6, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/plugins`, priority: 0.7, changeFrequency: 'weekly', lastModified },
    { url: `${BASE}/premium`, priority: 0.8, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/contact`, priority: 0.6, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/privacy`, priority: 0.5, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/terms`, priority: 0.5, changeFrequency: 'monthly', lastModified },
    { url: `${BASE}/warrant-canary`, priority: 0.4, changeFrequency: 'monthly', lastModified },
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
