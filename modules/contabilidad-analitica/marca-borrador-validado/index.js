/**
 * contabilidad-analitica/marca-borrador-validado — REFLEJO STATELESS (Q4, hoja del plan).
 *
 * El SELLO del punto en que esta lo que se ve: 'en curso' / 'revisado' / 'firmado'. Existe para
 * que NO se decida sobre un borrador vivo: quien lee una cifra sabe si esta mirando hierro o
 * un documento a medio hacer.
 *
 * Es unico sello lo DERIVA de los hechos ya ocurridos, sin recalculos de dominio:
 *   · contabilidad.traza_registrada  (traza-asiento B4)    → hay asiento trazado  → al menos 'revisado'
 *   · contabilidad.revision_firmada  (flujo-firma L3)      → el asesor firmo      → 'firmado'
 * La marca no la impone el reflejo: la acumula a partir de los hechos que ESCUCHA y la DECLARA.
 *
 * Invariantes:
 *  - Dato ausente = desconocido: sin ningun hecho visto, el sello es 'EN_CURSO' y se declara
 *    que no hay borrador validado (no se inventa una validacion).
 *  - NUNCA degrada: una vez firmado, re-trazar no lo baja a 'revisado'; el sello SOLO sube.
 *  - NO escribe dominio, NO persiste; su registro de sellos es un DERIVADO en memoria.
 *
 * R3 · ESCUCHA: contabilidad.traza_registrada (traza-asiento B4) y contabilidad.revision_firmada
 * (flujo-firma L3) — AMBOS con emisor vivo.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. RPC PREGUNTA → sin ui_handler.
 * Ver hoja Q4 del plan-construccion y diseno-oop.md (CLASE MarcaBorradorValidado).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// El sello del punto en que esta lo que se ve. SOLO sube (EN_CURSO < REVISADO < FIRMADO).
const ORDEN_SELLO = { EN_CURSO: 0, REVISADO: 1, FIRMADO: 2 };

class MarcaBorradorValidado extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marca-borrador-validado';
    this.version = 'reflejo-0.1.0';
    // Registro DERIVADO en memoria: project_id -> Map<clave, {sello, en, ...}>
    this._sellos = new Map();
  }

  async onUnload() { return super.onUnload(); }

  // ── handlers FIRE-AND-FORGET: los hechos que mueven el sello ──
  // No son RPC: no publican response. Acumulan el sello (SOLO sube).
  onTrazaRegistrada(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      const clave = this._claveDe(d);
      if (!pid || !clave) return;
      // Un asiento trazado = al menos revisado.
      this._subirSello(pid, clave, 'REVISADO', d);
    } catch (err) {
      this.logger?.error(`${this.name}.traza_registrada.error`, { error: err.message });
    }
  }

  onRevisionFirmada(e) {
    const d = (e && (e.data || e)) || {};
    try {
      const pid = d.project_id || this.project_id;
      const clave = this._claveDe(d);
      if (!pid || !clave) return;
      // El asesor firmo = firmado.
      this._subirSello(pid, clave, 'FIRMADO', d);
    } catch (err) {
      this.logger?.error(`${this.name}.revision_firmada.error`, { error: err.message });
    }
  }

  // ── handler RPC PREGUNTA (sin ui_handler: su cara es el bus) ──
  onEstadoRequest(e) {
    return this._atender(e, 'estado', 'marca-borrador-validado.estado.response', async (d) => {
      const res = this._estado(d);
      // PREGUNTA: deriva el sello; no escribe dominio → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('marca-borrador-validado.estado.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // estado(clave) → sello del punto en que esta lo que se ve (PREGUNTA)
  // ══════════════════════════════════════════════════════════════════════
  _estado(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const clave = input.clave != null ? String(input.clave).trim()
      : (input.referencia != null ? String(input.referencia).trim() : '');
    if (!clave) return this._invalid('clave');

    const registro = this._sellos.get(pid) || null;
    const sello = registro ? (registro.get(clave) || null) : null;

    if (!sello) {
      // Sin hechos vistos: es un borrador VIVO. No se decide sobre el (no hay validacion inventada).
      return {
        status: 200,
        data: {
          project_id: pid,
          clave,
          sello: 'EN_CURSO',
          validado: false,
          borrador_vivo: true,
          firmado: false,
          abierto: { validacion: 'no se ha visto ningun hecho (traza/firma) para esta clave: sigue siendo un borrador vivo' }
        }
      };
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        clave,
        sello: sello.sello,
        validado: sello.sello !== 'EN_CURSO',
        borrador_vivo: false,
        firmado: sello.sello === 'FIRMADO',
        firmado_por: sello.firmado_por || null,
        visto_en: sello.en,
        abierto: { validacion: null }
      }
    };
  }

  // Sube el sello del hecho (NUNCA lo baja: EN_CURSO < REVISADO < FIRMADO).
  _subirSello(pid, clave, sello, d) {
    let registro = this._sellos.get(pid);
    if (!registro) {
      registro = new Map();
      this._sellos.set(pid, registro);
    }
    const actual = registro.get(clave) || { sello: 'EN_CURSO', en: null };
    const nuevo = ORDEN_SELLO[sello] > ORDEN_SELLO[actual.sello] ? sello : actual.sello;
    registro.set(clave, {
      sello: nuevo,
      en: d.en != null ? String(d.en) : new Date().toISOString(),
      firmado_por: sello === 'FIRMADO' ? (d.firmado_por || (d.revision && d.revision.firmado_por) || null) : (actual.firmado_por || null)
    });
  }

  // La clave del sello: la referencia del asiento/revision, o su asiento_id.
  _claveDe(d) {
    const raw = d.clave !== undefined ? d.clave
      : (d.referencia !== undefined ? d.referencia
        : (d.asiento_id !== undefined ? d.asiento_id
          : (d.revision && d.revision.clave !== undefined ? d.revision.clave : null)));
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    return s || null;
  }

  // Lectura directa (mismo proceso) — no muta.
  sellosDe(pid) {
    const r = pid ? this._sellos.get(pid) : null;
    return r ? [...r.entries()].map(([clave, s]) => ({ clave, ...s })) : [];
  }

  // ── Tools ──
  toolEstado(params) { return this._estado(params); }
}

module.exports = MarcaBorradorValidado;
