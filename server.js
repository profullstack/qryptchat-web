/**
 * @fileoverview Production server for QryptChat
 * Integrates SvelteKit with WebSocket server for real-time chat functionality
 */

import { createServer } from 'node:http';
import { handler } from './build/handler.js';
import { WebSocketServer } from 'ws';
import { ChatWebSocketServer } from './src/lib/websocket/server.js';
import { messageCleanupService } from './src/lib/services/message-cleanup-service.js';

// Create HTTP server that delegates all non-WS requests to SvelteKit
const server = createServer((req, res) => {
	// SvelteKit handles all HTTP requests
	handler(req, res);
});

// Create WebSocket server in "noServer" mode for manual upgrade handling
const wss = new WebSocketServer({ noServer: true });

// Create our chat WebSocket server instance
const chatServer = new ChatWebSocketServer({ 
	wss, // Pass the WebSocket server instance
	noListen: true // Don't create its own server
});

// Per-IP WebSocket connection rate limiting
const wsConnectionCounts = new Map(); // ip -> { count, firstSeen }
const WS_MAX_CONNECTIONS_PER_IP = 10;
const WS_RATE_WINDOW_MS = 60 * 1000; // 1 minute

function getClientIp(request) {
	return request.headers['x-forwarded-for']?.split(',')[0]?.trim() ||
		request.socket?.remoteAddress || 'unknown';
}

// Clean up stale entries every 5 minutes
setInterval(() => {
	const now = Date.now();
	for (const [ip, data] of wsConnectionCounts) {
		if (now - data.firstSeen > WS_RATE_WINDOW_MS) {
			wsConnectionCounts.delete(ip);
		}
	}
}, 5 * 60 * 1000);

// Handle WebSocket upgrade requests with per-IP rate limiting
server.on('upgrade', (request, socket, head) => {
	// Only upgrade requests to /ws path
	if (request.url !== '/ws') {
		socket.destroy();
		return;
	}

	// Rate limit by IP
	const ip = getClientIp(request);
	const now = Date.now();
	const record = wsConnectionCounts.get(ip);

	if (record) {
		if (now - record.firstSeen > WS_RATE_WINDOW_MS) {
			// Window expired, reset
			wsConnectionCounts.set(ip, { count: 1, firstSeen: now });
		} else if (record.count >= WS_MAX_CONNECTIONS_PER_IP) {
			console.warn(`⚠️ WebSocket rate limit exceeded for IP: ${ip}`);
			socket.write('HTTP/1.1 429 Too Many Requests\r\n\r\n');
			socket.destroy();
			return;
		} else {
			record.count++;
		}
	} else {
		wsConnectionCounts.set(ip, { count: 1, firstSeen: now });
	}

	// Handle the upgrade using our WebSocket server
	wss.handleUpgrade(request, socket, head, (ws) => {
		// Use our chat server's connection handler
		chatServer.handleConnection(ws, request);
	});
});

// Graceful shutdown handling
const shutdown = () => {
	console.log('Shutting down server...');
	
	// Stop message cleanup service
	messageCleanupService.stop();
	
	// Close WebSocket server
	wss.close(() => {
		console.log('WebSocket server closed');
	});
	
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
	console.log(`📡 WebSocket endpoint available at ws://localhost:${PORT}/ws`);
	
	// Start message cleanup service after server is running
	setTimeout(() => {
		messageCleanupService.start();
	}, 2000);
});