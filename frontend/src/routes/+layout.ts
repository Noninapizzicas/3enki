/**
 * Disable SSR for the entire application
 *
 * This application relies heavily on client-side features:
 * - MQTT WebSocket connections
 * - LocalStorage persistence
 * - Browser-only APIs
 *
 * SSR causes hydration issues because the server-rendered content
 * doesn't match the client-rendered content.
 */
export const ssr = false;
export const prerender = false;
