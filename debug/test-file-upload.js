// Debug script to test file upload functionality
import { fileEncryption } from '../src/lib/crypto/file-encryption.js';

async function testFileEncryption() {
  try {
    console.log('🧪 Testing file encryption...');
    
    // Initialize encryption
    await fileEncryption.initialize();
    console.log('✅ File encryption initialized');
    
    // Create test file
    const testContent = new Uint8Array(Buffer.from('Hello, this is a test file for debugging!', 'utf8'));
    const filename = 'test-debug.txt';
    const mimeType = 'text/plain';
    const conversationId = 'test-conversation-123';
    
    console.log(`📄 Test file: ${filename} (${testContent.length} bytes)`);
    
    // Test file validation
    console.log(`🔍 File type allowed: ${fileEncryption.isAllowedFileType(filename)}`);
    console.log(`🔍 File size valid: ${fileEncryption.isValidFileSize(testContent.length)}`);
    
    // Encrypt file
    console.log('🔐 Encrypting file...');
    const result = await fileEncryption.encryptFile(
      conversationId,
      testContent,
      filename,
      mimeType
    );
    
    console.log('✅ File encrypted successfully');
    console.log(`📊 Encrypted data type: ${typeof result.encryptedData}`);
    console.log(`📊 Encrypted data length: ${result.encryptedData.length}`);
    console.log(`📊 Metadata:`, result.metadata);
    
    // Test decryption
    console.log('🔓 Testing decryption...');
    const decrypted = await fileEncryption.decryptFile(
      conversationId,
      result.encryptedData,
      result.metadata
    );
    
    console.log('✅ File decrypted successfully');
    console.log(`📊 Decrypted content matches: ${Buffer.from(decrypted.fileContent).toString() === 'Hello, this is a test file for debugging!'}`);
    
    return result;
    
  } catch (error) {
    console.error('❌ Error in file encryption test:', error);
    throw error;
  }
}

// Run the test
testFileEncryption()
  .then((result) => {
    console.log('🎉 File encryption test completed successfully');
    process.exit(0);
  })
  .catch((error) => {
    console.error('💥 File encryption test failed:', error);
    process.exit(1);
  });