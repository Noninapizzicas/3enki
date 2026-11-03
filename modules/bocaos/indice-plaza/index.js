'use strict';

/**
 * indice-plaza · REFLEJO · PLAZA — D07 (PlazaPública) + D08 (NeutralidadOrden) + L02 (GuardaPropiedadCliente).
 *
 * EL ÍNDICE DE LA PLAZA: las tiendas que REPARTEN en la dirección consultada, en orden declarado
 * y neutro. Es una proyección del censo, ya filtrada por cobertura (S02): no se escribe, no vive
 * por su cuenta y no guarda posiciones.
 *
 *   D07 · índice(censo, dirección) → escaparate
 *   D08 · revisar(orden mostrado) → conforme | FALLA
 *   K02 · revisar(cualquier comunicación al cliente final) → conforme | FALLA
 *   L02 · revisar(consulta que cruce tiendas) → conforme | FALLA
 *
 * Las tres guardas son UNA sola pregunta: ¿puede un campo comprar lo que el cliente ve? No.
 *
 *   1. FILTRAR NO ES ORDENAR. Quitar por cobertura es un hecho comprobable (¿llega?); poner por
 *      conveniencia es una preferencia que el cliente no ve. La guarda cubre las dos.
 *   2. NINGÚN CAMPO PERMITE PAGAR POR POSICIÓN: ni destacado, ni prioridad, ni ranking, ni peso,
 *      ni promoción. Si un solo campo aparece, FALLA — no se ignora.
 *   3. LA MARCA QUE HAY QUE OCULTAR ES DE LA PLAZA Y DEL NACIONAL (K02): la tienda no puede
 *      vigilar una marca que no conoce, por eso esta guarda vive aquí y la tienda la invoca en su
 *      camino caliente. Sin marca de Bocaos, ni de la plaza, ni «powered by», ni enlace.
 *   4. EL CLIENTE DE UNA TIENDA NO APARECE EN OTRA (L02), tampoco dentro de la misma plaza.
 *
 * Sin store y sin PosPersistencia: no escribe nada. Lo que necesita lo pide al bus.
 * Isla: cero require a otra isla.
 */

const ModuloBocaos = require('../_bocaos');

// D08 · lo que NO existe en el diseño. Si aparece uno de estos campos, alguien está vendiendo
// una posición con otro nombre.
const CAMPOS_COMPRA = [
  'posicion', 'posición', 'posicion_pagada', 'destacado', 'destacada', 'prioridad', 'ranking',
  'score', 'peso', 'promocionado', 'sponsored', 'publicidad', 'cuota', 'comision', 'comisión',
  'orden_pagado', 'boost', 'premium'
];

// K02 · la marca de Bocaos y la de la plaza nunca viajan al cliente final. Estas son las formas
// con las que se cuelan (nombre, enlace, remitente, «powered by»).
const MARCAS_FIJAS = ['bocaos', 'powered by', 'powered-by', 'impulsado por', 'una plaza de', 'bocaos.app'];
const ENLACES = /(https?:\/\/|www\.)/i;

class IndicePlaza extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'indice-plaza';
    this.version = 'reflejo-0.1.0';
    this._path = null;               // no escribe: es una proyección del censo
    this.marcas_vedadas = [];        // se puede ampliar con el nombre de la plaza, por evento
  }

  onIndiceRequest(e) { return this.servir(e, 'indice', 'indice-plaza.indice', (d) => this._indice(d)); }
  onGuardaRequest(e) { return this.servir(e, 'guarda', 'indice-plaza.guarda', (d) => this._guarda(d)); }

  // ================= D07 · el índice de la plaza =================
  async _indice(d) {
    if (!d.project_id) return this._invalid('project_id');
    const plaza_id = d.plaza_id || this.plaza_id || d.project_id;

    // El filtro no se hace aquí: se PIDE. D07 es una proyección, y la cobertura es de S02.
    const frontera = await this._rpc('frontera-plaza.zonas.request', {
      project_id: d.project_id,
      plaza_id,
      direccion: d.direccion || { zona: d.zona || null },
      instante: this._iso(d.instante) || this.ahora()
    }, { timeout_ms: 4000 });

    if (!frontera || !frontera.data) {
      return this._errorResponse(503, 'SIN_FRONTERA',
        'sin la frontera no hay índice: una lista sin cobertura sería una lista de las que quieren, no de las que llegan',
        { field: 'direccion', hueco: 'sin frontera' });
    }

    const tiendas = Array.isArray(frontera.data.tiendas_que_llegan) ? frontera.data.tiendas_que_llegan : [];
    const huecos = [...(frontera.data.huecos || [])];

    // D08: ninguna fila puede traer un campo de compra. Se revisa ANTES de servir, sobre lo que
    // llega: si se revisara la fila ya limpia, el campo se colaría en el camino y nadie lo vería.
    const revision = this._neutralidad(tiendas);
    if (!revision.conforme) {
      return this._errorResponse(409, 'ORDEN_NO_NEUTRO',
        'el índice trae un campo que permite pagar por posición: no se sirve (D08)',
        { field: 'orden', fallas: revision.fallas });
    }

    const orden = tiendas.map((t, i) => ({
      orden: i,
      tienda_id: t.tienda_id,
      nombre: t.nombre || null,
      zonas: t.zonas || [],
      motivo_filtro: 'llega a la dirección consultada'
    }));

    const escaparate = {
      plaza_id,
      direccion: frontera.data.direccion || d.direccion || null,
      zona: frontera.data.zona || null,
      // El orden es el declarado (el del censo). Sin ranking, sin destacados, sin «recomendados».
      orden: 'declarado',
      tiendas: orden,
      n: orden.length,
      filtro: {
        cobertura_plaza: frontera.data.cobertura_plaza || [],
        fuente: frontera.data.fuente_cobertura || 'sin declarar',
        no_llegan: (frontera.data.tiendas_que_no || []).map((t) => ({ tienda_id: t.tienda_id, motivo: t.motivo }))
      },
      huecos
    };

    this.hecho('bocaos.indice_servido', {
      plaza_id,
      zona: escaparate.zona,
      n: escaparate.n,
      tiendas: escaparate.tiendas.map((t) => t.tienda_id),
      orden: 'declarado',
      huecos
    });

    return { status: 200, data: { indice: escaparate } };
  }

  // ================= D08 + K02 + L02 · la guarda =================
  async _guarda(d) {
    if (!d.project_id) return this._invalid('project_id');
    const fallas = [];

    // D08: el orden mostrado, campo por campo.
    const orden = Array.isArray(d.orden) ? d.orden : (Array.isArray(d.tiendas) ? d.tiendas : null);
    if (orden) {
      const r = this._neutralidad(orden);
      if (!r.conforme) fallas.push(...r.fallas);
    }

    // K02: cualquier comunicación al cliente final. Se revisa el texto y, si viene, el remitente.
    const textos = [];
    if (typeof d.texto === 'string') textos.push(['texto', d.texto]);
    if (typeof d.mensaje === 'string') textos.push(['mensaje', d.mensaje]);
    if (typeof d.asunto === 'string') textos.push(['asunto', d.asunto]);
    if (typeof d.remitente === 'string') textos.push(['remitente', d.remitente]);
    for (const [campo, texto] of textos) {
      const marca = this._marcaAjena(texto, d);
      if (marca) {
        fallas.push({
          regla: 'K02',
          campo,
          motivo: `la comunicación lleva la marca «${marca}»: el cliente final no puede saber que Bocaos (ni la plaza) existe`,
          detectado: marca
        });
      }
    }

    // L02: una consulta que cruce tiendas devuelve FALLA, también dentro de la misma plaza.
    const consulta = (d.consulta && typeof d.consulta === 'object') ? d.consulta : null;
    if (consulta) {
      const tiendas = Array.isArray(consulta.tiendas) ? consulta.tiendas : null;
      if (consulta.cruza_tiendas === true || (tiendas && tiendas.length > 1)) {
        fallas.push({
          regla: 'L02',
          campo: 'consulta',
          motivo: 'la consulta cruza tiendas: el cliente de una tienda no aparece en otra (L02)'
        });
      }
    } else if (d.cruza_tiendas === true) {
      fallas.push({ regla: 'L02', campo: 'cruza_tiendas', motivo: 'la consulta cruza tiendas (L02)' });
    }

    return {
      status: 200,
      data: {
        conforme: fallas.length === 0,
        fallas,
        // Se dice QUÉ se revisó: una guarda que no enumera lo que miró no es una guarda.
        revisado: {
          orden: !!orden,
          comunicacion: textos.map(([c]) => c),
          consulta: !!consulta
        },
        marcas_vedadas: this._marcas(d)
      }
    };
  }

  // D08 · un solo campo que permita pagar por posición y la guarda FALLA.
  _neutralidad(orden) {
    const fallas = [];
    orden.forEach((fila, i) => {
      if (!fila || typeof fila !== 'object') return;
      for (const campo of Object.keys(fila)) {
        if (CAMPOS_COMPRA.includes(campo.toLowerCase())) {
          fallas.push({
            regla: 'D08',
            campo,
            fila: i,
            tienda_id: fila.tienda_id || null,
            motivo: `«${campo}» permite pagar por posición: filtrar no es ordenar, y ordenar por conveniencia es una preferencia que el cliente no ve`
          });
        }
      }
    });
    return { conforme: fallas.length === 0, fallas };
  }

  // K02 · devuelve la marca encontrada, o null.
  _marcaAjena(texto, d) {
    const t = String(texto || '');
    const bajo = t.toLowerCase();
    for (const marca of this._marcas(d)) {
      if (marca && bajo.includes(marca)) return marca;
    }
    // Un enlace a la plaza o al nacional también la delata.
    if (ENLACES.test(t) && (d.enlace_prohibido || d.revisar_enlaces)) return 'enlace';
    return null;
  }

  _marcas(d) {
    const extra = [];
    if (d && typeof d.plaza_nombre === 'string' && d.plaza_nombre.trim()) extra.push(d.plaza_nombre.trim().toLowerCase());
    if (d && typeof d.marca_plaza === 'string' && d.marca_plaza.trim()) extra.push(d.marca_plaza.trim().toLowerCase());
    return [...new Set([...MARCAS_FIJAS, ...this.marcas_vedadas, ...extra])];
  }
}

module.exports = IndicePlaza;
module.exports.CAMPOS_COMPRA = CAMPOS_COMPRA;
module.exports.MARCAS_FIJAS = MARCAS_FIJAS;
