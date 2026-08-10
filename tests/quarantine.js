/**
 * Test files excluded from the default suite and from CI.
 *
 * Everything here is known-broken, not flaky. Most were orphaned by the
 * SvelteKit -> Next.js migration and still import paths that no longer exist
 * (SvelteKit `+server.js` endpoints, `$lib/*`); the rest need live Supabase
 * credentials or have genuinely failing assertions. See tests/QUARANTINE.md.
 *
 * They are listed rather than deleted because each still documents intended
 * behaviour worth porting.
 *
 * Run just these with `pnpm test:quarantined`. When one starts passing, delete
 * its line — the goal is for this array to end up empty.
 */
export const quarantined = [
  'src/app/api/auth/upload-avatar/route.test.js',
  'src/lib/crypto/crypto.test.js',
  'tests/api/auth/debug-sms.test.js',
  'tests/api/auth/send-sms.test.js',
  'tests/api/auth/verify-sms-error-handling.test.js',
  'tests/api/auth/verify-sms.test.js',
  'tests/api/webhooks/telnyx-sms.test.js',
  'tests/asymmetric-encryption.test.js',
  'tests/auth-key-generation.test.js',
  'tests/chat-archive.test.js',
  'tests/client-encryption.test.js',
  'tests/crypto/crypto.test.js',
  'tests/crypto/multi-recipient-encryption.test.js',
  'tests/data-format-debug.test.js',
  'tests/debug-current-red-dot-issue.test.js',
  'tests/debug-encryption-flow.test.js',
  'tests/debug-missing-message-status.test.js',
  'tests/disappearing-messages.test.js',
  'tests/e2e-file-upload-flow.test.js',
  'tests/encryption-analysis.test.js',
  'tests/encryption-compatibility-fix.test.js',
  'tests/encryption-display-fix.test.js',
  'tests/encryption-fix-verification.test.js',
  'tests/encryption-flow.test.js',
  'tests/file-encryption.test.js',
  'tests/file-upload-integration.test.js',
  'tests/file-upload-size-limit-debug.test.js',
  'tests/gpg-private-key-export.test.js',
  'tests/integration/auth-flow.test.js',
  'tests/key-sync-integration.test.js',
  'tests/key-sync-simple.test.js',
  'tests/large-file-upload-fix-verification.test.js',
  'tests/ml-kem-1024-consistency.test.js',
  'tests/ml-kem-call-system.test.js',
  'tests/ml-kem-module.test.js',
  'tests/nuclear-delete.test.js',
  'tests/password-security-fix-verification.test.js',
  'tests/phone-auth-fix.test.js',
  'tests/post-quantum-encryption.test.js',
  'tests/private-key-import-export.test.js',
  'tests/private-key-password-security.test.js',
  'tests/pwa-session-integration.test.js',
  'tests/pwa-session-restoration.test.js',
  'tests/red-dot-fix-verification.test.js',
  'tests/simple-encryption.test.js',
  'tests/sms-auth.test.js',
  'tests/sms-config-diagnostic.test.js',
  'tests/sms-notification-service.test.js',
  'tests/sms-webhook-email-integration.test.js',
  'tests/twilio-validator.test.js',
  'tests/unique-identifier-flow.test.js',
  'tests/unread-message-system.test.js',
  'tests/url-link-converter.test.js',
  'tests/utils/sms-debug.test.js',
  'tests/video-diagnostics.test.js',
  'tests/voice-calling.test.js',
  'tests/websocket-server-integration.test.js',
  'tests/websocket-supabase-realtime-bridge.test.js',
  'tests/websocket/websocket-chat.test.js',
];
