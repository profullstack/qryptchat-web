import Link from 'next/link';
import { loadAllPosts } from '@/lib/blog/posts';

export const metadata = {
  title: 'Blog — QryptChat',
  description: 'Encrypted messaging, privacy, and security from the QryptChat team.',
  alternates: { canonical: '/blog', types: { 'application/rss+xml': '/blog/rss.xml' } },
};

export const revalidate = 60;

export default async function BlogPage() {
  const posts = await loadAllPosts();

  return (
    <div className="container" style={{ padding: '3rem 0', maxWidth: '48rem', margin: '0 auto' }}>
      <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Blog</h1>
      <p style={{ marginTop: '0.5rem', color: 'var(--color-text-secondary)' }}>
        Encrypted messaging, privacy, and security.
      </p>

      {posts.length === 0 ? (
        <p style={{ marginTop: '2.5rem', color: 'var(--color-text-secondary)' }}>
          No posts yet — check back soon.
        </p>
      ) : (
        <ul style={{ listStyle: 'none', padding: 0, marginTop: '2.5rem', display: 'flex', flexDirection: 'column', gap: '1.25rem' }}>
          {posts.map((p) => (
            <li key={p.slug} style={{ border: '1px solid var(--color-border)', borderRadius: '0.5rem', overflow: 'hidden' }}>
              <Link href={`/blog/${p.slug}`} style={{ display: 'flex', gap: '1rem', padding: '1rem', textDecoration: 'none', color: 'inherit' }}>
                {p.image_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={p.image_url} alt="" loading="lazy" width={80} height={80}
                    style={{ width: '5rem', height: '5rem', objectFit: 'cover', borderRadius: '0.375rem', flexShrink: 0 }} />
                ) : (
                  <div style={{ width: '5rem', height: '5rem', borderRadius: '0.375rem', flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'center', background: 'var(--color-bg-secondary)', fontSize: '0.75rem', fontWeight: 700, color: 'var(--color-accent)' }}>
                    QC
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: 0, lineHeight: 1.3 }}>{p.title}</h2>
                  <p style={{ fontSize: '0.75rem', color: 'var(--color-text-secondary)', marginTop: '0.25rem' }}>{p.date}</p>
                  {p.excerpt && (
                    <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '0.5rem', overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
                      {p.excerpt}
                    </p>
                  )}
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
