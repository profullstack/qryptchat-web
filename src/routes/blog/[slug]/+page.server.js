import { findPost } from '$lib/blog/posts.js';
import { error } from '@sveltejs/kit';

export async function load({ params }) {
  const post = await findPost(params.slug);
  if (!post) error(404, 'Post not found');
  return { post };
}
