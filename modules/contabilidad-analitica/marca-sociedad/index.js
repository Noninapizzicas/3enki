/**
 * contabilidad-analitica/marca-sociedad — REFLEJO STATELESS (I1, hoja del plan).
 *
 * Etiqueta cada asiento con su SOCIEDAD. Mecanico, cero juicio: NO decide a que
 * sociedad pertenece un asiento (eso lo declara quien lo emite / el criterio del
 * jefe) — solo APONE la marca declarada y la propaga a los renglones.
 *
 * Sirve a la consolidacion: cada asiento queda identificado con la sociedad que lo
 * origina, de modo que `eliminacion-intercompany` (I2) y `consolidacion` (I3) puedan
 * operar por sociedad sin ambiguedad.
 *
 * Invariante: dato ausente = desconocido. Sin `sociedad` declarada NO se inventa una
 * (no se marca con un default): se declara `sin_marca` y queda en `abierto`.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja I1 del plan-construccion y diseno-oop.md (CLASE MarcaSociedad).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class MarcaSociedad extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'marca-sociedad';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onMarcarRequest(e) {
    return this._atender(e, 'marcar', 'marca-sociedad.marcar.response', async (d) => {
      const res = this._marcar(d);
      // Reflejo: apone la marca declarada; no escribe estado → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('marca-sociedad.marcar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // marcar(asiento, sociedad) → asiento con su sociedad (mecanico)
  // ══════════════════════════════════════════════════════════════════════
  _marcar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const asiento = (input.asiento && typeof input.asiento === 'object') ? input.asiento
      : ((input.a && typeof input.a === 'object') ? input.a : null);
    if (!asiento) return this._invalid('asiento');

    // La SOCIEDAD es DECLARADA: entra como dato. Sin ella NO se inventa una marca.
    const sociedad = this._sociedad(input);
    const soc = sociedad != null ? String(sociedad).trim() : '';
    if (!soc) {
      // No se marca con un default: se declara que el asiento queda sin sociedad.
      return {
        status: 200,
        data: {
          project_id: pid,
          tipo: 'marca-sociedad',
          asiento: this._conMarca(asiento, null),
          sociedad: null,
          marcado: false,
          sin_marca: true,
          abierto: { sociedad: 'el asiento no declara sociedad: se marca el hueco, no se inventa una' }
        }
      };
    }

    const marcado = this._conMarca(asiento, soc);
    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'marca-sociedad',
        asiento: marcado,
        sociedad: soc,
        marcado: true,
        sin_marca: false,
        en_dudoso: false,
        abierto: { sociedad: null }
      }
    };
  }

  // Apone la marca a la CABEZA del asiento y a cada RENGLON (mecanico, sin juicio).
  _conMarca(asiento, sociedad) {
    const out = { ...asiento, sociedad };
    const renglones = Array.isArray(asiento.renglones) ? asiento.renglones
      : (Array.isArray(asiento.lineas) ? asiento.lineas : null);
    if (renglones) {
      out.renglones = renglones.map((r) => (r && typeof r === 'object') ? { ...r, sociedad } : r);
    }
    return out;
  }

  // La sociedad declarada: `sociedad` o `sociedad_id`. Ausente → null (no se estima).
  _sociedad(input = {}) {
    const raw = input.sociedad !== undefined ? input.sociedad
      : (input.sociedad_id !== undefined ? input.sociedad_id : null);
    if (raw === null || raw === undefined) return null;
    const s = String(raw).trim();
    return s || null;
  }

  // ── Tools ──
  toolMarcar(params) { return this._marcar(params); }
}

module.exports = MarcaSociedad;
