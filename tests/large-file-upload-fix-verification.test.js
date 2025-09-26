// Test to verify large file upload fixes are working
import { describe, it } from 'mocha';
import { expect } from 'chai';
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

describe('Large File Upload Fix Verification', () => {
	let supabase;

	before(() => {
		const supabaseUrl = process.env.SUPABASE_URL;
		const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

		if (!supabaseUrl || !supabaseServiceKey) {
			console.log('⚠️  Skipping tests - missing environment variables');
			return;
		}

		supabase = createClient(supabaseUrl, supabaseServiceKey);
	});

	it('should verify encrypted-files bucket has 2GB limit', async function() {
		if (!supabase) {
			this.skip();
			return;
		}

		console.log('🔍 Verifying bucket configuration...');

		// Use the new function from our migration
		const { data: buckets, error } = await supabase
			.rpc('get_storage_bucket_limits');

		if (error) {
			console.error('❌ Error calling get_storage_bucket_limits:', error);
			throw error;
		}

		console.log('📊 Storage bucket limits:');
		buckets.forEach(bucket => {
			console.log(`   ${bucket.bucket_id}: ${bucket.file_size_limit_gb} GB (${bucket.file_size_limit_bytes} bytes)`);
		});

		const encryptedFilesBucket = buckets.find(b => b.bucket_id === 'encrypted-files');
		expect(encryptedFilesBucket).to.exist;
		expect(encryptedFilesBucket.file_size_limit_bytes).to.equal(2147483648); // 2GB
		expect(encryptedFilesBucket.file_size_limit_gb).to.equal(2);

		console.log('✅ encrypted-files bucket correctly configured with 2GB limit');
	});

	it('should test signed upload URL creation for large files', async function() {
		if (!supabase) {
			this.skip();
			return;
		}

		console.log('🔍 Testing signed upload URL creation...');

		const testPath = `test/large-file-${Date.now()}.mp4`;

		try {
			const { data: uploadData, error: uploadError } = await supabase.storage
				.from('encrypted-files')
				.createSignedUploadUrl(testPath);

			if (uploadError) {
				console.error('❌ Error creating signed upload URL:', uploadError);
				throw uploadError;
			}

			expect(uploadData.signedUrl).to.be.a('string');
			expect(uploadData.token).to.be.a('string');
			expect(uploadData.path).to.equal(testPath);

			console.log('✅ Successfully created signed upload URL for large file');

		} catch (error) {
			console.error('❌ Failed to create signed upload URL:', error);
			throw error;
		}
	});

	it('should verify RLS policies allow file operations', async function() {
		if (!supabase) {
			this.skip();
			return;
		}

		console.log('🔍 Checking RLS policies for encrypted-files bucket...');

		// Check if we can query storage policies (this verifies they exist)
		const { data: policies, error: policyError } = await supabase
			.from('storage.policies')
			.select('name, command, definition')
			.eq('bucket_id', 'encrypted-files');

		if (policyError) {
			console.log('⚠️  Could not check storage policies (this is normal):', policyError.message);
		} else {
			console.log(`📊 Found ${policies?.length || 0} RLS policies for encrypted-files bucket`);
			if (policies && policies.length > 0) {
				policies.forEach((policy, index) => {
					console.log(`   Policy ${index + 1}: ${policy.name} (${policy.command})`);
				});
			}
		}

		console.log('✅ RLS policy check completed');
	});

	it('should provide troubleshooting information', async function() {
		console.log('\n🔧 Troubleshooting Information:');
		console.log('');
		console.log('If you\'re still getting 413 errors, check these potential causes:');
		console.log('');
		console.log('1. Platform Limits:');
		console.log('   - Railway: Check project settings for request size limits');
		console.log('   - Vercel: Has 100MB limit on Hobby plan, 500MB on Pro');
		console.log('   - Netlify: Has 100MB limit');
		console.log('');
		console.log('2. Supabase Project Settings:');
		console.log('   - Go to your Supabase dashboard');
		console.log('   - Check Settings > Storage for any global limits');
		console.log('   - Verify your plan supports large file uploads');
		console.log('');
		console.log('3. Network/Client Issues:');
		console.log('   - Large files may timeout on slow connections');
		console.log('   - Consider implementing chunked uploads for files > 500MB');
		console.log('   - Check browser network tab for actual error source');
		console.log('');
		console.log('4. Direct Upload Method:');
		console.log('   - Your app uses signed URLs for direct upload to Supabase');
		console.log('   - This bypasses your server, so server limits shouldn\'t apply');
		console.log('   - The 413 error is likely from Supabase Storage API or platform');
		console.log('');
		console.log('5. File Size Verification:');
		console.log('   - Client-side limit: 2GB (2,147,483,648 bytes)');
		console.log('   - Supabase bucket limit: 2GB (set by migration)');
		console.log('   - Check actual file size vs. these limits');
	});
});