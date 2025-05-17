import { Hono } from 'hono';
import { serve } from '@hono/node-server';
import { serveStatic } from '@hono/node-server/serve-static';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenvFlow from 'dotenv-flow';
import fs from 'fs';
import { WebSocketServer } from 'ws';

import { registerRoutes } from './routes/index.js';
import { errorHandler } from './middleware/error-handler.js';
import { enableSafeHttpDebugging } from './utils/safe-http-debug.js';

// Enable HTTP debugging for detailed request/response logging
console.log('Enabling HTTP debugging for detailed request/response logging');
enableSafeHttpDebugging();

// Load environment variables
dotenvFlow.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const publicPath = path.resolve(__dirname, '../public');

console.log('Starting server...');
console.log('Current directory:', process.cwd());
console.log('__dirname:', __dirname);
console.log('Public directory:', publicPath);
console.log('Public directory exists:', fs.existsSync(publicPath));

if (fs.existsSync(publicPath)) {
  console.log('Files in public directory:');
  fs.readdirSync(publicPath).forEach(file => {
    console.log(`- ${file}`);
  });
}

// Create Hono app for both static files and API endpoints
const app = new Hono();

// Add CORS middleware
app.use('*', async (c, next) => {
  // Add CORS headers to all responses
  c.header('Access-Control-Allow-Origin', '*');
  c.header('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  c.header('Access-Control-Allow-Headers', 'Content-Type, Authorization, Accept');
  c.header('Access-Control-Max-Age', '86400'); // 24 hours
  
  // Handle OPTIONS requests (preflight)
  if (c.req.method === 'OPTIONS') {
    return c.text('', 204);
  }
  
  await next();
});

// Log when requests are received and add cache control headers
app.use('*', async (c, next) => {
  console.log(`Request for: ${c.req.path}`);
  
  // Add cache control headers to prevent caching for SPA routes
  c.header('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
  c.header('Pragma', 'no-cache');
  c.header('Expires', '0');
  c.header('Surrogate-Control', 'no-store');
  
  // Handle SPA routes (paths without extensions)
  const reqPath = c.req.path;
  
  // First check if this is a request for a view HTML file
  if (reqPath.startsWith('/views/') && reqPath.endsWith('.html')) {
    console.log(`View HTML file request detected: ${reqPath}`);
    // Let this pass through to the static file middleware
    await next();
    return;
  }
  
  // Then handle SPA routes
  if (reqPath !== '/' && !reqPath.includes('.') && !reqPath.startsWith('/api/')) {
    console.log(`SPA route detected: ${reqPath}`);
    try {
      const indexPath = path.resolve(__dirname, '../public/index.html');
      const content = fs.readFileSync(indexPath, 'utf-8');
      return c.html(content);
    } catch (error) {
      console.error(`Error serving index.html: ${error.message}`);
    }
  }
  
  await next();
});

// Global error handler middleware
app.use('*', errorHandler);

// Register all API routes
registerRoutes(app);

// Add a direct Stripe checkout handler for emergencies
import Stripe from 'stripe';

// Initialize Stripe with minimal configuration
const stripeDirectClient = new Stripe(process.env.STRIPE_SECRET_KEY, {
  apiVersion: '2023-10-16'
});

// Ultra-minimal Stripe checkout using pure fetch - no packages, no database, just API calls
app.post('/api/stripe-simple/create-checkout', async (c) => {
  try {
    console.log('Creating simple checkout session using fetch...');
    
    // Parse request
    const body = await c.req.json();
    const { email, plan } = body;
    
    // Get price ID from environment variables
    const priceId = plan === 'monthly' 
      ? process.env.STRIPE_MONTHLY_PRICE_ID 
      : process.env.STRIPE_YEARLY_PRICE_ID;
    
    if (!priceId) {
      throw new Error('Price ID not configured');
    }
    
    // Use fetch to directly call Stripe API - don't use any Stripe packages
    const response = await fetch('https://api.stripe.com/v1/checkout/sessions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.STRIPE_SECRET_KEY}`,
        'Content-Type': 'application/x-www-form-urlencoded'
      },
      body: new URLSearchParams({
        'mode': 'subscription',
        'success_url': 'https://qrypt.chat/dashboard?success=true',
        'cancel_url': 'https://qrypt.chat/register?canceled=true',
        'customer_email': email, // Pre-fill customer email in checkout
        'line_items[0][price]': priceId,
        'line_items[0][quantity]': '1'
      })
    });
    
    if (!response.ok) {
      const errorData = await response.json();
      throw new Error(`Stripe API error: ${errorData.error?.message || response.statusText}`);
    }
    
    // Parse the Stripe API response
    const session = await response.json();
    
    // Return minimal response with just ID and URL
    return c.json({
      id: session.id,
      checkout_url: session.url,
      url: session.url
    });
  } catch (error) {
    console.error('Simple checkout error:', error.message);
    return c.json({
      error: 'Payment processing error',
      message: error.message
    }, 500);
  }
});

// Keep the direct checkout as a fallback
app.post('/api/stripe-direct/create-checkout', async (c) => {
  try {
    console.log('Creating direct checkout session...');
    
    // Parse request
    const body = await c.req.json();
    const { email, plan } = body;
    
    // Get price ID
    const priceId = plan === 'monthly' 
      ? process.env.STRIPE_MONTHLY_PRICE_ID 
      : process.env.STRIPE_YEARLY_PRICE_ID;
    
    // Directly create session with minimal params
    const session = await stripeDirectClient.checkout.sessions.create({
      mode: 'subscription',
      success_url: 'https://qrypt.chat/dashboard?success=true',
      cancel_url: 'https://qrypt.chat/register?canceled=true',
      customer_email: email, // Pre-fill customer email in checkout
      line_items: [{ price: priceId, quantity: 1 }]
    });
    
    // Return minimal response with just ID and URL
    return c.json({
      id: session.id,
      checkout_url: session.url,
      url: session.url
    });
  } catch (error) {
    console.error('Direct checkout error:', error.message);
    return c.json({
      error: 'Payment processing error',
      message: error.message
    }, 500);
  }
});

// Health check endpoint
app.get('/', async (c) => {
  // If the request accepts HTML, serve the index.html file directly
  if (c.req.header('accept')?.includes('text/html')) {
    try {
      const indexPath = path.resolve(__dirname, '../public/index.html');
      const content = fs.readFileSync(indexPath, 'utf-8');
      return c.html(content);
    } catch (error) {
      console.error(`Error serving index.html: ${error.message}`);
      return c.text('Internal Server Error', 500);
    }
  }
  
  // Otherwise, return a JSON response
  return c.json({
    status: 'ok',
    message: 'E2E encrypted chat service is running',
    version: process.env.npm_package_version || '1.0.0'
  });
});

// Serve static files from the public directory, but skip API routes
app.use('*', async (c, next) => {
  const reqPath = c.req.path;
  
  // Skip API routes
  if (reqPath.startsWith('/api/')) {
    return next();
  }
  
  // Use the static file middleware for non-API routes
  console.log(`Attempting to serve static file: ${reqPath} from ./public`);
  
  // Check if the file exists before serving it
  const filePath = path.join(process.cwd(), 'public', reqPath);
  if (fs.existsSync(filePath)) {
    console.log(`File exists: ${filePath}`);
  } else {
    console.log(`File does not exist: ${filePath}`);
  }
  
  return serveStatic({
    root: './public',
    rewriteRequestPath: (path) => {
      console.log(`Static file request for: ${path}`);
      return path;
    }
  })(c, next);
});

// SPA fallback for routes that don't match any static files
app.get('*', async (c) => {
  const reqPath = c.req.path;
  
  // Add detailed logging for API routes
  if (reqPath.startsWith('/api/')) {
    console.log(`API route not found: ${reqPath}`);
    return c.json({
      error: 'API endpoint not found',
      path: reqPath
    }, 404);
  }
  
  // Skip files with extensions
  if (reqPath.includes('.')) {
    return c.notFound();
  }
  
  console.log(`SPA fallback for: ${reqPath}`);
  
  // Serve index.html for client-side routes
  try {
    const indexPath = path.resolve(__dirname, '../public/index.html');
    const content = fs.readFileSync(indexPath, 'utf-8');
    return c.html(content);
  } catch (error) {
    console.error(`Error serving index.html: ${error.message}`);
    return c.text('Internal Server Error', 500);
  }
});

// Start the server
const port = process.env.PORT || 3000;
const startServer = (portToUse) => {
  try {
    serve({
      fetch: app.fetch,
      port: portToUse
    }, (info) => {
      console.log(`Server running at http://localhost:${info.port}`);
      console.log('Available endpoints:');
      console.log(`- WebSocket: http://localhost:${info.port}/api/1/ws`);
      console.log(`- Chat API: http://localhost:${info.port}/api/1/chat`);
      console.log(`- Chat UI: http://localhost:${info.port}/chat`);
      console.log(`- Subscription: http://localhost:${info.port}/api/1/subscription`);
      console.log(`- Subscription Status: http://localhost:${info.port}/api/1/subscription-status`);
      console.log(`- Stripe Checkout: http://localhost:${info.port}/api/1/payments/stripe/create-checkout-session`);
      console.log(`- Stripe Webhook: http://localhost:${info.port}/api/1/payments/stripe/webhook`);
      console.log(`- Stripe Subscription: http://localhost:${info.port}/api/1/payments/stripe/subscription`);
      console.log(`- Stripe Cancel: http://localhost:${info.port}/api/1/payments/stripe/cancel-subscription`);
      console.log(`- Payment Callback: http://localhost:${info.port}/api/1/payments/cryptapi/callback`);
      console.log(`- Payment Logs: http://localhost:${info.port}/api/1/payments/cryptapi/logs`);
      console.log(`- Web interface: http://localhost:${info.port}`);
      
      // Create a separate WebSocket server on a different port
      const wsPort = parseInt(portToUse) + 1;
      startWebSocketServer(wsPort);
    });
  } catch (err) {
    if (err.code === 'EADDRINUSE') {
      console.log(`Port ${portToUse} is already in use, trying ${portToUse + 2}...`);
      startServer(portToUse + 2);
    } else {
      console.error('Server error:', err);
    }
  }
};

// Try to start the server on the initial port
startServer(port);

// Function to start the WebSocket server
function startWebSocketServer(wsPort) {
  try {
    // Create a separate WebSocket server
    const wss = new WebSocketServer({ port: wsPort });
    
    // Store connected clients
    const clients = new Set();
    
    // Handle WebSocket connections
    wss.on('connection', (ws) => {
      console.log('WebSocket connection established');
      
      // Add client to the set
      clients.add(ws);
      
      // Send a welcome message
      const welcomeMessage = JSON.stringify({
        type: 'system',
        content: 'Connected to WebSocket server'
      });
      ws.send(welcomeMessage);
      
      // Handle messages
      ws.on('message', (message) => {
        try {
          console.log(`Received message: ${message}`);
          
          // Parse the message
          const parsedMessage = JSON.parse(message);
          
          // Handle different message types
          switch (parsedMessage.type) {
            case 'key_exchange':
              // Forward key exchange message to all other clients
              forwardMessage(ws, parsedMessage);
              break;
            
            case 'chat_message':
              // Forward chat message to all other clients
              forwardMessage(ws, parsedMessage);
              break;
            
            default:
              console.warn('Unknown message type:', parsedMessage.type);
              ws.send(JSON.stringify({
                type: 'system',
                content: `Unknown message type: ${parsedMessage.type}`
              }));
          }
        } catch (error) {
          console.error('Error handling WebSocket message:', error);
          ws.send(JSON.stringify({
            type: 'system',
            content: `Error: ${error.message}`
          }));
        }
      });
      
      // Handle connection close
      ws.on('close', () => {
        console.log('WebSocket connection closed');
        // Remove client from the set
        clients.delete(ws);
      });
      
      // Handle errors
      ws.on('error', (error) => {
        console.error('WebSocket error:', error);
        clients.delete(ws);
      });
    });
    
    console.log(`WebSocket server running at ws://localhost:${wsPort}`);
    
    // Handle WebSocket server errors
    wss.on('error', (error) => {
      if (error.code === 'EADDRINUSE') {
        console.log(`WebSocket port ${wsPort} is already in use, trying ${wsPort + 2}...`);
        startWebSocketServer(wsPort + 2);
      } else {
        console.error('WebSocket server error:', error);
      }
    });
  } catch (error) {
    console.error('Error starting WebSocket server:', error);
    if (error.code === 'EADDRINUSE') {
      console.log(`WebSocket port ${wsPort} is already in use, trying ${wsPort + 2}...`);
      startWebSocketServer(wsPort + 2);
    }
  }
  /**
   * Forward a message to all other connected clients
   * @param {WebSocket} sender - The client that sent the message
   * @param {Object} message - The message to forward
   */
  function forwardMessage(sender, message) {
    const messageStr = JSON.stringify(message);
    
    // Send to all clients except the sender
    clients.forEach(client => {
      if (client !== sender && client.readyState === WebSocket.OPEN) {
        client.send(messageStr);
      }
    });
  }
}