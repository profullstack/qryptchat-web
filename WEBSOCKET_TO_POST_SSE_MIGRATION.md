# WebSocket to POST + SSE Migration Analysis

## Overview
This document identifies all code locations that would need to change when migrating from WebSocket-based real-time communication to a POST + Server-Sent Events (SSE) architecture.

## Architecture Change Summary

### Current Architecture (WebSocket)
- **Bidirectional**: Single persistent connection for both sending and receiving
- **Connection**: `ws://` or `wss://` protocol
- **Client → Server**: `ws.send(JSON.stringify(message))`
- **Server → Client**: `ws.send(JSON.stringify(message))`
- **Library**: `ws` package (v8.18.3)

### Target Architecture (POST + SSE)
- **Unidirectional**: 
  - POST requests for client → server communication
  - SSE for server → client real-time updates
- **Connections**: 
  - HTTP POST to `/api/*` endpoints
  - SSE connection to `/api/events` or similar
- **Client → Server**: `fetch('/api/messages', { method: 'POST', body: JSON.stringify(data) })`
- **Server → Client**: SSE stream with `text/event-stream` content type

---

## 1. Server-Side Changes

### 1.1 Main Server Entry Point
**File**: [`server.js`](server.js:1)

**Current Implementation**:
- Lines 8-9: Imports `WebSocketServer` from `ws` and `ChatWebSocketServer`
- Lines 18-25: Creates WebSocket server in "noServer" mode
- Lines 28-40: Handles WebSocket upgrade requests on `/ws` path
- Lines 49-52: WebSocket server shutdown logic

**Required Changes**:
- Remove WebSocket server initialization
- Remove upgrade handler
- Add SSE endpoint handler (e.g., `/api/events`)
- Implement SSE connection management
- Update shutdown logic to close SSE connections

---

### 1.2 WebSocket Server Implementation
**File**: [`src/lib/websocket/server.js`](src/lib/websocket/server.js:1)

**Current Implementation**:
- Entire file implements `ChatWebSocketServer` class
- Lines 53-92: Server start/stop methods
- Lines 111-186: Connection handling with `ws.on('message')`, `ws.on('close')`, `ws.on('error')`
- Lines 186-366: Message routing based on message type
- Lines 394-411: Heartbeat/ping mechanism
- Lines 428-444: Broadcast functionality

**Required Changes**:
- **Replace entirely** with SSE server implementation
- Create SSE connection manager
- Implement POST endpoint handlers for each message type
- Replace `ws.send()` with SSE `res.write()` for server → client
- Implement SSE heartbeat using `:keep-alive` comments
- Update broadcast to iterate SSE connections instead of WebSocket connections

---

### 1.3 WebSocket Protocol Utilities
**File**: [`src/lib/websocket/utils/protocol.js`](src/lib/websocket/utils/protocol.js:1)

**Current Implementation**:
- Lines 10-79: Message type constants
- Lines 82-121: `createMessage()` helper
- Lines 123-159: `validateMessage()` helper
- Lines 162-174: `parseMessage()` helper
- Lines 176-180: `serializeMessage()` helper

**Required Changes**:
- Rename file to `src/lib/api/protocol.js` or similar
- Keep message types and validation (still needed)
- Update serialization for SSE format (add `event:` and `data:` prefixes)
- Add SSE-specific helpers for formatting events

---

### 1.4 Room Management
**File**: [`src/lib/websocket/utils/rooms.js`](src/lib/websocket/utils/rooms.js:1)

**Current Implementation**:
- Lines 13-16: Maps WebSocket connections to users/rooms
- Lines 22-41: `addUserConnection()` - stores WebSocket reference
- Lines 43-65: `removeUserConnection()` - removes WebSocket reference
- Lines 67-93: `joinRoom()` - associates WebSocket with conversation
- Lines 95-110: `leaveRoom()` - removes WebSocket from conversation
- Lines 112-200: `broadcastToRoom()` - sends to all WebSockets in room
- Lines 202-217: `sendToUser()` - sends to specific user's WebSockets

**Required Changes**:
- Replace `WebSocket` references with SSE response objects
- Update connection storage to use SSE response streams
- Modify broadcast methods to use `res.write()` instead of `ws.send()`
- Implement SSE connection cleanup on client disconnect
- Add connection state tracking (SSE connections can be one-way)

---

### 1.5 Authentication Middleware
**File**: [`src/lib/websocket/middleware/auth.js`](src/lib/websocket/middleware/auth.js:1)

**Current Implementation**:
- Lines 9-37: `extractToken()` - extracts JWT from WebSocket upgrade request
- Lines 40-104: `authenticateWebSocket()` - validates JWT for WebSocket connection
- Lines 107-113: Message authentication middleware

**Required Changes**:
- Rename to `src/lib/api/middleware/auth.js`
- Update `extractToken()` to work with standard HTTP requests (headers, cookies)
- Create separate authentication for:
  - POST endpoints (standard JWT validation)
  - SSE endpoint (validate on connection establishment)
- Remove WebSocket-specific upgrade request handling

---

### 1.6 Message Handlers
**Files**: 
- [`src/lib/websocket/handlers/auth.js`](src/lib/websocket/handlers/auth.js:1)
- [`src/lib/websocket/handlers/messages.js`](src/lib/websocket/handlers/messages.js:1)
- [`src/lib/websocket/handlers/conversations.js`](src/lib/websocket/handlers/conversations.js:1)
- [`src/lib/websocket/handlers/typing.js`](src/lib/websocket/handlers/typing.js:1)
- [`src/lib/websocket/handlers/voice-calls.js`](src/lib/websocket/handlers/voice-calls.js:1)
- [`src/lib/websocket/handlers/ml-kem-voice-calls.js`](src/lib/websocket/handlers/ml-kem-voice-calls.js:1)

**Current Implementation**:
- All handlers receive `(ws, message, context)` parameters
- All use `ws.send(serializeMessage(response))` to send responses
- Synchronous request-response pattern over WebSocket

**Required Changes**:
- **Convert to SvelteKit API routes** in `src/routes/api/`
- Create separate POST endpoints for each action:
  - `/api/auth/authenticate` (replaces AUTH message)
  - `/api/messages/send` (replaces SEND_MESSAGE)
  - `/api/messages/load` (replaces LOAD_MESSAGES)
  - `/api/conversations/create` (replaces CREATE_CONVERSATION)
  - `/api/conversations/join` (replaces JOIN_CONVERSATION)
  - `/api/typing/start` (replaces TYPING_START)
  - `/api/typing/stop` (replaces TYPING_STOP)
  - `/api/calls/offer` (replaces CALL_OFFER)
  - `/api/calls/answer` (replaces CALL_ANSWER)
  - etc.
- Change response pattern from `ws.send()` to `return json(response)`
- For real-time updates (new messages, typing indicators), broadcast via SSE instead
- Update all `ws.send()` calls to use SSE broadcast mechanism

---

### 1.7 Supabase Realtime Bridge
**File**: [`src/lib/websocket/supabase-realtime-bridge.js`](src/lib/websocket/supabase-realtime-bridge.js:1)

**Current Implementation**:
- Lines 145-155: Broadcasts Supabase changes to WebSocket clients
- Lines 175-186: Broadcasts typing indicators to WebSocket clients

**Required Changes**:
- Update broadcast calls to use SSE instead of WebSocket
- Replace `roomManager.broadcastToRoom()` with SSE broadcast
- Ensure SSE connections receive Supabase realtime events

---

### 1.8 SvelteKit WebSocket Endpoint
**File**: [`src/routes/api/websocket/+server.js`](src/routes/api/websocket/+server.js:1)

**Current Implementation**:
- Handles WebSocket upgrade requests in development
- Returns WebSocket URL information

**Required Changes**:
- **Delete this file** (no longer needed)
- Create new SSE endpoint: `src/routes/api/events/+server.js`
- Implement SSE connection handler with proper headers:
  ```javascript
  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive'
    }
  });
  ```

---

## 2. Client-Side Changes

### 2.1 WebSocket Chat Store
**File**: [`src/lib/stores/websocket-chat.js`](src/lib/stores/websocket-chat.js:1)

**Current Implementation**:
- Lines 49-813: Entire store manages WebSocket connection
- Lines 68-83: `getWebSocketUrl()` - constructs WebSocket URL
- Lines 86-195: `connect()` - establishes WebSocket connection
- Lines 96-97: Checks `ws.readyState === WebSocket.OPEN`
- Lines 111: `ws = new WebSocket(wsUrl)`
- Lines 113-181: WebSocket event handlers (`onopen`, `onmessage`, `onclose`, `onerror`)
- Lines 197-207: `disconnect()` - closes WebSocket
- Lines 228-247: `sendMessage()` - sends via `ws.send()`
- Lines 250-307: `handleMessage()` - processes incoming WebSocket messages
- Lines 812: `getWebSocket()` - exposes WebSocket for WebRTC

**Required Changes**:
- **Major refactor required**
- Replace WebSocket connection with:
  - SSE connection for receiving updates
  - Fetch API for sending messages
- Update `connect()`:
  - Establish SSE connection using `EventSource`
  - Set up SSE event listeners
- Update `disconnect()`:
  - Close SSE connection with `eventSource.close()`
- Replace `sendMessage()`:
  - Use `fetch()` with POST method
  - Send to appropriate API endpoint based on message type
  - Handle response as JSON
- Update `handleMessage()`:
  - Process SSE events instead of WebSocket messages
  - Parse `event.data` for message content
- Update connection state tracking:
  - `EventSource.CONNECTING`, `EventSource.OPEN`, `EventSource.CLOSED`
- For WebRTC signaling, may need alternative approach (WebRTC data channels or separate signaling)

**Example SSE Connection**:
```javascript
const eventSource = new EventSource('/api/events?token=' + token);

eventSource.addEventListener('message', (event) => {
  const message = JSON.parse(event.data);
  handleMessage(message);
});

eventSource.addEventListener('error', (error) => {
  console.error('SSE error:', error);
  // Implement reconnection logic
});
```

**Example POST Request**:
```javascript
async function sendMessage(conversationId, content) {
  const response = await fetch('/api/messages/send', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${token}`
    },
    body: JSON.stringify({ conversationId, content })
  });
  return response.json();
}
```

---

### 2.2 WebRTC Services
**Files**:
- [`src/lib/webrtc/ml-kem-call-manager.js`](src/lib/webrtc/ml-kem-call-manager.js:1)
- [`src/lib/webrtc/webrtc-service.js`](src/lib/webrtc/webrtc-service.js:1)

**Current Implementation**:
- Line 28-29: Constructor receives WebSocket connection
- Lines 57-87: `setupWebSocketHandlers()` - listens for WebSocket messages
- Lines 142-143, 220, 313, 373: Sends signaling via `ws.send()`
- Lines 356-359: Checks `ws.readyState !== WebSocket.OPEN`
- Lines 479-488: `initialize()` receives WebSocket connection
- Lines 534-564: `setupWebSocketHandlers()` for WebRTC signaling

**Required Changes**:
- **Option 1: Use POST for signaling**
  - Replace `ws.send()` with `fetch()` POST requests
  - Poll for signaling messages or use SSE for receiving
  - May introduce latency in call setup
  
- **Option 2: Use WebRTC Data Channels**
  - After initial connection via POST/SSE, establish WebRTC data channel
  - Use data channel for subsequent signaling
  - More complex but maintains low latency
  
- **Option 3: Hybrid approach**
  - Keep WebSocket only for WebRTC signaling
  - Use POST/SSE for chat messages
  - Simplest migration path for calls

- Update constructor to accept SSE connection or fetch function
- Replace all `ws.send()` with appropriate POST requests
- Update message listeners to work with SSE events or polling

---

### 2.3 PWA Session Manager
**File**: [`src/lib/utils/pwa-session-manager.js`](src/lib/utils/pwa-session-manager.js:1)

**Current Implementation**:
- Lines 242-244: `ensureWebSocketConnection()` - checks WebSocket status
- Lines 258-295: Validates WebSocket connection state
- Lines 266-269: Checks `currentState.connected && currentState.authenticated`
- Lines 283: Calls `wsChat.connect()`
- Lines 315: Calls `wsChat.disconnect()`

**Required Changes**:
- Rename to `ensureSSEConnection()` or `ensureRealtimeConnection()`
- Update connection checks for SSE/EventSource state
- Update reconnection logic for SSE
- Handle SSE-specific error cases

---

### 2.4 PWA Diagnostics
**File**: [`src/lib/utils/pwa-diagnostics.js`](src/lib/utils/pwa-diagnostics.js:1)

**Current Implementation**:
- Lines 20, 36, 158-186: Collects WebSocket diagnostic information
- Lines 161-162: Gets WebSocket state and connection
- Lines 168-170: Checks `ws?.readyState`
- Lines 301-307: `getWebSocketReadyStateText()` helper
- Lines 367-391: Identifies WebSocket-related issues
- Lines 424-428: Checks WebSocket browser support

**Required Changes**:
- Update diagnostic collection for SSE/EventSource
- Replace WebSocket state checks with EventSource state
- Update issue detection for SSE-specific problems
- Check `EventSource` browser support instead of `WebSocket`
- Update ready state text helper for EventSource states

---

### 2.5 Svelte Components
**File**: [`src/lib/components/calls/MLKEMCallInterface.svelte`](src/lib/components/calls/MLKEMCallInterface.svelte:1)

**Current Implementation**:
- Line 163: `websocket.send(JSON.stringify(declineMessage))`

**Required Changes**:
- Replace direct WebSocket send with store method
- Store method should use POST request
- Update to use new API endpoint for call decline

---

### 2.6 File Decryption Utility
**File**: [`src/lib/utils/file-decryption.js`](src/lib/utils/file-decryption.js:1)

**Current Implementation**:
- Lines 31-32: Imports from `websocket-chat.js` store

**Required Changes**:
- Update import path if store is renamed
- No functional changes needed (just uses store data)

---

### 2.7 Voice Call Store
**File**: [`src/lib/stores/voice-call.js`](src/lib/stores/voice-call.js:1)

**Current Implementation**:
- Lines 215-216: TODO comment about WebRTC signaling through WebSocket

**Required Changes**:
- Implement WebRTC signaling using new POST/SSE approach
- Update TODO with actual implementation

---

## 3. Configuration Changes

### 3.1 Package Dependencies
**File**: [`package.json`](package.json:1)

**Current Implementation**:
- Line 50: `"ws": "^8.18.3"` in devDependencies

**Required Changes**:
- Remove `ws` package (no longer needed)
- No new dependencies required (SSE uses native browser `EventSource` and Node.js streams)

---

### 3.2 Locale Strings
**File**: [`src/lib/locales/en.js`](src/lib/locales/en.js:1)

**Current Implementation**:
- Lines 260, 356-358: References to "WebSocket store"

**Required Changes**:
- Update locale strings to reference "API" or "real-time connection" instead of "WebSocket"
- Example: "Not yet implemented in API" instead of "Not yet implemented in WebSocket store"

---

## 4. Testing Changes

### 4.1 WebSocket Integration Tests
**File**: [`tests/websocket-server-integration.test.js`](tests/websocket-server-integration.test.js:1)

**Required Changes**:
- Rewrite tests for POST + SSE architecture
- Test SSE connection establishment
- Test POST endpoint responses
- Test SSE event delivery
- Test reconnection logic

---

## 5. Migration Strategy Recommendations

### 5.1 Phased Approach

**Phase 1: Parallel Implementation**
- Implement POST + SSE alongside existing WebSocket
- Add feature flag to switch between implementations
- Test thoroughly in development

**Phase 2: Gradual Rollout**
- Deploy both implementations to production
- Use feature flag for gradual user migration
- Monitor performance and error rates

**Phase 3: WebSocket Deprecation**
- After successful migration, remove WebSocket code
- Clean up unused dependencies
- Update documentation

### 5.2 Key Considerations

**Advantages of POST + SSE**:
- Simpler server implementation (standard HTTP)
- Better compatibility with HTTP/2 and HTTP/3
- Easier to cache and load balance
- Works better with some corporate firewalls
- Simpler authentication (standard HTTP headers)

**Disadvantages of POST + SSE**:
- Higher latency for client → server messages (HTTP overhead)
- More complex for bidirectional real-time features
- SSE browser support (IE/Edge legacy issues)
- Connection limits (browser typically allows 6 SSE connections per domain)
- WebRTC signaling may need special handling

**Critical Areas**:
1. **WebRTC Signaling**: Requires low-latency bidirectional communication
   - Consider keeping WebSocket only for calls
   - Or implement WebRTC data channels for signaling
   
2. **Typing Indicators**: Need real-time updates
   - SSE works well for receiving
   - POST may add latency for sending
   
3. **Message Delivery**: Core functionality
   - POST for sending is straightforward
   - SSE for receiving works well
   
4. **Connection Management**: 
   - SSE auto-reconnects but may need custom logic
   - Need to handle connection state carefully

### 5.3 Estimated Effort

- **Server-side**: 3-5 days
  - Create API routes: 1-2 days
  - Implement SSE endpoint: 1 day
  - Update broadcast mechanism: 1 day
  - Testing: 1 day

- **Client-side**: 2-3 days
  - Refactor chat store: 1-2 days
  - Update WebRTC integration: 1 day
  - Testing: 1 day

- **Total**: 5-8 days for core migration
- **Additional**: 2-3 days for edge cases and polish

---

## 6. Summary of Files Requiring Changes

### Server-Side (11 files)
1. ✏️ [`server.js`](server.js:1) - Remove WebSocket, add SSE
2. 🔄 [`src/lib/websocket/server.js`](src/lib/websocket/server.js:1) - Replace with SSE server
3. ✏️ [`src/lib/websocket/utils/protocol.js`](src/lib/websocket/utils/protocol.js:1) - Update for SSE format
4. ✏️ [`src/lib/websocket/utils/rooms.js`](src/lib/websocket/utils/rooms.js:1) - Replace WebSocket refs with SSE
5. ✏️ [`src/lib/websocket/middleware/auth.js`](src/lib/websocket/middleware/auth.js:1) - Update for HTTP
6. 🔄 [`src/lib/websocket/handlers/auth.js`](src/lib/websocket/handlers/auth.js:1) - Convert to API route
7. 🔄 [`src/lib/websocket/handlers/messages.js`](src/lib/websocket/handlers/messages.js:1) - Convert to API route
8. 🔄 [`src/lib/websocket/handlers/conversations.js`](src/lib/websocket/handlers/conversations.js:1) - Convert to API route
9. 🔄 [`src/lib/websocket/handlers/typing.js`](src/lib/websocket/handlers/typing.js:1) - Convert to API route
10. 🔄 [`src/lib/websocket/handlers/voice-calls.js`](src/lib/websocket/handlers/voice-calls.js:1) - Convert to API route
11. 🔄 [`src/lib/websocket/handlers/ml-kem-voice-calls.js`](src/lib/websocket/handlers/ml-kem-voice-calls.js:1) - Convert to API route
12. ✏️ [`src/lib/websocket/supabase-realtime-bridge.js`](src/lib/websocket/supabase-realtime-bridge.js:1) - Update broadcasts
13. ❌ [`src/routes/api/websocket/+server.js`](src/routes/api/websocket/+server.js:1) - Delete, replace with SSE endpoint

### Client-Side (8 files)
1. 🔄 [`src/lib/stores/websocket-chat.js`](src/lib/stores/websocket-chat.js:1) - Major refactor for SSE + POST
2. ✏️ [`src/lib/webrtc/ml-kem-call-manager.js`](src/lib/webrtc/ml-kem-call-manager.js:1) - Update signaling
3. ✏️ [`src/lib/webrtc/webrtc-service.js`](src/lib/webrtc/webrtc-service.js:1) - Update signaling
4. ✏️ [`src/lib/utils/pwa-session-manager.js`](src/lib/utils/pwa-session-manager.js:1) - Update connection checks
5. ✏️ [`src/lib/utils/pwa-diagnostics.js`](src/lib/utils/pwa-diagnostics.js:1) - Update diagnostics
6. ✏️ [`src/lib/components/calls/MLKEMCallInterface.svelte`](src/lib/components/calls/MLKEMCallInterface.svelte:1) - Update send method
7. ✏️ [`src/lib/stores/voice-call.js`](src/lib/stores/voice-call.js:1) - Implement signaling
8. ✏️ [`src/lib/locales/en.js`](src/lib/locales/en.js:1) - Update strings

### Configuration (1 file)
1. ✏️ [`package.json`](package.json:1) - Remove `ws` dependency

### Testing (1+ files)
1. 🔄 [`tests/websocket-server-integration.test.js`](tests/websocket-server-integration.test.js:1) - Rewrite for POST/SSE

**Legend**:
- ✏️ = Modify existing file
- 🔄 = Major refactor or replacement
- ❌ = Delete file
- ➕ = Create new file

**Total**: ~22 files requiring changes

---

## 7. New Files to Create

1. ➕ `src/routes/api/events/+server.js` - SSE endpoint
2. ➕ `src/routes/api/messages/send/+server.js` - Send message endpoint
3. ➕ `src/routes/api/messages/load/+server.js` - Load messages endpoint
4. ➕ `src/routes/api/conversations/create/+server.js` - Create conversation endpoint
5. ➕ `src/routes/api/conversations/join/+server.js` - Join conversation endpoint
6. ➕ `src/routes/api/typing/start/+server.js` - Typing start endpoint
7. ➕ `src/routes/api/typing/stop/+server.js` - Typing stop endpoint
8. ➕ `src/routes/api/calls/offer/+server.js` - Call offer endpoint
9. ➕ `src/routes/api/calls/answer/+server.js` - Call answer endpoint
10. ➕ `src/routes/api/calls/decline/+server.js` - Call decline endpoint
11. ➕ `src/routes/api/calls/end/+server.js` - Call end endpoint
12. ➕ `src/lib/api/sse-manager.js` - SSE connection manager
13. ➕ `src/lib/api/broadcast.js` - SSE broadcast utilities

**Total**: ~13 new files to create

---

## Conclusion

Migrating from WebSocket to POST + SSE is a significant architectural change affecting approximately **22 existing files** and requiring **13 new files**. The most complex changes are:

1. **Server-side**: Converting WebSocket handlers to REST API endpoints and implementing SSE broadcasting
2. **Client-side**: Refactoring the chat store to use EventSource + fetch instead of WebSocket
3. **WebRTC**: Deciding on signaling approach (POST/SSE, data channels, or hybrid)

The migration is feasible but requires careful planning, especially around real-time features like WebRTC calls and typing indicators. A phased approach with feature flags is strongly recommended.