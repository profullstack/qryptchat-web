// Debug endpoint for file upload testing
import { json, error } from '@sveltejs/kit';
import { createSupabaseServerClient } from '$lib/supabase.js';

export async function POST(event) {
	try {
		console.log('📁 [DEBUG-UPLOAD] Starting debug upload test...');
		
		// Test 1: Supabase client creation
		const supabase = createSupabaseServerClient(event);
		console.log('📁 [DEBUG-UPLOAD] ✅ Supabase client created');
		
		// Test 2: Authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			console.error('📁 [DEBUG-UPLOAD] ❌ Auth failed:', authError);
			return error(401, 'Unauthorized');
		}
		console.log(`📁 [DEBUG-UPLOAD] ✅ User authenticated: ${user.id}`);
		
		// Test 3: Form data parsing
		const formData = await event.request.formData();
		const file = formData.get('file');
		const conversationId = formData.get('conversationId');
		const messageId = formData.get('messageId');
		
		console.log('📁 [DEBUG-UPLOAD] ✅ Form data parsed:', {
			fileExists: !!file,
			fileName: file?.name,
			fileSize: file?.size,
			conversationId,
			messageId
		});
		
		// Test 4: File validation
		if (!file || !(file instanceof File)) {
			console.error('📁 [DEBUG-UPLOAD] ❌ Invalid file');
			return error(400, 'No file provided');
		}
		
		if (!conversationId || !messageId) {
			console.error('📁 [DEBUG-UPLOAD] ❌ Missing IDs');
			return error(400, 'Missing conversationId or messageId');
		}
		
		// Test 5: Database access
		try {
			const { data: participant, error: participantError } = await supabase
				.from('conversation_participants')
				.select('user_id')
				.eq('conversation_id', conversationId)
				.eq('user_id', user.id)
				.single();
				
			if (participantError || !participant) {
				console.error('📁 [DEBUG-UPLOAD] ❌ Participant check failed:', participantError);
				return error(403, 'Not authorized for conversation');
			}
			console.log('📁 [DEBUG-UPLOAD] ✅ Participant validation passed');
		} catch (dbError) {
			console.error('📁 [DEBUG-UPLOAD] ❌ Database error:', dbError);
			return error(500, 'Database access failed');
		}
		
		// Test 6: Storage bucket access
		try {
			const testPath = `debug-test/${user.id}/${Date.now()}.txt`;
			const { data: uploadData, error: uploadError } = await supabase.storage
				.from('encrypted-files')
				.upload(testPath, 'test content', {
					contentType: 'text/plain'
				});
			
			if (uploadError) {
				console.error('📁 [DEBUG-UPLOAD] ❌ Storage upload failed:', uploadError);
				return error(500, `Storage upload failed: ${uploadError.message}`);
			}
			
			// Clean up test file
			await supabase.storage.from('encrypted-files').remove([testPath]);
			console.log('📁 [DEBUG-UPLOAD] ✅ Storage test passed');
		} catch (storageError) {
			console.error('📁 [DEBUG-UPLOAD] ❌ Storage error:', storageError);
			return error(500, 'Storage access failed');
		}
		
		console.log('📁 [DEBUG-UPLOAD] ✅ All tests passed!');
		
		return json({
			success: true,
			message: 'Debug upload test completed successfully',
			details: {
				userId: user.id,
				fileName: file.name,
				fileSize: file.size,
				conversationId,
				messageId
			}
		});
		
	} catch (err) {
		console.error('📁 [DEBUG-UPLOAD] ❌ Unexpected error:', err);
		return error(500, `Debug test failed: ${err.message}`);
	}
}