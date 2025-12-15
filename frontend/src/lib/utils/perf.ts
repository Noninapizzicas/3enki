/**
 * Performance logging utility - saves to files via log-manager
 */
import { browser } from '$app/environment';

const timers: Map<string, number> = new Map();
const LOG_ENDPOINT = '/modules/log-manager/logs';

/**
 * Start a performance timer
 */
export function perfStart(label: string): void {
  timers.set(label, performance.now());
}

/**
 * End a timer and log the result to file
 */
export function perfEnd(label: string): number {
  const start = timers.get(label);
  if (!start) {
    console.warn(`[Perf] Timer "${label}" not found`);
    return 0;
  }

  const duration = performance.now() - start;
  timers.delete(label);

  // Log to file
  logPerf(label, duration);

  return duration;
}

/**
 * Log a performance measurement to file
 */
export function logPerf(label: string, durationMs: number): void {
  // Only log in browser environment (not during SSR)
  if (!browser) return;

  const entry = {
    level: 'info',
    source: 'frontend',
    module: 'perf',
    msg: `⏱️ ${label}: ${durationMs.toFixed(2)}ms`,
    ctx: {
      label,
      duration_ms: Math.round(durationMs * 100) / 100,
      timestamp: new Date().toISOString()
    }
  };

  // Send to log-manager (fire and forget)
  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(entry)
  }).catch(() => {});
}

/**
 * Log a simple message to file
 */
export function logMsg(msg: string, ctx: Record<string, unknown> = {}): void {
  // Only log in browser environment (not during SSR)
  if (!browser) return;

  fetch(LOG_ENDPOINT, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      level: 'info',
      source: 'frontend',
      module: 'perf',
      msg,
      ctx: { ...ctx, timestamp: new Date().toISOString() }
    })
  }).catch(() => {});
}
