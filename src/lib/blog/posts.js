import { getServiceRoleClient } from '$lib/supabase/service-role.js';

/** @typedef {{ slug: string, title: string, date: string, excerpt: string, html: string|null, image_url: string|null, source: string }} Post */

const FIELDS = 'slug, title, meta_description, content_html, image_url, published_at, source';

/** @param {import('@supabase/supabase-js').PostgrestSingleResponse<any>['data']} row */
function rowToPost(row) {
  return {
    slug: row.slug,
    title: row.title,
    date: row.published_at.slice(0, 10),
    excerpt: row.meta_description ?? '',
    html: row.content_html,
    image_url: row.image_url,
    source: row.source,
  };
}

/** @returns {Promise<Post[]>} */
export async function loadAllPosts() {
  try {
    const sb = getServiceRoleClient();
    const { data, error } = await sb
      .from('blog_posts')
      .select(FIELDS)
      .order('published_at', { ascending: false })
      .limit(200);
    if (error || !data) return [];
    return data.map(rowToPost);
  } catch {
    return [];
  }
}

/**
 * @param {string} slug
 * @returns {Promise<Post|undefined>}
 */
export async function findPost(slug) {
  try {
    const sb = getServiceRoleClient();
    const { data } = await sb
      .from('blog_posts')
      .select(FIELDS)
      .eq('slug', slug)
      .maybeSingle();
    if (!data) return undefined;
    return rowToPost(data);
  } catch {
    return undefined;
  }
}
