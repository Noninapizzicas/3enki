/**
 * prisma/opciones — REFLEJO JS que ENVUELVE el banco _shared/motor-opciones.js.
 *
 * Valida + precia la SELECCIÓN de un cliente contra las opciones de un ProductoUniversal
 * (las 4 sub-formas: variante·modificacion·añadido·personalizacion_libre). El banco es puro
 * (céntimos, modos ELEGIR_UNO/ELEGIR_VARIOS/QUITAR) y NO se toca; este reflejo mapea:
 *   - delta_precio (€ del ProductoUniversal) → delta_precio_centimos (entero)
 *   - las opciones LIBRE (personalizacion_libre) se apartan a `libres` (texto del cliente,
 *     sin cardinalidad ni precio) para que el frontend recoja el texto.
 * Generaliza pizzepos/variaciones (validar) + el tasador (preciar) a cualquier arquetipo.
 * Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { evaluarProducto } = require('../../_shared/motor-opciones');

const eur2cent = (x) => (typeof x === 'number' && Number.isFinite(x)) ? Math.round(x * 100) : 0;

class PrismaOpcionesReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'opciones';
    this.version = 'reflejo-0.1.0';
  }

  onEvaluarRequest(e) { return this._atender(e, 'evaluar', 'opciones.evaluar.response', d => this._evaluar(d)); }

  // Precio base en céntimos: precio_base_centimos explícito · o un atributo 'precio' (€) · o 0 (desconocido).
  _baseCentimos(producto) {
    if (Number.isInteger(producto.precio_base_centimos)) return { base: producto.precio_base_centimos, resuelto: true };
    const attrs = (producto.contrato && Array.isArray(producto.contrato.atributos_saber)) ? producto.contrato.atributos_saber
      : (Array.isArray(producto.atributos) ? producto.atributos : []);
    const precio = attrs.find(a => a && String(a.nombre).toLowerCase() === 'precio');
    if (precio && typeof precio.valor === 'number') return { base: eur2cent(precio.valor), resuelto: true };
    return { base: 0, resuelto: false };   // precio desconocido (probablemente pregunta_abierta al comerciante)
  }

  // ProductoUniversal → forma del banco (céntimos). Aparta las LIBRE a `libres`.
  _aProductoMotor(producto) {
    const opsAll = (producto.contrato && Array.isArray(producto.contrato.opciones)) ? producto.contrato.opciones
      : (Array.isArray(producto.opciones) ? producto.opciones : []);
    const opciones = [];
    const libres = [];
    for (const o of opsAll) {
      if (o.modo === 'LIBRE' || o.sub_forma === 'personalizacion_libre') { libres.push({ id: o.id, etiqueta: o.etiqueta }); continue; }
      opciones.push({
        id: o.id, etiqueta: o.etiqueta, modo: o.modo,
        requerido: !!o.requerido,
        ...(Number.isInteger(o.min) ? { min: o.min } : {}),
        ...(Number.isInteger(o.max) ? { max: o.max } : {}),
        valores: (Array.isArray(o.valores) ? o.valores : []).map(v => ({
          id: v.id, etiqueta: v.etiqueta, delta_precio_centimos: eur2cent(v.delta_precio), disponible: v.disponible !== false
        }))
      });
    }
    const { base, resuelto } = this._baseCentimos(producto);
    return { motor: { precio_base_centimos: base, opciones }, libres, base_resuelto: resuelto };
  }

  async _evaluar(input) {
    let producto = input.producto;
    if (!producto) {
      if (!input.project_id || !input.catalogo_id || !input.producto_id) return this._invalid('producto | (catalogo_id + producto_id)');
      const r = await this._rpc('catalogo.get.request', { project_id: input.project_id, catalogo_id: input.catalogo_id });
      if (!r || r.status !== 200 || !r.data) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'catálogo no accesible', { catalogo_id: input.catalogo_id });
      producto = (Array.isArray(r.data.productos) ? r.data.productos : []).find(p => p.id === input.producto_id);
      if (!producto) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'producto no existe', { entity_type: 'producto', id: input.producto_id });
    }
    const { motor, libres, base_resuelto } = this._aProductoMotor(producto);
    const r = evaluarProducto(motor, input.selecciones || {});
    return { status: 200, data: {
      valida: r.valida, errores: r.errores,
      precio_final_centimos: r.precio_final_centimos,
      precio_final_eur: r.precio_final_centimos / 100,
      base_resuelto, libres
    } };
  }
}

module.exports = PrismaOpcionesReflejo;
