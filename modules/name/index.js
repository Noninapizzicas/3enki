'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');
const prioridadUtil = require('../_shared/prioridad');
const calcularPrioridad = typeof prioridadUtil === 'function'
  ? prioridadUtil
  : (prioridadUtil.calcularPrioridad || prioridadUtil.prioridad || null);

const RUTA_BANCO = 'data/newsletter/banco-ideas.json';
const TOPE = 100;

class BancoIdeas extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'banco-ideas';
    this.version = '0.1.0';
    this._pos = new PosPersistencia(RUTA_BANCO);
  }

  _atender(evento, contexto, respuesta, siguiente) {
    const datos = this._extraerDatos(evento, contexto);
    switch (evento) {
      case 'newsletter.idea.registrar.request':
        return this.onRegistrarRequest(datos, contexto, respuesta);
      case 'newsletter.idea.aparcar.request':
        return this.onAparcarRequest(datos, contexto, respuesta);
      case 'newsletter.banco.listar.request':
        return this.onListarRequest(datos, contexto, respuesta);
      case 'newsletter.banco.seleccionar.request':
        return this.onSeleccionarRequest(datos, contexto, respuesta);
      case 'project.activated':
        return this.onProjectActivated(datos, contexto, respuesta);
      default:
        if (siguiente) return siguiente();
    }
  }

  _extraerDatos(evento, contexto) {
    if (evento && typeof evento === 'object' && !contexto) return evento;
    const datos = contexto && contexto.datos ? contexto.datos : (contexto || {});
    return Object.assign({}, datos, {
      request_id: (contexto && contexto.request_id) || datos.request_id
    });
  }

  _leerBanco() {
    let banco;
    try {
      banco = this._pos.leer();
    } catch (e) {
      banco = null;
    }
    if (!banco || !Array.isArray(banco.ideas)) {
      banco = { ideas: [], siguienteId: 1 };
    }
    return banco;
  }

  _escribirBanco(banco) {
    this._pos.escribir(banco);
  }

  _publicar(contexto, evento, payload) {
    const bus = (contexto && contexto.bus) || this.bus;
    if (bus && typeof bus.publish === 'function') {
      bus.publish(evento, payload);
      return true;
    }
    return false;
  }

  _responder(contexto, eventoResponse, requestId, status, data) {
    const payload = { request_id: requestId, status, data };
    const publicado = this._publicar(contexto, eventoResponse, payload);
    return { payload, publicado };
  }

  _registrar(banco, datos) {
    const prioridad = typeof datos.prioridadCalculada === 'number'
      ? datos.prioridadCalculada
      : (typeof calcularPrioridad === 'function' ? calcularPrioridad(datos) : 0);
    const idea = {
      id: banco.siguienteId,
      titulo: datos.titulo,
      descripcion: datos.descripcion || '',
      prioridadCalculada: prioridad,
      estado: 'Cruda',
      tags: datos.tags || [],
      fuente: datos.fuente || null,
      fechaRegistro: new Date().toISOString()
    };
    banco.siguienteId += 1;
    banco.ideas.push(idea);
    let descartada = null;
    if (banco.ideas.length > TOPE) {
      descartada = this._menorPrioridad(banco.ideas);
      banco.ideas = banco.ideas.filter((i) => i.id !== descartada.id);
    }
    return { banco, idea, descartada };
  }

  _menorPrioridad(ideas) {
    return ideas.slice().sort((a, b) => {
      if (a.prioridadCalculada !== b.prioridadCalculada) {
        return a.prioridadCalculada - b.prioridadCalculada;
      }
      return new Date(a.fechaRegistro) - new Date(b.fechaRegistro);
    })[0];
  }

  _aparcar(banco, datos) {
    const idea = banco.ideas.find((i) => i.id === datos.ideaId);
    if (!idea) return { banco, idea: null, error: 'idea_no_encontrada' };
    idea.estado = 'Aparcada';
    idea.fechaAparcado = new Date().toISOString();
    idea.motivoAparcado = datos.motivo || 'Falta de evidencia';
    return { banco, idea, error: null };
  }

  _listar(banco, datos) {
    let ideas = banco.ideas;
    if (datos.estado && datos.estado !== 'todas') {
      ideas = ideas.filter((i) => i.estado === datos.estado);
    }
    return { banco, ideas };
  }

  _seleccionar(banco, datos) {
    const idea = banco.ideas.find((i) => i.id === datos.ideaId);
    if (!idea) return { banco, idea: null, error: 'idea_no_encontrada' };
    const huboCambio = idea.estado !== 'Seleccionada';
    if (huboCambio) {
      idea.estado = 'Seleccionada';
      idea.fechaSeleccion = new Date().toISOString();
    }
    return { banco, idea, error: null, huboCambio };
  }

  onRegistrarRequest(datos, contexto, respuesta) {
    const banco = this._leerBanco();
    const resultado = this._registrar(banco, datos);
    this._escribirBanco(resultado.banco);
    const { payload, publicado } = this._responder(contexto, 'newsletter.idea.registrar.response', datos.request_id, 'ok', {
      idea: resultado.idea,
      descartada: resultado.descartada
    });
    this._publicar(contexto, 'newsletter.idea.registrada', {
      request_id: datos.request_id,
      idea: resultado.idea
    });
    if (resultado.descartada) {
      this._publicar(contexto, 'newsletter.banco.tope_alcanzado', {
        request_id: datos.request_id,
        idea_id: resultado.idea.id,
        descartada_id: resultado.descartada.id,
        total: resultado.banco.ideas.length
      });
    }
    if (!publicado && typeof respuesta === 'function') respuesta(payload);
  }

  onAparcarRequest(datos, contexto, respuesta) {
    const banco = this._leerBanco();
    const resultado = this._aparcar(banco, datos);
    if (resultado.error) {
      const { payload, publicado } = this._responder(contexto, 'newsletter.idea.aparcar.response', datos.request_id, 'error', { error: resultado.error });
      if (!publicado && typeof respuesta === 'function') respuesta(payload);
      return;
    }
    this._escribirBanco(resultado.banco);
    const { payload, publicado } = this._responder(contexto, 'newsletter.idea.aparcar.response', datos.request_id, 'ok', {
      idea: resultado.idea
    });
    this._publicar(contexto, 'newsletter.idea.aparcada', {
      request_id: datos.request_id,
      idea_id: resultado.idea.id,
      motivo: resultado.idea.motivoAparcado
    });
    if (!publicado && typeof respuesta === 'function') respuesta(payload);
  }

  onListarRequest(datos, contexto, respuesta) {
    const banco = this._leerBanco();
    const { ideas } = this._listar(banco, datos);
    const { payload, publicado } = this._responder(contexto, 'newsletter.banco.listar.response', datos.request_id, 'ok', { ideas });
    if (!publicado && typeof respuesta === 'function') respuesta(payload);
  }

  onSeleccionarRequest(datos, contexto, respuesta) {
    const banco = this._leerBanco();
    const resultado = this._seleccionar(banco, datos);
    if (resultado.error) {
      const { payload, publicado } = this._responder(contexto, 'newsletter.banco.seleccionar.response', datos.request_id, 'error', { error: resultado.error });
      if (!publicado && typeof respuesta === 'function') respuesta(payload);
      return;
    }
    this._escribirBanco(resultado.banco);
    const { payload, publicado } = this._responder(contexto, 'newsletter.banco.seleccionar.response', datos.request_id, 'ok', {
      idea: resultado.idea,
      huboCambio: resultado.huboCambio
    });
    if (!publicado && typeof respuesta === 'function') respuesta(payload);
  }

  onProjectActivated(datos, contexto, respuesta) {
    const banco = this._leerBanco();
    if (typeof respuesta === 'function') respuesta({ status: 'ok', data: { total: banco.ideas.length } });
  }
}

module.exports = BancoIdeas;