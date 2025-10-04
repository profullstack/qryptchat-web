# WebSocket to POST + SSE Implementation Guide

## Progress Status

### ✅ Completed
1. **SSE Infrastructure** - [`src/lib/api/sse-manager.js`](src/lib/api/sse-manager.js:1)
   - Connection management
   - Room/conversation management
   - Broadcasting utilities
   - Keep-alive mechanism

2. **Protocol Utilities** - [`src/lib/api/protocol.js`](src/lib/api/protocol.js:1)
   - Message type constants
   - Message creation helpers
   - Validation functions
   - SSE formatting

3. **SSE Events Endpoint** - [`src/routes/api/events/+server.js`](src/routes/api/events/+server.js:1)
   - Real-time event stream
   - Authentication
   - Connection lifecycle management

### 🔄 In Progress / Remaining

## Implementation Steps

### Step 1: Create Authentication Middleware

Create `src/lib/api/middleware/auth.js`:

```javascript
/**
 * @fileoverview API authentication middleware
 * Handles JWT token validation for API requests
 */

import { createSupabaseServerClient } from '$lib/supabase.js';

/**
 * Authenticate API request
 * @param {Object} event - SvelteKit request event
 * @returns {Promise<{success: boolean, user?: Object, supabase?: Object, error?: string}>}
 */
export async function authenticateRequest(event) {
	try {
		const supabase = createSupabaseServerClient(event);
		const { data: { session }, error } = await supabase.auth.getSession();

		if (error || !session) {
			return {
				success: false,
				error: 'Unauthorized'
			};
		}

		return {
			success: true,
			user: session.user,
			supabase
		};
	} catch (error) {
		console.error('Authentication error:', error);
		return {
			success: false,
			error: 'Authentication failed'
		};
	}
}

/**
 * Middleware wrapper for authenticated routes
 * @param {Function} handler - Route handler function
 * @returns {Function} Wrapped handler
 */
export function withAuth(handler) {
	return async (event) => {
		const auth = await authenticateRequest(event);
		
		if (!auth.success) {
			return new Response(JSON.stringify({ error: auth.error }), {
				status: 401,
				headers: { 'Content-Type': 'application/json' }
			});
		}

		// Add auth info to event locals
		event.locals.user = auth.user;
		event.locals.supabase = auth.supabase;

		return handler(event);
	};
}
```

### Step 2: Create Message API Endpoints

#### Send Message: `src/routes/api/messages/send/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId, content, encryptedContent, fileUrl, fileName, fileSize, replyTo } = await request.json();

		if (!conversationId || (!content && !encryptedContent)) {
			return json({ error: 'Missing required fields' }, { status: 400 });
		}

		const { supabase, user } = locals;

		// Insert message into database
		const { data: message, error } = await supabase
			.from('messages')
			.insert({
				conversation_id: conversationId,
				sender_id: user.id,
				content,
				encrypted_content: encryptedContent,
				file_url: fileUrl,
				file_name: fileName,
				file_size: fileSize,
				reply_to: replyTo
			})
			.select()
			.single();

		if (error) {
			console.error('Failed to send message:', error);
			return json({ error: 'Failed to send message' }, { status: 500 });
		}

		// Broadcast new message to conversation participants via SSE
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.NEW_MESSAGE, {
			message
		}, user.id);

		return json({
			success: true,
			message
		});
	} catch (error) {
		console.error('Send message error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});
```

#### Load Messages: `src/routes/api/messages/load/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId, limit = 50, before } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { supabase, user } = locals;

		// Build query
		let query = supabase
			.from('messages')
			.select('*')
			.eq('conversation_id', conversationId)
			.order('created_at', { ascending: false })
			.limit(limit);

		if (before) {
			query = query.lt('created_at', before);
		}

		const { data: messages, error } = await query;

		if (error) {
			console.error('Failed to load messages:', error);
			return json({ error: 'Failed to load messages' }, { status: 500 });
		}

		// Join conversation room for real-time updates
		sseManager.joinRoom(user.id, conversationId);

		return json({
			success: true,
			messages: messages.reverse(),
			hasMore: messages.length === limit
		});
	} catch (error) {
		console.error('Load messages error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});
```

### Step 3: Create Conversation API Endpoints

#### Create Conversation: `src/routes/api/conversations/create/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { participantIds, name, isGroup } = await request.json();

		if (!participantIds || !Array.isArray(participantIds)) {
			return json({ error: 'Missing or invalid participantIds' }, { status: 400 });
		}

		const { supabase, user } = locals;

		// For direct conversations, check if one already exists
		if (!isGroup && participantIds.length === 1) {
			const otherUserId = participantIds[0];
			
			// Check for existing direct conversation
			const { data: existing } = await supabase
				.from('conversations')
				.select('*, participants(*)')
				.eq('is_group', false)
				.filter('participants.user_id', 'in', `(${user.id},${otherUserId})`)
				.single();

			if (existing) {
				sseManager.joinRoom(user.id, existing.id);
				return json({ success: true, conversation: existing });
			}
		}

		// Create new conversation
		const { data: conversation, error: convError } = await supabase
			.from('conversations')
			.insert({
				name,
				is_group: isGroup || false,
				created_by: user.id
			})
			.select()
			.single();

		if (convError) {
			console.error('Failed to create conversation:', convError);
			return json({ error: 'Failed to create conversation' }, { status: 500 });
		}

		// Add participants
		const allParticipants = [user.id, ...participantIds];
		const participantInserts = allParticipants.map(userId => ({
			conversation_id: conversation.id,
			user_id: userId
		}));

		const { error: partError } = await supabase
			.from('conversation_participants')
			.insert(participantInserts);

		if (partError) {
			console.error('Failed to add participants:', partError);
			return json({ error: 'Failed to add participants' }, { status: 500 });
		}

		// Join room
		sseManager.joinRoom(user.id, conversation.id);

		// Notify other participants
		for (const participantId of participantIds) {
			sseManager.sendToUser(participantId, MESSAGE_TYPES.CONVERSATION_CREATED, {
				conversation
			});
		}

		return json({
			success: true,
			conversation
		});
	} catch (error) {
		console.error('Create conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});
```

#### Load Conversations: `src/routes/api/conversations/load/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';

export const POST = withAuth(async ({ locals }) => {
	try {
		const { supabase, user } = locals;

		// Load user's conversations
		const { data: conversations, error } = await supabase
			.from('conversations')
			.select(`
				*,
				participants:conversation_participants(
					user_id,
					user:profiles(*)
				),
				last_message:messages(*)
			`)
			.order('updated_at', { ascending: false });

		if (error) {
			console.error('Failed to load conversations:', error);
			return json({ error: 'Failed to load conversations' }, { status: 500 });
		}

		return json({
			success: true,
			conversations
		});
	} catch (error) {
		console.error('Load conversations error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});
```

#### Join Conversation: `src/routes/api/conversations/join/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { user } = locals;

		// Join SSE room for real-time updates
		sseManager.joinRoom(user.id, conversationId);

		return json({ success: true });
	} catch (error) {
		console.error('Join conversation error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});
```

### Step 4: Create Typing Indicator Endpoints

#### Start Typing: `src/routes/api/typing/start/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { user } = locals;

		// Broadcast typing indicator to conversation
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.USER_TYPING, {
			userId: user.id,
			conversationId,
			isTyping: true
		}, user.id);

		return json({ success: true });
	} catch (error) {
		console.error('Start typing error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});
```

#### Stop Typing: `src/routes/api/typing/stop/+server.js`

```javascript
import { json } from '@sveltejs/kit';
import { withAuth } from '$lib/api/middleware/auth.js';
import { sseManager } from '$lib/api/sse-manager.js';
import { MESSAGE_TYPES } from '$lib/api/protocol.js';

export const POST = withAuth(async ({ request, locals }) => {
	try {
		const { conversationId } = await request.json();

		if (!conversationId) {
			return json({ error: 'Missing conversationId' }, { status: 400 });
		}

		const { user } = locals;

		// Broadcast typing stopped to conversation
		sseManager.broadcastToRoom(conversationId, MESSAGE_TYPES.USER_TYPING, {
			userId: user.id,
			conversationId,
			isTyping: false
		}, user.id);

		return json({ success: true });
	} catch (error) {
		console.error('Stop typing error:', error);
		return json({ error: 'Internal server error' }, { status: 500 });
	}
});
```

### Step 5: Update server.js

Remove WebSocket server and start SSE keep-alive:

```javascript
/**
 * @fileoverview Production server for QryptChat
 * Integrates SvelteKit with SSE for real-time chat functionality
 */

import { createServer } from 'node:http';
import { handler } from './build/handler.js';
import { sseManager } from './src/lib/api/sse-manager.js';
import { messageCleanupService } from './src/lib/services/message-cleanup-service.js';

// Create HTTP server that delegates all requests to SvelteKit
const server = createServer((req, res) => {
	handler(req, res);
});

// Start SSE keep-alive
sseManager.startKeepAlive(30000); // 30 seconds

// Graceful shutdown handling
const shutdown = () => {
	console.log('Shutting down server...');
	
	// Stop message cleanup service
	messageCleanupService.stop();
	
	// Stop SSE keep-alive and cleanup connections
	sseManager.stopKeepAlive();
	sseManager.cleanup();
	
	// Close HTTP server
	server.close(() => {
		console.log('HTTP server closed');
		process.exit(0);
	});
};

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);

// Start the server
const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
	console.log(`🚀 QryptChat server running on http://localhost:${PORT}`);
	console.log(`📡 SSE endpoint available at http://localhost:${PORT}/api/events`);
	
	// Start message cleanup service after server is running
	setTimeout(() => {
		messageCleanupService.start();
	}, 2000);
});
```

### Step 6: Update Client-Side Chat Store

Key changes needed in `src/lib/stores/websocket-chat.js`:

1. Rename file to `src/lib/stores/chat.js`
2. Replace WebSocket with EventSource for receiving
3. Replace `ws.send()` with `fetch()` for sending
4. Update connection management

Example structure:

```javascript
// Connection
let eventSource = null;

function connect(token) {
	if (eventSource?.readyState === EventSource.OPEN) {
		return;
	}

	const url = `/api/events?token=${token}`;
	eventSource = new EventSource(url);

	eventSource.addEventListener('message', handleMessage);
	eventSource.addEventListener('error', handleError);
	eventSource.addEventListener('CONNECTED', () => {
		update(state => ({ ...state, connected: true }));
	});
}

// Sending messages
async function sendMessage(conversationId, content) {
	const response = await fetch('/api/messages/send', {
		method: 'POST',
		headers: { 'Content-Type': 'application/json' },
		body: JSON.stringify({ conversationId, content })
	});
	return response.json();
}
```

## Next Steps

1. Create all API endpoint files as shown above
2. Create authentication middleware
3. Update server.js
4. Refactor client-side store
5. Update WebRTC signaling (consider hybrid approach)
6. Test thoroughly
7. Remove WebSocket dependencies

## Testing Checklist

- [ ] SSE connection establishment
- [ ] SSE reconnection on disconnect
- [ ] Message sending via POST
- [ ] Message receiving via SSE
- [ ] Typing indicators
- [ ] Conversation creation
- [ ] Multiple simultaneous connections
- [ ] Keep-alive mechanism
- [ ] Authentication flow
- [ ] Error handling

## Notes

- TypeScript errors in JavaScript files are expected and can be ignored
- SSE has browser connection limits (typically 6 per domain)
- Consider WebRTC data channels for call signaling
- Test with multiple browser tabs to verify broadcasting