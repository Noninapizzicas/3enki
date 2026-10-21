/**
 * contabilidad-entrada/desatasco-entrada — MICRO-AGENTE (P3, hoja del plan).
 *
 * ══════════════════════════════════════════════════════════════════════════════════════
 * RESOLVER / REENCOLAR / DESCARTAR UNA EXCEPCION **CON MOTIVO**. Es la ACCION que completa A8.
 * ES EL UNICO MICRO-AGENTE QUE PUBLICA: no PROPONE — ACTUA sobre la cola de lo dudoso.
 * ══════════════════════════════════════════════════════════════════════════════════════
 * A8.1 (encolado-excepcion) ENCOLA lo dudoso; A8.2 (aviso-revision) AVISA. Faltaba la ACCION:
 * una excepcion encolada no se resuelve sola. Aqui se DECIDE que se hace con ella:
 *   · resolver   → se asienta (SUBE escritor-diario.asentar.request) y se anota en el historial.
 *   · reencolar  → vuelve a la cola con el motivo nuevo (SUBE encolado-excepcion.encolar.request).
 *   · descartar  → se descarta CON motivo (no se borra nada: se declara por que).
 *
 * SIN MOTIVO NO SE ACTUA: una excepcion que se resuelve/descarta sin causa es una excepcion
 * que se tapa. Dato ausente = desconocido: sin excepcion NO hay nada que desatascar.
 *
 * R2 · ACTUA → ANUNCIA: al desatascar publica `contabilidad.excepcion_desatascada` (el hecho que
 * alimenta regla-contrapartida —que aprende de la resolucion— y el historial de proceso).
 * Y SUBE por EVENTO la accion concreta (asentar / encolar / aplicar regla / anotar).
 *
 * Forma: MICRO-AGENTE → STATELESS (sin PosPersistencia). RPC juzgar es CLASE ORDEN → SÍ ui_handler.
 * Ver hoja P3 del plan-construccion y diseno-oop.md (CLASE DesatascoEntrada).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

const ACCIONES = new Set(['resolver', 'reencolar', 'descartar']);

class DesatascoEntrada extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'desatasco-entrada';
    this.version = 'reflejo-0.1.0';
    // Excepciones observadas por proyecto (memoria acotada, no store): para resolver sin
    // volver a pedirlas por EVENTO cuando llegan por el bus.
    this._excepciones = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC unico: juzgar (ORDEN → ui_handler panel) ──
  onJuzgarRequest(e) {
    return this._atender(e, 'juzgar', 'desatasco-entrada.juzgar.response', (d) => {
      const res = this._juzgar(d);
      if (res.status === 200 && res.data && res.data.desatascada) {
        // R2 · ACTUA → anuncia el HECHO: una excepcion quedo desatascada con su accion y motivo.
        this.eventBus?.publish('contabilidad.excepcion_desatascada', {
          project_id: res.data.project_id,
          excepcion_id: res.data.excepcion_id,
          clave: res.data.clave,
          accion: res.data.accion,
          motivo: res.data.motivo,
          en: res.data.en,
          correlation_id: d.correlation_id
        });
        // SUBE por EVENTO la ACCION concreta (cada destino tiene su dueno).
        this._subirAccion(res.data, d);
      } else if (res.status !== 200) {
        this.eventBus?.publish('desatasco-entrada.juzgar.failed', res);
      }
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): una excepcion entro a la cola → se observa ──
  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id || this.project_id;
    if (!pid) return;
    const lista = this._excepciones.get(pid) || [];
    lista.push(d.excepcion || d);
    if (lista.length > 1000) lista.shift();
    this._excepciones.set(pid, lista);
  }

  // Sube la accion concreta al dueno correspondiente, segun lo decidido.
  _subirAccion(data, d) {
    const base = { project_id: data.project_id, correlation_id: d.correlation_id };
    if (data.accion === 'resolver') {
      if (data.asiento) {
        this.eventBus?.publish('escritor-diario.asentar.request', { ...base, asiento: data.asiento, origen: 'desatasco-entrada' });
      }
    } else if (data.accion === 'reencolar') {
      this.eventBus?.publish('encolado-excepcion.encolar.request', {
        ...base, rol: 'DESATASCO_ENTRADA', clave: data.clave || `desatasco:${data.excepcion_id}`, motivo: data.motivo, origen: 'desatasco-entrada'
      });
    } else if (data.accion === 'descartar') {
      // Al descartar con una contrapartida declarada, se puede aplicar la regla (aprendizaje).
      if (data.contrapartida) {
        this.eventBus?.publish('regla-contrapartida.aplicar.request', { ...base, contexto: data.contrapartida });
      }
    }
    // TODO desatasco se anota en el historial del proceso (append-only).
    this.eventBus?.publish('historial-proceso-contable.anotar.request', {
      ...base,
      registro: {
        resultado: data.accion === 'resolver' ? 'PROCESADO' : 'FALLADO',
        asunto: 'excepcion desatascada',
        origen: 'desatasco-entrada',
        motivo: data.motivo,
        hecho_id: data.excepcion_id
      }
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _juzgar(input) → { status, data }  ·  DECIDE y ACTUA sobre la excepcion
  // ══════════════════════════════════════════════════════════════════════
  _juzgar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const excepcion = input.excepcion && typeof input.excepcion === 'object' ? input.excepcion : input;
    const excepcion_id = excepcion.excepcion_id != null ? String(excepcion.excepcion_id)
      : (input.excepcion_id != null ? String(input.excepcion_id) : null);
    const clave = input.clave != null ? String(input.clave) : (excepcion.clave != null ? String(excepcion.clave) : null);

    // Sin excepcion NO hay nada que desatascar (dato ausente = desconocido).
    if (!excepcion_id && !clave) {
      return this._invalid('excepcion');
    }

    const accion = this._accion(input.accion ?? input.decision ?? excepcion.accion);

    // SIN MOTIVO NO SE ACTUA: resolver/descartar sin causa es tapar la excepcion.
    const motivo = input.motivo !== undefined ? input.motivo
      : (input.causa !== undefined ? input.causa : excepcion.motivo);
    if (motivo === null || motivo === undefined || String(motivo).trim() === '') {
      return this._invalid('motivo');
    }

    // resolver con asiento declarado → se asienta; resolver sin asiento → se declara abierto.
    const asiento = input.asiento !== undefined ? input.asiento
      : (excepcion.asiento !== undefined ? excepcion.asiento : null);
    const contrapartida = input.contrapartida !== undefined ? input.contrapartida
      : (excepcion.contrapartida !== undefined ? excepcion.contrapartida : null);

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'desatasco-entrada',
        excepcion_id,
        clave,
        accion,                                  // resolver | reencolar | descartar
        motivo: String(motivo),
        asiento: accion === 'resolver' ? (asiento || null) : null,
        contrapartida: contrapartida || null,
        // ACTUA (no propone): el hecho lo anuncia el handler (R2).
        desatascada: true,
        resuelta: accion === 'resolver',
        reencolada: accion === 'reencolar',
        descartada: accion === 'descartar',
        en: new Date().toISOString(),
        abierto: {
          asiento: (accion === 'resolver' && !asiento)
            ? 'se resuelve pero la excepcion no declaro asiento: se anota el hueco, no se inventa el apunte'
            : null
        }
      }
    };
  }

  _accion(v) {
    const a = v != null ? String(v).toLowerCase().trim() : '';
    return ACCIONES.has(a) ? a : 'resolver';
  }

  // ── Tools ──
  toolJuzgar(params) { return this._juzgar(params); }
}

module.exports = DesatascoEntrada;
