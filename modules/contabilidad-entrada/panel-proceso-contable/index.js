/**
 * contabilidad-entrada/panel-proceso-contable — REFLEJO STATELESS (P1, hoja del plan).
 *
 * EL LATIDO del proceso de entrada: que ENTRA, que se PROCESA, que esta en COLA y que FALLA.
 * Agregacion DETERMINISTA sobre lo que ya emitieron las piezas del proceso — este modulo NO
 * decide nada, solo suma y ordena (el "display" de la contabilidad).
 *
 * ATRIBUTOS del diseno: `cola:EncoladoExcepcion`, `historial:HistorialProcesoContable`.
 *   METODOS: latido():Panel.
 *   REGLA: que entra, que se procesa, que esta en cola, que falla. Agregacion determinista.
 *
 * Invariantes:
 *  - AGREGA, NO DECIDE: compone el panel con lo que le dan (historial P2 + cola A8.1) o con los
 *    contadores que los eventos del proceso han acumulado EN MEMORIA. Cero criterio de negocio.
 *  - LEE, NO RECALCULA la cobertura: si trae tasa de cobertura, la toma de `completitud-cobertura`
 *    (A12, LA metrica unica) POR EVENTO; jamas la recomputa aqui.
 *  - DETERMINISTA: mismo estado del proceso → mismo panel.
 *  - Dato ausente = desconocido: los tramos que no tienen dato salen `null`, no un 0 inventado.
 *  - Sin estado de dominio: el panel es una PROYECCION; no persiste nada.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja P1 del plan-construccion y diseno-oop.md (CLASE PanelProcesoContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PanelProcesoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'panel-proceso-contable';
    this.version = 'reflejo-0.1.0';
    // Contadores del latido EN PROCESO (project_id -> contadores). Es una proyeccion viva,
    // no una parcela: la persistencia duradera del proceso es el historial (P2).
    this._latidos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onLatidoRequest(e) {
    return this._atender(e, 'latido', 'panel-proceso-contable.latido.response', async (d) => {
      const res = await this._latido(d);
      if (res.status !== 200) this.eventBus?.publish('panel-proceso-contable.latido.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget del flujo: una excepcion encolada entra al latido (EN COLA) ──
  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const x = d.excepcion || {};
    this._contar(d.project_id, 'en_cola', 1);
    if (String(x.destino || '').toUpperCase() === 'DUENO') this._contar(d.project_id, 'cola_dueno', 1);
    return { status: 200, data: { project_id: d.project_id, anotado: 'excepcion_encolada' } };
  }

  // ── Fire-and-forget del flujo: una anotacion del proceso (P2) entra al latido ──
  onProcesoAnotado(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    const reg = d.registro || d;
    const resultado = String(reg.resultado || d.resultado || '').toUpperCase();
    if (resultado === 'PROCESADO') this._contar(d.project_id, 'procesados', 1);
    else if (resultado === 'FALLADO') this._contar(d.project_id, 'fallados', 1);
    else this._contar(d.project_id, 'anotados', 1);
    return { status: 200, data: { project_id: d.project_id, anotado: 'proceso_anotado' } };
  }

  // ── proyeccion determinista: latido() → Panel (AGREGA; no decide) ──
  async _latido(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const c = this._latidos.get(pid) || null;

    // El HISTORIAL (P2, el custodio del proceso): si el llamante no lo trae, se PIDE por evento.
    const hist = await this._historial(pid, input);
    // La COLA (A8.1): si el llamante no la trae, se PIDE por evento.
    const cola = await this._cola(pid, input);
    // La COBERTURA: LA metrica unica (A12). SE LEE, no se recalcula.
    const cobertura = await this._cobertura(pid, input);

    const entrados = this._num(c ? c.entrados : null);
    const procesados = hist ? hist.procesados : this._num(c ? c.procesados : null);
    const fallados = hist ? hist.fallados : this._num(c ? c.fallados : null);

    // Lo que esta EN COLA: lo declara la cola (A8.1) o el contador de eventos.
    const en_cola = cola ? cola.pendientes : this._num(c ? c.en_cola : null);
    const cola_dueno = cola ? cola.pendientes_dueno : this._num(c ? c.cola_dueno : null);

    const panel = {
      // Que ENTRA: hechos/documentos admitidos a la entrada.
      entrados,
      // Que se PROCESA: lo que el historial (P2) marca PROCESADO.
      procesados,
      // Que esta EN COLA: lo dudoso que espera sin bloquear el flujo.
      en_cola,
      cola_dueno,
      // Que FALLA: lo que el historial (P2) marca FALLADO.
      fallados,
      // La cobertura se LEE de la metrica unica (A12), no se recalcula en el panel.
      cobertura,
      historial_disponible: hist !== null,
      cola_disponible: cola !== null,
      cobertura_disponible: cobertura !== null
    };

    const faltan = [];
    if (entrados === null) faltan.push('entrados');
    if (procesados === null) faltan.push('procesados');
    if (en_cola === null) faltan.push('en_cola');
    if (fallados === null) faltan.push('fallados');

    return {
      status: 200,
      data: {
        project_id: pid,
        panel,
        // La agregacion es MECANICA: se suman los tramos ya emitidos. Ni un juicio.
        agrega: ['entrados', 'procesados', 'en_cola', 'fallados', 'cobertura'],
        decide: false,
        abierto: {
          historial: hist ? null : 'historial-proceso-contable (P2) no respondio: sus tramos quedan null',
          cola: cola ? null : 'encolado-excepcion (A8.1) no respondio: el tramo en cola queda null',
          cobertura: cobertura ? null : 'completitud-cobertura (A12) no respondio: no se recalcula aqui, se declara el hueco'
        },
        faltan
      }
    };
  }

  async _historial(pid, input = {}) {
    if (input.historial && typeof input.historial === 'object') return this._resumenHistorial(input.historial);
    const r = await this._rpc('historial-proceso-contable.anotar.request',
      { project_id: pid, rol: 'PANEL_LECTURA', solo_lectura: true }, { timeout_ms: 3000 }).catch(() => null);
    // El historial no sirve lecturas por RPC: si no viene declarado, se usa el contador de eventos.
    if (r && r.data && Array.isArray(r.data.registros)) return this._resumenHistorial({ registros: r.data.registros });
    return null;
  }

  _resumenHistorial(h) {
    const regs = Array.isArray(h.registros) ? h.registros : [];
    let procesados = 0;
    let fallados = 0;
    for (const x of regs) {
      const res = String((x && x.resultado) || '').toUpperCase();
      if (res === 'PROCESADO') procesados++;
      else if (res === 'FALLADO') fallados++;
    }
    return { procesados, fallados, total: regs.length };
  }

  async _cola(pid, input = {}) {
    if (input.cola && typeof input.cola === 'object') {
      return {
        pendientes: this._num(input.cola.pendientes != null ? input.cola.pendientes : (Array.isArray(input.cola.excepciones) ? input.cola.excepciones.length : null)),
        pendientes_dueno: this._num(input.cola.pendientes_dueno)
      };
    }
    const r = await this._rpc('encolado-excepcion.tomar.request',
      { project_id: pid, solo_lectura: true }, { timeout_ms: 3000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    // `tomar` sin clave responde los pendientes; solo se usa como CONTADOR (no se toma nada aqui).
    if (data && data.pendientes != null) {
      return { pendientes: this._num(data.pendientes), pendientes_dueno: this._num(data.pendientes_dueno) };
    }
    return null;
  }

  // LA metrica unica de cobertura (A12): se LEE por evento. NO se recalcula.
  async _cobertura(pid, input = {}) {
    if (input.cobertura && typeof input.cobertura === 'object') return input.cobertura;
    const r = await this._rpc('completitud-cobertura.medir.request',
      { project_id: pid, vertical: input.vertical }, { timeout_ms: 4000 }).catch(() => null);
    const data = r && r.data ? r.data : null;
    if (data && data.cobertura) return data.cobertura;
    return null;
  }

  _contar(pid, clave, n) {
    const c = this._latidos.get(pid) || {};
    c[clave] = (c[clave] || 0) + n;
    this._latidos.set(pid, c);
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolLatido(params) { return this._latido(params); }
}

module.exports = PanelProcesoContable;
