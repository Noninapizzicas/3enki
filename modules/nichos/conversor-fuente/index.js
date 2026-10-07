/**
 * nichos/conversor-fuente — CONVERSOR REFLEJO JS PURO: cero pensar, solo cruzar formato.
 *
 * J2 del plan: la UNICA frontera de formatos entre las fuentes externas de datos y los
 * datos internos homogeneos del sistema. Recibe los datos crudos de una fuente en su
 * formato nativo (el DatasetBruto de puerto-fuente-datos) y los convierte a la señal
 * homogenea interna de nichos. Sin estado, sin red, sin store: cada op es una función
 * pura (entra objeto, sale objeto). Cero logica de negocio: solo convertir formato.
 *
 * Proyecciones puras:
 *   _cruzar  la unica frontera: valida el DatasetBruto y deriva los DatosHomogeneos.
 *   _mapear  mapea un item crudo de un formatoOrigen al formato interno canonico
 *            (titulo/url desde los campos nativos; id derivado; senal de relevancia).
 *
 * Al convertir con exito publica nichos.datos_homogeneos; si el formato es invalido
 * (sin nicho, sin items, o un item sin titulo ni url) cierra el circulo con el par
 * determinista nichos.fuente.convertir.failed.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');

class ConversorFuente extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conversor-fuente';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  // Convierte el DatasetBruto (formato nativo de la fuente) a la señal homogenea interna.
  onConvertirRequest(e) {
    return this._atender(e, 'convertir', 'nichos.fuente.convertir.response', (d) => {
      const res = this._cruzar(d);
      // Fire-and-forget de dominio: exito → datos homogeneos; fallo → par determinista.
      if (res.status === 200) this.eventBus?.publish('nichos.datos_homogeneos', res.data);
      else this.eventBus?.publish('nichos.fuente.convertir.failed', res);
      return res;
    });
  }

  // Proyección pura: la UNICA frontera de formatos externos->internos -> DatosHomogeneos.
  _cruzar({ nicho, fuente, formato, dataset_bruto } = {}) {
    if (!nicho || typeof nicho !== 'string') return this._invalid('nicho');
    if (!formato || typeof formato !== 'string') return this._invalid('formato');
    if (!dataset_bruto || !Array.isArray(dataset_bruto.items)) {
      return this._errorResponse(422, 'FORMATO_INVALIDO',
        'el DatasetBruto debe traer items[] para poder cruzar al formato interno', { nicho, fuente, formato });
    }
    if (dataset_bruto.items.length === 0) {
      return this._errorResponse(422, 'FORMATO_INVALIDO',
        'el DatasetBruto no trae ningun item crudo que convertir', { nicho, fuente, formato });
    }

    const ctx = { fuente: fuente || 'desconocida', formato, nicho };
    const items = [];
    let rechazados = 0;
    for (const bruto of dataset_bruto.items) {
      const canonico = this._mapear(bruto, ctx);
      if (canonico == null) { rechazados++; continue; }
      items.push(canonico);
    }

    if (items.length === 0) {
      return this._errorResponse(422, 'FORMATO_INVALIDO',
        'ningun item del DatasetBruto pudo convertirse al formato interno (faltan titulo o url)', { nicho, fuente, formato });
    }

    return {
      status: 200,
      data: {
        nicho,
        fuente: ctx.fuente,
        formato,
        total: dataset_bruto.items.length,
        convertidos: items.length,
        rechazados,
        items
      }
    };
  }

  // Proyección pura: mapea un item crudo de un formatoOrigen al formato interno canonico.
  // null si el item no es convertible (le falta titulo y url) — no inventa, lo rechaza.
  _mapear(item, { fuente, formato, nicho }) {
    if (!item || typeof item !== 'object') return null;
    const titulo = this._primer(item, ['titulo', 'title', 'nombre', 'name']);
    const url = this._primer(item, ['url', 'link', 'href', 'enlace']);
    if (!titulo || !url) return null;
    const relevancia = Number(item.relevancia) && Number(item.relevancia) > 0 ? Number(item.relevancia) : 0;
    const id = this._id(`${fuente}:${url}`);
    return { id, nicho, fuente, formato, titulo, url, relevancia, convertido: true };
  }

  // Devuelve el primer campo presente y no vacío de una lista de nombres de campo.
  _primer(obj, campos) {
    for (const c of campos) {
      const v = obj[c];
      if (v != null && String(v).trim().length > 0) return String(v).trim();
    }
    return null;
  }

  // id determinista derivado del origen (fuente:url) — estable entre conversiones.
  _id(clave) {
    return crypto.createHash('sha1').update(clave).digest('hex').slice(0, 12);
  }
}

module.exports = ConversorFuente;
