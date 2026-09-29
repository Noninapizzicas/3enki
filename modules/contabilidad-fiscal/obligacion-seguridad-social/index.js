/**
 * contabilidad-fiscal/obligacion-seguridad-social — REFLEJO STATELESS (G2, hoja del plan).
 *
 * GASTO DE EMPRESA + OBLIGACION CON LA TGSS, derivados DEL RECIBO y de los TIPOS/BASES que
 * el negocio DECLARA. El diseno lo dice literal: `calcular(n:ReciboNomina):Obligacion`, con
 * `tipos:ParametroDeclarable`. Determinista.
 *
 * LOS TIPOS Y LAS BASES SON DATO (invariante LEY/PARAMETRO COMO DATO): aqui NO se cablea NINGUN
 * tipo de cotizacion, NINGUNA base, NINGUN grupo de tarifa, NINGUNA tabla legal. Todo eso llega
 * DECLARADO por el negocio (`tipos`, `bases`) y se aplica de forma pura (base x tipo).
 *
 * EL RECIBO LLEGA YA CALCULADO por el sistema externo (por EVENTO: recibo-nomina G1, o declarado
 * en la peticion). Aqui NO se calcula la nomina: se COPIAN sus importes para el gasto de empresa.
 *
 * Invariante: dato ausente = desconocido. Una linea de tipo cuya base o tipo no venga declarada
 * queda `importe:null` y se declara en `faltantes`; los totales que dependan de ella quedan null.
 * Jamas se rellena con 0 un tipo que no se declaro, ni se estima una base.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G2 del plan-construccion y diseno-oop.md (CLASE ObligacionSeguridadSocial).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ObligacionSeguridadSocial extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'obligacion-seguridad-social';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onCalcularRequest(e) {
    return this._atender(e, 'calcular', 'obligacion-seguridad-social.calcular.response', async (d) => {
      const res = await this._calcular(d);
      if (res.status !== 200) this.eventBus?.publish('obligacion-seguridad-social.calcular.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: calcular(recibo, tipos declarados, bases declaradas) → Obligacion ──
  async _calcular(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { recibo, origen_recibo } = await this._recibo(pid, input);
    const lineas_tipo = this._tipos(input.tipos);
    const bases = input.bases !== undefined && input.bases !== null ? input.bases : null;

    // Sin TIPOS declarados no hay obligacion que calcular (la ley es dato; cero constantes).
    if (lineas_tipo.length === 0) {
      return {
        status: 200,
        data: {
          project_id: pid,
          empleado: recibo ? recibo.empleado : (input.empleado != null ? input.empleado : null),
          periodo: recibo ? recibo.periodo : (input.periodo != null ? input.periodo : null),
          origen_recibo,
          obligacion: null,
          gasto_empresa: null,
          tipos_declarados: 0,
          bases_declaradas: bases !== null,
          regla_cableada: false,
          abierto: true,
          faltantes: ['tipos'],
          motivo: 'no hay tipos declarados: nada se calcula (los tipos y las bases de cotizacion son dato)'
        }
      };
    }

    const faltantes = [];
    const lineas = lineas_tipo.map((t, i) => {
      const base = t.base !== null ? t.base : this._baseDeclarada(t.concepto, bases);
      if (base === null) faltantes.push(`tipos[${i}].base`);
      if (t.tipo === null) faltantes.push(`tipos[${i}].tipo`);
      if (t.a_cargo === null) faltantes.push(`tipos[${i}].a_cargo`);
      const importe = (base !== null && t.tipo !== null) ? this._round(base * t.tipo, 2) : null;
      return {
        concepto: t.concepto,
        base,
        tipo: t.tipo,
        a_cargo: t.a_cargo,
        importe,
        completo: importe !== null && t.a_cargo !== null
      };
    });

    const cargo = (c) => {
      const ls = lineas.filter((l) => this._esCargo(l.a_cargo, c));
      if (ls.length === 0) return { cuota: 0, lineas: 0, incompleta: false };
      const incompleta = ls.some((l) => l.importe === null);
      return {
        cuota: incompleta ? null : this._round(ls.reduce((s, l) => s + l.importe, 0), 2),
        lineas: ls.length,
        incompleta
      };
    };

    const empresa = cargo('empresa');
    const trabajador = cargo('trabajador');
    const otros = lineas.filter((l) => l.a_cargo !== null && !this._esCargo(l.a_cargo, 'empresa') && !this._esCargo(l.a_cargo, 'trabajador'));

    const total = (empresa.cuota !== null && trabajador.cuota !== null)
      ? this._round(empresa.cuota + trabajador.cuota, 2) : null;

    // El BRUTO se COPIA del recibo (no se calcula aqui); sin el, el gasto de empresa queda abierto.
    const bruto = recibo ? this._num(recibo.bruto) : null;
    if (recibo && bruto === null) faltantes.push('recibo.bruto');
    const gasto_empresa = (bruto !== null && empresa.cuota !== null)
      ? this._round(bruto + empresa.cuota, 2) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        empleado: recibo ? recibo.empleado : (input.empleado != null ? input.empleado : null),
        periodo: recibo ? recibo.periodo : (input.periodo != null ? input.periodo : null),
        clave_natural: recibo ? recibo.clave_natural : null,
        origen_recibo,
        obligacion: {
          lineas,
          cuota_empresa: empresa.cuota,
          cuota_trabajador: trabajador.cuota,
          total_tgss: total,
          otras_lineas: otros,
          moneda: recibo ? recibo.moneda : null,
          // La ley/los tipos son DATO: se declara de donde salieron, no se cablea nada.
          tipos_origen: 'declarados',
          regla_cableada: false
        },
        // gasto de empresa = bruto del recibo + cuota a cargo de la empresa
        gasto_empresa,
        bruto_origen: recibo ? 'recibo' : null,
        tipos_declarados: lineas.length,
        bases_declaradas: bases !== null,
        faltantes,
        abierto: faltantes.length > 0,
        motivo: faltantes.length > 0
          ? `hay piezas declaradas incompletas: ${faltantes.join(', ')} (nada se estima)`
          : null
      }
    };
  }

  // El RECIBO: declarado en la peticion, o pedido a recibo-nomina (G1) POR EVENTO. Nunca import cruzado.
  async _recibo(pid, input = {}) {
    const declarado = input.recibo || input.nomina || null;
    if (declarado && typeof declarado === 'object') return { recibo: declarado, origen_recibo: 'declarado' };

    const clave = input.clave_natural != null ? String(input.clave_natural) : null;
    if (clave || (input.empleado != null && input.periodo != null)) {
      const r = await this._rpc('recibo-nomina.dar_forma.request', {
        project_id: pid,
        clave_natural: clave,
        empleado: input.empleado,
        periodo: input.periodo
      }, { timeout_ms: 4000 });
      const rec = r && r.data ? r.data.recibo : null;
      if (rec) return { recibo: rec, origen_recibo: 'recibo-nomina' };
    }
    return { recibo: null, origen_recibo: null };
  }

  // Los TIPOS son DECLARABLES: array de lineas {concepto, tipo, a_cargo, base?} o mapa {concepto: tipo|{tipo,a_cargo}}.
  _tipos(raw) {
    const lineas = [];
    if (Array.isArray(raw)) {
      for (const t of raw) {
        if (!t || typeof t !== 'object') continue;
        lineas.push({
          concepto: t.concepto != null ? String(t.concepto) : null,
          base: this._num(t.base),
          tipo: this._num(t.tipo != null ? t.tipo : t.cuota),
          a_cargo: t.a_cargo != null ? String(t.a_cargo) : (t.cargo != null ? String(t.cargo) : null)
        });
      }
    } else if (raw && typeof raw === 'object') {
      for (const [concepto, v] of Object.entries(raw)) {
        if (v && typeof v === 'object') {
          lineas.push({
            concepto,
            base: this._num(v.base),
            tipo: this._num(v.tipo),
            a_cargo: v.a_cargo != null ? String(v.a_cargo) : (v.cargo != null ? String(v.cargo) : null)
          });
        } else {
          lineas.push({ concepto, base: null, tipo: this._num(v), a_cargo: null });
        }
      }
    }
    return lineas;
  }

  // Las BASES son DECLARABLES: escalar, mapa por concepto, o array de {concepto, importe}.
  _baseDeclarada(concepto, bases) {
    if (bases === null) return null;
    if (Array.isArray(bases)) {
      const hit = bases.find((b) => b && String(b.concepto) === concepto);
      return hit ? this._num(hit.importe != null ? hit.importe : hit.base) : null;
    }
    if (typeof bases === 'object') {
      const v = bases[concepto];
      if (v === undefined || v === null) return null;
      if (typeof v === 'object') return this._num(v.importe != null ? v.importe : v.base);
      return this._num(v);
    }
    return this._num(bases);
  }

  _esCargo(a_cargo, esperado) {
    return String(a_cargo || '').trim().toLowerCase() === esperado;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolCalcular(params) { return this._calcular(params); }
}

module.exports = ObligacionSeguridadSocial;
