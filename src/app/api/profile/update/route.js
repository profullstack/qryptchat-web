import { NextResponse } from 'next/server';
import { createSupabaseServerClientWithToken } from '@/lib/supabase.js';
import { bearerToken } from '@/lib/auth/bearer.js';
import { cleanEmoji, cleanPronouns, cleanWebsite } from '@/lib/profile/fields.js';

/**
 * POST /api/profile/update  { bio?, website?, emoji?, pronouns? }
 * Updates the caller's public profile. A field left out is unchanged; an
 * empty string clears it. Emoji, Pronouns and Web are OpenProfile 0.4's
 * default fields (logicsrc.com/openprofile).
 */
export async function POST(request) {
	try {
		let body;
		try {
			body = await request.json();
		} catch {
			return NextResponse.json({ error: 'Invalid JSON body' }, { status: 400 });
		}

		const token = bearerToken(request);
		if (!token) {
			return NextResponse.json({ error: 'Missing or invalid authorization header' }, { status: 401 });
		}

		// A client that carries the token on every request, so RLS sees this user.
		// (setSession() with an empty refresh token is refused by auth-js, which
		// made every update here run anonymously and match no row.)
		const supabase = await createSupabaseServerClientWithToken(token);
		const { data: { user }, error: authError } = await supabase.auth.getUser(token);
		if (authError || !user) {
			return NextResponse.json({ error: 'Invalid or expired token' }, { status: 401 });
		}

		const { bio, website, emoji, pronouns } = body ?? {};
		const updateData = { updated_at: new Date().toISOString() };

		if (bio !== undefined) {
			if (bio !== null && typeof bio !== 'string') return NextResponse.json({ error: 'Bio must be a string' }, { status: 400 });
			if (bio && bio.length > 500) return NextResponse.json({ error: 'Bio must be 500 characters or less' }, { status: 400 });
			updateData.bio = bio?.trim() || null;
		}
		for (const [field, value, clean] of [
			['website', website, cleanWebsite],
			['emoji', emoji, cleanEmoji],
			['pronouns', pronouns, cleanPronouns]
		]) {
			if (value === undefined) continue;
			const result = clean(value);
			if ('error' in result) return NextResponse.json({ error: result.error, field }, { status: 400 });
			updateData[field] = result.value;
		}

		const { data: updatedUsers, error: updateError } = await supabase
			.from('users')
			.update(updateData)
			.eq('auth_user_id', user.id)
			.select('id, username, display_name, avatar_url, bio, website, emoji, pronouns');

		if (updateError) {
			console.error('Error updating profile:', updateError);
			return NextResponse.json({ error: 'Failed to update profile' }, { status: 500 });
		}
		if (!updatedUsers || updatedUsers.length === 0) {
			return NextResponse.json({ error: 'Profile update failed - user not found or permission denied' }, { status: 404 });
		}

		const u = updatedUsers[0];
		return NextResponse.json({
			success: true,
			user: {
				id: u.id,
				username: u.username,
				displayName: u.display_name,
				avatarUrl: u.avatar_url,
				bio: u.bio,
				website: u.website,
				emoji: u.emoji,
				pronouns: u.pronouns
			}
		});
	} catch (err) {
		console.error('Profile update error:', err);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
