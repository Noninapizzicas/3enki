/**
 * Frontend Configuration
 * Reads from environment variables with sensible defaults
 */

// Environment variables (PUBLIC_ prefix required for SvelteKit)
export const config = {
  // Event-Core API endpoint - empty string uses Vite proxy in dev
  apiUrl: import.meta.env.PUBLIC_API_URL || '',

  // MQTT WebSocket URL (browsers need WebSocket, not TCP)
  mqttUrl: import.meta.env.PUBLIC_MQTT_URL || 'ws://localhost:9001',

  // Core ID for MQTT topic prefixes
  coreId: import.meta.env.PUBLIC_CORE_ID || 'core-a',

  // Current environment
  env: import.meta.env.PUBLIC_ENV || 'development',

  // Derived helpers
  get isDev() {
    return this.env === 'development';
  },

  get isProd() {
    return this.env === 'production';
  }
} as const;

// API endpoints helper
// Backend routes are: /modules/{moduleName}/{path} (no /api prefix)
export const api = {
  modules: `${config.apiUrl}/modules`,
  module: (name: string) => `${config.apiUrl}/modules/${name}`,
  moduleApi: (name: string, path: string) => `${config.apiUrl}/modules/${name}${path.startsWith('/') ? path : `/${path}`}`,
  health: `${config.apiUrl}/health`,
  metrics: `${config.apiUrl}/metrics`
} as const;

export default config;
