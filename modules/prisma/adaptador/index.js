/**
 * prisma/adaptador — REFLEJO JS (mitad determinista del adaptador de Prisma).
 *
 * Descompone un producto crudo en el ProductoUniversal (5 huecos) y clasifica su
 * arquetipo. Sigue blueprint-agentico (6 fases). v0.1.0 = la mitad REFLEJO:
 *   CONTRATO → { crudo, project_id, catalogo_id? }
 *   LEER     → [pendiente: arquetipos + marca; v0.1.0 no lee, usa el crudo]
 *   PENSAR   → _pensar: mapea crudo estructurado → 5 huecos, clasifica arquetipo POR LA FORMA
 *              (ejes+naturalezas, no la superficie), marca preguntas_abiertas de lo privado
 *   VALIDAR  → catalogo.validar.request → _checkProducto (el freno de producto-manager)
 *   GUARDAR  → emite producto.adaptado (producto-manager lo consume: onProductoAdaptado)
 *   EMITIR   → adaptador.adaptar.response { producto, arquetipo, madurez }
 *
 * La mitad FUZZY (el LLM que descompone foto/texto libre → estructura) llega como
 * adaptador.blueprint.json en el paso siguiente; entonces PENSAR pasa al LLM y esto
 * (clasificar por forma · marcar lo abierto · loop VALIDAR) se queda de reflejo.
 * Ver arquitectura/decisiones/propuestas/prisma.md.
 */

'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const { clasificar } = require('../../_shared/arquetipos-semilla');

const TIEMPO  = new Set(['ninguno', 'instante', 'cita', 'intervalo_que_cobra']);
const CICLO   = new Set(['de_ida', 'con_retorno']);
const STOCK   = new Set(['unidades', 'ingredientes', 'capacidad_temporal', 'activo_reutilizable']);
const PRECIO  = new Set(['por_unidad', 'por_peso', 'por_tiempo', 'rango_valoracion']);

class PrismaAdaptadorReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'adaptador';
    this.version = 'reflejo-0.1.0';
  }

  onAdaptarRequest(e) { return this._atender(e, 'adaptar', 'adaptador.adaptar.response', d => this._adaptar(d)); }

  // ── PENSAR (determinista v0.1.0): crudo estructurado → ProductoUniversal ──
  // Clasifica el arquetipo por la FORMA (ejes+naturalezas), no por la superficie.
  _clasificarArquetipo(ejes, naturalezas, arquetipoDado) {
    // clasificador POR LA FORMA — fuente única en _shared/arquetipos-semilla (mismo que usa el registro).
    return arquetipoDado || clasificar(ejes, naturalezas);
  }

  // Marca lo privado como ABIERTO (no se inventa): coste y stock siempre; agenda si hay tiempo;
  // tarifa si el precio no es un número fijo. Esas preguntas SON el onboarding del comerciante.
  _preguntasAbiertas(ejes, naturalezas, crudo) {
    const qs = [];
    if (!crudo.coste_resuelto) qs.push({ campo: 'coste', para: 'comerciante', porque: 'privado' });
    if (!crudo.stock_resuelto) qs.push({ campo: 'stock', para: 'comerciante', porque: 'privado' });
    if (ejes.tiempo && ejes.tiempo !== 'ninguno') qs.push({ campo: 'agenda', para: 'comerciante', porque: 'privado' });
    if (naturalezas.precio === 'rango_valoracion' || naturalezas.precio === 'por_tiempo') qs.push({ campo: 'tarifa', para: 'comerciante', porque: 'no_computable' });
    return qs;
  }

  _pensar(crudo) {
    const ejes = {
      tiempo: TIEMPO.has(crudo.tiempo) ? crudo.tiempo : 'ninguno',
      estado_de_partida: crudo.estado_de_partida || false,
      ciclo: CICLO.has(crudo.ciclo) ? crudo.ciclo : 'de_ida'
    };
    const naturalezas = {
      stock: STOCK.has(crudo.stock) ? crudo.stock : 'unidades',
      precio: PRECIO.has(crudo.precio) ? crudo.precio : 'por_unidad'
    };
    const arquetipo = this._clasificarArquetipo(ejes, naturalezas, crudo.arquetipo);
    const preguntas_abiertas = this._preguntasAbiertas(ejes, naturalezas, crudo);
    return {
      nombre: crudo.nombre,
      arquetipo,
      identidad: { que_es: crudo.que_es || crudo.nombre || '', trabajo_que_resuelve: crudo.trabajo || crudo.trabajo_que_resuelve || '' },
      restricciones: Array.isArray(crudo.restricciones) ? crudo.restricciones : [],
      contrato: {
        atributos_saber: Array.isArray(crudo.atributos) ? crudo.atributos : (Array.isArray(crudo.atributos_saber) ? crudo.atributos_saber : []),
        opciones: Array.isArray(crudo.opciones) ? crudo.opciones : [],
        estados: Array.isArray(crudo.estados) ? crudo.estados : []
      },
      ejes, naturalezas,
      no_objetivos: Array.isArray(crudo.no_objetivos) ? crudo.no_objetivos : [],
      preguntas_abiertas,
      madurez: preguntas_abiertas.length ? 'necesita_aclaracion_comerciante' : 'listo',
      ...(crudo.categoria_id ? { categoria_id: crudo.categoria_id } : {})
    };
  }

  // ── el espinazo blueprint-agentico (6 fases) ──
  async _adaptar(input) {
    if (!input.project_id) return this._invalid('project_id');
    const crudo = input.crudo || input.producto || {};
    if (!crudo.nombre) return this._invalid('crudo.nombre');

    // PENSAR
    const producto = this._pensar(crudo);

    // VALIDAR — contra el freno de producto-manager (catalogo.validar.request → _checkProducto).
    const v = await this._rpc('catalogo.validar.request', { producto });
    if (v && v.status === 200 && v.data && v.data.valid === false) {
      // el PENSAR determinista no debería fallar; si el freno rechaza, FALLA HONESTO (no persiste basura).
      return this._errorResponse(422, 'UPSTREAM_INVALID_RESPONSE', 'el producto adaptado no pasa el freno', { errors: v.data.errors });
    }

    // GUARDAR — producto-manager consume producto.adaptado (upsert idempotente).
    this.eventBus.publish('producto.adaptado', {
      project_id: input.project_id, catalogo_id: input.catalogo_id, producto,
      correlation_id: input.correlation_id, timestamp: new Date().toISOString()
    });

    // EMITIR
    return { status: 200, data: { producto, arquetipo: producto.arquetipo, madurez: producto.madurez, preguntas_abiertas: producto.preguntas_abiertas } };
  }
}

module.exports = PrismaAdaptadorReflejo;
