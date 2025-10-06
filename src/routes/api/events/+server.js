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
export async function GET(event) {
	console.log('📡 [SSE] New connection request');

	try {
		// Authenticate the user using getUser() for security
		const supabase = createSupabaseServerClient(event);
		const { data: { user }, error: authError } = await supabase.auth.getUser();

		if (authError || !user) {
			console.error('📡 [SSE] Authentication failed:', authError?.message || 'No user');
			return new Response('Unauthorized', { status: 401 });
		}

		const authUserId = user.id;
		console.log(`📡 [SSE] Auth user ${authUserId} authenticated`);

		// Get internal user ID from auth user ID
		const { data: userData, error: userError } = await supabase
			.from('users')
			.select('id')
			.eq('auth_user_id', authUserId)
			.single();

		if (userError || !userData) {
			console.error('📡 [SSE] User lookup failed:', userError);
			return new Response('User not found', { status: 404 });
		}

		const userId = userData.id;
		console.log(`📡 [SSE] Internal user ID: ${userId}`);

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

				// Add connection to SSE manager with internal user ID
				sseManager.addConnection(responseWriter, userId);

				// Send initial connection success message
				const welcomeMessage = sseManager.formatSSEMessage('CONNECTED', {
					userId,
					timestamp: new Date().toISOString()
				});
				responseWriter.write(welcomeMessage);

				// Handle client disconnect
				event.request.signal.addEventListener('abort', () => {
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
	} catch (error) {
		console.error('📡 [SSE] Fatal error:', error);
		const errorMessage = error instanceof Error ? error.message : 'Unknown error';
		return new Response(JSON.stringify({ error: 'Internal server error', details: errorMessage }), {
			status: 500,
			headers: { 'Content-Type': 'application/json' }
		});
	}
}