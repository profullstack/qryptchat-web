import { loadAllPosts } from '$lib/blog/posts.js';

export async function load() {
  const posts = await loadAllPosts();
  return { posts };
}
