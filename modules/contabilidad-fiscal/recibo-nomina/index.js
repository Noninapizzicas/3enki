/**
 * contabilidad-fiscal/recibo-nomina — REFLEJO STATELESS (G1, hoja del plan).
 *
 * ADMITE y DA FORMA ASENTABLE al HECHO DE NOMINA que ya entro por la frontera (puerto-nomina G4).
 * El diseno lo dice literal: `dar_forma(entrada):HechoNomina` — admite el hecho lo mismo si llega
 * como HECHO que si llega como DOCUMENTO (el PDF/registro del recibo). MECANICO, CERO JUICIO.
 *
 * ESTE MODULO NO CALCULA LA NOMINA: el bruto, la retencion, la cotizacion del trabajador y el
 * neto llegan ya calculados por el sistema de personal. Aqui NO se derivan, NO se retocan y NO
 * se estiman: se COPIAN tal cual y se declaran abiertos los que no vengan. Lo que hace es
 * REFLEJARLA contablemente: dar al hecho una forma estable que el asiento pueda consumir.
 *
 * LOS CONCEPTOS SON DECLARABLES: el recibo organiza los conceptos TAL CUAL llegan; no hay ningun
 * catalogo de conceptos, tipos ni bases cableado.
 *
 * Invariante: dato ausente = desconocido. Un importe que no llega queda `null` y se declara en
 * `faltantes`. La consistencia de lo declarado (`cuadra`) se DECLARA, no se corrige: si los
 * importes declarados no cuadran, se dice y su resolucion es del humano (no se ajusta nada aqui).
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja G1 del plan-construccion y diseno-oop.md (CLASE ReciboNomina).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ReciboNomina extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'recibo-nomina';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── handler RPC (una linea, delega a _atender) ──
  onDarFormaRequest(e) {
    return this._atender(e, 'dar_forma', 'recibo-nomina.dar_forma.response', async (d) => {
      const res = this._dar_forma(d);
      if (res.status === 200) this._emitirFormada(res, d);
      else this.eventBus?.publish('recibo-nomina.dar_forma.failed', res);
      return res;
    });
  }

  // ── Fire-and-forget: el hecho de nomina entro por el puerto (G4) ──
  onNominaRecibida(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._dar_forma(d);
    if (res.status === 200) this._emitirFormada(res, d);
    else this.eventBus?.publish('recibo-nomina.dar_forma.failed', res);
    return res;
  }

  // Exito → evento de dominio: la nomina quedo con forma asentable. Lo LEEN asiento-personal (G3)
  // y el resto de la cadena de personal (G2, G6, G8).
  _emitirFormada(res, d) {
    this.eventBus?.publish('contabilidad.nomina_formada', {
      project_id: res.data.project_id,
      id_recibo: res.data.recibo.id_recibo,
      clave_natural: res.data.recibo.clave_natural,
      periodo: res.data.recibo.periodo,
      empleado: res.data.recibo.empleado,
      neto: res.data.recibo.neto,
      cuadra: res.data.recibo.cuadra,
      faltantes: res.data.recibo.faltantes,
      correlation_id: (d && d.correlation_id) || null
    });
  }

  // ── proyeccion determinista: dar_forma(entrada) → HechoNomina asentable ──
  _dar_forma(input = {}) {
    const pid = input.project_id || this.project_id;
    if (!pid) return this._invalid('project_id');

    // La entrada: el HECHO de nomina (los campos ya calculados por el sistema externo) o el
    // DOCUMENTO del recibo. Se admite lo mismo uno que otro — es el contrato de `dar_forma`.
    const entrada = input.nomina != null ? input.nomina
      : (input.hecho != null ? input.hecho
        : (input.documento != null ? input.documento : null));
    if (!entrada || typeof entrada !== 'object') return this._invalid('nomina');

    const clase_entrada = input.documento != null && input.nomina == null && input.hecho == null
      ? 'documento' : 'hecho';

    // LOS IMPORTES SE COPIAN: no se calcula la nomina (eso es del sistema externo).
    // Cada uno que no venga queda `null` (desconocido) y se declara en `faltantes`.
    const faltantes = [];
    const bruto = this._copiaImporte(entrada.bruto, 'bruto', faltantes);
    const retencion = this._copiaImporte(entrada.retencion, 'retencion', faltantes);
    const cotizacion_trabajador = this._copiaImporte(
      entrada.cotizacion_trabajador != null ? entrada.cotizacion_trabajador : entrada.cotizacion,
      'cotizacion_trabajador', faltantes
    );
    const neto = this._copiaImporte(entrada.neto, 'neto', faltantes);

    const empleado = entrada.empleado != null ? String(entrada.empleado) : null;
    if (empleado === null) faltantes.push('empleado');
    const periodo = entrada.periodo != null ? String(entrada.periodo) : null;
    if (periodo === null) faltantes.push('periodo');

    // Los CONCEPTOS se organizan TAL CUAL llegan: ningun catalogo cableado de conceptos/tipos/bases.
    const conceptos = this._conceptos(entrada.conceptos);

    // La clave natural: declarada, o derivada del molde. No se inventa identidad.
    const clave_natural = (input.clave_natural != null ? String(input.clave_natural)
      : (entrada.clave_natural != null ? String(entrada.clave_natural) : null))
      || this._clave(empleado, periodo);

    const id_recibo = input.id_recibo != null ? String(input.id_recibo)
      : (clave_natural != null ? `nomina:${clave_natural}` : null);

    // LA CONSISTENCIA DE LO DECLARADO: bruto − retencion − cotizacion = neto, sobre los importes
    // TAL CUAL vinieron. Se DECLARA; no se corrige nada (la nomina no se toca aqui).
    const completo = bruto !== null && retencion !== null && cotizacion_trabajador !== null && neto !== null;
    const cuadra = completo
      ? this._round(bruto - retencion - cotizacion_trabajador, 2) === this._round(neto, 2)
      : null;
    const descuadre = completo
      ? this._round(bruto - retencion - cotizacion_trabajador - neto, 2)
      : null;

    const recibo = {
      id_recibo,
      clave_natural,
      clase_entrada,
      origen: entrada.origen != null ? String(entrada.origen) : null,
      empleado,
      periodo,
      fecha: entrada.fecha != null ? String(entrada.fecha) : null,
      // Los importes COPIADOS de la fuente (no calculados aqui).
      bruto,
      retencion,
      cotizacion_trabajador,
      neto,
      moneda: entrada.moneda != null ? String(entrada.moneda) : null,
      conceptos,
      // El hecho queda en forma asentable: lo que el asiento (G3) puede consumir.
      forma_asentable: true,
      // La nomina NO se calculo aqui: se refleja la que trajo el sistema externo.
      calculada_aqui: false,
      calculo_delegado_a: 'sistema-de-nomina-externo',
      // La consistencia de lo declarado: se declara, no se decide.
      cuadra,
      descuadre,
      faltantes,
      abierto: faltantes.length > 0,
      formado_en: new Date().toISOString()
    };

    return {
      status: 200,
      data: {
        project_id: pid,
        recibo,
        // Mecanico, cero juicio: la forma la da este reflejo; el ASIENTO lo construye G3.
        destino: 'asiento-personal'
      }
    };
  }

  _copiaImporte(v, campo, faltantes) {
    if (v === undefined || v === null || v === '') { faltantes.push(campo); return null; }
    const n = Number(v);
    if (!Number.isFinite(n)) { faltantes.push(campo); return null; }
    return n;
  }

  // Los conceptos viajan TAL CUAL; solo se les asegura una forma de linea (concepto + importe).
  _conceptos(raw) {
    if (!Array.isArray(raw)) return [];
    return raw.map((c) => {
      if (c && typeof c === 'object') return { ...c };
      return { concepto: c, importe: null };
    });
  }

  _clave(empleado, periodo) {
    if (empleado === null && periodo === null) return null;
    return [empleado != null ? empleado : '-', periodo != null ? periodo : '-'].join('|');
  }

  // ── Tools ──
  toolDarForma(params) { return this._dar_forma(params); }
}

module.exports = ReciboNomina;
