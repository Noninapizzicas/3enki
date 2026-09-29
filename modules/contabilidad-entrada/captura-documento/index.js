/**
 * contabilidad-entrada/captura-documento — REFLEJO STATELESS (A3, hoja del plan).
 *
 * Admite el documento (digitalizado o recibido) y valida sus campos: MECANICO,
 * CERO JUICIO. No interpreta lo ilegible (eso es extraccion-dato A4.1), no asienta,
 * no propone contrapartida: solo dice si el documento es admisible segun el minimo
 * DECLARADO (`campos_minimos`). Si el minimo no viene declarado, admite por forma
 * estructural y lo declara (`contrato: 'no_declarado'`) — no inventa un minimo.
 *
 * Forma: REFLEJO → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Ver hoja A3 del plan-construccion y diseno-oop.md (CLASE CapturaDocumento).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class CapturaDocumento extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'captura-documento';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  onAdmitirRequest(e) {
    return this._atender(e, 'admitir', 'captura-documento.admitir.response', async (d) => {
      const res = this._admitir(d);
      if (res.status === 200 && res.data.admitido === true) {
        // El documento quedo admitido → lo consume control-cuadre-documento (A4.3).
        this.eventBus?.publish('contabilidad.documento_admitido', {
          project_id: res.data.project_id,
          documento: res.data.documento,
          origen: res.data.origen,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('captura-documento.admitir.failed', res);
      }
      return res;
    });
  }

  // ── proyeccion determinista: validar campos, sin juicio ──
  _admitir(input = {}) {
    const doc = input.documento;
    if (!doc || typeof doc !== 'object' || Array.isArray(doc)) return this._invalid('documento');

    const pid = input.project_id || this.project_id || null;
    const campos = Object.keys(doc).filter((k) => doc[k] !== undefined && doc[k] !== null && doc[k] !== '');
    const origen = input.origen != null ? String(input.origen) : null;

    // El minimo exigible es DECLARABLE (cara de contrato-hecho-minimo A11). Sin
    // declaracion, la admision es estructural: hay documento con algun campo.
    const minimos = Array.isArray(input.campos_minimos) ? input.campos_minimos.map(String) : null;
    const contrato = minimos ? 'declarado' : 'no_declarado';

    const faltantes = minimos
      ? minimos.filter((c) => doc[c] === undefined || doc[c] === null || doc[c] === '')
      : [];

    const admitido = campos.length > 0 && faltantes.length === 0;

    return {
      status: 200,
      data: {
        project_id: pid,
        admitido,
        origen,
        contrato,
        campos_presentes: campos,
        faltantes,
        documento: doc
      }
    };
  }

  toolAdmitir(params) { return this._admitir(params); }
}

module.exports = CapturaDocumento;
