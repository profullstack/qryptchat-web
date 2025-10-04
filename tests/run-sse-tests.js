/**
 * @fileoverview Test Runner for SSE + POST Migration Tests
 * Runs all tests related to the WebSocket to SSE migration
 */

import Mocha from 'mocha';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Create Mocha instance
const mocha = new Mocha({
	ui: 'bdd',
	reporter: 'spec',
	timeout: 10000,
	color: true
});

// Add test files
const testFiles = [
	'sse-manager.test.js',
	'chat-store.test.js',
	'sse-api-integration.test.js'
];

console.log('🧪 Running SSE + POST Migration Tests...\n');

testFiles.forEach(file => {
	const testPath = join(__dirname, file);
	console.log(`📝 Adding test file: ${file}`);
	mocha.addFile(testPath);
});

console.log('\n🚀 Starting test execution...\n');

// Run tests
mocha.run(failures => {
	console.log('\n' + '='.repeat(50));
	if (failures) {
		console.log(`❌ ${failures} test(s) failed`);
		process.exitCode = 1;
	} else {
		console.log('✅ All tests passed!');
	}
	console.log('='.repeat(50) + '\n');
});