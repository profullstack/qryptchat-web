// Debug endpoint for file upload testing
import { NextResponse } from 'next/server';
import { createSupabaseServerClient } from '@/lib/supabase.js';

export async function POST(request, { params } = {}) {
	try {
		console.log('📁 [DEBUG-UPLOAD] Starting debug upload test...');
		
		// Test 1: Supabase client creation
		const supabase = await createSupabaseServerClient();
		console.log('📁 [DEBUG-UPLOAD] ✅ Supabase client created');
		
		// Test 2: Authentication
		const { data: { user }, error: authError } = await supabase.auth.getUser();
		if (authError || !user) {
			console.error( '📁 [DEBUG-UPLOAD] ❌ Auth failed:', authError);
			return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
		}
		console.log(`📁 [DEBUG-UPLOAD] ✅ User authenticated: ${user.id}`);
		
		// Test 3: Form data parsing
		const formData = await request.formData();
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
			console.error( '📁 [DEBUG-UPLOAD] ❌ Invalid file');
			return NextResponse.json({ error: 'No file provided' }, { status: 400 });
		}
		
		if (!conversationId || !messageId) {
			console.error( '📁 [DEBUG-UPLOAD] ❌ Missing IDs');
			return NextResponse.json({ error: 'Missing conversationId or messageId' }, { status: 400 });
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
				console.error( '📁 [DEBUG-UPLOAD] ❌ Participant check failed:', participantError);
				return NextResponse.json({ error: 'Not authorized for conversation' }, { status: 403 });
			}
			console.log('📁 [DEBUG-UPLOAD] ✅ Participant validation passed');
		} catch (dbError) {
			console.error( '📁 [DEBUG-UPLOAD] ❌ Database error:', dbError);
			return NextResponse.json({ error: 'Database access failed' }, { status: 500 });
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
				console.error( '📁 [DEBUG-UPLOAD] ❌ Storage upload failed:', uploadError);
				return NextResponse.json({ error: `Storage upload failed: ${uploadError.message}` }, { status: 500 });
			}
			
			// Clean up test file
			await supabase.storage.from('encrypted-files').remove([testPath]);
			console.log('📁 [DEBUG-UPLOAD] ✅ Storage test passed');
		} catch (storageError) {
			console.error( '📁 [DEBUG-UPLOAD] ❌ Storage error:', storageError);
			return NextResponse.json({ error: 'Storage access failed' }, { status: 500 });
		}
		
		console.log('📁 [DEBUG-UPLOAD] ✅ All tests passed!');
		
		return NextResponse.json({
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
		console.error( '📁 [DEBUG-UPLOAD] ❌ Unexpected error:', err);
		return NextResponse.json({ error: `Debug test failed: ${err.message}` }, { status: 500 });
	}
}