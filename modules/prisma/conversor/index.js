/**
 * prisma/conversor — REFLEJO JS PURO: cero pensar, solo calcular.
 *
 * Expone en el bus la lib _shared/prisma-unidades. Sin estado, sin red, sin store: cada op es una
 * función pura (entra objeto, sale objeto). Cuatro cálculos:
 *   convertir  unidades (masa↔volumen solo con densidad; si falta NO inventa → error)
 *   precio     a céntimos POR UNIDAD BASE (lo que el costeador multiplica)
 *   formula    fórmula PANADERA: % de cada componente sobre la referencia (=100%)
 *   escalar    esa fórmula a una tanda — el gran escalado (un número, toda la receta escala)
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const U = require('../../_shared/prisma-unidades');

class PrismaConversorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'conversor';
    this.version = 'reflejo-0.1.0';
  }
  async onUnload() { return super.onUnload(); }

  onConvertirRequest(e)  { return this._atender(e, 'convertir',  'conversor.convertir.response',  d => this._convertir(d)); }
  onPrecioRequest(e)     { return this._atender(e, 'precio',     'conversor.precio.response',     d => this._precio(d)); }
  onFormulaRequest(e)    { return this._atender(e, 'formula',    'conversor.formula.response',    d => this._formula(d)); }
  onEscalarRequest(e)    { return this._atender(e, 'escalar',    'conversor.escalar.response',    d => this._escalar(d)); }
  onReferenciaRequest(e) { return this._atender(e, 'referencia', 'conversor.referencia.response', d => this._referencia(d)); }

  _convertir({ cantidad, desde, hacia, densidad_g_ml } = {}) {
    if (desde == null) return this._invalid('desde');
    if (hacia == null) return this._invalid('hacia');
    const r = U.convertir(cantidad, desde, hacia, densidad_g_ml);
    if (r == null) return this._errorResponse(422, 'CONVERSION_IMPOSIBLE', 'no se puede convertir sin densidad o entre dimensiones incompatibles', { desde, hacia });
    return { status: 200, data: { cantidad: r, unidad: hacia } };
  }

  _precio({ precio_centimos, cantidad, unidad } = {}) {
    if (unidad == null) return this._invalid('unidad');
    const r = U.precioPorBase({ precio_centimos, cantidad, unidad });
    if (r.error) return this._errorResponse(422, 'PRECIO_INVALIDO', 'no se pudo normalizar el precio', r);
    return { status: 200, data: r };
  }

  _formula({ componentes, base_ref } = {}) {
    if (!Array.isArray(componentes)) return this._invalid('componentes');
    if (!base_ref) return this._invalid('base_ref');
    const r = U.porcentajePanadero(componentes, base_ref);
    if (r.error === 'referencia_sin_masa') return this._errorResponse(422, 'REFERENCIA_SIN_MASA', 'la referencia no tiene masa medible (o falta densidad)', { base_ref });
    return { status: 200, data: r };
  }

  _escalar({ formula, modo, gramos } = {}) {
    if (!Array.isArray(formula)) return this._invalid('formula');
    if (!(Number(gramos) > 0)) return this._invalid('gramos');
    return { status: 200, data: { componentes: U.escalar(formula, { modo, gramos }) } };
  }

  // precio de REFERENCIA (fase 1): de varios precios, uno prudente tirando a alto — NO el más barato (no es compra)
  _referencia({ precios, percentil } = {}) {
    if (!Array.isArray(precios)) return this._invalid('precios');
    const r = U.precioReferencia(precios, { percentil });
    if (r == null) return this._errorResponse(422, 'SIN_PRECIOS', 'no hay ningún precio válido para estimar la referencia', {});
    return { status: 200, data: { precio_referencia: r } };
  }
}

module.exports = PrismaConversorReflejo;
