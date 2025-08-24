import { WebSocketServer } from 'ws';
import { ChatWebSocketServer } from '../src/lib/websocket/server.js';
import { readFileSync } from 'fs';
import { join } from 'path';

/**
 * Load environment variables from .env file
 */
function loadEnvFile() {
  try {
    const envPath = join(process.cwd(), '.env');
    const envContent = readFileSync(envPath, 'utf8');
    
    envContent.split('\n').forEach(line => {
      const trimmed = line.trim();
      if (trimmed && !trimmed.startsWith('#')) {
        const [key, ...valueParts] = trimmed.split('=');
        if (key && valueParts.length > 0) {
          const value = valueParts.join('=').replace(/^["']|["']$/g, '');
          process.env[key.trim()] = value;
        }
      }
    });
  } catch (error) {
    console.warn('Could not load .env file:', error.message);
  }
}

/**
 * Vite plugin to run WebSocket server in development mode
 */
export function websocketDev() {
  let chatServer = null;

  const setupWebSocket = (httpServer) => {
    if (!httpServer || chatServer) return;
    
    try {
      console.log('🔧 Starting WebSocket server for development...');
      
      // Load environment variables from .env file
      loadEnvFile();
      
      // Debug environment variables
      console.log('🔍 Environment check:', {
        supabaseUrl: !!process.env.PUBLIC_SUPABASE_URL,
        supabaseKey: !!process.env.PUBLIC_SUPABASE_ANON_KEY,
        nodeEnv: process.env.NODE_ENV
      });
      
      // Create WebSocket server that shares the HTTP server
      const wss = new WebSocketServer({
        server: httpServer,
        path: '/ws'
      });
      
      // Initialize our chat WebSocket server with the external WebSocket server
      chatServer = new ChatWebSocketServer({
        wss: wss,
        noListen: true // Don't create own server, use the provided one
      });
      
      // Set up connection handling
      wss.on('connection', (ws, request) => {
        chatServer.handleConnection(ws, request);
      });
      
      chatServer.start();
      
      const port = httpServer.address()?.port || 5173;
      console.log(`📡 WebSocket server ready at ws://localhost:${port}/ws`);
      
      // Handle server shutdown
      const cleanup = () => {
        if (chatServer) {
          console.log('🔌 Shutting down WebSocket server...');
          chatServer.stop();
          chatServer = null;
        }
      };
      
      process.on('SIGTERM', cleanup);
      process.on('SIGINT', cleanup);
      process.on('exit', cleanup);
      
    } catch (error) {
      console.error('❌ Failed to start WebSocket server:', error);
    }
  };

  return {
    name: 'websocket-dev',
    configureServer(server) {
      // Set up WebSocket server when Vite server is ready
      server.middlewares.use('/ws', (req, res, next) => {
        // This middleware won't handle WebSocket upgrades directly,
        // but ensures the /ws path is recognized
        next();
      });

      // Wait for server to be ready, then set up WebSocket
      server.httpServer?.on('listening', () => {
        setupWebSocket(server.httpServer);
      });
    },
    
    configurePreviewServer(server) {
      // Also support preview mode
      server.httpServer?.on('listening', () => {
        setupWebSocket(server.httpServer);
      });
    }
  };
}