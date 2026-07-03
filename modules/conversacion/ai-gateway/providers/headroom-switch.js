'use strict';

/**
 * headroom-switch — interruptor 'headroom' en-proceso (hot-switch del proxy de compresión).
 *
 * Singleton compartido: el ai-gateway lo enciende/apaga desde el panel central
 * (interruptor.cambiado, sin reinicio) y los providers lo consultan en _apiBase().
 * ON + HEADROOM_PROXY_URL puesto → el tráfico de los providers opt-in (config.headroom:true)
 * va por el proxy; OFF → proveedor directo. Nace OFF: la compresión es decisión consciente.
 *
 * Fallback seguro: si el proxy no está configurado (env vacía), isOn() da igual → directo.
 */

let _on = false;

function isOn() { return _on; }
function setOn(v) { _on = !!v; }

/** URL del proxy Headroom (env, deploy-time). null si no está configurado. */
function proxyBase() {
  const b = process.env.HEADROOM_PROXY_URL;
  return (b && String(b).trim()) || null;
}

module.exports = { isOn, setOn, proxyBase };
