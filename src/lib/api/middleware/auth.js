import { createSupabaseServerClient, createSupabaseServerClientWithToken } from '@/lib/supabase.js';
import { NextResponse } from 'next/server';

export function getBearerToken(authHeader) {
  if (typeof authHeader !== 'string') return null;

  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  const token = match?.[1]?.trim();

  return token || null;
}

export async function authenticateRequest(request) {
  try {
    // Check Authorization header first (Bearer token), then fall back to cookies
    const authHeader = request.headers.get('authorization');
    const token = getBearerToken(authHeader);

    const supabase = token
      ? await createSupabaseServerClientWithToken(token)
      : await createSupabaseServerClient();

    const { data: { user }, error } = await supabase.auth.getUser();

    if (error || !user) {
      return { success: false, error: 'Unauthorized' };
    }

    return { success: true, user, supabase };
  } catch (error) {
    console.error('[AUTH] Authentication error:', error);
    return { success: false, error: 'Authentication failed' };
  }
}

export function withAuth(handler) {
  return async (request, context) => {
    const auth = await authenticateRequest(request);

    if (!auth.success) {
      return NextResponse.json({ error: auth.error }, { status: 401 });
    }

    // Handlers are written as ({ request, locals }) => ... (SvelteKit-style event object).
    // Pass a single event object so destructuring works correctly.
    return handler({
      request,
      locals: { supabase: auth.supabase, user: auth.user },
      context,
    });
  };
}
