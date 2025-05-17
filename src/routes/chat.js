/**
 * Chat route handler
 * This route provides information about the E2EE chat service
 */
export const chatRoute = {
  method: 'GET',
  path: '/api/1/chat',
  handler: async (c) => {
    // Get the WebSocket port from the environment or use default (port + 1)
    const serverPort = parseInt(process.env.PORT || '3000');
    const wsPort = serverPort + 1;
    
    return c.json({
      status: 'ok',
      message: 'Quantum-resistant E2EE chat service is running',
      endpoint: '/api/1/chat',
      websocket: {
        url: `ws://${c.req.headers.get('host')?.split(':')[0] || 'localhost'}:${wsPort}`,
        info: 'Connect to this WebSocket endpoint for real-time chat'
      },
      encryption: {
        keyExchange: 'CRYSTALS-Kyber (quantum-resistant KEM)',
        messageEncryption: 'AES-GCM (using shared secret from Kyber)',
        info: 'End-to-end encrypted chat with post-quantum security'
      }
    });
  }
};