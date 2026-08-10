'use strict';

const ModuloHibridoReflejo = require('../../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../../_shared/pos-persistencia');
const prioridadModulo = require('../../_shared/prioridad');
const prioridadCalculada = typeof prioridadModulo === 'function' ? prioridadModulo : prioridadModulo.prioridadCalculada;

const ARCHIVO = 'data/newsletter/banco-ideas.json';
const TOPE = 100;
const ESTADOS = { CRUDA: 'Cruda', APARCADA: 'Aparcada', SELECCIONADA: 'Seleccionada' };

class BancoIdeas extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'banco-ideas';
    this.version = '0.1.0';
    this._pos = new PosPersistencia({ modulo: this.name, archivo: ARCHIVO });
  }

  onRegistrarRequest(evento, contexto, respuesta, siguiente) {
    return this._atender(evento, contexto, respuesta, siguiente);
  }

  onAparcarRequest(evento, contexto, respuesta, siguiente) {
    return this._atender(evento, contexto, respuesta, siguiente);
  }

  onListarRequest(evento, contexto, respuesta, siguiente) {
    return this._atender(evento, contexto, respuesta, siguiente);
  }

  onSeleccionarRequest(evento, contexto, respuesta, siguiente) {
    return this._atender(evento, contexto, respuesta, siguiente);
  }

  onProjectActivated(evento, contexto, respuesta, siguiente) {
    return this._atender(evento, contexto, respuesta, siguiente);
  }

  _atender(evento, contexto, respuesta, siguiente) {
    const tipo = evento && (evento.tipo || evento.event || evento.nombre);
    if (!tipo) return siguiente();
    switch (tipo) {
      case 'newsletter.idea.registrar.request':
        return this._manejarRegistrar(evento, contexto, respuesta);
      case 'newsletter.idea.aparcar.request':
        return this._manejarAparcar(evento, contexto, respuesta);
      case 'newsletter.banco.listar.request':
        return this._manejarListar(evento, contexto, respuesta);
      case 'newsletter.banco.seleccionar.request':
        return this._manejarSeleccionar(evento, contexto, respuesta);
      case 'project.activated':
        return this._manejarProjectActivated(evento, contexto, respuesta);
      default:
        return siguiente();
    }
  }

  _proyectoId(contexto, evento) {
    const ctx = contexto || {};
    const payload = (evento && (evento.payload || evento.datos)) || (ctx.payload || {});
    return (evento && (evento.proyecto_id || evento.proyectoId)) ||
      ctx.proyecto_id || ctx.proyectoId ||
      payload.proyecto_id || payload.proyectoId ||
      'default';
  }

  _cargar(proyectoId) {
    try {
      let datos;
      if (typeof this._pos.leer === 'function') datos = this._pos.leer(proyectoId);
      else if (typeof this._pos.cargar === 'function') datos = this._pos.cargar(proyectoId);
      else if (typeof this._pos.obtener === 'function') datos = this._pos.obtener(proyectoId);
      if (!datos || typeof datos !== 'object') datos = {};
      if (!Array.isArray(datos.ideas)) datos.ideas = [];
      return datos;
    } catch (error) {
      return { ideas: [] };
    }
  }

  _guardar(proyectoId, estado) {
    if (typeof this._pos.escribir === 'function') this._pos.escribir(proyectoId, estado);
    else if (typeof this._pos.guardar === 'function') this._pos.guardar(proyectoId, estado);
    else if (typeof this._pos.persistir === 'function') this._pos.persistir(proyectoId, estado);
    return estado;
  }

  _responder(respuesta, datos, statusCode) {
    const codigo = statusCode || 200;
    if (typeof respuesta === 'function') {
      respuesta(datos);
      return;
    }
    if (respuesta && typeof respuesta.json === 'function') {
      if (typeof respuesta.status === 'function') respuesta.status(codigo).json(datos);
      else respuesta.json(datos);
      return;
    }
    if (respuesta) {
      respuesta.statusCode = codigo;
      respuesta.body = datos;
    }
  }

  _responderError(respuesta, error, mensaje) {
    this._responder(respuesta, { ok: false, error, mensaje }, 400);
  }

  _publicar(evento, datos) {
    if (typeof this.emitir === 'function') return this.emitir(evento, datos);
    if (typeof this.publicar === 'function') return this.publicar(evento, datos);
    if (this.bus && typeof this.bus.publish === 'function') return this.bus.publish(evento, datos);
    return undefined;
  }

  _uuid() {
    if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') return crypto.randomUUID();
    return `idea-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
  }

  _registrar(estado, payload) {
    const ideas = Array.isArray(estado.ideas) ? estado.ideas.slice() : [];
    const titulo = payload.titulo || payload.nombre || payload.texto || '';
    if (!titulo) return { ok: false, error: 'titulo_requerido' };
    const id = payload.id || this._uuid();
    const prioridad = typeof payload.prioridadCalculada === 'number' ? payload.prioridadCalculada : prioridadCalculada(payload);
    const idea = {
      id,
      titulo,
      descripcion: payload.descripcion || '',
      estado: ESTADOS.CRUDA,
      prioridadCalculada: prioridad,
      creadaEn: payload.creadaEn || new Date().toISOString()
    };
    ideas.push(idea);
    let descartada = null;
    if (ideas.length > TOPE) {
      ideas.sort((a, b) => a.prioridadCalculada - b.prioridadCalculada);
      descartada = ideas.shift();
    }
    return { ok: true, estado: { ...estado, ideas }, idea, descartada, topeAlcanzado: Boolean(descartada) };
  }

  _aparcar(estado, payload) {
    const id = payload.id || payload.ideaId;
    if (!id) return { ok: false, error: 'id_requerido' };
    const ideas = (estado.ideas || []).map(idea => idea.id === id ? { ...idea, estado: ESTADOS.APARCADA } : idea);
    const idea = ideas.find(item => item.id === id);
    if (!idea) return { ok: false, error: 'idea_no_encontrada' };
    return { ok: true, estado: { ...estado, ideas }, idea };
  }

  _listar(estado, payload) {
    const filtro = payload.estado || payload.filtro || 'todas';
    let ideas = (estado.ideas || []).slice();
    if (filtro === 'EnBanco') ideas = ideas.filter(item => item.estado === ESTADOS.CRUDA || item.estado === ESTADOS.SELECCIONADA);
    else if (filtro === 'Aparcada') ideas = ideas.filter(item => item.estado === ESTADOS.APARCADA);
    else if (filtro === 'Seleccionada') ideas = ideas.filter(item => item.estado === ESTADOS.SELECCIONADA);
    else if (filtro !== 'todas' && filtro !== 'Todas') ideas = ideas.filter(item => item.estado === filtro);
    return { ok: true, ideas, total: ideas.length };
  }

  _seleccionar(estado, payload) {
    const id = payload.id || payload.ideaId;
    if (!id) return { ok: false, error: 'id_requerido' };
    const existente = (estado.ideas || []).find(item => item.id === id);
    if (!existente) return { ok: false, error: 'idea_no_encontrada' };
    if (existente.estado === ESTADOS.SELECCIONADA) {
      return { ok: true, estado, idea: existente, yaSeleccionada: true };
    }
    const ideas = (estado.ideas || []).map(item => item.id === id
      ? { ...item, estado: ESTADOS.SELECCIONADA, fechaSeleccion: payload.fechaSeleccion || new Date().toISOString() }
      : item
    );
    const idea = ideas.find(item => item.id === id);
    return { ok: true, estado: { ...estado, ideas }, idea, yaSeleccionada: false };
  }

  _manejarRegistrar(evento, contexto, respuesta) {
    const proyectoId = this._proyectoId(contexto, evento);
    const estado = this._cargar(proyectoId);
    const payload = (evento && (evento.payload || evento.datos)) || (contexto && contexto.payload) || {};
    const resultado = this._registrar(estado, payload);
    if (!resultado.ok) return this._responderError(respuesta, resultado.error, 'No se pudo registrar la idea.');
    this._guardar(proyectoId, resultado.estado);
    this._publicar('newsletter.idea.registrada', { proyecto_id: proyectoId, idea: resultado.idea });
    if (resultado.topeAlcanzado) {
      this._publicar('newsletter.banco.tope_alcanzado', {
        proyecto_id: proyectoId,
        descartada: resultado.descartada,
        tope: TOPE
      });
    }
    return this._responder(respuesta, {
      ok: true,
      idea: resultado.idea,
      topeAlcanzado: resultado.topeAlcanzado,
      descartada: resultado.descartada || null,
      total: resultado.estado.ideas.length
    });
  }

  _manejarAparcar(evento, contexto, respuesta) {
    const proyectoId = this._proyectoId(contexto, evento);
    const estado = this._cargar(proyectoId);
    const payload = (evento && (evento.payload || evento.datos)) || (contexto && contexto.payload) || {};
    const resultado = this._aparcar(estado, payload);
    if (!resultado.ok) return this._responderError(respuesta, resultado.error, 'No se pudo aparcar la idea.');
    this._guardar(proyectoId, resultado.estado);
    this._publicar('newsletter.idea.aparcada', { proyecto_id: proyectoId, idea: resultado.idea });
    return this._responder(respuesta, { ok: true, idea: resultado.idea });
  }

  _manejarListar(evento, contexto, respuesta) {
    const proyectoId = this._proyectoId(contexto, evento);
    const estado = this._cargar(proyectoId);
    const payload = (evento && (evento.payload || evento.datos)) || (contexto && contexto.payload) || {};
    const resultado = this._listar(estado, payload);
    return this._responder(respuesta, { ok: true, ideas: resultado.ideas, total: resultado.total });
  }

  _manejarSeleccionar(evento, contexto, respuesta) {
    const proyectoId = this._proyectoId(contexto, evento);
    const estado = this._cargar(proyectoId);
    const payload = (evento && (evento.payload || evento.datos)) || (contexto && contexto.payload) || {};
    const resultado = this._seleccionar(estado, payload);
    if (!resultado.ok) return this._responderError(respuesta, resultado.error, 'No se pudo seleccionar la idea.');
    if (!resultado.yaSeleccionada) this._guardar(proyectoId, resultado.estado);
    return this._responder(respuesta, { ok: true, idea: resultado.idea, yaSeleccionada: resultado.yaSeleccionada });
  }

  _manejarProjectActivated(evento, contexto, respuesta) {
    const proyectoId = this._proyectoId(contexto, evento);
    const estado = this._cargar(proyectoId);
    this._guardar(proyectoId, estado);
    return this._responder(respuesta, { ok: true, banco: { total: estado.ideas.length } });
  }
}

module.exports = BancoIdeas;
