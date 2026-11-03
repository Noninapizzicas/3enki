'use strict';

/**
 * contrato-puntual · CUSTODIO · PLAZA — A24 (ContratoPuntual).
 *
 * El contrato de UN pedido con UN rider: puntual, sin turno, sin jornada, sin compromiso con el
 * siguiente. NACE DE UNA ACEPTACIÓN LIBRE, no de una asignación: el único disparador es el hecho
 * `bocaos.propuesta_aceptada`, y la petición explícita `contrato-puntual.crear.request` exige
 * que esa aceptación conste. Sin aceptación no hay constructor (A27).
 *
 * Si tuviera duración, turno o jornada, el negocio sería otro (inspección de trabajo): se
 * rechaza con 422. Cierra con el hecho de entrega, no con un reloj.
 */

const crypto = require('crypto');
const ModuloBocaos = require('../_bocaos');

const PROHIBIDO = ['turno', 'jornada', 'duracion_h', 'horas_semanales'];

class ContratoPuntual extends ModuloBocaos {
  constructor() {
    super();
    this.name = 'contrato-puntual';
    this.version = 'reflejo-0.1.0';
    this._path = '/bocaos/contrato-puntual.json';
  }

  // ================= RPC del bus =================
  onCrearRequest(e) { return this.servir(e, 'crear', 'contrato-puntual.crear', (d) => this._crear(d)); }
  onDeRequest(e) { return this.servir(e, 'de', 'contrato-puntual.de', (d) => this._de(d)); }
  onCerrarRequest(e) { return this.servir(e, 'cerrar', 'contrato-puntual.cerrar', (d) => this._cerrar(d)); }

  // ================= hechos que escucha =================
  async onPropuestaAceptada(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id) return;
    // A27: el contrato nace del HECHO del custodio de la propuesta, no de una voz del móvil que
    // use el mismo tópico. Se acepta su sello (origen 'propuesta') o la forma completa del hecho
    // (hora de aceptación + las medidas ya compuestas): una voz sin números no construye un
    // contrato sin precio.
    const esHecho = d.origen === 'propuesta'
      || (!!d.hora_aceptacion && !!d.medidas && typeof d.medidas === 'object');
    if (!esHecho) return;
    const est = await this.estado(d.project_id);
    est.aceptaciones = est.aceptaciones || {};
    est.aceptaciones[d.pedido_id] = {
      propuesta_id: d.propuesta_id || null,
      rider_id: d.rider_id || null,
      hora_aceptacion: this._iso(d.hora_aceptacion),
      medidas: d.medidas || null,
      plaza_id: d.plaza_id || null
    };
    await this.guardar(d.project_id);
    // A24: la aceptación libre ES el constructor. La asignación no existe.
    return this._crear({ ...d, project_id: d.project_id, pedido_id: d.pedido_id, rider_id: d.rider_id, propuesta_id: d.propuesta_id, hora_aceptacion: d.hora_aceptacion });
  }

  async onHechoRepartoAnotado(e) {
    const d = this.datos(e);
    if (!d.project_id || !d.pedido_id || d.tipo !== 'entrega') return;
    const est = await this.estado(d.project_id);
    const c = est.contratos?.[d.pedido_id];
    if (!c || c.estado !== 'VIVO') return;
    await this._cerrar({ ...d, contrato_id: c.contrato_id, hora: d.hora, motivo: 'hecho de entrega' });
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id && /^plaza-/.test(d.project_id)) this.plaza_id = d.project_id;
    if (d.project_id) await this.estado(d.project_id);
  }

  // ================= proyecciones =================
  async _crear(d) {
    if (!d.project_id) return this._invalid('project_id');
    if (!d.pedido_id) return this._invalid('pedido_id');

    for (const campo of PROHIBIDO) {
      if (d[campo] !== undefined && d[campo] !== null) {
        return this._errorResponse(422, 'CONTRATO_CON_DURACION', `${campo} no cabe en un contrato puntual: sería otro negocio (A24)`, { field: campo });
      }
    }

    const est = await this.estado(d.project_id);
    est.contratos = est.contratos || {};
    const existente = est.contratos[d.pedido_id];
    if (existente) return { status: 200, data: { contrato: existente, idempotente: true } };

    const aceptacion = est.aceptaciones?.[d.pedido_id];
    if (!aceptacion) {
      // A27: no hay camino de pedido a rider sin aceptación libre.
      return this._errorResponse(409, 'SIN_ACEPTACION', 'no hay aceptación libre de ese pedido: no se construye un contrato', { field: 'pedido_id', hueco: 'sin aceptación' });
    }
    if (d.rider_id && aceptacion.rider_id && d.rider_id !== aceptacion.rider_id) {
      return this._errorResponse(409, 'RIDER_NO_ES_EL_QUE_ACEPTO', 'el contrato es con el rider que dijo sí', { field: 'rider_id' });
    }

    const contrato = {
      contrato_id: `ct-${crypto.randomUUID().slice(0, 8)}`,
      pedido_id: d.pedido_id,
      plaza_id: aceptacion.plaza_id || d.plaza_id || this.plaza_id || null,
      rider_id: aceptacion.rider_id,
      propuesta_id: aceptacion.propuesta_id,
      hora_aceptacion: aceptacion.hora_aceptacion,
      hora_prometida: this._iso(d.hora_prometida) || null,
      precio_cents: aceptacion.medidas ? aceptacion.medidas.cobra_cents : null,
      estado: 'VIVO',
      creado_en: this.ahora(),
      cerrado_en: null,
      motivo_cierre: null
    };
    est.contratos[d.pedido_id] = contrato;
    await this.guardar(d.project_id);

    this.hecho('bocaos.contrato_creado', {
      contrato_id: contrato.contrato_id,
      pedido_id: contrato.pedido_id,
      plaza_id: contrato.plaza_id,
      rider_id: contrato.rider_id,
      propuesta_id: contrato.propuesta_id,
      hora_contrato: contrato.creado_en,
      hora_aceptacion: contrato.hora_aceptacion,
      hora_prometida: contrato.hora_prometida,
      precio_cents: contrato.precio_cents
    });
    return { status: 201, data: { contrato } };
  }

  async _de(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const c = d.contrato_id
      ? Object.values(est.contratos || {}).find((x) => x.contrato_id === d.contrato_id)
      : est.contratos?.[d.pedido_id];
    if (!c) return this._errorResponse(404, 'NO_CONSTA', 'no hay contrato para ese pedido o contrato_id', { field: d.contrato_id ? 'contrato_id' : 'pedido_id' });
    return { status: 200, data: { contrato: c } };
  }

  async _cerrar(d) {
    if (!d.project_id) return this._invalid('project_id');
    const est = await this.estado(d.project_id);
    const c = d.pedido_id ? est.contratos?.[d.pedido_id] : Object.values(est.contratos || {}).find((x) => x.contrato_id === d.contrato_id);
    if (!c) return this._errorResponse(404, 'NO_CONSTA', 'no hay contrato que cerrar', { field: 'contrato_id' });
    if (c.estado !== 'VIVO') return { status: 200, data: { contrato: c, idempotente: true } };

    c.estado = 'CERRADO';
    c.cerrado_en = this._iso(d.hora) || this.ahora();
    c.motivo_cierre = d.motivo || null;
    await this.guardar(d.project_id);

    this.hecho('bocaos.contrato_cerrado', {
      contrato_id: c.contrato_id,
      pedido_id: c.pedido_id,
      plaza_id: c.plaza_id,
      rider_id: c.rider_id,
      hora_cierre: c.cerrado_en,
      motivo: c.motivo_cierre
    });
    return { status: 200, data: { contrato: c } };
  }
}

module.exports = ContratoPuntual;
