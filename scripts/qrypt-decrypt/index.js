#!/usr/bin/env node

/**
 * QryptChat Key Decryption CLI Tool
 * Decrypts exported QryptChat encryption keys
 */

import { readFileSync } from 'fs';
import { webcrypto } from 'crypto';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import passwordPrompt from '@inquirer/password';

// Get package.json for version info
const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const packageJson = JSON.parse(readFileSync(join(__dirname, 'package.json'), 'utf8'));
const VERSION = packageJson.version;

const { subtle } = webcrypto;

// Base64 utilities
const Base64 = {
	encode: (bytes) => Buffer.from(bytes).toString('base64'),
	decode: (str) => new Uint8Array(Buffer.from(str, 'base64'))
};

/**
 * Derive key from password using HKDF
 */
async function deriveKeyFromPassword(password, salt, info, keyLength) {
	const encoder = new TextEncoder();
	const passwordKey = await subtle.importKey(
		'raw',
		encoder.encode(password),
		{ name: 'HKDF' },
		false,
		['deriveKey']
	);
	
	const derivedKey = await subtle.deriveKey(
		{
			name: 'HKDF',
			hash: 'SHA-256',
			salt: salt,
			info: encoder.encode(`QryptChat-v1-${info}`) // Must match web interface exactly
		},
		passwordKey,
		{ name: 'AES-GCM', length: 256 },
		true,
		['decrypt']
	);
	
	return new Uint8Array(await subtle.exportKey('raw', derivedKey));
}

/**
 * Decrypt QryptChat keys
 */
async function decryptKeys(exportedData, password) {
	const data = JSON.parse(exportedData);
	
	// Validate format
	if (!data.version || !data.encryptedKeys || !data.salt || !data.iv) {
		throw new Error('Invalid export format: missing required fields');
	}
	
	if (data.version !== '2.0') {
		throw new Error(`Unsupported version: ${data.version}. Only version 2.0 is supported.`);
	}
	
	if (data.algorithm !== 'AES-GCM-256') {
		throw new Error(`Unsupported algorithm: ${data.algorithm}. Only AES-GCM-256 is supported.`);
	}
	
	// Decode components
	const encryptedKeys = Base64.decode(data.encryptedKeys);
	const salt = Base64.decode(data.salt);
	const iv = Base64.decode(data.iv);
	
	// Derive key from password (must match web interface exactly)
	const keyBytes = await deriveKeyFromPassword(password, salt, 'PostQuantumKeyExport', 32);
	
	// Import key for decryption
	const cryptoKey = await subtle.importKey(
		'raw',
		keyBytes,
		{ name: 'AES-GCM', length: 256 },
		false,
		['decrypt']
	);
	
	// Decrypt
	const decryptedBuffer = await subtle.decrypt(
		{ name: 'AES-GCM', iv: iv },
		cryptoKey,
		encryptedKeys
	);
	
	// Convert to string and parse
	const decryptedJson = new TextDecoder().decode(decryptedBuffer);
	return JSON.parse(decryptedJson);
}

/**
 * Main CLI function
 */
async function main() {
	const args = process.argv.slice(2);
	
	// Handle CLI flags
	if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
		console.log(`🔐 QryptChat Key Decryption Tool v${VERSION}`);
		console.log('');
		console.log('Usage: qrypt-decrypt <key-file.json>');
		console.log('');
		console.log('Options:');
		console.log('  --version, -v    Show version number');
		console.log('  --help, -h       Show this help message');
		console.log('');
		console.log('Example:');
		console.log('  qrypt-decrypt qryptchat-pq-keys-2025-01-20T12-30-45-123Z.json');
		process.exit(0);
	}
	
	if (args.includes('--version') || args.includes('-v')) {
		console.log(`v${VERSION}`);
		process.exit(0);
	}
	
	const filename = args[0];
	if (!filename) {
		console.error('❌ Error: No file specified');
		console.log('');
		console.log('Usage: qrypt-decrypt <key-file.json>');
		console.log('Use --help for more information');
		process.exit(1);
	}
	
	console.log(`🔐 QryptChat Key Decryption Tool v${VERSION}`);
	console.log('');
	
	try {
		// Check if file exists
		const fileContent = readFileSync(filename, 'utf8');
		// Get password from user with proper masking
		const password = await passwordPrompt({
			message: '🔑 Enter password:'
		});
		
		console.log('🔓 Decrypting keys...');
		
		// Decrypt the keys with better error handling
		const keys = await decryptKeys(fileContent, password);
		
		console.log('');
		console.log('✅ Keys decrypted successfully!');
		console.log('');
		console.log('📊 Key Information:');
		console.log(`   Version: ${keys.version}`);
		console.log(`   Exported: ${new Date(keys.timestamp).toISOString()}`);
		
		if (keys.keys1024) {
			console.log('');
			console.log('🔐 ML-KEM-1024 Keys:');
			console.log(`   Algorithm: ${keys.keys1024.algorithm}`);
			console.log(`   Public Key: ${keys.keys1024.publicKey.substring(0, 50)}...`);
			console.log(`   Private Key: [PROTECTED - ${keys.keys1024.privateKey.length} characters]`);
		}
		
		if (keys.keys768) {
			console.log('');
			console.log('🔐 ML-KEM-768 Keys:');
			console.log(`   Algorithm: ${keys.keys768.algorithm}`);
			console.log(`   Public Key: ${keys.keys768.publicKey.substring(0, 50)}...`);
			console.log(`   Private Key: [PROTECTED - ${keys.keys768.privateKey.length} characters]`);
		}
		
		console.log('');
		console.log('⚠️  Keep your private keys secure and never share them!');
		console.log('');
		
	} catch (error) {
		console.log('');
		if (error.code === 'ENOENT') {
			console.error(`❌ File not found: ${filename}`);
		} else if (error.message.includes('Invalid password') || error.message.includes('operation failed')) {
			console.error('❌ Invalid password or corrupted data');
			console.error('   Make sure you entered the correct password used during export');
		} else if (error.message.includes('Invalid export format')) {
			console.error('❌ Invalid file format. Make sure this is a QryptChat key export file.');
		} else if (error.message.includes('Unsupported version')) {
			console.error('❌ Unsupported file version. Please export your keys again with the latest version.');
		} else {
			console.error(`❌ Error: ${error.message}`);
			console.error('   Debug info: This might be a password or file format issue');
		}
		console.log('');
		process.exit(1);
	}
}

main().catch((error) => {
	console.error(`❌ Unexpected error: ${error.message}`);
	process.exit(1);
});