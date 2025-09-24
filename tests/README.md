# WebSocket and Supabase Bridge Tests

This directory contains comprehensive tests for the WebSocket server and Supabase Realtime Bridge integration using **Vitest**.

## Test Files

### `websocket-supabase-realtime-bridge.test.js`
Unit tests for the Supabase Realtime Bridge:
- Bridge initialization and configuration
- Conversation subscription/unsubscription
- Message and typing indicator handling
- Error handling and edge cases
- Room management integration
- Cleanup and statistics

### `websocket-server-integration.test.js`
Integration tests for the WebSocket server with bridge:
- Server startup with bridge initialization
- WebSocket connection handling
- Message broadcasting across clients
- Backward compatibility verification
- Error handling and graceful degradation

### `run-tests.js`
Test runner script that:
- Checks for required dependencies
- Runs all tests with Vitest
- Provides clear pass/fail reporting
- Ensures no breaking changes

## Running Tests

### Prerequisites
Install test dependencies:
```bash
pnpm add --save-dev vitest ws
```

### Run All Tests
```bash
node tests/run-tests.js
```

### Run Individual Tests
```bash
# Bridge unit tests
npx vitest run tests/websocket-supabase-realtime-bridge.test.js

# Integration tests
npx vitest run tests/websocket-server-integration.test.js

# Run all tests with Vitest directly
npx vitest run --dir tests
```

## Test Coverage

The tests verify:

✅ **No Breaking Changes**: Existing WebSocket functionality works unchanged
✅ **Bridge Integration**: Supabase Realtime Bridge initializes correctly
✅ **Cross-Device Sync**: Messages broadcast to all connected clients
✅ **Error Handling**: Graceful degradation when bridge fails
✅ **Backward Compatibility**: All existing message types still supported
✅ **Room Management**: Automatic subscription/unsubscription
✅ **Edge Cases**: Invalid data, network errors, cleanup scenarios

## What These Tests Ensure

1. **Your existing WebSocket server continues to work exactly as before**
2. **The new Supabase Bridge enhances functionality without breaking anything**
3. **Cross-device sync works through the bridge**
4. **Error conditions are handled gracefully**
5. **The system degrades gracefully if Supabase is unavailable**

## Test Philosophy

Following KISS principles:
- Simple, focused tests
- Clear pass/fail criteria
- No complex mocking beyond what's necessary
- Real integration testing where possible
- Comprehensive error scenario coverage

Run these tests before deploying to ensure the bridge integration doesn't break your existing chat functionality.