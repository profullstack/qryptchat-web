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

// Handle WebSocket upgrade requests
server.on('upgrade', (request, socket, head) => {
	// Only upgrade requests to /ws path
	if (request.url !== '/ws') {
		socket.destroy();
		return;
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