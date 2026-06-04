import { notFound, redirect } from 'next/navigation';
import Link from 'next/link';
import { createSupabaseServerClient } from '@/lib/supabase';
import { getServiceRoleClient } from '@/lib/supabase/service-role';
import { IntegrationsManager } from './integrations-form';

export const metadata = {
  title: 'Admin — QryptChat',
  robots: { index: false, follow: false },
};

export const dynamic = 'force-dynamic';

export default async function AdminPage() {
  const supabase = await createSupabaseServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect('/auth');

  const svc = getServiceRoleClient();
  const { data: adminRow } = await svc
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  if (!adminRow) notFound();

  const [{ data: integrations }, { data: posts }] = await Promise.all([
    svc.from('autoblog_integrations')
      .select('id, name, kind, access_token, request_count, last_used_at, created_at')
      .order('created_at', { ascending: false }),
    svc.from('blog_posts')
      .select('id, slug, title, source, published_at')
      .order('published_at', { ascending: false })
      .limit(20),
  ]);

  const cardStyle = { border: '1px solid var(--color-border)', borderRadius: '0.5rem', padding: '1.25rem' };
  const mutedColor = 'var(--color-text-secondary)';

  return (
    <div className="container" style={{ padding: '3rem 0', maxWidth: '48rem', margin: '0 auto', display: 'flex', flexDirection: 'column', gap: '2rem' }}>
      <div>
        <h1 style={{ fontSize: '2rem', fontWeight: 700, margin: 0 }}>Admin</h1>
        <p style={{ marginTop: '0.25rem', fontSize: '0.875rem', color: mutedColor }}>
          Logged in as {user.phone ?? user.email}
        </p>
      </div>

      <section style={cardStyle}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.25rem' }}>Autoblog integrations</h2>
        <p style={{ fontSize: '0.875rem', color: mutedColor, marginBottom: '1.25rem' }}>
          Generate a bearer token, then paste it into{' '}
          <a href="https://crawlproof.com" style={{ textDecoration: 'underline' }}>CrawlProof</a>{' '}
          as the webhook secret. The token also doubles as the HMAC signing secret for request verification.
        </p>
        <IntegrationsManager initial={integrations ?? []} />
      </section>

      <section style={cardStyle}>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600, margin: '0 0 0.75rem' }}>Recent blog posts</h2>
        {(posts ?? []).length === 0 ? (
          <p style={{ fontSize: '0.875rem', color: mutedColor }}>No posts ingested yet.</p>
        ) : (
          <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.875rem' }}>
            <thead>
              <tr style={{ borderBottom: '1px solid var(--color-border)' }}>
                <th style={{ textAlign: 'left', padding: '0.5rem 1rem 0.5rem 0', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: mutedColor }}>Title</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 1rem 0.5rem 0', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: mutedColor }}>Source</th>
                <th style={{ textAlign: 'left', padding: '0.5rem 0', fontSize: '0.7rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: mutedColor }}>Published</th>
              </tr>
            </thead>
            <tbody>
              {(posts ?? []).map((p) => (
                <tr key={p.id} style={{ borderBottom: '1px solid var(--color-border)' }}>
                  <td style={{ padding: '0.5rem 1rem 0.5rem 0' }}>
                    <Link href={`/blog/${p.slug}`} style={{ textDecoration: 'underline' }}>{p.title}</Link>
                  </td>
                  <td style={{ padding: '0.5rem 1rem 0.5rem 0', color: mutedColor }}>{p.source}</td>
                  <td style={{ padding: '0.5rem 0', color: mutedColor }}>{p.published_at.slice(0, 10)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </section>
    </div>
  );
}
