import { redirect, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';
import { getServiceRoleClient } from '$lib/supabase/service-role.js';

export async function load(event) {
  const supabase = createSupabaseServerClient(event);
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect(302, '/auth');

  const svc = getServiceRoleClient();
  const { data: adminRow } = await svc
    .from('admin_users')
    .select('user_id')
    .eq('user_id', user.id)
    .maybeSingle();
  // 404 so non-admins get no confirmation the page exists.
  if (!adminRow) error(404, 'Not found');

  const [{ data: integrations }, { data: posts }] = await Promise.all([
    svc
      .from('autoblog_integrations')
      .select('id, name, kind, request_count, last_used_at, created_at')
      .order('created_at', { ascending: false }),
    svc
      .from('blog_posts')
      .select('id, slug, title, source, published_at')
      .order('published_at', { ascending: false })
      .limit(20),
  ]);

  return {
    email: user.email,
    integrations: integrations ?? [],
    posts: posts ?? [],
  };
}
