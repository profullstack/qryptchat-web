const BASE_URL = process.env.NEXT_PUBLIC_BASE_URL ?? 'https://qrypt.chat';

export default function sitemap() {
  const now = new Date().toISOString();

  const staticRoutes = [
    { url: `${BASE_URL}/`, priority: 1.0, changeFrequency: 'weekly' },
    { url: `${BASE_URL}/about`, priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/blog`, priority: 0.8, changeFrequency: 'weekly' },
    { url: `${BASE_URL}/contact`, priority: 0.6, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/privacy`, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/terms`, priority: 0.5, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/security`, priority: 0.7, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/plugins`, priority: 0.7, changeFrequency: 'weekly' },
    { url: `${BASE_URL}/premium`, priority: 0.8, changeFrequency: 'monthly' },
    { url: `${BASE_URL}/warrant-canary`, priority: 0.4, changeFrequency: 'monthly' },
  ];

  return staticRoutes.map((r) => ({
    url: r.url,
    lastModified: now,
    changeFrequency: r.changeFrequency,
    priority: r.priority,
  }));
}
