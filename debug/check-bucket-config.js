// Debug script to check Supabase bucket configuration
import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';

// Load environment variables
dotenv.config();

async function checkBucketConfig() {
	const supabaseUrl = process.env.SUPABASE_URL;
	const supabaseServiceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

	if (!supabaseUrl || !supabaseServiceKey) {
		console.error('❌ Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY environment variables');
		process.exit(1);
	}

	const supabase = createClient(supabaseUrl, supabaseServiceKey);

	console.log('🔍 Checking encrypted-files bucket configuration...\n');

	try {
		// Query the storage.buckets table to check file_size_limit
		const { data: buckets, error } = await supabase
			.from('storage.buckets')
			.select('id, name, file_size_limit, allowed_mime_types, public')
			.eq('id', 'encrypted-files');

		if (error) {
			console.error('❌ Error querying buckets:', error);
			return;
		}

		if (!buckets || buckets.length === 0) {
			console.error('❌ encrypted-files bucket not found!');
			return;
		}

		const bucket = buckets[0];
		console.log('📊 Bucket Configuration:');
		console.log(`   ID: ${bucket.id}`);
		console.log(`   Name: ${bucket.name}`);
		console.log(`   File Size Limit: ${bucket.file_size_limit} bytes`);
		console.log(`   File Size Limit (GB): ${(bucket.file_size_limit / (1024 * 1024 * 1024)).toFixed(2)} GB`);
		console.log(`   Public: ${bucket.public}`);
		console.log(`   Allowed MIME Types: ${bucket.allowed_mime_types || 'All types allowed'}`);

		// Check if the limit is set to 2GB
		const expectedLimit = 2147483648; // 2GB in bytes
		if (bucket.file_size_limit === expectedLimit) {
			console.log('✅ File size limit is correctly set to 2GB');
		} else {
			console.log(`❌ File size limit mismatch!`);
			console.log(`   Expected: ${expectedLimit} bytes (2GB)`);
			console.log(`   Actual: ${bucket.file_size_limit} bytes`);
		}

		// Test creating a signed upload URL
		console.log('\n🔍 Testing signed upload URL creation...');
		const testPath = `test/large-file-test-${Date.now()}.mp4`;
		
		const { data: uploadData, error: uploadError } = await supabase.storage
			.from('encrypted-files')
			.createSignedUploadUrl(testPath);

		if (uploadError) {
			console.error('❌ Error creating signed upload URL:', uploadError);
		} else {
			console.log('✅ Successfully created signed upload URL');
			console.log(`   Path: ${uploadData.path}`);
			console.log(`   Token present: ${uploadData.token ? 'Yes' : 'No'}`);
		}

		// Check if there are any RLS policies that might interfere
		console.log('\n🔍 Checking storage policies...');
		const { data: policies, error: policyError } = await supabase
			.from('storage.policies')
			.select('*')
			.eq('bucket_id', 'encrypted-files');

		if (policyError) {
			console.log('⚠️  Could not check storage policies:', policyError.message);
		} else {
			console.log(`📊 Found ${policies?.length || 0} storage policies for encrypted-files bucket`);
			if (policies && policies.length > 0) {
				policies.forEach((policy, index) => {
					console.log(`   Policy ${index + 1}: ${policy.name} (${policy.command})`);
				});
			}
		}

	} catch (error) {
		console.error('❌ Unexpected error:', error);
	}
}

checkBucketConfig();