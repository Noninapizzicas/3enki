/**
 * contabilidad-fiscal/liquidacion-iva — REFLEJO STATELESS (D1, hoja del plan).
 *
 * IVA devengado / soportado DERIVADO del libro. El IVA va por DEVENGO (C3 separa caja/devengo).
 * LOS TIPOS SON DATO: la ley entra como dato declarado, NUNCA cableamos tipos de IVA aqui.
 *
 *   · NO calcula la cifra por su cuenta (eso es mayor-balanza): RECIBE los saldos/lineas (o los
 *     sube por EVENTO a mayor-balanza.saldos.request) y AISLA las cuentas de IVA.
 *   · devengado = IVA repercutido (salida, cuentas 477); soportado = IVA deducible (entrada, 472).
 *   · si las lineas traen su TIPO declarado, se desglosa por tipo; el tipo NO se adivina.
 *   · resultado = devengado − soportado (a ingresar si > 0, a compensar/devolver si < 0).
 *
 * Honestidad (invariante 13): sin saldos no se inventa la liquidacion; una cuenta de IVA sin
 * naturaleza declarada ni prefijo reconocible NO se cuenta — se declara en `abierto`.
 *
 * NO escribe, NO persiste. RPC calcular es CLASE PREGUNTA → sin ui_handler.
 * Publica liquidacion-iva.calcular.response y su par .failed.
 * Escucha contabilidad.asiento_asentado (escritor-diario B2) y contabilidad.ejercicio_cerrado (C4).
 * Ver hoja D1 del plan-construccion y diseno-oop.md (CLASE LiquidacionIva).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class LiquidacionIva extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'liquidacion-iva';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea). CLASE PREGUNTA → sin ui_handler ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'liquidacion-iva.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('liquidacion-iva.calcular.failed', res);
      return res;
    });
  }

  // ── handlers de dominio (fire-and-forget): se observa el libro (ventana acotada) ──
  onAsientoAsentado(e) {
    const d = (e && (e.data || e)) || {};
    this._vistos = this._vistos || [];
    if (d.asiento) this._vistos.push(d.asiento);
    if (this._vistos.length > 1000) this._vistos.shift();
  }

  onEjercicioCerrado(e) {
    const d = (e && (e.data || e)) || {};
    this._cierres = this._cierres || [];
    if (d.estado === 'cerrado') this._cierres.push(d);
    if (this._cierres.length > 100) this._cierres.shift();
  }

  // ══════════════════════════════════════════════════════════════════════
  // calcular(saldos) → { devengado, soportado, resultado, por_tipo, abierto }
  // ══════════════════════════════════════════════════════════════════════
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { saldos, fuente } = await this._saldosDe(input);

    let devengado = 0, soportado = 0;
    const porTipo = new Map();
    const detalle = [];
    const noClasificables = [];

    for (const s of saldos) {
      const cuenta = s && s.cuenta != null ? String(s.cuenta) : null;
      const lado = this._lado(s, cuenta);
      if (!lado) { if (this._esIva(s, cuenta)) noClasificables.push({ cuenta, saldo: this._saldo(s) }); continue; }
      const base = s && s.base_imponible != null ? Number(s.base_imponible) : null;
      const cuota = Math.abs(s && s.cuota != null ? Number(s.cuota) : this._saldo(s));
      const tipo = await this._tipo(s, input, lado);

      const acc = porTipo.get(tipo === null ? '(sin_tipo)' : String(tipo)) || { tipo, base: 0, cuota: 0, lado };
      if (base !== null) acc.base = this._round(acc.base + base, 2);
      acc.cuota = this._round(acc.cuota + cuota, 2);
      porTipo.set(tipo === null ? '(sin_tipo)' : String(tipo), acc);

      if (lado === 'devengado') devengado += cuota; else soportado += cuota;
      detalle.push({ cuenta, lado, tipo, base_imponible: base, cuota: this._round(cuota, 2) });
    }

    devengado = this._round(devengado, 2);
    soportado = this._round(soportado, 2);
    const resultado = this._round(devengado - soportado, 2);
    const sinTipo = detalle.filter((d) => d.tipo === null).length;

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'liquidacion-iva',
        fuente: fuente || null,
        // El IVA va por DEVENGO (C3 separa caja/devengo).
        criterio: 'devengo',
        devengado,
        soportado,
        resultado,
        a_ingresar: resultado > 0 ? resultado : 0,
        a_compensar: resultado < 0 ? this._round(-resultado, 2) : 0,
        por_tipo: [...porTipo.values()].map((t) => ({ ...t, base: this._round(t.base, 2), cuota: this._round(t.cuota, 2) })),
        detalle,
        determinista: true,
        // La ley entra como DATO: sin tipo declarado la cuota se computa pero el tipo queda ABIERTO.
        tipos_cableados: false,
        abierto: {
          fuente: fuente ? null : 'no se recibieron saldos (ni declarados ni de mayor-balanza): la liquidacion no se inventa',
          tipo: sinTipo
            ? `${sinTipo} linea(s) sin tipo declarado: la cuota se computa pero el tipo queda sin desglosar (la ley entra como DATO)`
            : null,
          clasificacion: noClasificables.length
            ? `${noClasificables.length} cuenta(s) de IVA sin naturaleza declarada ni prefijo reconocible (477 devengado / 472 soportado): no se suman`
            : null
        }
      }
    };
  }

  async _saldosDe(input) {
    if (Array.isArray(input.saldos)) return { saldos: input.saldos, fuente: 'declarado' };
    if (Array.isArray(input.lineas)) return { saldos: input.lineas, fuente: 'declarado' };
    const resp = await this._rpc('mayor-balanza.saldos.request', {
      project_id: input.project_id || this.project_id,
      fecha: input.fecha, ejercicio: input.ejercicio
    }, { timeout_ms: 800 });
    if (resp && Array.isArray(resp.saldos)) return { saldos: resp.saldos, fuente: 'mayor-balanza' };
    return { saldos: [], fuente: null };
  }

  _esIva(s, cuenta) {
    const decl = s && (s.tipo || s.naturaleza);
    if (decl && /iva/i.test(String(decl))) return true;
    const c = String(cuenta || '');
    return c.startsWith('472') || c.startsWith('477') || c.startsWith('4700');
  }

  // Lado: declarado, o por prefijo PGC (477 devengado/repercutido · 472 soportado/deducible).
  _lado(s, cuenta) {
    const decl = s && (s.lado || s.naturaleza || s.tipo);
    if (decl) {
      const v = String(decl).toLowerCase();
      if (v.includes('deveng') || v.includes('repercut') || v.includes('salid')) return 'devengado';
      if (v.includes('soport') || v.includes('deducib') || v.includes('entrad')) return 'soportado';
    }
    const c = String(cuenta || '');
    if (c.startsWith('477')) return 'devengado';
    if (c.startsWith('472')) return 'soportado';
    return null;
  }

  // El TIPO es DATO declarado por la linea o por la peticion. Nunca cableado.
  async _tipo(s, input, lado) {
    const raw = (s && (s.tipo_iva != null ? s.tipo_iva : (s.tipo_impositivo != null ? s.tipo_impositivo : s.tipo_declarado))) != null
      ? (s.tipo_iva != null ? s.tipo_iva : (s.tipo_impositivo != null ? s.tipo_impositivo : s.tipo_declarado))
      : (input && input.tipos && input.tipos[lado] != null ? input.tipos[lado] : null);
    if (raw === null || raw === undefined || raw === '') return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
  }

  _saldo(s) {
    const n = Number(s && (s.saldo != null ? s.saldo : (Number(s.debe || 0) - Number(s.haber || 0))));
    return Number.isFinite(n) ? n : 0;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = LiquidacionIva;
