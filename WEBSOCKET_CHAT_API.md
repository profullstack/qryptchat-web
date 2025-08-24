# WebSocket Chat API Documentation

## Overview

The WebSocket Chat API provides a unified, real-time communication system for QryptChat that replaces the previous mixed approach of REST APIs and Supabase real-time subscriptions. This implementation offers better performance, reduced latency, and simplified client-server communication.

## Architecture

### Core Components

1. **WebSocket Server** (`src/lib/websocket/server.js`)
   - Main WebSocket server handling all connections
   - Message routing and broadcasting
   - Connection lifecycle management
   - Heartbeat and health monitoring

2. **Protocol Layer** (`src/lib/websocket/utils/protocol.js`)
   - Standardized message format
   - Request/response correlation
   - Message validation and serialization

3. **Room Manager** (`src/lib/websocket/utils/rooms.js`)
   - Conversation room management
   - User presence tracking
   - Message broadcasting to room participants

4. **Authentication Middleware** (`src/lib/websocket/middleware/auth.js`)
   - JWT token validation
   - User session management
   - Permission checking

5. **Message Handlers** (`src/lib/websocket/handlers/`)
   - Modular handlers for different message types
   - Database operations
   - Business logic implementation

6. **WebSocket Chat Store** (`src/lib/stores/websocket-chat.js`)
   - Svelte store for WebSocket communication
   - Automatic reconnection
   - State management

## Message Protocol

### Message Format

All WebSocket messages follow this standardized format:

```javascript
{
  type: "message_type",           // Message type from MESSAGE_TYPES
  payload: { /* data */ },        // Message-specific data
  requestId: "unique_id",         // For request/response correlation
  timestamp: "2025-01-01T00:00:00.000Z"  // ISO timestamp
}
```

### Message Types

#### Authentication
- `auth` - Authenticate connection with JWT token
- `auth_success` - Authentication successful
- `auth_error` - Authentication failed

#### Conversations
- `load_conversations` - Load user's conversations
- `conversations_loaded` - Conversations data response
- `join_conversation` - Join a conversation room
- `conversation_joined` - Successfully joined conversation
- `leave_conversation` - Leave a conversation room
- `conversation_left` - Successfully left conversation
- `create_conversation` - Create new conversation
- `conversation_created` - Conversation created successfully

#### Messages
- `send_message` - Send a message to conversation
- `message_sent` - Message sent successfully
- `message_received` - New message broadcast
- `load_messages` - Load messages for conversation
- `messages_loaded` - Messages data response
- `load_more_messages` - Load older messages (pagination)

#### Typing Indicators
- `typing_start` - Start typing indicator
- `typing_stop` - Stop typing indicator
- `typing_update` - Typing status broadcast

#### User Presence
- `user_online` - User came online
- `user_offline` - User went offline

#### System
- `error` - Error response
- `ping` - Connection health check
- `pong` - Ping response

## API Usage

### Client Connection

```javascript
import { wsChat } from '$lib/stores/websocket-chat.js';

// Connect to WebSocket server
const token = localStorage.getItem('supabase.auth.token');
wsChat.connect(token);

// Subscribe to connection status
wsChat.subscribe(state => {
  console.log('Connected:', state.connected);
  console.log('Authenticated:', state.authenticated);
});
```

### Authentication

```javascript
// Authenticate after connection
await wsChat.authenticate(jwtToken);
```

### Load Conversations

```javascript
// Load user's conversations
await wsChat.loadConversations();

// Access conversations via derived store
import { conversations } from '$lib/stores/websocket-chat.js';
$conversations.forEach(conv => {
  console.log(conv.conversation_name);
});
```

### Join Conversation and Load Messages

```javascript
// Join a conversation room
await wsChat.joinConversation('conversation-id-123');

// Load messages for the conversation
await wsChat.loadMessages('conversation-id-123');

// Access messages via derived store
import { messages } from '$lib/stores/websocket-chat.js';
$messages.forEach(msg => {
  console.log(msg.encrypted_content);
});
```

### Send Messages

```javascript
// Send a text message
const result = await wsChat.sendMessage(
  'conversation-id-123',
  'Hello, World!',
  'text'
);

if (result.success) {
  console.log('Message sent:', result.data);
} else {
  console.error('Failed to send:', result.error);
}

// Send a reply
await wsChat.sendMessage(
  'conversation-id-123',
  'This is a reply',
  'text',
  'original-message-id'
);
```

### Typing Indicators

```javascript
// Start typing (with auto-stop after 3 seconds)
wsChat.setTyping('conversation-id-123');

// Manual control
await wsChat.startTyping('conversation-id-123');
await wsChat.stopTyping('conversation-id-123');

// Subscribe to typing updates
import { typingUsers } from '$lib/stores/websocket-chat.js';
$typingUsers.forEach(userId => {
  console.log(`User ${userId} is typing...`);
});
```

### Create Conversations

```javascript
// Create a direct message conversation
const result = await wsChat.createConversation({
  type: 'direct',
  participant_ids: ['other-user-id']
});

// Create a group conversation
const result = await wsChat.createConversation({
  type: 'group',
  name: 'My Group Chat',
  participant_ids: ['user1', 'user2', 'user3']
});
```

## Server Configuration

### Environment Variables

```bash
# WebSocket server port (default: 8080)
WEBSOCKET_PORT=8080

# Supabase configuration (for database access)
SUPABASE_URL=your_supabase_url
SUPABASE_ANON_KEY=your_anon_key
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
```

### Starting the Server

```javascript
import { startWebSocketServer } from '$lib/websocket/server.js';

// Start server with custom options
const server = startWebSocketServer({
  port: 8080
});

// Get server statistics
const stats = server.getStats();
console.log('Active connections:', stats.totalConnections);
```

## Security Features

### Authentication
- JWT token validation on connection
- User session management
- Automatic token refresh handling

### Authorization
- Conversation access control
- Message sending permissions
- Room participation validation

### Data Protection
- Message content validation
- SQL injection prevention
- Rate limiting (planned)

## Real-time Features

### Message Broadcasting
- Instant message delivery to conversation participants
- Typing indicators with automatic cleanup
- User presence updates

### Connection Management
- Automatic reconnection with exponential backoff
- Heartbeat monitoring
- Dead connection cleanup

### Room Management
- Dynamic conversation rooms
- User presence tracking
- Efficient message routing

## Error Handling

### Connection Errors
```javascript
wsChat.subscribe(state => {
  if (state.error) {
    console.error('WebSocket error:', state.error);
    // Handle reconnection or show user notification
  }
});
```

### Message Errors
```javascript
try {
  await wsChat.sendMessage(conversationId, content);
} catch (error) {
  console.error('Failed to send message:', error.message);
  // Show error to user
}
```

### Authentication Errors
```javascript
wsChat.subscribe(state => {
  if (!state.authenticated && state.connected) {
    // Redirect to login or refresh token
    window.location.href = '/auth';
  }
});
```

## Performance Considerations

### Connection Pooling
- Single WebSocket connection per client
- Efficient message multiplexing
- Reduced server resource usage

### Message Batching
- Bulk message loading
- Pagination support
- Optimized database queries

### Memory Management
- Automatic cleanup of dead connections
- Stale typing indicator removal
- Room cleanup when empty

## Testing

### Unit Tests
```bash
# Run WebSocket API tests
pnpm test tests/websocket/
```

### Integration Tests
```bash
# Test with real WebSocket connections
pnpm test:integration
```

### Load Testing
```bash
# Test server performance under load
pnpm test:load
```

## Migration from REST API

### Before (REST + Supabase Real-time)
```javascript
// Load conversations via REST
const response = await fetch('/api/chat/conversations');
const { conversations } = await response.json();

// Subscribe to real-time updates
const channel = supabase
  .channel('conversation:123')
  .on('postgres_changes', { ... }, callback)
  .subscribe();
```

### After (WebSocket API)
```javascript
// Load conversations via WebSocket
await wsChat.loadConversations();

// Real-time updates are automatic
wsChat.subscribe(state => {
  // State updates include new messages, typing, etc.
});
```

## Deployment

### Development
```bash
# Start development server with WebSocket
pnpm run dev
```

### Production
```bash
# Build and start production server
pnpm run build
pnpm run start

# Or use PM2 for process management
pm2 start ecosystem.config.js
```

### Docker
```dockerfile
FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production
COPY . .
EXPOSE 3000 8080
CMD ["npm", "start"]
```

## Monitoring

### Server Statistics
```javascript
const server = getWebSocketServer();
const stats = server.getStats();

console.log({
  totalConnections: stats.totalConnections,
  authenticatedConnections: stats.authenticatedConnections,
  totalRooms: stats.roomStats.totalRooms,
  onlineUsers: stats.roomStats.onlineUsers.length
});
```

### Health Checks
```bash
# Check WebSocket server health
curl -f http://localhost:8080/health || exit 1
```

## Future Enhancements

### Planned Features
- [ ] Message encryption integration
- [ ] File upload support via WebSocket
- [ ] Voice/video call signaling
- [ ] Message reactions and threads
- [ ] Advanced user presence (away, busy, etc.)
- [ ] Message search via WebSocket
- [ ] Push notification integration
- [ ] Rate limiting and abuse prevention

### Performance Improvements
- [ ] Message compression
- [ ] Connection clustering
- [ ] Redis for horizontal scaling
- [ ] CDN integration for file transfers

## Troubleshooting

### Common Issues

1. **Connection Failed**
   - Check WebSocket server is running on correct port
   - Verify firewall settings
   - Check browser WebSocket support

2. **Authentication Failed**
   - Verify JWT token is valid and not expired
   - Check Supabase configuration
   - Ensure user exists in database

3. **Messages Not Received**
   - Check user is joined to conversation room
   - Verify conversation permissions
   - Check for connection drops

### Debug Mode
```javascript
// Enable debug logging
localStorage.setItem('websocket-debug', 'true');
wsChat.connect(token);
```

### Server Logs
```bash
# View WebSocket server logs
tail -f logs/websocket.log
```

## Support

For issues and questions:
- Check the troubleshooting section above
- Review server logs for error details
- Test with the provided unit tests
- Verify database schema and permissions

## License

This WebSocket Chat API is part of the QryptChat project and follows the same licensing terms.