/**
 * contabilidad-entrada/historial-proceso-contable — CUSTODIO CON PERSISTENCIA (P2, hoja del plan).
 *
 * Registro APPEND-ONLY e inmutable de lo PROCESADO y lo FALLADO, con su rastro (quien/cuando/
 * de donde vino/si cayo a cola). Es el historial del PROCESO DE ENTRADA — no del asiento.
 *   != `traza-asiento` (B4), que registra el ASIENTO, no el proceso de entrada.
 *
 * UN SOLO ESCRITOR de la parcela: el anotador (`HISTORIAL_PROCESO_CONTABLE`); cualquier otro rol
 * es rechazado (segundo escritor → 403).
 *
 * Invariantes:
 *  - APPEND-ONLY: cada registro se APILA con su secuencia; NADA se borra, NADA se sobrescribe.
 *  - El registro exige su RESULTADO declarado (PROCESADO|FALLADO); sin resultado NO se anota
 *    (dato ausente = desconocido: no se aprime un resultado que no consta).
 *  - El ABIERTO se declara, no se oculta: un registro sin motivo/asunto se apila con sus huecos.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + GUARD de escritor.
 * Ver hoja P2 del plan-construccion y diseno-oop.md (CLASE HistorialProcesoContable).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

// Rol unico escritor de la parcela del historial del proceso.
const ROL_ESCRITOR = 'HISTORIAL_PROCESO_CONTABLE';

// Resultados declarables de una anotacion del proceso.
const RESULTADOS = new Set(['PROCESADO', 'FALLADO']);

class HistorialProcesoContable extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'historial-proceso-contable';
    this.version = 'reflejo-0.1.0';
    // store en memoria: project_id -> { esquema, registros: [append-only] }
    this._historiales = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'historial-proceso-contable.json',
      dir: '/contabilidad/historial-proceso-contable',
      snapshot: (pid) => {
        const h = this._historiales.get(pid);
        return h ? { project_id: pid, esquema: h.esquema, registros: h.registros } : null;
      },
      hidratar: (pid, data) => {
        if (!data) return;
        this._historiales.set(pid, {
          esquema: data.esquema || 'contabilidad-historial-proceso-v1',
          registros: Array.isArray(data.registros) ? data.registros : []
        });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura el historial del proceso del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC (una linea, delega a _atender) ──
  onAnotarRequest(e) {
    return this._atender(e, 'anotar', 'historial-proceso-contable.anotar.response', async (d) => {
      const res = this._anotar(d);
      if (res.status === 200) {
        // Exito → evento de dominio: el proceso quedo anotado (append-only).
        this.eventBus?.publish('contabilidad.proceso_anotado', {
          project_id: res.data.project_id,
          registro: res.data.registro,
          resultado: res.data.registro.resultado,
          anotado: true,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('historial-proceso-contable.anotar.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion de lectura (NO muta) ──
  _obtenerOCrear(pid) {
    let h = this._historiales.get(pid);
    if (!h) {
      h = { esquema: 'contabilidad-historial-proceso-v1', registros: [] };
      this._historiales.set(pid, h);
      this._persist.marcarDirty(pid);
    }
    return h;
  }

  // Historial plano del proyecto (mismo proceso) — solo lectura.
  historialDe(pid) {
    const h = pid ? this._historiales.get(pid) : null;
    return h ? [...h.registros] : [];
  }

  // ── proyeccion de escritura (UN escritor) — APPEND-ONLY ──
  _anotar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // GUARD de escritor: solo el anotador puede escribir en la parcela.
    if (input.rol !== ROL_ESCRITOR) {
      return this._errorResponse(403, 'PERMISSION_DENIED',
        'solo el anotador (HISTORIAL_PROCESO_CONTABLE) puede escribir el historial del proceso',
        { rol_esperado: ROL_ESCRITOR, rol_recibido: input.rol ?? null });
    }

    const r = input.registro || input.r;
    if (!r || typeof r !== 'object') return this._invalid('registro');

    // El RESULTADO es obligatorio: sin el NO se sabe si se proceso o fallo → no se anota.
    const resultado = this._resultado(r.resultado != null ? r.resultado : r.estado);
    if (!resultado) return this._invalid('registro.resultado');

    const motivo = r.motivo != null ? String(r.motivo).trim() : null;

    const hist = this._obtenerOCrear(pid);
    // Append-only: el registro se apila con su secuencia; NUNCA se sobrescribe.
    const registro = {
      id: `${pid}-p${hist.registros.length + 1}`,
      secuencia: hist.registros.length + 1,
      resultado,
      asunto: r.asunto != null ? String(r.asunto) : null,
      origen: r.origen != null ? String(r.origen) : null,
      motivo,
      // El rastro: por donde paso y si cayo a cola. Se copia lo declarado; lo ausente = null.
      fases: Array.isArray(r.fases) ? r.fases.map((f) => String(f)) : [],
      en_cola: r.en_cola === true,
      destino_cola: r.destino_cola != null ? String(r.destino_cola) : null,
      detalle: r.detalle && typeof r.detalle === 'object' ? r.detalle : null,
      hecho_id: r.hecho_id != null ? String(r.hecho_id) : null,
      documento_id: r.documento_id != null ? String(r.documento_id) : null,
      anotado_por: ROL_ESCRITOR,
      en: r.en != null ? String(r.en) : new Date().toISOString()
    };
    hist.registros.push(registro);
    hist.updated_at = registro.en;
    this._persist.marcarDirty(pid);

    return {
      status: 200,
      data: {
        project_id: pid,
        registro,
        anotado: true,
        total: hist.registros.length,
        // NADA se borra: el historial SOLO crece.
        append_only: true,
        abierto: {
          motivo: motivo ? null : 'el registro no declaró un motivo (se anota el hueco, no se inventa)'
        }
      }
    };
  }

  _resultado(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    const v = String(raw).toUpperCase().trim();
    return RESULTADOS.has(v) ? v : null;
  }

  // ── Tools ──
  toolAnotar(params) { return this._anotar(params); }
}

module.exports = HistorialProcesoContable;
