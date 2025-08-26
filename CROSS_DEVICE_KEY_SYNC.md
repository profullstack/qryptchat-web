# Cross-Device Key Synchronization

## Overview

QryptChat now supports secure cross-device key synchronization, allowing users to access their encrypted conversations from multiple devices while maintaining end-to-end encryption security.

## Architecture

### Key Components

1. **Master Key Derivation** ([`src/lib/crypto/master-key-derivation.js`](src/lib/crypto/master-key-derivation.js))
   - Derives encryption keys from user credentials (phone + PIN)
   - Uses PBKDF2 with SHA-256 and 100,000 iterations
   - Creates deterministic but secure master keys

2. **Encrypted Key Backup** ([`src/lib/crypto/encrypted-key-backup.js`](src/lib/crypto/encrypted-key-backup.js))
   - Encrypts user keys with AES-GCM using master key
   - Handles identity keys and conversation keys separately
   - Provides backup integrity verification

3. **Key Sync Service** ([`src/lib/crypto/key-sync-service.js`](src/lib/crypto/key-sync-service.js))
   - Manages backup and restoration operations
   - Interfaces with Supabase database
   - Provides security logging and monitoring

4. **Database Schema** ([`supabase/migrations/20250826103206_encrypted_key_backups.sql`](supabase/migrations/20250826103206_encrypted_key_backups.sql))
   - Stores encrypted key backups
   - Tracks access logs for security monitoring
   - Implements Row Level Security (RLS)

## Security Model

### Zero-Knowledge Architecture
- Server never sees plaintext keys
- All encryption/decryption happens client-side
- Master key derived from user credentials, never stored

### Key Derivation Process
```
Phone Number + PIN → PBKDF2 (100k iterations) → Master Key (256-bit)
Master Key + Identity Keys → AES-GCM → Encrypted Identity Keys
Master Key + Conversation Keys → AES-GCM → Encrypted Conversation Keys
```

### Threat Protection
- **Quantum Resistance**: Uses post-quantum algorithms for identity keys
- **Forward Secrecy**: Conversation keys remain ephemeral
- **Compromise Recovery**: New PIN invalidates old backups
- **Brute Force Protection**: High iteration count PBKDF2

## Usage

### Initial Setup (First Device)

```javascript
import { KeySyncService } from '$lib/crypto/key-sync-service.js';
import { supabase } from '$lib/supabase.js';

const keySyncService = new KeySyncService(supabase);
await keySyncService.initialize();

// Backup keys to cloud
const result = await keySyncService.backupKeys({
  phoneNumber: '+1234567890',
  pin: 'user-chosen-pin',
  identityKeys: userIdentityKeys,
  conversationKeys: userConversationKeys,
  deviceFingerprint: await EncryptedKeyBackup.generateDeviceFingerprint()
});

if (result.success) {
  console.log('Keys backed up successfully');
}
```

### New Device Setup

```javascript
// Restore keys on new device
const result = await keySyncService.restoreKeys(
  '+1234567890',
  'user-chosen-pin',
  await EncryptedKeyBackup.generateDeviceFingerprint()
);

if (result.success) {
  // Apply restored keys to local storage
  await keyManager.importUserKeys(result.identityKeys);
  
  for (const [convId, key] of Object.entries(result.conversationKeys)) {
    await keyManager.storeConversationKey(convId, key);
  }
  
  console.log('Keys restored successfully');
}
```

### PIN Requirements

The system enforces strong PIN requirements:
- Minimum 6 characters
- Recommended: Mix of numbers, letters, and symbols
- Avoid simple sequences (123456, etc.)
- Avoid repeated digits (111111, etc.)

## Database Schema

### encrypted_key_backups Table
```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key to auth.users)
- phone_number: TEXT (For key derivation verification)
- encrypted_identity_keys: BYTEA (AES-GCM encrypted)
- encrypted_master_key: BYTEA (AES-GCM encrypted conversation keys)
- salt: BYTEA (32 bytes for PBKDF2)
- iterations: INTEGER (PBKDF2 iterations, default 100000)
- key_version: INTEGER (For future key rotation)
- device_fingerprint: TEXT (Device identification)
- created_at/updated_at: TIMESTAMPTZ
```

### key_access_log Table
```sql
- id: UUID (Primary Key)
- user_id: UUID (Foreign Key)
- device_fingerprint: TEXT
- access_type: TEXT (backup_created, keys_restored, etc.)
- success: BOOLEAN
- error_message: TEXT
- ip_address: INET
- user_agent: TEXT
- created_at: TIMESTAMPTZ
```

## Security Considerations

### What's Protected
- ✅ Private keys never stored in plaintext
- ✅ Server cannot decrypt user data
- ✅ PIN compromise requires physical device access
- ✅ Each user's data is cryptographically isolated
- ✅ Access attempts are logged for monitoring

### What's Not Protected
- ❌ Device compromise (malware, physical access)
- ❌ PIN shoulder surfing or keylogging
- ❌ User choosing weak PINs despite warnings
- ❌ Quantum attacks on AES-GCM (future concern)

### Best Practices
1. **Strong PINs**: Use complex, unique PINs
2. **Device Security**: Keep devices updated and secure
3. **Regular Rotation**: Change PINs periodically
4. **Monitor Access**: Check access logs for suspicious activity
5. **Backup Verification**: Verify backup integrity before relying on it

## Migration from localStorage-only

Existing users with localStorage-only keys can migrate:

```javascript
// Check if user has existing keys
const hasLocalKeys = await keyManager.hasUserKeys();
const hasBackup = await keySyncService.checkBackupStatus(phoneNumber);

if (hasLocalKeys && !hasBackup.hasBackup) {
  // Prompt user to create PIN and backup existing keys
  const pin = await promptUserForPIN();
  
  const identityKeys = await keyManager.getUserKeys();
  const conversationKeys = await keyManager.getAllConversationKeys();
  
  await keySyncService.backupKeys({
    phoneNumber,
    pin,
    identityKeys,
    conversationKeys,
    deviceFingerprint: await EncryptedKeyBackup.generateDeviceFingerprint()
  });
}
```

## Error Handling

Common error scenarios and handling:

### Backup Failures
- Network connectivity issues
- Database constraints
- Encryption failures
- Authentication problems

### Restore Failures
- Wrong PIN (most common)
- No backup found
- Corrupted backup data
- Network issues

### Recovery Options
- PIN reset (requires new backup)
- Manual key export/import
- Fresh start (lose conversation history)

## Performance Considerations

### Key Derivation
- PBKDF2 with 100k iterations takes ~100ms on modern devices
- Consider showing progress indicator for user experience
- Cache derived keys temporarily to avoid re-derivation

### Backup Size
- Identity keys: ~200 bytes encrypted
- Conversation keys: ~50 bytes per conversation encrypted
- Total backup typically < 10KB for most users

### Network Usage
- Initial backup: One-time upload of encrypted keys
- Restore: One-time download of encrypted keys
- Updates: Only when new conversations are created

## Testing

Comprehensive test suite covers:
- Key derivation consistency
- Encryption/decryption round trips
- Database operations
- Error conditions
- Cross-device scenarios

Run tests:
```bash
pnpm test tests/crypto-key-sync.test.js
```

## Future Enhancements

### Planned Features
1. **Key Rotation**: Automatic periodic key updates
2. **Multi-PIN Support**: Different PINs for different security levels
3. **Hardware Security**: Integration with device secure enclaves
4. **Backup Verification**: Cryptographic proof of backup integrity
5. **Emergency Recovery**: Secure key recovery mechanisms

### Security Improvements
1. **Post-Quantum Migration**: Upgrade to quantum-resistant algorithms
2. **Zero-Knowledge Proofs**: Prove PIN knowledge without revealing it
3. **Threshold Cryptography**: Split keys across multiple secure locations
4. **Biometric Integration**: Use device biometrics as additional factor

## Compliance

This implementation addresses:
- **GDPR**: User controls their data, can delete backups
- **SOC 2**: Comprehensive logging and access controls
- **HIPAA**: End-to-end encryption with user-controlled keys
- **FIPS 140-2**: Uses approved cryptographic algorithms

## Support

For implementation questions or security concerns:
1. Review the comprehensive test suite
2. Check access logs for debugging
3. Verify backup integrity before troubleshooting
4. Consider PIN strength and user education

---

**⚠️ Security Notice**: This system provides strong security when used correctly, but user education about PIN security is critical for overall system security.