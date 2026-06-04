<script>
  let { data } = $props();
  const { post } = data;

  const siteUrl = (import.meta.env.PUBLIC_APP_URL ?? 'https://qrypt.chat').replace(/\/$/, '');
  const jsonLd = JSON.stringify({
    '@context': 'https://schema.org',
    '@type': 'BlogPosting',
    headline: post.title,
    datePublished: post.date,
    author: { '@type': 'Organization', name: 'QryptChat' },
    mainEntityOfPage: `${siteUrl}/blog/${post.slug}`,
    ...(post.image_url ? { image: [post.image_url] } : {}),
  });
</script>

<svelte:head>
  <title>{post.title} — QryptChat</title>
  {#if post.excerpt}<meta name="description" content={post.excerpt} />{/if}
  <link rel="canonical" href="{siteUrl}/blog/{post.slug}" />
  <!-- eslint-disable-next-line svelte/no-at-html-tags -->
  {@html `<script type="application/ld+json">${jsonLd}</script>`}
</svelte:head>

<main class="blog-post">
  <a href="/blog" class="back-link">← Back to blog</a>
  <p class="post-date">{post.date}</p>
  <h1>{post.title}</h1>
  {#if post.image_url}
    <img src={post.image_url} alt="" class="hero-image" />
  {/if}
  {#if post.html}
    <article class="prose">
      <!-- eslint-disable-next-line svelte/no-at-html-tags -->
      {@html post.html}
    </article>
  {:else}
    <article class="prose">
      <p>{post.excerpt}</p>
    </article>
  {/if}
</main>

<style>
  .blog-post {
    max-width: 48rem;
    margin: 0 auto;
    padding: 3rem 1rem;
  }
  .back-link { font-size: 0.875rem; color: var(--color-muted, #888); text-decoration: none; }
  .back-link:hover { color: var(--color-accent, #6366f1); }
  .post-date { font-size: 0.875rem; color: var(--color-muted, #888); margin: 1rem 0 0; }
  h1 { font-size: 2.25rem; font-weight: 700; margin: 0.5rem 0 0; line-height: 1.2; }
  .hero-image { width: 100%; border-radius: 0.5rem; margin-top: 1.5rem; border: 1px solid var(--color-border, #333); }
  .prose { margin-top: 2rem; line-height: 1.75; }
  .prose :global(h2) { font-size: 1.5rem; font-weight: 700; margin-top: 2rem; }
  .prose :global(h3) { font-size: 1.25rem; font-weight: 600; margin-top: 1.5rem; }
  .prose :global(p) { margin-top: 1rem; }
  .prose :global(ul), .prose :global(ol) { margin-top: 1rem; padding-left: 1.5rem; }
  .prose :global(li) { margin-top: 0.25rem; }
  .prose :global(a) { text-decoration: underline; color: var(--color-accent, #6366f1); }
  .prose :global(pre) { margin-top: 1rem; padding: 0.75rem; border-radius: 0.375rem; overflow-x: auto; background: var(--color-card, #1a1a2e); border: 1px solid var(--color-border, #333); }
  .prose :global(code) { background: var(--color-card, #1a1a2e); padding: 0.125rem 0.375rem; border-radius: 0.25rem; font-size: 0.875em; }
  .prose :global(blockquote) { border-left: 4px solid var(--color-border, #333); padding-left: 1rem; margin-top: 1rem; font-style: italic; color: var(--color-muted, #888); }
  .prose :global(img) { width: 100%; border-radius: 0.5rem; margin-top: 1.5rem; }
</style>
