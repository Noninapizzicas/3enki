/**
 * contabilidad-fiscal/conceptos-extra-nomina — REFLEJO STATELESS (G9, hoja del plan).
 *
 * DIETAS, ESPECIE, FINIQUITO, PAGA EXTRA: calculo de SU IMPUTACION. El diseno lo dice literal:
 * `imputar(c:Concepto):Set<Apunte>`, con `conceptos:Set<Concepto>`. Calculo PURO, determinista:
 * mismo concepto declarado + misma regla declarada → mismo apunte.
 *
 * LOS CONCEPTOS SON DECLARABLES (invariante LEY/PARAMETRO COMO DATO): aqui NO se cablea que es
 * una dieta, ni que la especie exonera, ni que la paga extra se prorratea, ni ningun tratamiento
 * fiscal. El negocio DECLARA cada concepto y su TRATAMIENTO (`tratamiento`: la cuenta/rol destino,
 * si es exento, si integra la base, si es de un solo pago). Aplicar el tratamiento declarado es
 * puro; INVENTAR un tratamiento es lo que este reflejo NO hace.
 *
 * ESTE MODULO NO DECIDE: no valora el concepto, no decide si esta exento y no calcula retencion
 * alguna. Deriva los apuntes que la regla DECLARADA produce; si un concepto no trae tratamiento,
 * queda `[ABIERTO]` (no se le asigna uno por defecto).
 *
 * Invariante: dato ausente = desconocido. Un concepto sin importe o sin tratamiento queda
 * declarado como abierto; jamas se rellena con 0 ni se le supone un tratamiento.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G9 del plan-construccion y diseno-oop.md (CLASE ConceptosExtraNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ConceptosExtraNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conceptos-extra-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onImputarRequest(e) {
    return this._atender(e, 'imputar', 'conceptos-extra-nomina.imputar.response', async (d) => {
      const res = this._imputar(d);
      if (res.status !== 200) this.eventBus?.publish('conceptos-extra-nomina.imputar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: imputar(concepto/s, tratamiento declarado) → Set<Apunte> ──
  _imputar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const raw = Array.isArray(input.conceptos) ? input.conceptos
      : (input.concepto !== undefined && input.concepto !== null ? [input.concepto] : null);
    if (raw === null) return this._invalid('concepto');

    // El TRATAMIENTO es DECLARABLE: mapa {concepto: {cuenta|rol_destino, exento?, integra_base?, pago_unico?}}
    // o una regla unica declarada en la peticion. Sin ninguno, cada concepto se declara sin tratamiento.
    const catalogo = this._catalogo(input.tratamientos || input.reglas);
    const tratamiento_unico = this._tratamiento(input.tratamiento);

    const faltantes = [];
    const apuntes = [];
    const conceptos = [];

    raw.forEach((c, i) => {
      const obj = (c && typeof c === 'object') ? c : { concepto: c, importe: null };
      const nombre = obj.concepto != null ? String(obj.concepto) : (obj.nombre != null ? String(obj.nombre) : null);
      if (nombre === null) faltantes.push(`conceptos[${i}].concepto`);

      const importe = this._num(obj.importe);
      if (importe === null) faltantes.push(`conceptos[${i}].importe`);

      // El tratamiento: el declarado en el propio concepto, en el catalogo declarado, o el unico declarado.
      const t = this._tratamiento(obj.tratamiento)
        || (nombre !== null ? catalogo[nombre] : null)
        || tratamiento_unico;
      if (!t) faltantes.push(`conceptos[${i}].tratamiento`);

      const concepto = {
        concepto: nombre,
        importe,
        clase: obj.clase != null ? String(obj.clase) : null,
        cantidad: this._num(obj.cantidad),
        precio: this._num(obj.precio),
        especie: obj.especie === true ? true : (obj.especie === false ? false : null),
        tratamiento: t,
        // Sin tratamiento declarado el concepto queda ABIERTO: no se le supone uno.
        abierto: t === null,
        imputable: t !== null && importe !== null
      };
      conceptos.push(concepto);

      if (concepto.imputable) {
        // Aplicar el tratamiento DECLARADO es puro: se generan los apuntes que la regla produce.
        apuntes.push({
          concepto: nombre,
          importe,
          cuenta: t.cuenta,
          rol_destino: t.rol_destino,
          exento: t.exento,
          integra_base: t.integra_base,
          pago_unico: t.pago_unico,
          signo: t.signo,
          origen_tratamiento: t.origen
        });
      }
    });

    const completos = conceptos.filter((c) => c.imputable);
    const total_imputado = completos.length === conceptos.length && conceptos.length > 0
      ? this._round(completos.reduce((s, c) => s + (c.importe * (c.tratamiento.signo || 1)), 0), 2)
      : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        empleado: input.empleado != null ? String(input.empleado) : null,
        periodo: input.periodo != null ? String(input.periodo) : null,
        conceptos,
        apuntes,
        total_imputado,
        // El tratamiento/la ley es DATO: se declara el origen, no se cablea ningun tratamiento.
        tratamiento_origen: Object.keys(catalogo).length > 0 ? 'declarado' : (tratamiento_unico ? 'declarado_unico' : null),
        tratamientos_cableados: false,
        // El modulo NO valora ni decide exenciones: aplica la regla declarada.
        decide: false,
        aplica_regla_declarada: true,
        calculo_puro: true,
        faltantes,
        abierto: faltantes.length > 0,
        motivo: faltantes.length > 0
          ? `hay conceptos sin importe o sin tratamiento declarado: ${faltantes.join(', ')} (no se les supone nada)`
          : null
      }
    };
  }

  // El catalogo de tratamientos es DECLARABLE: {concepto: {cuenta, exento, integra_base, pago_unico, signo, rol_destino}}.
  _catalogo(raw) {
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
    const out = {};
    for (const [concepto, v] of Object.entries(raw)) {
      const t = this._tratamiento(v);
      if (t) out[concepto] = t;
    }
    return out;
  }

  _tratamiento(raw) {
    if (!raw || typeof raw !== 'object') return null;
    const cuenta = raw.cuenta != null ? String(raw.cuenta) : null;
    const rol_destino = raw.rol_destino != null ? String(raw.rol_destino) : (raw.rol != null ? String(raw.rol) : null);
    // Un tratamiento sin destino declarado no es aplicable: no se inventa la cuenta.
    if (cuenta === null && rol_destino === null) return null;
    return {
      cuenta,
      rol_destino,
      exento: raw.exento === true ? true : (raw.exento === false ? false : null),
      integra_base: raw.integra_base === true ? true : (raw.integra_base === false ? false : null),
      pago_unico: raw.pago_unico === true ? true : (raw.pago_unico === false ? false : null),
      signo: this._signo(raw.signo),
      origen: 'declarado'
    };
  }

  _signo(raw) {
    if (raw === undefined || raw === null || raw === '') return 1;   // neutro declarado
    if (typeof raw === 'number') return raw < 0 ? -1 : 1;
    const s = String(raw).trim().toLowerCase();
    if (s === '-1' || s === '-' || s === 'negativo' || s === 'deduccion' || s === 'debe') return -1;
    return 1;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolImputar(params) { return this._imputar(params); }
}

module.exports = ConceptosExtraNomina;
