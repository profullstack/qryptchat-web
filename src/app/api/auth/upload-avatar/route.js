import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

const supabaseAuth = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY);

function getBearerToken(authHeader) {
	if (typeof authHeader !== 'string') return null;

	const match = authHeader.match(/^Bearer\s+(.+)$/i);
	const token = match?.[1]?.trim();

	return token || null;
}

async function authenticateBearerToken(request) {
	const authHeader = request.headers.get('authorization');
	const token = getBearerToken(authHeader);

	if (!token) {
		return { error: 'Authentication required' };
	}

	const { data: { user }, error } = await supabaseAuth.auth.getUser(token);

	if (error || !user?.id) {
		return { error: 'Invalid authentication token' };
	}

	return { user };
}

export async function POST(request) {
	try {
		const { user, error: authError } = await authenticateBearerToken(request);
		if (authError || !user) {
			return NextResponse.json({ error: authError }, { status: 401 });
		}

		// Create service role client for database operations
		const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

		const formData = await request.formData();
		const file = formData.get('avatar');

		if (!file || !(file instanceof File)) {
			return NextResponse.json({ error: 'No file provided' }, { status: 400 });
		}

		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		if (!allowedTypes.includes(file.type)) {
			return NextResponse.json({ 
				error: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images only.' 
			}, { status: 400 });
		}

		// Validate file size (5MB limit)
		if (file.size > 5 * 1024 * 1024) {
			return NextResponse.json({ 
				error: 'File size too large. Please upload files smaller than 5MB.' 
			}, { status: 400 });
		}

		// Generate unique filename
		const fileExt = file.name.split('.').pop();
		const fileName = `${user.id}/${Date.now()}.${fileExt}`;

		// Convert file to buffer for upload
		const fileBuffer = await file.arrayBuffer();

		// Upload to Supabase Storage
		const { error: uploadError } = await supabase.storage
			.from('avatars')
			.upload(fileName, fileBuffer, {
				contentType: file.type,
				cacheControl: '3600',
				upsert: false
			});

		if (uploadError) {
			console.error('Storage upload error:', uploadError);
			return NextResponse.json({ error: 'Failed to upload file' }, { status: 500 });
		}

		// Get public URL
		const { data: { publicUrl } } = supabase.storage
			.from('avatars')
			.getPublicUrl(fileName);

		// Update user's avatar_url in database using authenticated client
		const { error: updateError } = await supabase
			.from('users')
			.update({ avatar_url: publicUrl })
			.eq('auth_user_id', user.id);

		if (updateError) {
			console.error('Database update error:', updateError);
			// Try to clean up uploaded file
			await supabase.storage.from('avatars').remove([fileName]);
			return NextResponse.json({ error: 'Failed to update user profile' }, { status: 500 });
		}

		return NextResponse.json({ 
			success: true, 
			avatarUrl: publicUrl,
			message: 'Avatar uploaded successfully'
		});

	} catch (error) {
		console.error('Avatar upload error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE(request) {
	try {
		const { user, error: authError } = await authenticateBearerToken(request);
		if (authError || !user) {
			return NextResponse.json({ error: authError }, { status: 401 });
		}

		// Create service role client for storage and database operations
		const supabase = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SERVICE_ROLE_KEY);

		// Update user's avatar_url to null in database using authenticated client
		const { error: updateError } = await supabase
			.from('users')
			.update({ avatar_url: null })
			.eq('auth_user_id', user.id);

		if (updateError) {
			console.error('Database update error:', updateError);
			return NextResponse.json({ error: 'Failed to remove avatar' }, { status: 500 });
		}

		// Note: We're not deleting the file from storage to avoid issues with caching
		// The file will remain in storage but won't be referenced by the user

		return NextResponse.json({ 
			success: true,
			message: 'Avatar removed successfully'
		});

	} catch (error) {
		console.error('Avatar removal error:', error);
		return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
	}
}
