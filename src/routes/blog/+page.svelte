<script>
  let { data } = $props();
  const { posts } = data;
</script>

<svelte:head>
  <title>Blog — QryptChat</title>
  <meta name="description" content="Encrypted messaging, privacy, and security — from the QryptChat team." />
  <link rel="alternate" type="application/rss+xml" title="QryptChat Blog" href="/blog/rss.xml" />
</svelte:head>

<main class="blog-index">
  <h1>Blog</h1>
  <p class="subtitle">Encrypted messaging, privacy, and security.</p>

  {#if posts.length === 0}
    <p class="empty">No posts yet — check back soon.</p>
  {:else}
    <ul class="post-list">
      {#each posts as post}
        <li class="post-card">
          <a href="/blog/{post.slug}" class="post-link">
            {#if post.image_url}
              <img src={post.image_url} alt="" loading="lazy" class="post-thumb" />
            {:else}
              <div class="post-thumb-placeholder" aria-hidden="true">QC</div>
            {/if}
            <div class="post-meta">
              <h2 class="post-title">{post.title}</h2>
              <p class="post-date">{post.date}</p>
              {#if post.excerpt}
                <p class="post-excerpt">{post.excerpt}</p>
              {/if}
            </div>
          </a>
        </li>
      {/each}
    </ul>
  {/if}
</main>

<style>
  .blog-index {
    max-width: 48rem;
    margin: 0 auto;
    padding: 3rem 1rem;
  }
  h1 { font-size: 2rem; font-weight: 700; margin: 0; }
  .subtitle { margin-top: 0.5rem; color: var(--color-muted, #888); }
  .empty { margin-top: 2.5rem; color: var(--color-muted, #888); }
  .post-list { list-style: none; padding: 0; margin: 2.5rem 0 0; display: flex; flex-direction: column; gap: 1.25rem; }
  .post-card { border: 1px solid var(--color-border, #333); border-radius: 0.5rem; overflow: hidden; }
  .post-link {
    display: flex;
    gap: 1rem;
    padding: 1rem;
    text-decoration: none;
    color: inherit;
    transition: background 0.15s;
  }
  .post-link:hover { background: rgba(255,255,255,0.04); }
  .post-thumb {
    width: 5rem;
    height: 5rem;
    object-fit: cover;
    border-radius: 0.375rem;
    flex-shrink: 0;
  }
  .post-thumb-placeholder {
    width: 5rem;
    height: 5rem;
    border-radius: 0.375rem;
    flex-shrink: 0;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-card, #1a1a2e);
    font-size: 0.75rem;
    font-weight: 700;
    color: var(--color-accent, #6366f1);
    letter-spacing: 0.05em;
  }
  .post-meta { flex: 1; min-width: 0; }
  .post-title { font-size: 1.125rem; font-weight: 600; margin: 0; line-height: 1.3; }
  .post-date { font-size: 0.75rem; color: var(--color-muted, #888); margin: 0.25rem 0 0; }
  .post-excerpt { font-size: 0.875rem; color: var(--color-muted, #888); margin: 0.5rem 0 0; overflow: hidden; display: -webkit-box; -webkit-line-clamp: 2; -webkit-box-orient: vertical; }
</style>
