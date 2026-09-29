/**
 * contabilidad-entrada/control-cuadre-documento — REFLEJO STATELESS (A4.3, hoja del plan).
 *
 * Control DETERMINISTA del cuadre del documento: base + impuestos frente al total,
 * dentro de una TOLERANCIA DECLARABLE. Si importe+impuestos no cuadran → la hoja
 * publica `contabilidad.documento_descuadrado` (lo consume encolado-excepcion, A8.1):
 * NO se asienta mal, va a la cola. No corrige, no estima, no decide: calcula.
 *
 * Dato ausente: si falta base/impuestos/total, NO se afirma nada — se devuelve
 * `cuadra: null` con los campos en `abierto`. Nada se estima.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A4.3 del plan-construccion y diseno-oop.md (CLASE ControlCuadreDocumento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ControlCuadreDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'control-cuadre-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onCuadraRequest(e) {
    return this._atender(e, 'cuadra', 'control-cuadre-documento.cuadra.response', async (d) => {
      const res = this._cuadra(d);
      if (res.status !== 200) {
        // Entrada invalida (no es un veredicto de cuadre) → par de fallo.
        this.eventBus?.publish('control-cuadre-documento.cuadra.failed', res);
      } else if (res.data.cuadra === false) {
        // Descuadre: ERROR de la entrada, no estado del libro. Va a la cola.
        this.eventBus?.publish('contabilidad.documento_descuadrado', {
          project_id: res.data.project_id,
          documento: res.data.documento,
          esperado: res.data.esperado,
          total: res.data.total,
          descuadre: res.data.descuadre,
          correlation_id: d.correlation_id
        });
      }
      return res;
    });
  }

  // ── proyeccion determinista: cuadra(doc):bool ──
  _cuadra(input = {}) {
    const doc = input.documento || input.doc;
    if (!doc || typeof doc !== 'object') return this._invalid('documento');

    const pid = input.project_id || this.project_id || null;

    // Tolerancia DECLARABLE (ParametroDeclarable). Sin declarar → 0 (cuadre exacto),
    // y se declara en la salida que no venia declarada: no se asume una ley.
    const tolerancia_declarada = Number.isFinite(Number(input.tolerancia));
    const tolerancia = tolerancia_declarada ? Math.abs(Number(input.tolerancia)) : 0;

    const base = doc.base;
    const total = doc.total;
    const impuestos = doc.impuestos;

    const abierto = [];
    if (base === undefined || base === null || base === '') abierto.push('base');
    if (total === undefined || total === null || total === '') abierto.push('total');
    if (impuestos === undefined || impuestos === null) abierto.push('impuestos');

    // Malformado ≠ ausente: un valor no numerico es entrada invalida.
    const num = (v, campo) => {
      if (v === undefined || v === null || v === '') return null;
      const n = Number(v);
      if (!Number.isFinite(n)) { abierto.push(`__malformado__${campo}`); return null; }
      return n;
    };
    const b = num(base, 'base');
    const t = num(total, 'total');
    if (abierto.some((c) => c.startsWith('__malformado__'))) {
      return this._invalid('documento.base|documento.total');
    }
    const suma_impuestos = this._sumaImpuestos(impuestos);

    // Dato ausente → no se afirma nada.
    if (abierto.length > 0) {
      return {
        status: 200,
        data: {
          project_id: pid, cuadra: null, motivo: '[ABIERTO]: falta dato para calcular el cuadre',
          abierto, tolerancia, tolerancia_declarada, documento: doc
        }
      };
    }

    const esperado = this._round(b + suma_impuestos, 2);
    const descuadre = this._round(t - esperado, 2);
    const cuadra = Math.abs(descuadre) <= tolerancia;

    return {
      status: 200,
      data: {
        project_id: pid,
        cuadra,
        esperado,
        total: t,
        base: b,
        suma_impuestos,
        descuadre,
        tolerancia,
        tolerancia_declarada,
        documento: doc
      }
    };
  }

  // Impuestos: numero, o lista de {cuota|importe|total} (declarable en forma libre).
  _sumaImpuestos(impuestos) {
    if (impuestos === undefined || impuestos === null) return 0;
    if (Number.isFinite(Number(impuestos))) return this._round(Number(impuestos), 2);
    if (!Array.isArray(impuestos)) return 0;
    let suma = 0;
    for (const it of impuestos) {
      if (it == null) continue;
      if (Number.isFinite(Number(it))) { suma += Number(it); continue; }
      const v = it.cuota ?? it.importe ?? it.total ?? it.cuota_impuesto;
      if (Number.isFinite(Number(v))) suma += Number(v);
    }
    return this._round(suma, 2);
  }

  toolCuadra(params) { return this._cuadra(params); }
}

module.exports = ControlCuadreDocumento;
