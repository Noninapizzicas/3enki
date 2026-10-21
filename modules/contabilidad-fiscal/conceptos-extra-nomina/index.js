/**
 * contabilidad-fiscal/conceptos-extra-nomina — REFLEJO STATELESS (G9, hoja del plan).
 *
 * Dietas, especie, finiquito, paga extra: el CALCULO DETERMINISTA de su IMPUTACION
 * (que cuenta, y si es gasto o pasivo). No inventa importes: clasifica lo que la nomina
 * ya declaro y dice como se imputa. El resultado lo escribe B2 (escritor-diario) si toca.
 *
 * Invariante (13): cada concepto declara su tipo y su importe; lo que no declare queda
 * `abierto` — no se estima un importe ni un tipo por defecto.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated. PREGUNTA → sin ui_handler.
 * Ver hoja G9 del plan-construccion y diseno-oop.md (CLASE ConceptosExtraNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Tipos de concepto extra conocidos y su imputacion declarable (naturaleza + cuenta sugerida).
// El MAPA es estructural (nombra la naturaleza); la CUENTA concreta es declarable por el jefe.
const IMPUTACION_CONOCIDA = {
  DIETAS:     { naturaleza: 'GASTO',   cuenta: '629' },
  ESPECIE:    { naturaleza: 'GASTO',   cuenta: '649' },
  FINIQUITO:  { naturaleza: 'GASTO',   cuenta: '641' },
  PAGA_EXTRA: { naturaleza: 'GASTO',   cuenta: '640' }
};

class ConceptosExtraNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conceptos-extra-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onImputarRequest(e) {
    return this._atender(e, 'imputar', 'conceptos-extra-nomina.imputar.response', async (d) => {
      const res = this._imputar(d);
      // Reflejo: calcula la imputacion; no escribe → no hay hecho que anunciar (B2 lo anuncia si toca).
      if (res.status !== 200) this.eventBus?.publish('conceptos-extra-nomina.imputar.failed', res);
      return res;
    });
  }

  // ── handler de dominio (fire-and-forget): al recibirse una nomina, se imputan sus extras ──
  async onNominaRecibida(e) {
    const d = (e && (e.data || e)) || {};
    if (!d.project_id) return;
    const nomina = d.nomina || {};
    const conceptos = Array.isArray(d.conceptos) ? d.conceptos
      : (Array.isArray(nomina.conceptos_extra) ? nomina.conceptos_extra : []);
    if (conceptos.length === 0) return; // sin extras declarados no hay nada que imputar
    this._imputar({ project_id: d.project_id, conceptos, periodo: d.periodo || nomina.periodo });
  }

  // ══════════════════════════════════════════════════════════════════════
  // _imputar(input) → { status, data }  ·  calculo determinista de la imputacion
  // ══════════════════════════════════════════════════════════════════════
  _imputar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const conceptos = Array.isArray(input.conceptos) ? input.conceptos
      : (input.concepto ? [input.concepto] : []);
    if (conceptos.length === 0) return this._invalid('conceptos');

    let total = 0;
    const imputaciones = conceptos.filter((c) => c && typeof c === 'object').map((c) => {
      const tipo = c.tipo != null ? String(c.tipo).toUpperCase().trim() : null;
      const importe = Number.isFinite(Number(c.importe)) ? this._round(Number(c.importe), 2) : null;
      const conocida = tipo ? IMPUTACION_CONOCIDA[tipo] : null;
      if (importe != null) total += importe;
      return {
        tipo,
        importe,
        // La imputacion: naturaleza + cuenta sugerida (la cuenta concreta es declarable).
        naturaleza: conocida ? conocida.naturaleza : null,
        cuenta: c.cuenta != null ? String(c.cuenta) : (conocida ? conocida.cuenta : null),
        conocida: Boolean(conocida),
        periodo: input.periodo != null ? String(input.periodo) : null,
        abierto: {
          tipo: tipo ? null : 'el concepto no declara su tipo (dietas/especie/finiquito/paga extra)',
          importe: importe != null ? null : 'el concepto no declara importe (no se estima)',
          imputacion: conocida ? null : 'el tipo no es conocido: la imputacion queda abierta (no se inventa la cuenta)'
        }
      };
    });

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'conceptos-extra-nomina',
        imputaciones,
        num: imputaciones.length,
        total: this._round(total, 2),
        // Determinista: mismos conceptos → misma imputacion (un test lo afirma).
        determinista: true,
        // Quien escribe si toca es B2.
        escritor: 'escritor-diario',
        abierto: imputaciones.some((i) => Object.values(i.abierto).some(Boolean))
          ? 'hay conceptos sin tipo/importe/regla declarados: sus huecos se declaran, no se estiman'
          : null
      }
    };
  }

  // ── Tools ──
  toolImputar(params) { return this._imputar(params); }
}

module.exports = ConceptosExtraNomina;
