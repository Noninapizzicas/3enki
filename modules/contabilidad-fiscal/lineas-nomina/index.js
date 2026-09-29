/**
 * contabilidad-fiscal/lineas-nomina — REFLEJO STATELESS (G6, hoja del plan).
 *
 * DESGLOSE BRUTO / RETENCION / COTIZACION DEL TRABAJADOR / NETO. El diseno lo dice literal:
 * `desglosar(n:ReciboNomina):Set<Linea>`. Hace la nomina EXPLICABLE — no un numero pelado.
 * Calculo PURO, determinista.
 *
 * LOS CONCEPTOS SON DECLARABLES: vienen del sistema externo TAL CUAL (en el recibo o en la
 * peticion). Aqui NO hay ningun catalogo de conceptos cableado, ni tipos, ni bases, ni signos
 * legales impuestos. Cada linea de concepto se organiza con SU signo declarado (`signo`: +1/−1)
 * o, si no viene, se declara sin signo (`signo:null`) y NO se resta ni se suma por su cuenta.
 *
 * ESTE MODULO NO CALCULA LA NOMINA: los cuatro importes (bruto, retencion, cotizacion del
 * trabajador, neto) se COPIAN del recibo. Lo que se hace es desglosarlos y comprobar que los
 * conceptos declarados EXPLICAN el bruto — esa consistencia se DECLARA (`explica_bruto`,
 * `descuadre`), no se corrige.
 *
 * Invariante: dato ausente = desconocido. El importe que no venga queda `null` y se declara en
 * `faltantes`; jamas se rellena con 0 ni se estima una linea.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G6 del plan-construccion y diseno-oop.md (CLASE LineasNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las CUATRO magnitudes del recibo que hay que hacer explicitas (los NOMBRES, no valores legales).
const MAGNITUDES = ['bruto', 'retencion', 'cotizacion_trabajador', 'neto'];

class LineasNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lineas-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onDesglosarRequest(e) {
    return this._atender(e, 'desglosar', 'lineas-nomina.desglosar.response', async (d) => {
      const res = await this._desglosar(d);
      if (res.status !== 200) this.eventBus?.publish('lineas-nomina.desglosar.failed', res);
      return res;
    });
  }

  // ── proyeccion determinista: desglosar(recibo) → Set<Linea> explicables ──
  async _desglosar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    const { recibo, origen_recibo } = await this._recibo(pid, input);
    if (!recibo && !Array.isArray(input.conceptos)) {
      return {
        status: 200,
        data: {
          project_id: pid,
          lineas: [],
          abierto: true,
          faltantes: ['recibo'],
          motivo: 'no hay recibo ni conceptos que desglosar (nada se estima)'
        }
      };
    }

    const fuente = recibo || {};
    const faltantes = [];

    // 1) Las CUATRO magnitudes del recibo, COPIADAS (no calculadas aqui).
    const magnitudes = {};
    for (const m of MAGNITUDES) {
      const raw = fuente[m] !== undefined ? fuente[m] : (m === 'cotizacion_trabajador' ? fuente.cotizacion : undefined);
      const n = this._num(raw);
      magnitudes[m] = n;
      if (n === null) faltantes.push(m);
    }

    // 2) Los CONCEPTOS declarados, tal cual llegan (cero catalogo cableado).
    const conceptos = Array.isArray(input.conceptos) ? input.conceptos
      : (Array.isArray(fuente.conceptos) ? fuente.conceptos : []);
    const lineas_concepto = conceptos.map((c, i) => {
      const obj = (c && typeof c === 'object') ? c : { concepto: c };
      const importe = this._num(obj.importe);
      if (importe === null) faltantes.push(`conceptos[${i}].importe`);
      return {
        tipo: 'concepto',
        concepto: obj.concepto != null ? String(obj.concepto) : null,
        importe,
        signo: this._signo(obj.signo),
        a_cargo: obj.a_cargo != null ? String(obj.a_cargo) : null,
        cantidad: this._num(obj.cantidad),
        precio: this._num(obj.precio)
      };
    });

    // 3) Las cuatro magnitudes como lineas explicitas (la nomina deja de ser un numero pelado).
    const lineas_magnitud = MAGNITUDES.map((m) => ({
      tipo: 'magnitud',
      magnitud: m,
      concepto: m,
      importe: magnitudes[m],
      a_cargo: m === 'cotizacion_trabajador' ? 'trabajador' : null
    }));

    // 4) CONSISTENCIA DECLARADA: los conceptos con signo declarado vs el bruto (se declara, no se corrige).
    const con_signo = lineas_concepto.filter((l) => l.signo !== null && l.importe !== null);
    const suma_conceptos = con_signo.reduce((s, l) => s + l.signo * l.importe, 0);
    const cuadra_conceptos = con_signo.length === lineas_concepto.length && lineas_concepto.length > 0
      ? this._round(suma_conceptos, 2) === this._round(magnitudes.bruto !== null ? magnitudes.bruto : NaN, 2)
      : null;
    const descuadre = (magnitudes.bruto !== null && con_signo.length === lineas_concepto.length && lineas_concepto.length > 0)
      ? this._round(suma_conceptos - magnitudes.bruto, 2) : null;

    return {
      status: 200,
      data: {
        project_id: pid,
        empleado: fuente.empleado != null ? fuente.empleado : null,
        periodo: fuente.periodo != null ? fuente.periodo : null,
        clave_natural: fuente.clave_natural != null ? fuente.clave_natural : null,
        origen_recibo,
        magnitudes,
        lineas_concepto,
        lineas_magnitud,
        // El desglose completo: conceptos declarados + las cuatro magnitudes explicitas.
        lineas: [...lineas_concepto, ...lineas_magnitud],
        // Los conceptos son DECLARABLES: se declara de donde salieron y que no hay catalogo propio.
        conceptos_origen: Array.isArray(input.conceptos) ? 'declarados' : (Array.isArray(fuente.conceptos) ? 'recibo' : null),
        catalogo_cableado: false,
        explicable: lineas_concepto.length > 0,
        // Consistencia de lo declarado: se declara, no se ajusta.
        suma_conceptos: this._round(suma_conceptos, 2),
        explica_bruto: cuadra_conceptos,
        descuadre,
        calculada_aqui: false,
        calculo_delegado_a: 'sistema-de-nomina-externo',
        faltantes,
        abierto: faltantes.length > 0
      }
    };
  }

  // El RECIBO: declarado en la peticion, o pedido a recibo-nomina (G1) POR EVENTO.
  async _recibo(pid, input = {}) {
    const declarado = input.recibo || input.nomina || null;
    if (declarado && typeof declarado === 'object') return { recibo: declarado, origen_recibo: 'declarado' };
    const clave = input.clave_natural != null ? String(input.clave_natural) : null;
    if (clave || (input.empleado != null && input.periodo != null)) {
      const r = await this._rpc('recibo-nomina.dar_forma.request', {
        project_id: pid, clave_natural: clave, empleado: input.empleado, periodo: input.periodo
      }, { timeout_ms: 4000 });
      const rec = r && r.data ? r.data.recibo : null;
      if (rec) return { recibo: rec, origen_recibo: 'recibo-nomina' };
    }
    return { recibo: null, origen_recibo: null };
  }

  // El signo es DECLARABLE: +1/−1 (o '+'/'−'/devengo/deduccion). Sin declarar → null (no se interpreta).
  _signo(raw) {
    if (raw === undefined || raw === null || raw === '') return null;
    if (typeof raw === 'number') return raw < 0 ? -1 : (raw > 0 ? 1 : null);
    const s = String(raw).trim().toLowerCase();
    if (s === '+1' || s === '+' || s === '1' || s === 'positivo' || s === 'devengo' || s === 'haber') return 1;
    if (s === '-1' || s === '-' || s === 'negativo' || s === 'deduccion' || s === 'debe') return -1;
    return null;
  }

  _num(v) {
    if (v === undefined || v === null || v === '') return null;
    const n = Number(v);
    return Number.isFinite(n) ? n : null;
  }

  // ── Tools ──
  toolDesglosar(params) { return this._desglosar(params); }
}

module.exports = LineasNomina;
