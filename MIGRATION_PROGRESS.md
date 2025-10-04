# WebSocket to POST + SSE Migration Progress

## ✅ Completed (Phase 1: Server Infrastructure)

### Core Infrastructure
1. **[`src/lib/api/sse-manager.js`](src/lib/api/sse-manager.js:1)** - SSE Connection Manager
   - User connection tracking
   - Room/conversation management
   - Broadcasting utilities
   - Keep-alive mechanism
   - Connection cleanup

2. **[`src/lib/api/protocol.js`](src/lib/api/protocol.js:1)** - Protocol Utilities
   - Message type constants (all WebSocket types preserved)
   - Message creation and validation helpers
   - SSE formatting functions

3. **[`src/lib/api/middleware/auth.js`](src/lib/api/middleware/auth.js:1)** - Authentication Middleware
   - Request authentication
   - `withAuth()` wrapper for protected routes
   - Session validation

### API Endpoints Created

#### Real-time Events
- **[`src/routes/api/events/+server.js`](src/routes/api/events/+server.js:1)** - SSE endpoint for real-time updates

#### Messages
- **[`src/routes/api/messages/send/+server.js`](src/routes/api/messages/send/+server.js:1)** - Send messages
- **[`src/routes/api/messages/load/+server.js`](src/routes/api/messages/load/+server.js:1)** - Load messages with pagination

#### Conversations
- **[`src/routes/api/conversations/create/+server.js`](src/routes/api/conversations/create/+server.js:1)** - Create conversations
- **[`src/routes/api/conversations/load/+server.js`](src/routes/api/conversations/load/+server.js:1)** - Load user conversations
- **[`src/routes/api/conversations/join/+server.js`](src/routes/api/conversations/join/+server.js:1)** - Join conversation room

#### Typing Indicators
- **[`src/routes/api/typing/start/+server.js`](src/routes/api/typing/start/+server.js:1)** - Start typing indicator
- **[`src/routes/api/typing/stop/+server.js`](src/routes/api/typing/stop/+server.js:1)** - Stop typing indicator

### Documentation
- **[`WEBSOCKET_TO_POST_SSE_MIGRATION.md`](WEBSOCKET_TO_POST_SSE_MIGRATION.md:1)** - Complete analysis of all changes needed
- **[`WEBSOCKET_TO_SSE_IMPLEMENTATION_GUIDE.md`](WEBSOCKET_TO_SSE_IMPLEMENTATION_GUIDE.md:1)** - Implementation guide with code templates

## 🔄 Remaining Work (Phase 2: Client & Integration)

### High Priority

1. **Client-Side Store Refactoring** - [`src/lib/stores/websocket-chat.js`](src/lib/stores/websocket-chat.js:1)
   - Replace WebSocket with EventSource for receiving
   - Replace `ws.send()` with `fetch()` for sending
   - Update connection management
   - Handle SSE reconnection
   - Update all message handlers

2. **Server.js Updates** - [`server.js`](server.js:1)
   - Remove WebSocket server initialization (lines 8-40)
   - Remove upgrade handler
   - Start SSE keep-alive: `sseManager.startKeepAlive(30000)`
   - Update shutdown to cleanup SSE connections

3. **Voice Call Endpoints** - Need to create:
   - `/api/calls/offer` - Initiate call
   - `/api/calls/answer` - Answer call
   - `/api/calls/decline` - Decline call
   - `/api/calls/end` - End call
   - `/api/calls/ice-candidate` - Exchange ICE candidates

### Medium Priority

4. **WebRTC Signaling Updates**
   - [`src/lib/webrtc/ml-kem-call-manager.js`](src/lib/webrtc/ml-kem-call-manager.js:1)
   - [`src/lib/webrtc/webrtc-service.js`](src/lib/webrtc/webrtc-service.js:1)
   - Decision needed: POST/SSE, WebRTC data channels, or hybrid approach

5. **PWA Updates**
   - [`src/lib/utils/pwa-session-manager.js`](src/lib/utils/pwa-session-manager.js:1) - Update connection checks
   - [`src/lib/utils/pwa-diagnostics.js`](src/lib/utils/pwa-diagnostics.js:1) - Update diagnostics for SSE

6. **Locale Strings** - [`src/lib/locales/en.js`](src/lib/locales/en.js:1)
   - Update references from "WebSocket" to "API" or "real-time connection"

### Low Priority

7. **Cleanup**
   - Remove `ws` dependency from [`package.json`](package.json:1)
   - Delete [`src/routes/api/websocket/+server.js`](src/routes/api/websocket/+server.js:1)
   - Remove unused WebSocket files from `src/lib/websocket/`

8. **Testing**
   - Create SSE connection tests
   - Test all new API endpoints
   - Test reconnection scenarios
   - Test concurrent connections
   - Update existing WebSocket tests

## 📊 Migration Statistics

- **Files Created**: 12
- **Files to Modify**: ~10
- **Files to Delete**: ~13
- **Estimated Remaining Effort**: 2-3 days

## 🎯 Next Steps

### Immediate (Do First)
1. Update [`server.js`](server.js:1) to remove WebSocket and start SSE keep-alive
2. Refactor [`src/lib/stores/websocket-chat.js`](src/lib/stores/websocket-chat.js:1) to use SSE + POST
3. Test basic message sending/receiving with new architecture

### Then
4. Create voice call API endpoints
5. Update WebRTC signaling
6. Test thoroughly
7. Clean up old WebSocket code

## 🔍 Testing Strategy

### Unit Tests
- SSE manager connection handling
- Protocol message formatting
- Authentication middleware

### Integration Tests
- SSE connection establishment
- Message sending via POST
- Message receiving via SSE
- Typing indicators
- Conversation management
- Multiple simultaneous connections

### E2E Tests
- Complete chat flow
- File uploads
- Voice/video calls
- PWA session restoration

## ⚠️ Important Notes

1. **TypeScript Errors**: The TypeScript errors in JavaScript files are expected and can be ignored. This is a JavaScript project using JSDoc comments.

2. **SSE Connection Limits**: Browsers typically limit SSE connections to 6 per domain. This should be sufficient for most use cases.

3. **WebRTC Signaling**: The voice/video call signaling may need special consideration. Options:
   - Use POST + SSE (simpler, may have latency)
   - Use WebRTC data channels (more complex, lower latency)
   - Hybrid: Keep WebSocket only for calls (easiest migration)

4. **Backward Compatibility**: Consider running both WebSocket and SSE in parallel during migration with a feature flag.

5. **Performance**: SSE + POST may have slightly higher latency for client→server messages compared to WebSocket, but should be negligible for chat applications.

## 📝 Code Examples

### Client-Side SSE Connection
```javascript
// In src/lib/stores/chat.js (renamed from websocket-chat.js)
let eventSource = null;

function connect(token) {
	const url = `/api/events`;
	eventSource = new EventSource(url);

	eventSource.addEventListener('NEW_MESSAGE', (event) => {
		const message = JSON.parse(event.data);
		handleNewMessage(message.data.message);
	});

	eventSource.addEventListener('error', (error) => {
		console.error('SSE error:', error);
		// Implement reconnection logic
	});
}
```

### Client-Side POST Request
```javascript
async function sendMessage(conversationId, content) {
	const response = await fetch('/api/messages/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ conversationId, content })
	});
	return response.json();
}
```

## 🚀 Deployment Considerations

1. **Zero-Downtime Migration**: Deploy SSE endpoints alongside WebSocket, use feature flag to switch
2. **Monitoring**: Add logging for SSE connection counts, message delivery rates
3. **Scaling**: SSE connections are stateful - consider sticky sessions or Redis for multi-server deployments
4. **Fallbacks**: Implement polling fallback for environments that block SSE

## ✨ Benefits of This Migration

1. **Simpler Architecture**: Standard HTTP/REST instead of WebSocket protocol
2. **Better Compatibility**: Works with more proxies and firewalls
3. **Easier Debugging**: Standard HTTP tools work for POST requests
4. **HTTP/2 Multiplexing**: Better performance with HTTP/2
5. **Easier Load Balancing**: Standard HTTP load balancing works
6. **Cleaner Code**: Separation of concerns (POST for sending, SSE for receiving)