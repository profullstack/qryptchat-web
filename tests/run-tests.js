/**
 * @fileoverview Test runner for WebSocket and Supabase Bridge tests using Vitest
 * Simple test runner to verify the new bridge functionality doesn't break existing code
 */

import { spawn } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

/**
 * Run tests with proper error handling
 */
async function runTests() {
	console.log('🧪 Running WebSocket and Supabase Bridge Tests with Vitest...\n');

	try {
		const result = await runAllTests();
		
		console.log('📊 Test Summary:');
		if (result.success) {
			console.log('✅ All tests passed! The bridge integration is working correctly.');
			console.log('🔒 Your existing WebSocket functionality is preserved.');
			console.log('🔗 Supabase Realtime Bridge is ready for cross-device sync.');
		} else {
			console.log('❌ Some tests failed. Please review the errors above.');
			process.exit(1);
		}
	} catch (error) {
		console.error('❌ Test runner error:', error.message);
		process.exit(1);
	}
}

/**
 * Run all tests using Vitest
 * @returns {Promise<{success: boolean, error?: string}>}
 */
function runAllTests() {
	return new Promise((resolve) => {
		console.log('📋 Running all tests with Vitest...');
		
		// Use vitest to run all tests in the tests directory
		const vitest = spawn('npx', ['vitest', 'run', '--dir', 'tests'], {
			stdio: 'pipe',
			cwd: join(__dirname, '..')
		});

		let output = '';
		let errorOutput = '';

		vitest.stdout.on('data', (data) => {
			const text = data.toString();
			output += text;
			process.stdout.write(text); // Show output in real-time
		});

		vitest.stderr.on('data', (data) => {
			const text = data.toString();
			errorOutput += text;
			process.stderr.write(text); // Show errors in real-time
		});

		vitest.on('close', (code) => {
			console.log(''); // Add newline after test output
			
			if (code === 0) {
				resolve({ success: true });
			} else {
				resolve({ 
					success: false, 
					error: errorOutput || output || `Process exited with code ${code}`
				});
			}
		});

		vitest.on('error', (error) => {
			resolve({ 
				success: false, 
				error: error.message 
			});
		});
	});
}

/**
 * Check if required dependencies are available
 */
function checkDependencies() {
	const requiredDeps = ['vitest'];
	
	console.log('🔍 Checking test dependencies...');
	
	for (const dep of requiredDeps) {
		try {
			require.resolve(dep);
			console.log(`✅ ${dep} - available`);
		} catch (error) {
			console.log(`❌ ${dep} - missing`);
			console.log(`Please install with: pnpm add --save-dev ${dep}`);
			process.exit(1);
		}
	}
	
	console.log('');
}

// Main execution
if (import.meta.url === `file://${process.argv[1]}`) {
	checkDependencies();
	runTests().catch(error => {
		console.error('Test runner error:', error);
		process.exit(1);
	});
}

export { runTests, runAllTests };