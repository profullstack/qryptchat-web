import { NextResponse } from 'next/server';

// WebSocket handling in Next.js is done differently
// For full WebSocket support, use a custom server or a service like Pusher/Ably
// This endpoint returns 426 Upgrade Required

export async function GET(request) {
  const upgrade = request.headers.get('upgrade');
  if (upgrade !== 'websocket') {
    return NextResponse.json(
      { error: 'WebSocket connections are handled by the external WebSocket server' },
      { status: 426 }
    );
  }
  return NextResponse.json({ error: 'Use the SSE endpoint (/api/events) for real-time updates' }, { status: 426 });
}
