/**
 * @fileoverview SvelteKit WebSocket endpoint
 * Handles WebSocket upgrade requests and integrates with the chat WebSocket server
 */

import { dev } from '$app/environment';
import { ChatWebSocketServer } from '$lib/websocket/server.js';

// Global server instance for development
let wsServer = null;

/**
 * Handle WebSocket upgrade requests
 * @param {Object} event - SvelteKit request event
 */
export async function GET(event) {
	const { request, url } = event;

	// Check if this is a WebSocket upgrade request
	const upgrade = request.headers.get('upgrade');
	if (upgrade !== 'websocket') {
		return new Response('Expected WebSocket upgrade', { status: 426 });
	}

	try {
		// In development, use a single server instance
		// In production, this would typically be handled by a separate WebSocket server
		if (dev) {
			if (!wsServer) {
				wsServer = new ChatWebSocketServer({ port: 8080 });
				wsServer.start();
			}

			// Return upgrade response
			return new Response('WebSocket server running on port 8080', {
				status: 200,
				headers: {
					'Content-Type': 'text/plain'
				}
			});
		}

		// In production, redirect to WebSocket server
		const wsUrl = url.protocol === 'https:' ? 'wss:' : 'ws:';
		const wsPort = process.env.WEBSOCKET_PORT || '8080';
		const redirectUrl = `${wsUrl}//${url.hostname}:${wsPort}`;

		return new Response(`WebSocket server available at: ${redirectUrl}`, {
			status: 200,
			headers: {
				'Content-Type': 'text/plain',
				'X-WebSocket-URL': redirectUrl
			}
		});

	} catch (error) {
		console.error('WebSocket endpoint error:', error);
		return new Response('WebSocket server error', { status: 500 });
	}
}

/**
 * Handle POST requests for WebSocket server control
 * @param {Object} event - SvelteKit request event
 */
export async function POST(event) {
	if (!dev) {
		return new Response('Not available in production', { status: 403 });
	}

	try {
		const { action } = await event.request.json();

		switch (action) {
			case 'start':
				if (!wsServer) {
					wsServer = new ChatWebSocketServer({ port: 8080 });
					wsServer.start();
					return new Response(JSON.stringify({ 
						success: true, 
						message: 'WebSocket server started',
						stats: wsServer.getStats()
					}), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				return new Response(JSON.stringify({ 
					success: false, 
					message: 'WebSocket server already running',
					stats: wsServer.getStats()
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			case 'stop':
				if (wsServer) {
					wsServer.stop();
					wsServer = null;
					return new Response(JSON.stringify({ 
						success: true, 
						message: 'WebSocket server stopped' 
					}), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				return new Response(JSON.stringify({ 
					success: false, 
					message: 'WebSocket server not running' 
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			case 'stats':
				if (wsServer) {
					return new Response(JSON.stringify({ 
						success: true, 
						stats: wsServer.getStats() 
					}), {
						headers: { 'Content-Type': 'application/json' }
					});
				}
				return new Response(JSON.stringify({ 
					success: false, 
					message: 'WebSocket server not running' 
				}), {
					headers: { 'Content-Type': 'application/json' }
				});

			default:
				return new Response(JSON.stringify({ 
					success: false, 
					message: 'Unknown action' 
				}), {
					status: 400,
					headers: { 'Content-Type': 'application/json' }
				});
		}

	} catch (error) {
		console.error('WebSocket control error:', error);
		return new Response(JSON.stringify({ 
			success: false, 
			message: 'Server error' 
		}), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}