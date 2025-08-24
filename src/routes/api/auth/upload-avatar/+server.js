import { json } from '@sveltejs/kit';
import { createClient } from '@supabase/supabase-js';
import { PUBLIC_SUPABASE_URL } from '$env/static/public';
import { PUBLIC_SUPABASE_ANON_KEY } from '$env/static/public';
import { SUPABASE_SERVICE_ROLE_KEY } from '$env/static/private';

export async function POST({ request }) {
	try {
		// Get the authorization header
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const token = authHeader.replace('Bearer ', '');

		// Decode JWT token to get user ID (simple validation)
		let user;
		try {
			// JWT tokens have 3 parts separated by dots: header.payload.signature
			const tokenParts = token.split('.');
			if (tokenParts.length !== 3) {
				throw new Error('Invalid token format');
			}
			
			// Decode the payload (second part)
			const payload = JSON.parse(atob(tokenParts[1]));
			
			// Check if token is expired
			if (payload.exp && payload.exp < Date.now() / 1000) {
				throw new Error('Token expired');
			}
			
			// Extract user info from payload
			user = {
				id: payload.sub,
				email: payload.email
			};
			
			if (!user.id) {
				throw new Error('Invalid token payload');
			}
		} catch (error) {
			console.error('Token validation error:', error);
			return json({ error: 'Invalid authentication token' }, { status: 401 });
		}

		// Create service role client for database operations
		const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		const formData = await request.formData();
		const file = formData.get('avatar');

		if (!file || !(file instanceof File)) {
			return json({ error: 'No file provided' }, { status: 400 });
		}

		// Validate file type
		const allowedTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
		if (!allowedTypes.includes(file.type)) {
			return json({ 
				error: 'Invalid file type. Please upload JPEG, PNG, WebP, or GIF images only.' 
			}, { status: 400 });
		}

		// Validate file size (5MB limit)
		if (file.size > 5 * 1024 * 1024) {
			return json({ 
				error: 'File size too large. Please upload files smaller than 5MB.' 
			}, { status: 400 });
		}

		// Generate unique filename
		const fileExt = file.name.split('.').pop();
		const fileName = `${user.id}/${Date.now()}.${fileExt}`;

		// Convert file to buffer for upload
		const fileBuffer = await file.arrayBuffer();

		// Upload to Supabase Storage
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('avatars')
			.upload(fileName, fileBuffer, {
				contentType: file.type,
				cacheControl: '3600',
				upsert: false
			});

		if (uploadError) {
			console.error('Storage upload error:', uploadError);
			return json({ error: 'Failed to upload file' }, { status: 500 });
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
			return json({ error: 'Failed to update user profile' }, { status: 500 });
		}

		return json({ 
			success: true, 
			avatarUrl: publicUrl,
			message: 'Avatar uploaded successfully'
		});

	} catch (error) {
		console.error('Avatar upload error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}

export async function DELETE({ request }) {
	try {
		// Get the authorization header
		const authHeader = request.headers.get('authorization');
		if (!authHeader || !authHeader.startsWith('Bearer ')) {
			return json({ error: 'Authentication required' }, { status: 401 });
		}

		const token = authHeader.replace('Bearer ', '');

		// Decode JWT token to get user ID (simple validation)
		let user;
		try {
			// JWT tokens have 3 parts separated by dots: header.payload.signature
			const tokenParts = token.split('.');
			if (tokenParts.length !== 3) {
				throw new Error('Invalid token format');
			}
			
			// Decode the payload (second part)
			const payload = JSON.parse(atob(tokenParts[1]));
			
			// Check if token is expired
			if (payload.exp && payload.exp < Date.now() / 1000) {
				throw new Error('Token expired');
			}
			
			// Extract user info from payload
			user = {
				id: payload.sub,
				email: payload.email
			};
			
			if (!user.id) {
				throw new Error('Invalid token payload');
			}
		} catch (error) {
			console.error('Token validation error:', error);
			return json({ error: 'Invalid authentication token' }, { status: 401 });
		}

		// Create service role client for storage and database operations
		const supabase = createClient(PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

		// Update user's avatar_url to null in database using authenticated client
		const { error: updateError } = await supabase
			.from('users')
			.update({ avatar_url: null })
			.eq('auth_user_id', user.id);

		if (updateError) {
			console.error('Database update error:', updateError);
			return json({ error: 'Failed to remove avatar' }, { status: 500 });
		}

		// Note: We're not deleting the file from storage to avoid issues with caching
		// The file will remain in storage but won't be referenced by the user

		return json({ 
			success: true,
			message: 'Avatar removed successfully'
		});

	} catch (error) {
		console.error('Avatar removal error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
}