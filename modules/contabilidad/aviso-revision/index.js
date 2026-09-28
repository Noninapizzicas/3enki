/**
 * contabilidad/aviso-revision — PUENTE STATELESS (A8.2, hoja del plan).
 *
 * EMPUJON AL MOTOR DE AVISOS: "esto necesita revision". Conecta por SENAL; NO
 * resuelve ni decide nada — la cola (A8.1) encola, el asesor resuelve (P3) y el
 * aviso solo EMPUJA para que nadie se quede mirando una cola muda. Avisa con el
 * MOTIVO y la COLA DE DESTINO (ASESOR | DUENO), para que K2 lo enrute a quien
 * tiene la silla.
 *
 * PUENTE (patron real, stateless): sin PosPersistencia ni project.activated — no
 * guarda estado; reacciona a un evento de dominio y sigue. La dependencia con
 * cola-revision (A8.1) es por EVENTO (`contabilidad.excepcion_encolada`,
 * fire-and-forget), NUNCA por require cruzado. La dependencia con `motor-avisos`
 * (K2) AUN NO EXISTE en el proyecto: el aviso se PIDE por EVENTO
 * (`contabilidad.aviso.solicitar.request`, que K2 declara en sus subscribes) y
 * si no contesta se publica CONTRATO TOLERANTE
 * (`contabilidad.aviso.solicitar.failed`, 503 DEPENDENCIA_NO_DISPONIBLE): la
 * senal de revision QUEDA EMITIDA igualmente
 * (`contabilidad.aviso_revision_solicitado`), porque la senal es de contabilidad
 * y no depende de que K2 este vivo. NO se fabrica un aviso que K2 no produjo.
 *
 * Emisor/par de fallo: exito publica contabilidad.aviso_revision_solicitado y el
 * aviso pedido; error su par determinista. NO REUTILIZA: el aviso de revision
 * nace de la cola de ESTA vertical; K2 (motor-avisos) solo lo produce/entrega.
 *
 * Ver hoja A8.2 del diseno-oop y bloque `aviso-revision` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Colas por naturaleza (A8.1): la senal lleva el destino para que K2 enrute.
const COLAS = new Set(['ASESOR', 'DUENO']);

// Naturalezas -> destinatario de la senal (espejo del routing de A8.1).
const DESTINO_POR_NATURALEZA = {
  CONTABLE: 'ASESOR',
  DOCUMENTO_DESCUADRADO: 'ASESOR',
  SIN_COBERTURA: 'ASESOR',
  NEGOCIO: 'DUENO',
  DECISION_DUENO: 'DUENO',
  FUENTE_FALTANTE: 'DUENO'
};

class AvisoRevision extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'aviso-revision';
    this.version = 'reflejo-0.1.0';
    // Puente stateless: sin store que persistir.
  }

  async onUnload() { return super.onUnload(); }

  // Fire-and-forget: cola-revision (A8.1) encolo una excepcion → se empuja el aviso.
  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return (async () => {
      const res = this._avisar(d);
      if (res.status !== 200) {
        this.eventBus?.publish('contabilidad.aviso.solicitar.failed', {
          status: res.status,
          error: {
            code: (res.error && res.error.code) || 'DEPENDENCIA_NO_DISPONIBLE',
            message: (res.error && res.error.message) || 'no se pudo armar la senal de revision',
            details: res.error && res.error.details
          }
        });
        return res;
      }
      // La SENAL de revision es de contabilidad: se publica SIEMPRE (no depende de K2).
      this.eventBus?.publish('contabilidad.aviso_revision_solicitado', {
        ...res.data,
        correlation_id: d.correlation_id
      });
      // Y se PIDE el aviso a K2 por EVENTO (contrato TOLERANTE).
      await this._pedirAviso(d, res.data);
      return res;
    })();
  }

  // ── proyeccion pura ──
  // avisar(excepcion) -> senal a motor-avisos (K2) con el motivo y la cola de destino.
  _avisar(input) {
    const excepcion = (input && (input.excepcion || input)) || null;
    if (!excepcion || typeof excepcion !== 'object') return this._invalid('excepcion');

    const pid = (input && input.project_id) || excepcion.project_id;
    if (!pid) return this._invalid('project_id');

    // Cola de destino: la declarada en la excepcion o la derivada de la naturaleza.
    const colaDeclarada = String((input && (input.cola || excepcion.cola)) || '').toUpperCase();
    const naturaleza = String((excepcion.naturaleza || '') || '').toUpperCase();
    const cola = COLAS.has(colaDeclarada)
      ? colaDeclarada
      : (excepcion.cola_destino && COLAS.has(String(excepcion.cola_destino).toUpperCase())
        ? String(excepcion.cola_destino).toUpperCase()
        : (DESTINO_POR_NATURALEZA[naturaleza] || 'ASESOR'));

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'AVISO_REVISION',
        excepcion_id: excepcion.id || null,
        motivo: excepcion.motivo || null,
        naturaleza: excepcion.naturaleza || null,
        cola_destino: cola,
        destinatario: cola,            // la silla que resuelve esa cola
        vertical: excepcion.vertical || (excepcion.hecho && excepcion.hecho.vertical) || null,
        prioridad: excepcion.prioridad || (excepcion.ambiguedad_alta ? 'ALTA' : 'NORMAL'),
        texto: 'esto necesita revision',
        // Conecta por SENAL: no resuelve ni decide nada.
        resuelve: false,
        decide: false,
        empuja_senal: true,
        origen_cola: 'A8.1'
      }
    };
  }

  // Aviso a motor-avisos (K2) por EVENTO. CONTRATO TOLERANTE: K2 AUN NO EXISTE.
  async _pedirAviso(d, senal) {
    const resp = await this._rpc('contabilidad.aviso.solicitar.request', {
      project_id: senal.project_id,
      origen: 'A8.2_AVISO_REVISION',
      tipo: 'AVISO_REVISION',
      motivo: senal.motivo,
      destinatario: senal.destinatario,
      cola_destino: senal.cola_destino,
      prioridad: senal.prioridad,
      contexto: {
        excepcion_id: senal.excepcion_id,
        naturaleza: senal.naturaleza,
        vertical: senal.vertical,
        origen_cola: 'A8.1'
      },
      correlation_id: d && d.correlation_id
    }, { timeout_ms: 4000 });

    if (!resp || resp.status !== 200) {
      // K2 no esta vivo (aun no construido) o rechazo: la senal QUEDA EMITIDA
      // — se declara el fallo, NO se fabrica un aviso.
      this.eventBus?.publish('contabilidad.aviso.solicitar.failed', {
        status: (resp && resp.status) || 503,
        error: {
          code: 'DEPENDENCIA_NO_DISPONIBLE',
          message: 'motor-avisos (K2) no respondio: la senal de revision queda EMITIDA, no se fabrica el aviso',
          details: { dependencia: 'motor-avisos', cola_destino: senal.cola_destino, excepcion_id: senal.excepcion_id }
        }
      });
      return null;
    }
    return resp;
  }

  // ── Tools ──
  toolAvisar(params) { return this._avisar(params); }
}

module.exports = AvisoRevision;
