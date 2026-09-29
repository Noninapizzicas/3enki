/**
 * contabilidad-entrada/puerto-evento-vertical — PUENTE STATELESS (A1, hoja del plan).
 *
 * Abre el puerto por el que cada VERTICAL manda sus hechos ya emitidos. Contabilidad
 * se ADAPTA: no impone formato ni obliga a emitir. Acepta el hecho crudo tal como la
 * vertical lo publica y lo envuelve en un sobre estable (`HechoCrudo`) que el resto de
 * la entrada puede consumir; si la vertical declara su minimo (`campos_minimos`),
 * se verifica ese minimo, nunca uno cableado.
 *
 * Invariante: la vertical manda. Dato ausente = desconocido (se declara en `faltantes`),
 * jamas se estima ni se completa.
 *
 * Forma: PUENTE → STATELESS. Sin PosPersistencia, sin onProjectActivated.
 * Es el eslabon limitante de la entrada; lo consume normalizador-hecho (A2).
 * Ver hoja A1 del plan-construccion y diseno-oop.md (CLASE PuertoEventoVertical).
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class PuertoEventoVertical extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'puerto-evento-vertical';
    this.version = 'reflejo-0.1.0';
  }

  async onUnload() { return super.onUnload(); }

  // ── RPC: la vertical pide entregar un hecho por el puerto ──
  onRecibirRequest(e) {
    return this._atender(e, 'recibir', 'puerto-evento-vertical.recibir.response', async (d) => {
      const res = this._recibir(d);
      if (res.status === 200) {
        this.eventBus?.publish('contabilidad.hecho_crudo', {
          project_id: res.data.project_id,
          crudo: res.data.crudo,
          vertical: res.data.crudo.vertical,
          tipo: res.data.crudo.tipo,
          clave_natural: res.data.crudo.clave_natural,
          correlation_id: d.correlation_id
        });
      } else {
        this.eventBus?.publish('puerto-evento-vertical.recibir.failed', res);
      }
      return res;
    });
  }

  // ── Fire-and-forget: la vertical ya emitio su hecho en su propio bus ──
  onHechoEmitido(e) {
    const d = (e && (e.data || e)) || {};
    const res = this._recibir(d);
    if (res.status === 200) {
      this.eventBus?.publish('contabilidad.hecho_crudo', {
        project_id: res.data.project_id,
        crudo: res.data.crudo,
        vertical: res.data.crudo.vertical,
        tipo: res.data.crudo.tipo,
        clave_natural: res.data.crudo.clave_natural,
        correlation_id: d.correlation_id
      });
    } else {
      this.eventBus?.publish('puerto-evento-vertical.recibir.failed', res);
    }
    return res;
  }

  // ── proyeccion: envuelve el hecho crudo en el sobre estable ──
  _recibir(input = {}) {
    const vertical = input.vertical != null ? String(input.vertical) : null;
    if (!vertical) return this._invalid('vertical');
    const tipo = input.tipo != null ? String(input.tipo) : null;
    if (!tipo) return this._invalid('tipo');

    // El payload crudo: se acepta TAL CUAL lo emite la vertical (no se impone forma).
    const payload = (input.payload && typeof input.payload === 'object') ? input.payload : {};
    const clave_natural = input.clave_natural != null ? String(input.clave_natural) : null;

    // Minimo DECLARADO por la fuente: si la vertical lo declara, se verifica; si no,
    // no se le exige nada (el puerto no impone formato).
    const minimos = Array.isArray(input.campos_minimos) ? input.campos_minimos.map(String) : null;
    const faltantes = minimos
      ? minimos.filter((c) => payload[c] === undefined || payload[c] === null || payload[c] === '')
      : [];

    const pid = input.project_id || this.project_id || null;

    return {
      status: 200,
      data: {
        project_id: pid,
        contrato: minimos ? 'declarado' : 'no_declarado',
        faltantes,
        crudo: {
          vertical,
          tipo,
          clave_natural,
          payload,
          faltantes,
          emitido_en: input.emitido_en || new Date().toISOString(),
          recibido_en: new Date().toISOString()
        }
      }
    };
  }

  toolRecibir(params) { return this._recibir(params); }
}

module.exports = PuertoEventoVertical;
