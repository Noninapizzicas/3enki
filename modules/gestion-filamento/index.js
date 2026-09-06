/**
 * gestion-filamento — CUSTODIO del proyecto 3D (taller personal de impresion 3D).
 *
 * Gestion del filamento por LONGITUD (mm). Es el UNICO escritor de su store
 * (Map<id,Filamento>). La impresora reporta filament_used en mm (longitud); el
 * decremento de stock se hace por longitud.
 *
 * Op registrar (append + emite filamento.registrado), decrementar (proyeccion
 * _decrementarStock pieza 6.2 + _detectarBajo pieza 6.3, emite
 * filamento.decrementado y filamento.bajo si cae bajo el umbral), listar.
 * Tambien escucha el evento fire-and-forget filamento.usado (la impresora
 * reporta filament_used en mm) para decrementar el rollo activo del proyecto.
 *
 * Invariante 9: el filamento NO se decrementa sin rollo — si no hay rollo o la
 * longitud es desconocida, no se decrementa y se avisa (par de fallo
 * filamento.decrementar.failed). Todo flujo cierra su circulo.
 *
 * Umbral de filamento bajo configurable (pregunta abierta 5 del plan).
 * Persiste por proyecto via _shared/pos-persistencia (snapshot fs por
 * project_id, debounced) en /3d/filamento/gestion-filamento.json; restaura en
 * project.activated; vuelca en onUnload.
 *
 * Ver plan-construccion.md seccion 6.4.
 */

'use strict';

const crypto = require('crypto');
const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const nowISO = () => new Date().toISOString();

class GestionFilamentoReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'gestion-filamento';
    this.version = 'reflejo-0.1.0';
    this.filamentos = new Map();   // id → Filamento { project_id, ... }
    this.umbralBajo = 5000;        // mm — pregunta abierta 5 (configurable)

    this._persist = new PosPersistencia({
      modulo: this, file: 'gestion-filamento.json', dir: '/3d/filamento',
      snapshot: (pid) => ({ filamentos: [...this.filamentos].filter(([, f]) => f.project_id === pid) }),
      hidratar: (pid, data) => { for (const [id, f] of (data.filamentos || [])) this.filamentos.set(id, f); }
    });
  }

  async onUnload() { await this._persist.flush(); this._persist.detener(); return super.onUnload(); }
  onProjectActivated(e) { const d = (e && (e.data || e)) || {}; return this._persist.restaurar(d.project_id); }

  onRegistrarRequest(e)   { return this._atender(e, 'registrar', 'filamento.registrar.response', d => this._registrar(d)); }
  onDecrementarRequest(e) { return this._atender(e, 'decrementar', 'filamento.decrementar.response', d => this._decrementar(d)); }
  onListarRequest(e)      { return this._atender(e, 'listar', 'filamento.listar.response', d => this._listar(d)); }

  // fire-and-forget: la impresora reporta filament_used en mm → decrementa el rollo activo.
  onFilamentoUsado(e) {
    const d = (e && (e.data || e)) || {};
    const pid = d.project_id;
    if (!pid) return;
    const activo = this._rolloActivo(pid);
    if (!activo) return;   // sin rollo activo → nada que decrementar (honesto)
    this._decrementar({ project_id: pid, rollo_id: activo.id, filament_used: d.filament_used });
  }

  // ---- proyecciones deterministas ----------------------------------------

  _registrar(input) {
    if (!input.tipo) return this._invalid('tipo');
    if (!input.project_id) return this._invalid('project_id');
    const id = input.id || crypto.randomUUID();
    if (this.filamentos.has(id)) {
      return this._errorResponse(409, 'ALREADY_EXISTS', 'el rollo de filamento ya existe', { entity_type: 'filamento', id });
    }
    const longitudInicial = input.longitud_inicial;
    const filamento = {
      id,
      project_id: input.project_id,
      tipo: input.tipo,
      color: input.color || 'desconocido',
      longitud_inicial: (typeof longitudInicial === 'number' && longitudInicial > 0) ? longitudInicial : null,
      longitud_restante: (typeof longitudInicial === 'number' && longitudInicial > 0) ? longitudInicial : null,
      activo: input.activo === true,
      created_at: nowISO()
    };
    this.filamentos.set(id, filamento);
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('filamento.registrado', {
      filamento_id: id, tipo: filamento.tipo, color: filamento.color,
      longitud_inicial: filamento.longitud_inicial,
      longitud_desconocida: filamento.longitud_inicial === null,
      project_id: input.project_id, correlation_id: input.correlation_id, timestamp: nowISO()
    });
    return { status: 201, data: { filamento } };
  }

  _decrementar(input) {
    if (!input.rollo_id) return this._invalid('rollo_id');
    if (!input.project_id) return this._invalid('project_id');
    const f = this.filamentos.get(input.rollo_id);
    if (!f || f.project_id !== input.project_id) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'rollo de filamento no existe', { entity_type: 'filamento', id: input.rollo_id });
    }
    const usado = Number(input.filament_used);
    if (!Number.isFinite(usado) || usado < 0) {
      return this._errorResponse(400, 'INVALID_INPUT', 'filament_used debe ser un numero en mm >= 0', { field: 'filament_used' });
    }
    // Invariante 9: sin longitud conocida no se decrementa y se avisa.
    if (f.longitud_restante === null) {
      return this._errorResponse(409, 'LONGITUD_DESCONOCIDA', 'no se decrementa un rollo con longitud desconocida', { entity_type: 'filamento', id: f.id });
    }
    const antes = f.longitud_restante;
    const restante = this._decrementarStock(f, usado);
    const bajo = this._detectarBajo(f);
    this._persist.marcarDirty(input.project_id);
    this.eventBus?.publish('filamento.decrementado', {
      filamento_id: f.id, tipo: f.tipo, color: f.color,
      filament_used: usado, longitud_antes: antes, longitud_restante: restante,
      project_id: input.project_id, correlation_id: input.correlation_id, timestamp: nowISO()
    });
    if (bajo) {
      this.eventBus?.publish('filamento.bajo', {
        filamento_id: f.id, tipo: f.tipo, color: f.color,
        longitud_restante: restante, umbral: this.umbralBajo,
        project_id: input.project_id, correlation_id: input.correlation_id, timestamp: nowISO()
      });
    }
    return { status: 200, data: { filamento: f, bajo } };
  }

  _listar(input) {
    const pid = input && input.project_id;
    const out = [];
    for (const [id, f] of this.filamentos) {
      if (pid && f.project_id !== pid) continue;
      out.push({
        id, tipo: f.tipo, color: f.color,
        longitud_inicial: f.longitud_inicial, longitud_restante: f.longitud_restante,
        activo: f.activo, bajo: this._detectarBajo(f)
      });
    }
    return { status: 200, data: { filamentos: out, total: out.length } };
  }

  // pieza 6.2 — decremento de stock por longitud (resta acumulada, piso 0).
  _decrementarStock(filamento, usado) {
    const restante = Math.max(0, (filamento.longitud_restante || 0) - usado);
    filamento.longitud_restante = this._round(restante);
    return filamento.longitud_restante;
  }

  // pieza 6.3 — deteccion de filamento bajo (umbral configurable).
  _detectarBajo(filamento) {
    if (filamento.longitud_restante === null) return false;
    return filamento.longitud_restante <= this.umbralBajo;
  }

  // rollo activo del proyecto (el que esta cargado en la impresora).
  _rolloActivo(pid) {
    for (const f of this.filamentos.values()) {
      if (f.project_id === pid && f.activo) return f;
    }
    return null;
  }
}

module.exports = GestionFilamentoReflejo;
