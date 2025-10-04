/**
 * @fileoverview SSE Events Endpoint
 * Handles Server-Sent Events connections for real-time updates
 */

import { sseManager } from '$lib/api/sse-manager.js';
import { createSupabaseServerClient } from '$lib/supabase.js';

/**
 * GET handler for SSE connections
 * Establishes a Server-Sent Events stream for real-time updates
 */
export async function GET({ request, cookies }) {
	console.log('📡 [SSE] New connection request');

	// Authenticate the user
	const supabase = createSupabaseServerClient(cookies);
	const { data: { session }, error: sessionError } = await supabase.auth.getSession();

	if (sessionError || !session) {
		console.error('📡 [SSE] Authentication failed:', sessionError?.message);
		return new Response('Unauthorized', { status: 401 });
	}

	const userId = session.user.id;
	console.log(`📡 [SSE] User ${userId} authenticated`);

	// Create a readable stream for SSE
	const stream = new ReadableStream({
		start(controller) {
			// Create a response writer that wraps the controller
			const responseWriter = {
				write(data) {
					try {
						controller.enqueue(new TextEncoder().encode(data));
					} catch (error) {
						console.error('📡 [SSE] Write error:', error);
					}
				},
				close() {
					try {
						controller.close();
					} catch (error) {
						console.error('📡 [SSE] Close error:', error);
					}
				}
			};

			// Add connection to SSE manager
			sseManager.addConnection(responseWriter, userId);

			// Send initial connection success message
			const welcomeMessage = sseManager.formatSSEMessage('CONNECTED', {
				userId,
				timestamp: new Date().toISOString()
			});
			responseWriter.write(welcomeMessage);

			// Handle client disconnect
			request.signal.addEventListener('abort', () => {
				console.log(`📡 [SSE] Client ${userId} disconnected`);
				sseManager.removeConnection(responseWriter);
			});
		},

		cancel() {
			console.log(`📡 [SSE] Stream cancelled for user ${userId}`);
		}
	});

	// Return SSE response with appropriate headers
	return new Response(stream, {
		headers: {
			'Content-Type': 'text/event-stream',
			'Cache-Control': 'no-cache, no-transform',
			'Connection': 'keep-alive',
			'X-Accel-Buffering': 'no' // Disable nginx buffering
		}
	});
}