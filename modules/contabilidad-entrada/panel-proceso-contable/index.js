/**
 * contabilidad-entrada/panel-proceso-contable — REFLEJO STATELESS (P1, hoja del plan).
 *
 * EL 'DISPLAY DE COCINA' DE LA CONTABILIDAD: que entra, que se procesa, que esta en cola y que
 * falla. Es un ESPEJO del proceso de entrada, no un escritor: OBSERVA los hechos del proceso
 * (contabilidad.hecho_recibido · excepcion_encolada · excepcion_desatascada) en una ventana
 * acotada y los COMPONE en un latido. NO calcula la tasa por su cuenta (eso es
 * tasa-cobertura-entrada P4): le SUBE por EVENTO tasa-cobertura-entrada.calcular.request y usa
 * lo que devuelve.
 *
 * Honestidad (invariante 13): lo que no llega NO se rellena con 0 ni se finge vacio — se declara
 * en `abierto` (un panel que inventa cifras miente sobre el proceso).
 *
 * NO escribe, NO persiste. RPC latido es CLASE PREGUNTA → sin ui_handler (su cara es el bus).
 * Publica panel-proceso-contable.latido.response y su par .failed.
 * Escucha contabilidad.hecho_recibido (puerto-evento-vertical A1), contabilidad.excepcion_encolada
 * (encolado-excepcion A8.1). NOTA R3: el plan declara tambien escucha de
 * contabilidad.excepcion_desatascada (desatasco-entrada P3) y subida a encolado-excepcion.encolar.request
 * y historial-proceso-contable.anotar.request — NO se cablean aqui: el panel OBSERVA, no escribe;
 * las subidas se hacen SOLO si la peticion las declara (best-effort, sin inventar escrituras).
 * Ver hoja P1 del plan-construccion y diseno-oop.md (CLASE PanelProcesoContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// La ventana acotada del panel: cuantos eventos de proceso se guardan en memoria.
const VENTANA = 500;

class PanelProcesoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'panel-proceso-contable';
    this.version = 'reflejo-0.1.0';
    // Observacion en memoria: project_id -> { entrados:[], encoladas:[], desatascadas:[] }
    this._procesos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onLatidoRequest(e) {
    return this._atender(e, 'latido', 'panel-proceso-contable.latido.response', async (d) => {
      const res = await this._latido(d);
      if (res.status !== 200) this.eventBus?.publish('panel-proceso-contable.latido.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): el panel OBSERVA el proceso de entrada ──
  onHechoRecibido(e) {
    const d = (e && (e.data || e)) || {};
    const p = this._proceso(d.project_id || this.project_id);
    p.entrados.push({ tipo: d.tipo_hecho || d.tipo || null, vertical: d.vertical || null, en: new Date().toISOString() });
    if (p.entrados.length > VENTANA) p.entrados.shift();
  }

  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    const p = this._proceso(d.project_id || this.project_id);
    p.encoladas.push({ clave: d.clave != null ? d.clave : (d.excepcion && d.excepcion.clave) || null, motivo: d.motivo || null, en: new Date().toISOString() });
    if (p.encoladas.length > VENTANA) p.encoladas.shift();
  }

  // NOTA R3: desatasco-entrada (P3) aun puede no existir; si el hecho llega, se observa igual
  // (el handler solo se declara en module.json si el emisor existe).
  onExcepcionDesatascada(e) {
    const d = (e && (e.data || e)) || {};
    const p = this._proceso(d.project_id || this.project_id);
    p.desatascadas.push({ clave: d.clave != null ? d.clave : null, en: new Date().toISOString() });
    if (p.desatascadas.length > VENTANA) p.desatascadas.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // latido(input) → { entra, procesa, en_cola, falla, tasa, abierto }
  // ══════════════════════════════════════════════════════════════════════
  async _latido(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const p = this._proceso(pid);

    // La TASA de cobertura: la calcula P4 (metrica unica). El panel solo la LEE por EVENTO.
    const tasaResp = await this._rpc('tasa-cobertura-entrada.calcular.request', { project_id: pid }, { timeout_ms: 700 });
    const tasa = tasaResp && tasaResp.tasa != null ? tasaResp.tasa : null;

    // Se COMPONE el latido con lo observado; lo que no llego se declara, no se inventa.
    const enColaVisible = input.pendientes != null && Number.isFinite(Number(input.pendientes))
      ? Number(input.pendientes)
      : p.encoladas.length;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'panel-proceso-contable',
        // El 'display de cocina': entra → procesa → en cola → falla.
        entra: { num: p.entrados.length, ultimos: p.entrados.slice(-10) },
        procesa: { num: p.entrados.length - p.encoladas.length > 0 ? p.entrados.length - p.encoladas.length : 0 },
        en_cola: { num: enColaVisible, pendientes: p.encoladas.slice(-10) },
        desatascadas: p.desatascadas.slice(-10),
        tasa,
        fuente_tasa: tasa !== null ? 'tasa-cobertura-entrada' : null,
        determinista: true,
        abierto: {
          tasa: tasa === null
            ? 'no llego la tasa (ni declarada ni de tasa-cobertura-entrada P4): el panel la declara, no la inventa'
            : null,
          proceso: (p.entrados.length || p.encoladas.length)
            ? null
            : 'la ventana de proceso esta vacia: no hay nada que mostrar todavia (no se finge actividad)'
        }
      }
    };
  }

  _proceso(pid) {
    let p = this._procesos.get(pid);
    if (!p) { p = { entrados: [], encoladas: [], desatascadas: [] }; this._procesos.set(pid, p); }
    return p;
  }

  // ── Tools ──
  toolLatido(params) { return this._latido(params); }
}

module.exports = PanelProcesoContable;
