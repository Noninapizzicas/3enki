// Fix: tools event_based por el MCP (portal.handleCall)
// Problema: moduleLoader.executeTool (wrapper simple) llama tool.handler(args) —
// pero las tools event_based (ej. buscar_capacidad, detalle_capacidad) NO tienen
// handler directo: su handler espera un EVENTO del bus (onBuscarCapacidad(event)
// lee event.data). executeTool lanzaba "tool.handler is not a function".
// Fix: si toolDef.event_based → enrutar por bus (publish + esperar <tool>.response
// correlado por request_id), el mismo patrón que el ai-gateway._executeToolCall.
const crypto = require('crypto');

const EB_TIMEOUT_MS = 15000;

async function _callToolEventBased(eventBus, toolName, argv) {
  const request_id = crypto.randomUUID();
  return new Promise((resolve, reject) => {
    const responseEvent = `${toolName}.response`;
    let unsub = null;
    const timeout = setTimeout(() => {
      if (unsub) unsub();
      reject(new Error(`bus timeout: ${toolName} (${EB_TIMEOUT_MS}ms)`));
    }, EB_TIMEOUT_MS);
    unsub = eventBus.subscribe(responseEvent, (event) => {
      const data = (event && typeof event === 'object' && 'data' in event) ? event.data : event;
      if (!data || data.request_id !== request_id) return;
      clearTimeout(timeout);
      if (unsub) unsub();
      if (data.error) {
        const err = new Error(data.error.message || String(data.error));
        err.code = data.error.code || 'UNKNOWN_ERROR';
        reject(err);
      } else {
        resolve(data.result !== undefined ? data.result : data);
      }
    });
    eventBus.publish(toolName, { request_id, ...argv });
  });
}

module.exports = { _callToolEventBased, EB_TIMEOUT_MS };
