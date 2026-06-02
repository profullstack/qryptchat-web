import { createSupabaseServerClient, createSupabaseServerClientWithToken } from '@/lib/supabase.js';
import { NextResponse } from 'next/server';

export async function authenticateRequest(request) {
  try {
    // Check Authorization header first (Bearer token), then fall back to cookies
    const authHeader = request.headers.get('authorization');
    const token = authHeader?.startsWith('Bearer ') ? authHeader.slice(7) : null;

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

    return handler(request, context, auth);
  };
}
