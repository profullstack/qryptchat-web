<script>
  let { data } = $props();
  const { email, integrations, posts } = data;

  function fmt(iso) {
    if (!iso) return '—';
    return new Date(iso).toLocaleString();
  }
</script>

<svelte:head>
  <title>Admin — QryptChat</title>
  <meta name="robots" content="noindex, nofollow" />
</svelte:head>

<main class="admin">
  <h1>Admin</h1>
  <p class="who">Logged in as {email}</p>

  <section class="card">
    <h2>Autoblog integrations</h2>
    <p class="hint">
      Bearer tokens for inbound autoblog webhooks. Each token is also the HMAC
      secret for Standard Webhooks signature verification. Add tokens via direct
      database insert into <code>autoblog_integrations</code>.
    </p>
    {#if integrations.length === 0}
      <p class="empty">No integrations configured.</p>
    {:else}
      <table>
        <thead>
          <tr>
            <th>Name</th><th>Kind</th><th class="right">Requests</th><th>Last used</th>
          </tr>
        </thead>
        <tbody>
          {#each integrations as i}
            <tr>
              <td class="bold">{i.name}</td>
              <td class="muted">{i.kind}</td>
              <td class="right mono">{i.request_count}</td>
              <td class="muted">{fmt(i.last_used_at)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>

  <section class="card">
    <h2>Recent blog posts</h2>
    {#if posts.length === 0}
      <p class="empty">No posts ingested yet.</p>
    {:else}
      <table>
        <thead>
          <tr><th>Title</th><th>Source</th><th>Published</th></tr>
        </thead>
        <tbody>
          {#each posts as p}
            <tr>
              <td><a href="/blog/{p.slug}">{p.title}</a></td>
              <td class="muted">{p.source}</td>
              <td class="muted">{p.published_at.slice(0, 10)}</td>
            </tr>
          {/each}
        </tbody>
      </table>
    {/if}
  </section>
</main>

<style>
  .admin { max-width: 48rem; margin: 0 auto; padding: 3rem 1rem; display: flex; flex-direction: column; gap: 2rem; }
  h1 { font-size: 2rem; font-weight: 700; margin: 0; }
  .who { margin-top: 0.25rem; font-size: 0.875rem; color: var(--color-muted, #888); }
  .card { border: 1px solid var(--color-border, #333); border-radius: 0.5rem; padding: 1.25rem; }
  h2 { font-size: 1.125rem; font-weight: 600; margin: 0 0 0.5rem; }
  .hint { font-size: 0.875rem; color: var(--color-muted, #888); margin-bottom: 1rem; }
  .empty { font-size: 0.875rem; color: var(--color-muted, #888); }
  table { width: 100%; border-collapse: collapse; font-size: 0.875rem; }
  th { text-align: left; padding: 0.5rem 1rem 0.5rem 0; font-size: 0.7rem; text-transform: uppercase; letter-spacing: 0.05em; color: var(--color-muted, #888); border-bottom: 1px solid var(--color-border, #333); }
  td { padding: 0.5rem 1rem 0.5rem 0; border-bottom: 1px solid var(--color-border, #333); }
  .bold { font-weight: 500; }
  .muted { color: var(--color-muted, #888); }
  .right { text-align: right; }
  .mono { font-variant-numeric: tabular-nums; }
  a { text-decoration: underline; color: var(--color-accent, #6366f1); }
  code { background: var(--color-card, #1a1a2e); padding: 0.1rem 0.35rem; border-radius: 0.25rem; font-size: 0.8em; }
</style>
