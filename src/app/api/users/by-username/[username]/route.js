import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';

export async function GET(request, { params } = {}) {
  try {
    const { username } = (await params) || {};
    const normalizedUsername = username?.trim().toLowerCase();
    if (!normalizedUsername) {
      return NextResponse.json({ error: 'Username required' }, { status: 400 });
    }

    // Public profile page (/u/[username]) is viewable while logged out, so this
    // read cannot rely on the caller's session. RLS on `users` is restricted to
    // the `authenticated` role, so use the service role and keep the explicit
    // column list below as the boundary — never widen it to `*`, and never add
    // phone_number / salt. (backup_pin_hash no longer lives on `users`; PIN
    // material moved to the service-role-only user_backup_pins table.)
    const supabase = getServiceRoleClient();

    const { data, error } = await supabase
      .from('users')
      .select('id, username, display_name, avatar_url, bio, unique_identifier')
      .eq('username', normalizedUsername)
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
