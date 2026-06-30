import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';

export async function GET(request, { params } = {}) {
  try {
    const { username } = (await params) || {};
    if (!username) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    const supabase = await createSupabaseServerClient();

    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, bio, unique_identifier')
      .eq('username', username.toLowerCase())
      .single();

    if (error || !data) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    return NextResponse.json({ user: data });
  } catch (err) {
    console.error('[by-username] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
