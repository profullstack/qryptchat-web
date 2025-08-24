# WebSocket Chat API Implementation Plan

## Overview
Replace the current mixed approach (REST + Supabase real-time) with a unified WebSocket-based chat API that handles all chat operations through WebSocket connections.

## Current State Analysis
- **Chat Store**: Uses REST API calls + Supabase real-time subscriptions
- **API Endpoints**: REST endpoints for conversations, groups, messages
- **Real-time**: Supabase real-time for live updates
- **Dependencies**: `ws` package already installed

## WebSocket API Requirements

### 1. WebSocket Server
- Create WebSocket server that integrates with SvelteKit
- Handle authentication via JWT tokens
- Manage client connections and rooms
- Implement message broadcasting

### 2. Message Protocol
Define standardized message format:
```javascript
{
  type: 'action_type',
  payload: { /* action-specific data */ },
  requestId: 'unique_id', // for request/response correlation
  timestamp: 'ISO_string'
}
```

### 3. Supported Actions
- `auth` - Authenticate user connection
- `join_conversation` - Join a conversation room
- `leave_conversation` - Leave a conversation room
- `send_message` - Send a message to conversation
- `load_conversations` - Get user's conversations
- `load_messages` - Get messages for conversation
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `create_conversation` - Create new conversation
- `join_group` - Join group by invite code
- `create_group` - Create new group

### 4. Real-time Features
- Message broadcasting to conversation participants
- Typing indicators
- User presence (online/offline)
- Message read receipts
- Connection status updates

## Implementation Steps

### Phase 1: Core WebSocket Infrastructure
1. Create WebSocket server handler
2. Implement authentication middleware
3. Set up connection management
4. Define message protocol

### Phase 2: Chat Operations
1. Implement conversation management
2. Add message sending/receiving
3. Handle typing indicators
4. Add user presence tracking

### Phase 3: Integration
1. Update chat store to use WebSocket
2. Remove REST API dependencies
3. Update UI components
4. Add error handling and reconnection

### Phase 4: Testing
1. Create WebSocket API tests
2. Test real-time functionality
3. Performance testing
4. Error scenario testing

## File Structure
```
src/
├── lib/
│   ├── websocket/
│   │   ├── server.js          # WebSocket server
│   │   ├── handlers/           # Message handlers
│   │   │   ├── auth.js
│   │   │   ├── conversations.js
│   │   │   ├── messages.js
│   │   │   └── typing.js
│   │   ├── middleware/         # WebSocket middleware
│   │   │   └── auth.js
│   │   └── utils/
│   │       ├── protocol.js     # Message protocol
│   │       └── rooms.js        # Room management
│   └── stores/
│       └── websocket-chat.js   # Updated chat store
└── routes/
    └── api/
        └── websocket/
            └── +server.js       # WebSocket endpoint
```

## Benefits
- **Unified Communication**: Single WebSocket connection for all chat operations
- **Better Performance**: Reduced HTTP overhead, persistent connections
- **Real-time**: Native real-time capabilities without external dependencies
- **Scalability**: Better connection management and resource usage
- **Simplicity**: Single protocol for all chat operations