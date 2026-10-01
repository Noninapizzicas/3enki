/**
 * contabilidad-fiscal/lineas-nomina — REFLEJO STATELESS (G6, hoja del plan).
 *
 * DESGLOSE de la nomina: bruto · retencion (IRPF) · cotizacion del trabajador · neto.
 * Hace la nomina EXPLICABLE — convierte el recibo (G1) en sus lineas con su naturaleza.
 *
 * Mecanico y DETERMINISTA: NO decide las bases ni los tipos (eso es del motor de
 * personal, fuera de esta hoja); TOMA los importes DECLARADOS y los CLASIFICA en las
 * cuatro cubetas. Lo que no pueda clasificar con una regla declarada NO se inventa:
 * cae en `otras` y el neto se declara COMPLETO o NO (nunca se cierra a ciegas).
 *
 *   neto = bruto − retencion − cotizacion + otras (segun los signos declarados)
 *
 * Invariante: dato ausente = desconocido. Sin nomina/recibo no hay desglose (no se fabrica);
 * un importe sin declarar queda null, no 0.
 *
 * ESCUCHA (R3): el plan declara escucha de `contabilidad.nomina_recibida`; NINGUN modulo del
 * repo lo emite AUN (lo emite puerto-nomina G4, de un grupo posterior): declararlo daria
 * cadena colgada. NO se declara hasta que su emisor exista.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G6 del plan-construccion y diseno-oop.md (CLASE LineasNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

// Las cuatro CUBETAS del desglose. La clasificacion por palabra clave es DECLARABLE
// (`clasificacion`); esto es solo el suelo por defecto cuando no se declara ninguna.
const CUBETAS = ['bruto', 'retencion', 'cotizacion', 'neto'];

class LineasNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'lineas-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender). CLASE PREGUNTA → sin ui_handler ──
  onDesglosarRequest(e) {
    return this._atender(e, 'desglosar', 'lineas-nomina.desglosar.response', async (d) => {
      const res = this._desglosar(d);
      // Reflejo: desglosa y declara; no escribe → no hay hecho que anunciar (R2).
      if (res.status !== 200) this.eventBus?.publish('lineas-nomina.desglosar.failed', res);
      return res;
    });
  }

  // ══════════════════════════════════════════════════════════════════════
  // desglosar(nomina|recibo, clasificacion?) → lineas {bruto, retencion, cotizacion, neto}
  // ══════════════════════════════════════════════════════════════════════
  _desglosar(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La nomina/recibo: viene DECLARADO. Sin el no se fabrica un desglose.
    const nomina = this._nomina(input);
    if (!nomina) return this._invalid('nomina');

    const clasificacion = this._clasificacion(input);
    const conceptos = this._conceptos(nomina);

    const cubetas = { bruto: [], retencion: [], cotizacion: [], neto: [] };
    const otras = [];
    for (const c of conceptos) {
      const cubeta = this._clasificar(c, clasificacion);
      if (cubeta) cubetas[cubeta].push(c); else otras.push(c);
    }

    // Los totales: suma de lo declarado. Sin ninguna linea → null (no un 0 inventado).
    const total = (arr) => {
      const vals = arr.map(x => this._num(x.importe)).filter(v => v !== null);
      return vals.length ? this._round(vals.reduce((a, b) => a + b, 0), 2) : null;
    };
    const bruto = total(cubetas.bruto);
    const retencion = total(cubetas.retencion);
    const cotizacion = total(cubetas.cotizacion);
    const neto_declarado = total(cubetas.neto);
    const otras_total = total(otras);

    // El neto: el declarado si viene; si no, se DERIVA de bruto − retencion − cotizacion.
    let neto = neto_declarado;
    let neto_derivado = false;
    if (neto === null && (bruto !== null || retencion !== null || cotizacion !== null)) {
      neto = this._round((bruto || 0) - (retencion || 0) - (cotizacion || 0), 2);
      neto_derivado = true;
    }

    return {
      status: 200,
      data: {
        project_id: pid,
        tipo: 'lineas-nomina',
        // El desglose con su naturaleza: cada cubeta con sus lineas.
        desglose: {
          bruto: { total: bruto, lineas: cubetas.bruto },
          retencion: { total: retencion, lineas: cubetas.retencion },
          cotizacion: { total: cotizacion, lineas: cubetas.cotizacion },
          neto: { total: neto, lineas: cubetas.neto }
        },
        otras: { total: otras_total, lineas: otras },
        // Completitud HONESTA: el neto esta completo solo si sus tres terminos constan.
        neto_completo: bruto !== null && retencion !== null && cotizacion !== null,
        neto,
        neto_derivado,
        num_lineas: conceptos.length,
        determinista: true,
        abierto: {
          clasificacion: (clasificacion.declarada || Object.keys(clasificacion.mapa).length > 0) ? null
            : 'no se declaro clasificacion de conceptos: los no reconocidos caen en `otras` (no se inventan)',
          neto: (bruto !== null && retencion !== null && cotizacion !== null) ? null
            : 'falta algun termino del neto (bruto/retencion/cotizacion): no se cierra a ciegas'
        }
      }
    };
  }

  // La nomina declarada (nomina|recibo|hecho). null si no viene.
  _nomina(input = {}) {
    const n = input.nomina || input.recibo || input.hecho || input.recibo_nomina;
    return (n && typeof n === 'object') ? n : null;
  }

  _conceptos(nomina) {
    const raw = Array.isArray(nomina.desglose) ? nomina.desglose
      : (Array.isArray(nomina.conceptos) ? nomina.conceptos
        : (Array.isArray(nomina.lineas) ? nomina.lineas : []));
    return raw.map((c, i) => {
      const o = (c && typeof c === 'object') ? c : { concepto: c };
      return {
        orden: i + 1,
        concepto: o.concepto != null ? String(o.concepto) : (o.clave != null ? String(o.clave) : (o.tipo != null ? String(o.tipo) : null)),
        tipo: o.tipo != null ? String(o.tipo) : null,
        importe: this._num(o.importe !== undefined ? o.importe : (o.cuantia !== undefined ? o.cuantia : null)),
        signo: o.signo != null ? String(o.signo) : null
      };
    });
  }

  // Clasificacion DECLARABLE: {palabra_o_tipo → cubeta}. Sin ella, no se adivina.
  _clasificacion(input = {}) {
    const raw = (input.clasificacion && typeof input.clasificacion === 'object') ? input.clasificacion : {};
    const mapa = {};
    for (const [k, v] of Object.entries(raw)) {
      if (CUBETAS.includes(String(v))) mapa[String(k).toLowerCase()] = String(v);
      else if (CUBETAS.includes(String(k))) mapa[String(v).toLowerCase()] = String(k);
    }
    return { mapa, declarada: Object.keys(mapa).length > 0 };
  }

  // Clasifica un concepto: por su tipo declarado, o por palabra clave del mapa declarado.
  // Sin regla declarada NO se inventa cubeta → null (cae en `otras`).
  _clasificar(c, clasificacion) {
    const mapa = clasificacion.mapa;
    const tipo = c.tipo != null ? String(c.tipo).toLowerCase() : null;
    const concepto = c.concepto != null ? String(c.concepto).toLowerCase() : null;
    if (tipo && mapa[tipo]) return mapa[tipo];
    if (concepto && mapa[concepto]) return mapa[concepto];
    if (concepto) {
      for (const [k, v] of Object.entries(mapa)) {
        if (concepto.includes(k)) return v;
      }
    }
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
