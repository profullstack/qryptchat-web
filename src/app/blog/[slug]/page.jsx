import { notFound } from 'next/navigation';
import Link from 'next/link';
import { findPost } from '@/lib/blog/posts';

export const dynamic = 'force-dynamic';

export async function generateMetadata({ params }) {
  const { slug } = await params;
  const post = await findPost(slug);
  if (!post) return { title: 'Post not found' };
  return {
    title: `${post.title} — QryptChat`,
    description: post.excerpt || undefined,
    alternates: { canonical: `/blog/${slug}` },
    openGraph: {
      type: 'article',
      title: post.title,
      description: post.excerpt || undefined,
      images: post.image_url ? [{ url: post.image_url }] : undefined,
    },
  };
}

export default async function BlogPostPage({ params }) {
  const { slug } = await params;
  const post = await findPost(slug);
  if (!post) notFound();

  const siteUrl = (process.env.NEXT_PUBLIC_APP_URL ?? 'https://qrypt.chat').replace(/\/$/, '');

  return (
    <div className="container" style={{ padding: '3rem 0', maxWidth: '48rem', margin: '0 auto' }}>
      <Link href="/blog" style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', textDecoration: 'none' }}>
        ← Back to blog
      </Link>
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'BlogPosting',
            headline: post.title,
            datePublished: post.date,
            author: { '@type': 'Organization', name: 'QryptChat' },
            mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
            ...(post.image_url ? { image: [post.image_url] } : {}),
          }),
        }}
      />
      <p style={{ fontSize: '0.875rem', color: 'var(--color-text-secondary)', marginTop: '1rem' }}>{post.date}</p>
      <h1 style={{ fontSize: '2.25rem', fontWeight: 700, marginTop: '0.5rem', lineHeight: 1.2 }}>{post.title}</h1>
      {post.image_url && (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={post.image_url} alt="" style={{ width: '100%', borderRadius: '0.5rem', marginTop: '1.5rem', border: '1px solid var(--color-border)' }} />
      )}
      {post.html ? (
        <article
          style={{ marginTop: '2rem', lineHeight: 1.75 }}
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      ) : (
        <article style={{ marginTop: '2rem', lineHeight: 1.75 }}>
          <p>{post.excerpt}</p>
        </article>
      )}
    </div>
  );
}
