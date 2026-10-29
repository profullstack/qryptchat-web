import { NextResponse } from 'next/server';
import { getServiceRoleClient } from '@/lib/supabase/service-role.js';
import { loadPublicProfile } from '@/lib/profile/fields.js';

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
    // column list (PUBLIC_PROFILE_COLUMNS, in loadPublicProfile) as the boundary — never widen it to `*`, and never add
    // phone_number / salt. (backup_pin_hash no longer lives on `users`; PIN
    // material moved to the service-role-only user_backup_pins table.)
    const supabase = getServiceRoleClient();

    const profile = await loadPublicProfile(supabase, normalizedUsername);
    if (!profile) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // operator: the owner of an agent; agents: the agents a person owns.
    return NextResponse.json(profile);
  } catch (err) {
    console.error('[by-username] error:', err);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
