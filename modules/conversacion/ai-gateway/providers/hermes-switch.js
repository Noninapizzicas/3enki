'use strict';

/**
 * hermes-switch — interruptor 'hermes-agente' en-proceso (gobierno de la delegación a Hermes).
 *
 * Singleton compartido: el ai-gateway lo enciende/apaga desde el panel central
 * (interruptor.cambiado, sin reinicio) y el hermes-provider lo consulta en isAvailable().
 * OFF → Hermes no existe para Enki (ni auto-fallback ni selección explícita).
 * Nace OFF: delegar en un agente autónomo es decisión consciente del dueño.
 *
 * AUDIT: el provider llama audit(payload) tras cada delegación; el ai-gateway
 * engancha aquí el emisor real (eventBus.publish('hermes.invocado', ...)) en onLoad.
 * Ninguna delegación es invisible — la capta la propiocepción, como portal.invocado.
 */

let _on = false;
let _audit = null; // (payload) => void — lo cablea ai-gateway/index.js con el eventBus vivo

function isOn() { return _on; }
function setOn(v) { _on = !!v; }

function setAudit(fn) { _audit = typeof fn === 'function' ? fn : null; }
function audit(payload) {
  if (!_audit) return; // sin emisor cableado → silencio seguro (el log del provider queda)
  try { _audit(payload); } catch (_) { /* el audit jamás rompe la delegación */ }
}

module.exports = { isOn, setOn, setAudit, audit };
