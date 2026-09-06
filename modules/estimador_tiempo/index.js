/**
 * estimador_tiempo — ESTIMADOR DE TIEMPO (PASO 9 del plan-construccion).
 *
 * Contrato: estima minutos de impresión por parámetros/material. Cálculo 100%
 * determinista (volumen, altura, material, velocidad), sin E/S, sin juicio.
 * Alimenta Modelo.tiempo_estimado de la cola.
 *
 * FORMA: REFLEJO PURO — sin store, sin escribir, sin estado propio.
 *   - estimarMinutos(parametros, material): función pura exportada (testeable sin bus).
 *   - el RPC estimar_tiempo aplica la función pura. Nunca muta nada.
 *
 * PROPÓSITO (la PRESENCIA): el motor de propuesta usa tiempo_estimado + horarios en
 * casa para decidir si la impresión termina cuando hay alguien para supervisarla o
 * recogerla. Si arrancar ahora termina cuando NO hay nadie, la pieza se pospone o se
 * descarta en favor de una que sí termine en ventana de presencia.
 *
 * Invariante (n.º 7 del plan): lo que estima es SUGERENCIA; solo se convierte en
 * Modelo real vía cola_modelos.agregar. PARAMETROS_INVALIDOS → 422 con hint.
 *
 * v0.1.0 (primera pasada del plan-construccion): el estimador puro.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

// Velocidad de impresión de referencia (mm³/min) por material.
// Creality SPARKX i7 · 0.4mm nozzle · ~60mm/s · capa 0.2mm. Heurística determinista,
// NO un slicer: el tiempo real lo da la máquina/slicer; esto solo llena
// Modelo.tiempo_estimado como sugerencia para la decisión de presencia.
const VELOCIDAD_POR_MATERIAL = Object.freeze({
  petg: 7200,
  pla: 8400,
  abs: 6600,
  tpu: 4800,
  default: 7200
});

/**
 * Estima minutos de impresión por volumen y material (heurística determinista).
 * @param {Object} p  parametros { dimensiones:{ ancho, alto, profundo, radio? }, forma? }
 * @param {string} [material]  material (petg/pla/abs/tpu) para ajustar la velocidad
 * @returns {number} minutos estimados (>=1)
 */
function estimarMinutos(p, material) {
  const d = (p && p.dimensiones) || {};
  const w = Number(d.ancho) || 20;
  const h = Number(d.alto) || 20;
  const prof = Number(d.profundo) || 20;
  const radio = Number(d.radio) || 0;

  // Volumen aproximado: caja (w×h×prof) o cilindro (π·r²·h) según forma.
  const forma = String((p && p.forma) || 'caja').toLowerCase();
  let volumen;
  if (forma === 'cilindro' && radio > 0) {
    volumen = Math.PI * radio * radio * h;
  } else {
    volumen = w * h * prof;
  }

  const vel = VELOCIDAD_POR_MATERIAL[String(material || '').toLowerCase()] || VELOCIDAD_POR_MATERIAL.default;
  const minutos = Math.max(1, Math.round(volumen / vel));
  return minutos;
}

class EstimadorTiempoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'estimador_tiempo';
    this.version = 'reflejo-0.1.0';
  }

  // Handlers RPC
  onEstimarTiempoRequest(e) {
    return this._atender(e, 'estimar_tiempo', 'estimador_tiempo.estimar_tiempo.response', (d) => this._estimarTiempo(d));
  }

  // Proyección: aplica la función pura. NO escribe, NO muta, NO mantiene estado.
  async _estimarTiempo(input) {
    if (!input || !input.project_id) return this._invalid('project_id');
    if (!input.parametros || typeof input.parametros !== 'object') return this._invalid('parametros');

    const minutos = estimarMinutos(input.parametros, input.material);
    return {
      status: 200,
      data: {
        minutos,
        material: input.material || 'default',
        metodo: 'heuristica_volumen',
        nota: 'sugerencia — el tiempo real lo da el slicer/máquina; alimenta la decisión de presencia del motor de propuesta'
      }
    };
  }
}

module.exports = EstimadorTiempoReflejo;
module.exports.estimarMinutos = estimarMinutos;
