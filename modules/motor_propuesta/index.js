/**
 * motor_propuesta — Motor de propuesta PURO (PASO 2 del plan-construccion).
 *
 * Contrato: dado el conjunto de modelos, elige el siguiente a imprimir por la
 * ReglaPrioridadPorDefecto (prioridad desc → desempate por fecha_alta asc).
 * Es cálculo 100% determinista, sin E/S, sin juicio: no aprueba ni desaprueba,
 * solo aplica la regla y devuelve Presente|Ausente. Toda decisión de valor
 * (aprobar, rechazar, reinterpretar la necesidad) vive en el orquestador / LLM
 * de página, NO aquí.
 *
 * FORMA: REFLEJO PURO — sin store, sin escribir, sin estado propio.
 *   - proponerSiguiente(modelos): función pura exportada (testeable sin bus).
 *   - el RPC proponer_siguiente lee la cola vía cola_modelos (el custodio
 *     single-writer) y aplica la función pura. Nunca muta nada.
 *
 * Invariante central (n.º 9 del plan): el motor es cálculo puro, cero efectos.
 * Invariante de propuesta (n.º 3): un modelo IMPRIMIENDO nunca se propone.
 * Ausente canónico: cola sin candidatos PENDIENTE → propuesta null, causa
 * 'cola_vacia' (respuesta siempre, nunca silencio).
 *
 * v0.1.0 (primera pasada del plan-construccion): esqueleto del motor puro.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * Función pura de propuesta. Determinista, sin efectos laterales.
 * @param {Array<Modelo>} modelos  lista de modelos (de la cripta, puede ser [])
 * @returns {Modelo|null} el siguiente a imprimir, o null si no hay candidato
 *                        (cola vacía o todo no-PENDIENTE).
 * Orden: solo PENDIENTE es proponible → agrupa por material (imprimir en lotes del
 * mismo carrete ahorra cambios de filamento) → prioridad desc → fecha_alta asc.
 * NUNCA muta el array de entrada ni ninguno de sus elementos.
 */
function proponerSiguiente(modelos) {
  const lista = Array.isArray(modelos) ? modelos : [];
  const candidatos = lista.filter((m) => m && m.estado === 'PENDIENTE');
  if (!candidatos.length) return null;
  // Copia antes de ordenar: cero efecto sobre la lista de entrada.
  return candidatos
    .slice()
    .sort((a, b) => {
      const ma = (a.material || '').toLowerCase();
      const mb = (b.material || '').toLowerCase();
      if (ma !== mb) return ma < mb ? -1 : 1;                              // 1) agrupar por material
      if (b.prioridad !== a.prioridad) return b.prioridad - a.prioridad;  // 2) mayor prioridad primero
      if (a.fecha_alta !== b.fecha_alta) return a.fecha_alta < b.fecha_alta ? -1 : 1; // 3) desempate: el más antiguo
      return 0;
    })[0];
}

class MotorPropuestaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor_propuesta';
    this.version = 'reflejo-0.1.0';
  }

  // Handlers RPC
  onProponerSiguienteRequest(e) {
    return this._atender(e, 'proponer_siguiente', 'motor_propuesta.proponer_siguiente.response', (d) => this._proponerSiguiente(d));
  }

  // Proyección: lee la cola del custodio (single-writer) y aplica el motor puro.
  // NO escribe, NO muta, NO mantiene estado: solo lee y propone.
  async _proponerSiguiente(input) {
    if (!input.project_id) return this._invalid('project_id');

    const resp = await this._rpc('cola_modelos.listar.request', { project_id: input.project_id });
    if (!resp) {
      return this._errorResponse(502, 'COLA_NO_DISPONIBLE', 'no se pudo leer la cola de modelos', {});
    }

    const modelos = (resp.data && resp.data.modelos) || [];
    const propuesta = proponerSiguiente(modelos);

    if (!propuesta) {
      // Ausente canónico con causa explícita (nunca silencio): cola sin candidatos.
      return { status: 200, data: { propuesta: null, causa: 'cola_vacia' } };
    }
    return { status: 200, data: { propuesta, causa: 'ok' } };
  }
}

module.exports = MotorPropuestaReflejo;
module.exports.proponerSiguiente = proponerSiguiente;
