/**
 * contabilidad/historial-proceso-contable — CUSTODIO (P2, hoja del plan).
 *
 * Registro APPEND-ONLY de lo PROCESADO y lo FALLADO con su rastro. Solo crece;
 * NUNCA se reescribe (invariante de registro inmutable del dominio, junto a B4,
 * D8, L7). Es el historial del PROCESO de entrada (admitido / encolado /
 * resuelto), distinto de `traza-asiento` (B4, del asiento) y de `historial-nicho`
 * (otro dominio).
 *
 * CUSTODIO (patron real): un solo escritor del store — la ADMISION asienta via
 * guard de rol en _anotar; la lectura (_consultar) no muta; la escritura valida,
 * apila y guarda. Persiste por proyecto con PosPersistencia (storage
 * /contabilidad/historial-proceso-contable/*.json), restaura en
 * project.activated y vuelca en onUnload. Emisor/par de fallo. Absorbe ademas
 * las trazas de la cadena por EVENTO (hecho_admitido, excepcion_encolada,
 * excepcion_resuelta) sin require cruzado.
 *
 * Ver hoja P2 del diseno-oop y bloque `historial-proceso-contable` de la espina enki-plan.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor del historial — la ADMISION anota; los demas son lectores.
const ROL_ADMISION = 'ADMISION';

class HistorialProcesoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'historial-proceso-contable';
    this.version = 'reflejo-0.1.0';
    // store en memoria (append-only): project_id -> { esquema, entradas: [] }
    this._store = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'historial-proceso-contable.json',
      dir: '/contabilidad/historial-proceso-contable',
      snapshot: (pid) => {
        const d = this._store.get(pid);
        return d ? { project_id: pid, ...d } : null;
      },
      hidratar: (pid, data) => {
        if (data && data.entradas) this._store.set(pid, data);
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el historial del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handlers RPC ──
  onAnotarRequest(e) {
    return this._atender(e, 'anotar', 'contabilidad.historial.anotar.response', async (d) => {
      const res = this._anotar(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.historial_anotado', {
          ...res.data,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('contabilidad.historial.anotar.failed', res);
      }
      return res;
    });
  }

  onConsultarRequest(e) {
    return this._atender(e, 'consultar', 'contabilidad.historial.consultar.response', async (d) => {
      const res = this._consultar(d);
      if (res.status !== 200) this.eventBus?.publish('contabilidad.historial.consultar.failed', res);
      return res;
    });
  }

  // ── trazas por EVENTO (fire-and-forget, escritor ADMISION) ──
  onHechoAdmitido(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._anotar({
      project_id: d.project_id,
      rol: ROL_ADMISION,
      entrada: { tipo: 'HECHO_ADMITIDO', vertical: d.vertical, detalle: d, correlation_id: d.correlation_id }
    });
  }

  onExcepcionEncolada(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._anotar({
      project_id: d.project_id,
      rol: ROL_ADMISION,
      entrada: { tipo: 'EXCEPCION_ENCOLADA', cola: d.cola, detalle: d, correlation_id: d.correlation_id }
    });
  }

  onExcepcionResuelta(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return null;
    return this._anotar({
      project_id: d.project_id,
      rol: ROL_ADMISION,
      entrada: { tipo: 'EXCEPCION_RESUELTA', cola: d.cola, detalle: d, correlation_id: d.correlation_id }
    });
  }

  // ── proyecciones puras ──
  _obtenerOCrear(pid) {
    let d = this._store.get(pid);
    if (!d) {
      d = { esquema: 'contabilidad-historial-proceso-contable-v1', entradas: [] };
      this._store.set(pid, d);
      this._persist.marcarDirty(pid);
    }
    return d;
  }

  // anotar(entrada) — single-writer ADMISION. APPEND-ONLY: solo crece.
  _anotar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');

    const rol = String((input && input.rol) || '').toUpperCase();
    if (rol !== ROL_ADMISION) {
      return this._errorResponse(403, 'PERMISSION_DENIED', 'solo ADMISION anota en el historial', {
        rol_esperado: ROL_ADMISION, rol_recibido: rol
      });
    }

    const entrada = input && input.entrada;
    if (!entrada || typeof entrada !== 'object') return this._invalid('entrada');

    const d = this._obtenerOCrear(pid);
    const asiento = {
      seq: d.entradas.length + 1,
      tipo: entrada.tipo || null,
      vertical: entrada.vertical || null,
      cola: entrada.cola || null,
      detalle: entrada.detalle || null,
      anotado_en: new Date().toISOString(),
      anotado_por: ROL_ADMISION
    };
    d.entradas.push(asiento);
    d.updated_at = new Date().toISOString();
    this._persist.marcarDirty(pid);

    return { status: 200, data: { project_id: pid, entrada: asiento, total: d.entradas.length } };
  }

  // consultar(desde, hasta) -> Historial (no muta).
  _consultar(input) {
    const pid = input && input.project_id;
    if (!pid) return this._invalid('project_id');
    const d = this._obtenerOCrear(pid);
    const desde = Number.isFinite(input && input.desde) ? input.desde : 0;
    const hasta = Number.isFinite(input && input.hasta) ? input.hasta : d.entradas.length;
    const entradas = d.entradas.filter((x) => x.seq > desde && x.seq <= hasta);
    return { status: 200, data: { project_id: pid, desde, hasta, total: d.entradas.length, entradas } };
  }

  // Alias semantico: historial plano del proceso del proyecto.
  historialProceso(pid) {
    if (!pid) return [];
    const d = this._store.get(pid);
    return d ? d.entradas : [];
  }

  // ── Tools ──
  toolAnotar(params) { return this._anotar(params); }
  toolConsultar(params) { return this._consultar(params); }
}

module.exports = HistorialProcesoContable;
