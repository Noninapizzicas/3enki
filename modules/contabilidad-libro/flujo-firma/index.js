/**
 * contabilidad-libro/flujo-firma — CUSTODIO CON PERSISTENCIA (L3, hoja del plan).
 *
 * La PARCELA del estado revisado/firmado del asesor. UN solo escritor.
 *
 * 🔴 EL SISTEMA **NO FIRMA**. Esta hoja NO firma nada: REGISTRA que el asesor firmo (el acto
 * es del humano) y deja constancia del estado. Y una firma VENCE: al vencer EXPIRA y el sistema
 * RE-PREGUNTA — no renueva en silencio, no da por buena una firma caducada.
 *
 *   · firmar — ORDEN: el asesor deja constancia de que reviso/firmo. Si hay vencimiento, se
 *              guarda la fecha; sin vencimiento declarado, la firma NO se inventa vigencia.
 *   · estado — PREGUNTA: ¿cual es el estado de firma de esta revision (vigente/vencida/sin firmar)?
 *
 * Invariantes:
 *  - El sistema NO firma: `firmar` registra un acto DECLARADO (firmado_por obligatorio).
 *  - Una firma VENCIDA no se da por valida: estado → 'VENCIDA' y el sistema re-pregunta.
 *  - Dato ausente = desconocido: sin referencia de revision NO se firma (no se firma el vacio).
 *  - No se borra: re-firmar APPENDEA al historial; la firma vigente es la ultima del asesor.
 *  - Persiste por proyecto con PosPersistencia, restaura en project.activated y vuelca en onUnload.
 *
 * R3 · ESCUCHA: el plan NO declara escucha de dominio para esta hoja (—) y no se anade ninguna:
 * no habria emisor que la respalde.
 *
 * Forma: CUSTODIO → PosPersistencia + onProjectActivated + flush + UN escritor.
 * Ver hoja L3 del plan-construccion y diseno-oop.md (CLASE FlujoFirma).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');

class FlujoFirma extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'flujo-firma';
    this.version = 'reflejo-0.1.0';
    // store: project_id -> { esquema, revisiones: Map<clave, RevisionFirma> }
    this._firmas = new Map();

    this._persist = new PosPersistencia({
      modulo: this,
      file: 'flujo-firma.json',
      dir: '/contabilidad/flujo-firma',
      snapshot: (pid) => {
        const f = this._firmas.get(pid);
        if (!f) return null;
        return { project_id: pid, esquema: f.esquema, revisiones: [...f.revisiones.values()] };
      },
      hidratar: (pid, data) => {
        if (!data) return;
        const revisiones = new Map();
        for (const r of (data.revisiones || [])) {
          if (r && r.clave != null) revisiones.set(String(r.clave), r);
        }
        this._firmas.set(pid, { esquema: data.esquema || 'contabilidad-flujo-firma-v1', revisiones });
      }
    });
  }

  async onUnload() {
    await this._persist.flush();
    this._persist.detener();
    return super.onUnload();
  }

  // Restaura la parcela de firma del proyecto activado.
  onProjectActivated(e) {
    const d = (e && (e.data || e)) || {};
    return this._persist.restaurar(d.project_id);
  }

  // ── handler RPC ORDEN (ui_handler: el asesor firma en el panel) ──
  onFirmarRequest(e) {
    return this._atender(e, 'firmar', 'flujo-firma.firmar.response', async (d) => {
      const res = this._firmar(d);
      if (res.status === 200) {
        // R2 · si ESCRIBE, anuncia el HECHO: el asesor dejo constancia de que firmo (el sistema NO firma).
        this.eventBus?.publish('contabilidad.revision_firmada', {
          project_id: res.data.project_id,
          clave: res.data.revision.clave,
          revision: res.data.revision,
          firmada: res.data.firmada,
          estado: res.data.estado,
          correlation_id: d.correlation_id
        });
        // SUBE a traza-asiento (B4) por EVENTO: la firma queda trazada — nunca import.
        if (res.data.firmada === true) {
          this._rpc('traza-asiento.registrar.request', {
            project_id: res.data.project_id,
            asiento_id: res.data.revision.referencia != null ? String(res.data.revision.referencia) : res.data.revision.clave,
            accion: 'firma',
            actor: res.data.revision.firmado_por,
            rol: res.data.revision.rol || null,
            detalle: { clave: res.data.revision.clave, revisado: res.data.revision.revisado, firmado_en: res.data.revision.firmado_en },
            correlation_id: d.correlation_id
          }, { timeout_ms: 2000 });
        }
      } else {
        this.eventBus?.publish('flujo-firma.firmar.failed', res);
      }
      return res;
    });
  }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'flujo-firma.estado.response', async (d) => {
      const res = this._estado(d);
      // PREGUNTA: deriva; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('flujo-firma.estado.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // firmar(clave, firmado_por, ...) → el asesor dejo constancia (el sistema NO firma)
  // ══════════════════════════════════════════════════════════════════════
  _firmar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const clave = this._clave(input);
    if (!clave) return this._invalid('referencia');

    // El SISTEMA NO FIRMA: la firma es un acto DECLARADO por el asesor. Sin firmante no hay firma.
    const firmado_por = input.firmado_por != null ? String(input.firmado_por).trim()
      : (input.asesor != null ? String(input.asesor).trim() : '');
    if (!firmado_por) return this._invalid('firmado_por');

    const ahora = new Date().toISOString();
    // El vencimiento es DECLARABLE: si no se declara, la firma NO se inventa una vigencia.
    const vence_en = input.vence_en != null ? String(input.vence_en) : null;

    const f = this._obtenerOCrear(pid);
    const existente = f.revisiones.get(clave) || null;

    const revision = existente || {
      clave,
      referencia: input.referencia != null ? String(input.referencia) : null,
      revisado: false,
      firmada: false,
      firmado_por: null,
      rol: null,
      firmado_en: null,
      vence_en: null,
      historial: []
    };
    revision.revisado = input.revisado === undefined ? true : input.revisado === true;
    revision.firmada = true;
    revision.firmado_por = firmado_por;
    revision.rol = input.rol != null ? String(input.rol) : null;
    revision.firmado_en = ahora;
    revision.vence_en = vence_en;
    revision.historial = Array.isArray(revision.historial) ? revision.historial : [];
    revision.historial.push({ revision: revision.revisado, firmado_por, vence_en, en: ahora });

    f.revisiones.set(clave, revision);
    f.updated_at = ahora;
    this._persist.marcarDirty(pid);

    const estado = this._estadoDe(revision, ahora);

    return {
      status: 200,
      data: {
        project_id: pid,
        clave,
        revision,
        firmada: true,
        // El SISTEMA NO FIRMA: esto es constancia del acto declarado del asesor.
        sistema_firma: false,
        constancia_del_asesor: true,
        estado,
        abierto: {
          vence_en: vence_en ? null : 'no se declaro vencimiento: la firma no se inventa una vigencia (vence_en=null)'
        }
      }
    };
  }

  // ══════════════════════════════════════════════════════════════════════
  // estado(clave) → vigente/vencida/sin_firmar (PREGUNTA: ¿sigue valida la firma?)
  // ══════════════════════════════════════════════════════════════════════
  _estado(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const clave = this._clave(input);
    if (!clave) return this._invalid('referencia');

    const f = this._firmas.get(pid) || null;
    const revision = f ? (f.revisiones.get(clave) || null) : null;

    if (!revision) {
      return {
        status: 200,
        data: {
          project_id: pid,
          clave,
          estado: 'SIN_FIRMAR',
          vigente: false,
          firmada: false,
          // Una firma que no consta NO se da por buena: el sistema RE-PREGUNTA.
          re_pregunta: true,
          abierto: { firma: 'no hay firma registrada para esta revision: el sistema re-pregunta al asesor' }
        }
      };
    }

    const estado = this._estadoDe(revision, new Date().toISOString());
    // Una firma VENCIDA no es valida: expira y el sistema re-pregunta (no renueva sola).
    const re_pregunta = estado !== 'VIGENTE';

    return {
      status: 200,
      data: {
        project_id: pid,
        clave,
        revision,
        estado,
        vigente: estado === 'VIGENTE',
        firmada: revision.firmada === true,
        firmado_por: revision.firmado_por,
        firmado_en: revision.firmado_en,
        vence_en: revision.vence_en,
        re_pregunta,
        abierto: { firma: re_pregunta ? 'la firma no esta vigente (vencida o inexistente): el sistema re-pregunta' : null }
      }
    };
  }

  // El estado DERIVADO de una revision: SIN_FIRMAR · VIGENTE · VENCIDA (vence al pasar la fecha).
  _estadoDe(revision, ahora) {
    if (!revision || revision.firmada !== true) return 'SIN_FIRMAR';
    if (!revision.vence_en) return 'VIGENTE';            // sin vencimiento declarado no se inventa vencimiento
    const vence = new Date(revision.vence_en);
    if (Number.isNaN(vence.getTime())) return 'VIGENTE'; // fecha ilegible: no se declara vencida por un dato malo
    return vence.getTime() < new Date(ahora).getTime() ? 'VENCIDA' : 'VIGENTE';
  }

  _clave(input = {}) {
    const raw = input.referencia !== undefined ? input.referencia
      : (input.clave !== undefined ? input.clave
        : (input.revision_id !== undefined ? input.revision_id : null));
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    return s || null;
  }

  _obtenerOCrear(pid) {
    let f = this._firmas.get(pid);
    if (!f) {
      f = { esquema: 'contabilidad-flujo-firma-v1', revisiones: new Map() };
      this._firmas.set(pid, f);
      this._persist.marcarDirty(pid);
    }
    return f;
  }

  // Lectura directa (mismo proceso) — no muta.
  revisionesDe(pid) {
    const f = pid ? this._firmas.get(pid) : null;
    return f ? [...f.revisiones.values()] : [];
  }

  // ── Tools ──
  toolFirmar(params) { return this._firmar(params); }
  toolEstado(params) { return this._estado(params); }
}

module.exports = FlujoFirma;
