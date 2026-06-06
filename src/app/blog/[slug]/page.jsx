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
          className="blog-prose"
          dangerouslySetInnerHTML={{ __html: post.html }}
        />
      ) : (
        <article className="blog-prose">
          <p>{post.excerpt}</p>
        </article>
      )}

      <style>{`
        .blog-prose {
          margin-top: 2rem;
          line-height: 1.8;
          color: var(--color-text-primary);
        }
        .blog-prose p {
          margin: 1.25rem 0;
        }
        .blog-prose h1, .blog-prose h2, .blog-prose h3, .blog-prose h4 {
          font-weight: 700;
          line-height: 1.3;
          margin: 2rem 0 0.75rem;
          color: var(--color-text-primary);
        }
        .blog-prose h1 { font-size: 1.875rem; }
        .blog-prose h2 { font-size: 1.5rem; border-bottom: 1px solid var(--color-border); padding-bottom: 0.4rem; }
        .blog-prose h3 { font-size: 1.25rem; }
        .blog-prose h4 { font-size: 1.1rem; }
        .blog-prose ul, .blog-prose ol {
          padding-left: 1.75rem;
          margin: 1.25rem 0;
        }
        .blog-prose ul { list-style: disc; }
        .blog-prose ol { list-style: decimal; }
        .blog-prose li { margin: 0.4rem 0; }
        .blog-prose li > ul, .blog-prose li > ol { margin: 0.25rem 0; }
        .blog-prose blockquote {
          border-left: 3px solid var(--color-brand-primary);
          padding: 0.5rem 0 0.5rem 1.25rem;
          margin: 1.5rem 0;
          color: var(--color-text-secondary);
          font-style: italic;
        }
        .blog-prose code {
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 0.25rem;
          padding: 0.15rem 0.4rem;
          font-size: 0.875em;
          font-family: var(--font-mono, monospace);
          color: var(--color-brand-accent);
        }
        .blog-prose pre {
          background: var(--color-bg-secondary);
          border: 1px solid var(--color-border);
          border-radius: 0.5rem;
          padding: 1.25rem;
          overflow-x: auto;
          margin: 1.5rem 0;
        }
        .blog-prose pre code {
          background: none;
          border: none;
          padding: 0;
          font-size: 0.875rem;
          color: var(--color-text-primary);
        }
        .blog-prose a {
          color: var(--color-brand-secondary);
          text-decoration: underline;
          text-underline-offset: 2px;
        }
        .blog-prose a:hover { color: var(--color-brand-primary); }
        .blog-prose img {
          max-width: 100%;
          border-radius: 0.5rem;
          margin: 1.5rem 0;
          border: 1px solid var(--color-border);
        }
        .blog-prose hr {
          border: none;
          border-top: 1px solid var(--color-border);
          margin: 2.5rem 0;
        }
        .blog-prose table {
          width: 100%;
          border-collapse: collapse;
          margin: 1.5rem 0;
          font-size: 0.9rem;
        }
        .blog-prose th, .blog-prose td {
          border: 1px solid var(--color-border);
          padding: 0.5rem 0.75rem;
          text-align: left;
        }
        .blog-prose th {
          background: var(--color-bg-secondary);
          font-weight: 600;
        }
      `}</style>
    </div>
  );
}
