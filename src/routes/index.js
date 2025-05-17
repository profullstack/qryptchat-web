import { htmlToPdfRoute } from './html-to-pdf.js';
import { htmlToDocRoute } from './html-to-doc.js';
import { htmlToExcelRoute } from './html-to-excel.js';
import { htmlToPptRoute } from './html-to-ppt.js';
import { htmlToMarkdownRoute } from './html-to-markdown.js';
import { markdownToHtmlRoute } from './markdown-to-html.js';
import { htmlToEpubRoute } from './html-to-epub.js';
import { documentHistoryRoute } from './document-history.js';
import { downloadDocumentRoute } from './download-document.js';
import {
  subscriptionRoute,
  subscriptionStatusRoute
} from './subscription.js';
import {
  getSubscriptionDetails,
  createStripePortalSession,
  cancelSubscription
} from './subscription-management.js';
import { stripePaymentRoutes } from './stripe-payments.js';
import stripeDirectRouter from './stripe-direct.js';
import { apiKeyRoutes } from './api-keys.js';
import {
  loginRoute,
  refreshTokenRoute,
  registerRoute,
  resetPasswordRoute,
  resetPasswordConfirmRoute
} from './auth.js';
import { authStatusRoute } from './auth-status.js';
import { supabaseConfigRoute } from './config.js';
import { websocketRoute } from './websocket.js';
import { chatRoute } from './chat.js';
import { authMiddleware } from '../middleware/auth-middleware.js';

// Routes that require authentication
const protectedRoutes = [
  htmlToPdfRoute,
  htmlToDocRoute,
  htmlToExcelRoute,
  htmlToPptRoute,
  htmlToMarkdownRoute,
  markdownToHtmlRoute,
  htmlToEpubRoute,
  documentHistoryRoute,
  downloadDocumentRoute
];

// Apply auth middleware to protected routes
protectedRoutes.forEach(route => {
  if (!route.middleware) {
    route.middleware = [];
  }
  route.middleware.unshift(authMiddleware);
});

// Public routes (no authentication required)
const publicRoutes = [
  subscriptionRoute,
  subscriptionStatusRoute,
  ...stripePaymentRoutes,
  loginRoute,
  refreshTokenRoute,
  registerRoute,
  resetPasswordRoute,
  resetPasswordConfirmRoute,
  authStatusRoute,
  supabaseConfigRoute,
  websocketRoute,
  chatRoute,
  // Subscription management routes
  {
    method: 'GET',
    path: '/api/subscription/details',
    handler: getSubscriptionDetails,
    middleware: [authMiddleware] // This one needs auth
  },
  {
    method: 'POST',
    path: '/api/stripe/create-portal-session',
    handler: createStripePortalSession,
    middleware: [authMiddleware] // This one needs auth
  },
  {
    method: 'POST',
    path: '/api/subscription/cancel',
    handler: cancelSubscription,
    middleware: [authMiddleware] // This one needs auth
  }
];

/**
 * All API routes
 */
export const routes = [
  ...protectedRoutes,
  ...publicRoutes,
  ...apiKeyRoutes
];

/**
 * Register all routes with a Hono app instance
 * @param {Object} app - Hono app instance
 */
export function registerRoutes(app) {
  routes.forEach(route => {
    // Apply middleware if provided
    if (route.middleware && route.middleware.length > 0) {
      app[route.method.toLowerCase()](route.path, ...route.middleware, route.handler);
    } else {
      app[route.method.toLowerCase()](route.path, route.handler);
    }
  });
}