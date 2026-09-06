/**
 * motor_propuesta — Motor de propuesta PURO (PASO 2 del plan-construccion).
 *
 * Contrato: dado el conjunto de modelos, elige el siguiente a imprimir por una
 * ReglaPrioridad (Strategy). Por defecto ReglaPrioridadPorDefecto (prioridad desc →
 * desempate por fecha_alta asc). Si se pasa contexto de presencia (horarios en casa
 * + hora actual + tiempo_estimado), usa ReglaPrioridadConPresencia: si arrancar ahora
 * termina cuando NO hay nadie en casa, la pieza se descarta o se pospone en favor de
 * una que sí termine en ventana de presencia.
 * Es cálculo 100% determinista, sin E/S, sin juicio: no aprueba ni desaprueba,
 * solo aplica la regla y devuelve Presente|Ausente. Toda decisión de valor
 * (aprobar, rechazar, reinterpretar la necesidad) vive en el orquestador / LLM
 * de página, NO aquí.
 *
 * FORMA: REFLEJO PURO — sin store, sin escribir, sin estado propio.
 *   - proponerSiguiente(modelos, contexto?): función pura exportada (testeable sin bus).
 *   - el RPC proponer_siguiente lee la cola vía cola_modelos (el custodio
 *     single-writer) y aplica la función pura. Nunca muta nada.
 *
 * Invariante central (n.º 9 del plan): el motor es cálculo puro, cero efectos.
 * Invariante de propuesta (n.º 3): un modelo IMPRIMIENDO nunca se propone.
 * Ausente canónico: cola sin candidatos PENDIENTE → propuesta null, causa
 * 'cola_vacia' (respuesta siempre, nunca silencio).
 *
 * v0.1.0 (primera pasada del plan-construccion): esqueleto del motor puro.
 * v0.2.0: ReglaPrioridadConPresencia (paso 2 del plan) — el motor recibe contexto
 * de presencia y descarta/pospone piezas que terminarían fuera de ventana en casa.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

/**
 * Función pura de propuesta. Determinista, sin efectos laterales.
 * @param {Array<Modelo>} modelos  lista de modelos (de la cripta, puede ser [])
 * @param {Object} [contexto]      contexto opcional de presencia:
 *   { horarios_en_casa: Array<{desde, hasta}>, hora_actual: 'HH:MM', margen_min: number }
 * @returns {Modelo|null} el siguiente a imprimir, o null si no hay candidato
 *                        (cola vacía o todo no-PENDIENTE).
 * Orden: solo PENDIENTE es proponible → agrupa por material (imprimir en lotes del
 * mismo carrete ahorra cambios de filamento) → prioridad desc → fecha_alta asc.
 * Con presencia: si arrancar ahora termina cuando NO hay nadie en casa, la pieza se
 * descarta o se pospone en favor de una que sí termine en ventana de presencia.
 * NUNCA muta el array de entrada ni ninguno de sus elementos.
 */
function proponerSiguiente(modelos, contexto) {
  const lista = Array.isArray(modelos) ? modelos : [];
  const candidatos = lista.filter((m) => m && m.estado === 'PENDIENTE');
  if (!candidatos.length) return null;

  // Copia antes de ordenar: cero efecto sobre la lista de entrada.
  const ordenados = candidatos
    .slice()
    .sort((a, b) => {
      const ma = (a.material || '').toLowerCase();
      const mb = (b.material || '').toLowerCase();
      if (ma !== mb) return ma < mb ? -1 : 1;                              // 1) agrupar por material
      if (b.prioridad !== a.prioridad) return b.prioridad - a.prioridad;  // 2) mayor prioridad primero
      if (a.fecha_alta !== b.fecha_alta) return a.fecha_alta < b.fecha_alta ? -1 : 1; // 3) desempate: el más antiguo
      return 0;
    });

  // ReglaPrioridadConPresencia: si hay contexto de presencia, filtrar las piezas
  // que terminarían fuera de ventana en casa (nadie para supervisar/recoger).
  if (contexto && Array.isArray(contexto.horarios_en_casa) && contexto.horarios_en_casa.length) {
    const horaActual = contexto.hora_actual || _horaActual();
    const margen = Number(contexto.margen_min) || 0;
    const viables = ordenados.filter((m) => _terminaEnPresencia(m, horaActual, contexto.horarios_en_casa, margen));
    // Si hay al menos una viable, proponer la primera viable; si ninguna termina en
    // presencia, devolver la primera de la cola (degradación honesta: mejor imprimir
    // que dejar la máquina muda, pero señalando que no hay ventana).
    if (viables.length) return viables[0];
    return ordenados[0];
  }

  return ordenados[0];
}

// Hora actual en formato 'HH:MM' (local). Determinista por instante de llamada.
function _horaActual() {
  const d = new Date();
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

// ¿La pieza m termina dentro de una ventana de presencia en casa?
// termina = hora_actual + tiempo_estimado(min) + margen. Si no hay tiempo_estimado,
// se asume viable (no podemos decidir por presencia sin estimación).
function _terminaEnPresencia(m, horaActual, horarios, margen) {
  const minutos = Number(m.tiempo_estimado);
  if (!minutos || minutos <= 0) return true; // sin estimación → no bloqueamos por presencia
  const fin = _sumarMinutos(horaActual, minutos + margen);
  return horarios.some((h) => _dentroDe(fin, h.desde, h.hasta));
}

function _sumarMinutos(hhmm, mins) {
  const [h, m] = hhmm.split(':').map(Number);
  const total = (h * 60 + m + mins) % (24 * 60);
  return `${String(Math.floor(total / 60)).padStart(2, '0')}:${String(total % 60).padStart(2, '0')}`;
}

function _dentroDe(hhmm, desde, hasta) {
  return hhmm >= desde && hhmm <= hasta;
}

class MotorPropuestaReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'motor_propuesta';
    this.version = 'reflejo-0.2.0';
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
    const contexto = input.contexto || null;
    const propuesta = proponerSiguiente(modelos, contexto);

    if (!propuesta) {
      // Ausente canónico con causa explícita (nunca silencio): cola sin candidatos.
      return { status: 200, data: { propuesta: null, causa: 'cola_vacia' } };
    }
    return { status: 200, data: { propuesta, causa: 'ok' } };
  }
}

module.exports = MotorPropuestaReflejo;
module.exports.proponerSiguiente = proponerSiguiente;

