'use strict';

/**
 * P10 · Conversor de salida — REFLEJO puro (del esquema del motor).
 *
 * UNA sola frontera donde la salida CRUDA del generador se convierte a la
 * estructura canónica que el validador y el resto del pipeline entienden.
 * Cero estado, cero red. Si el crudo no es convertible → error de formato
 * con detalle (nunca se inventa la conversión).
 *
 * Entrada: string (JSON) | object | array | string plano.
 * Salida:  { ok: true, canónica } | { ok: false, detalle }.
 */

function convertir(salidaCruda) {
  if (salidaCruda === undefined || salidaCruda === null) {
    return { ok: false, detalle: 'salida cruda vacía (null/undefined)' };
  }

  // Ya es estructura → pasa tal cual (el validador decidirá).
  if (typeof salidaCruda === 'object') {
    return { ok: true, canónica: salidaCruda };
  }

  if (typeof salidaCruda === 'string') {
    const plano = salidaCruda.trim();
    if (plano === '') {
      return { ok: false, detalle: 'salida cruda vacía (string vacía)' };
    }
    // Intenta parsear como JSON — la forma canónica del motor.
    if (plano.startsWith('{') || plano.startsWith('[')) {
      try {
        const canónica = JSON.parse(plano);
        return { ok: true, canónica };
      } catch (err) {
        return { ok: false, detalle: `JSON inválido: ${err.message}` };
      }
    }
    // Texto plano → envolver como contenido (el validador lo comprueba).
    return { ok: true, canónica: { content: plano } };
  }

  if (typeof salidaCruda === 'number' || typeof salidaCruda === 'boolean') {
    return { ok: true, canónica: { content: String(salidaCruda) } };
  }

  return { ok: false, detalle: `tipo no convertible: ${typeof salidaCruda}` };
}

module.exports = { convertir };
