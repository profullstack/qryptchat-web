// Test to debug file upload size limits and verify Supabase configuration
import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

describe('File Upload Size Limit Debug', () => {
	let supabase;

	before(() => {
		const supabaseUrl = process.env.SUPABASE_URL;
		const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

		if (!supabaseUrl || !supabaseServiceKey) {
			throw new Error('Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
		}

		supabase = createClient(supabaseUrl, supabaseServiceKey);
	});

	it('should check encrypted-files bucket configuration', async () => {
		console.log('🔍 Checking encrypted-files bucket configuration...');

		// Query the storage.buckets table to check file_size_limit
		const { data: buckets, error } = await supabase
			.from('storage.buckets')
			.select('id, name, file_size_limit, allowed_mime_types')
			.eq('id', 'encrypted-files');

		if (error) {
			console.error('❌ Error querying buckets:', error);
			throw error;
		}

		console.log('📊 Bucket configuration:', buckets);

		expect(buckets).to.have.length(1);
		const bucket = buckets[0];
		
		console.log(`📏 Current file_size_limit: ${bucket.file_size_limit} bytes`);
		console.log(`📏 Expected file_size_limit: 2147483648 bytes (2GB)`);

		// Check if the limit is set to 2GB
		expect(bucket.file_size_limit).to.equal(2147483648);
	});

	it('should check if there are any global storage limits', async () => {
		console.log('🔍 Checking for global storage configuration...');

		// Check storage.objects table for any size constraints
		const { data: objects, error } = await supabase
			.from('storage.objects')
			.select('bucket_id, metadata')
			.eq('bucket_id', 'encrypted-files')
			.limit(5);

		if (error) {
			console.error('❌ Error querying objects:', error);
		} else {
			console.log('📊 Sample objects in encrypted-files bucket:', objects?.length || 0);
		}
	});

	it('should test creating a signed upload URL for a large file', async () => {
		console.log('🔍 Testing signed upload URL creation for large file...');

		const testFileName = `test-large-file-${Date.now()}.mp4`;
		const testPath = `test/${testFileName}`;

		try {
			// Try to create a signed upload URL
			const { data: uploadData, error: uploadError } = await supabase.storage
				.from('encrypted-files')
				.createSignedUploadUrl(testPath);

			if (uploadError) {
				console.error('❌ Error creating signed upload URL:', uploadError);
				throw uploadError;
			}

			console.log('✅ Successfully created signed upload URL');
			console.log('📊 Upload URL data:', {
				signedUrl: uploadData.signedUrl ? 'Present' : 'Missing',
				token: uploadData.token ? 'Present' : 'Missing',
				path: uploadData.path
			});

			expect(uploadData.signedUrl).to.be.a('string');
			expect(uploadData.token).to.be.a('string');

		} catch (error) {
			console.error('❌ Failed to create signed upload URL:', error);
			throw error;
		}
	});

	it('should check SvelteKit body parser limits', async () => {
		console.log('🔍 Checking SvelteKit configuration...');

		// This is informational - SvelteKit doesn't have explicit body size limits by default
		// The issue might be at the platform level (Railway, Vercel, etc.)
		console.log('ℹ️  SvelteKit uses Node.js http module which has no default body size limit');
		console.log('ℹ️  The 413 error is likely coming from:');
		console.log('   1. Supabase Storage API limits');
		console.log('   2. Platform-specific limits (Railway, Vercel, etc.)');
		console.log('   3. Reverse proxy limits (nginx, etc.)');
		console.log('   4. Client-side timeout or network issues');
	});
});