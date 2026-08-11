'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');

const prioridadHelper = require('../_shared/prioridad');
const calcularPrioridad = (prioridadHelper && (prioridadHelper.calcularPrioridad || prioridadHelper.prioridad)) || function (idea) {
  return Number((idea && (idea.prioridadCalculada || idea.puntaje)) || 0);
};

class BancoIdeas extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'banco-ideas';
    this.version = '0.1.0';
    this.tope = 100;
    this.persistencia = new PosPersistencia('data/newsletter/banco-ideas.json');
    this._cola = Promise.resolve();
  }

  _atender(evento, contexto, respuesta, siguiente) {
    const nombre = this._nombreEvento(evento);
    switch (nombre) {
      case 'newsletter.idea.registrar.request':
        return this.onRegistrarRequest(evento, contexto, respuesta, siguiente);
      case 'newsletter.idea.aparcar.request':
        return this.onAparcarRequest(evento, contexto, respuesta, siguiente);
      case 'newsletter.banco.listar.request':
        return this.onListarRequest(evento, contexto, respuesta, siguiente);
      case 'newsletter.banco.seleccionar.request':
        return this.onSeleccionarRequest(evento, contexto, respuesta, siguiente);
      case 'project.activated':
        return this.onProjectActivated(evento, contexto, respuesta, siguiente);
      default:
        return typeof siguiente === 'function' ? siguiente() : undefined;
    }
  }

  _nombreEvento(evento) {
    if (typeof evento === 'string') return evento;
    if (!evento) return '';
    return evento.name || evento.event || evento.tipo || '';
  }

  _datos(evento) {
    const base = (evento && typeof evento === 'object' && !Array.isArray(evento)) ? evento : {};
    return Object.assign({}, base, base.data || {});
  }

  _generarId() {
    return 'idea_' + Date.now().toString(36) + '_' + Math.random().toString(36).slice(2, 8);
  }

  _calcularPrioridad(idea) {
    const candidata = Object.assign({}, idea || {});
    if (!candidata.titulo && candidata.nombre) candidata.titulo = candidata.nombre;
    if (!candidata.descripcion && candidata.contenido) candidata.descripcion = candidata.contenido;
    try {
      const resultado = calcularPrioridad(candidata);
      if (typeof resultado === 'number') return resultado;
      if (resultado && typeof resultado === 'object') {
        if (typeof resultado.prioridad === 'number') return resultado.prioridad;
        if (typeof resultado.prioridadCalculada === 'number') return resultado.prioridadCalculada;
        if (typeof resultado.puntaje === 'number') return resultado.puntaje;
      }
    } catch (_e) {
      // fallback
    }
    const previo = Number((idea && (idea.prioridadCalculada || idea.puntaje)) || 0);
    return Number.isFinite(previo) ? previo : 0;
  }

  _crearIdea(input) {
    const id = input.id || input.idea_id || this._generarId();
    const idea = {
      id: id,
      titulo: input.titulo || input.nombre || '',
      descripcion: input.descripcion || input.contenido || '',
      estado: 'Cruda',
      prioridadCalculada: this._calcularPrioridad(input),
      creadaEn: input.creadaEn || new Date().toISOString(),
      actualizadaEn: null,
      decision: null,
      fechaSeleccion: null,
      pendienteDeEvidencia: false
    };
    if (input.tags) idea.tags = input.tags;
    if (input.fuente) idea.fuente = input.fuente;
    return idea;
  }

  _cargar() {
    const persistencia = this.persistencia;
    if (!persistencia || typeof persistencia.leer !== 'function') {
      return Promise.resolve({ ideas: [] });
    }
    return Promise.resolve(persistencia.leer())
      .catch(() => ({ ideas: [] }))
      .then((contenido) => {
        if (contenido && Array.isArray(contenido.ideas)) return contenido;
        if (Array.isArray(contenido)) return { ideas: contenido };
        return { ideas: [] };
      });
  }

  _guardar(banco) {
    const persistencia = this.persistencia;
    if (!persistencia) return Promise.resolve();
    const metodo = persistencia.escribir || persistencia.guardar;
    if (typeof metodo !== 'function') return Promise.resolve();
    if (metodo.length >= 2) {
      return Promise.resolve(metodo.call(persistencia, 'data/newsletter/banco-ideas.json', banco));
    }
    return Promise.resolve(metodo.call(persistencia, banco));
  }

  _mutar(contexto, fn) {
    const tarea = this._cola.then(async () => {
      const banco = await this._cargar(contexto);
      const resultado = await fn(banco);
      await this._guardar(banco);
      return resultado;
    });
    this._cola = tarea.then(() => undefined, () => undefined);
    return tarea;
  }

  _descartarMenorPrioridad(ideas) {
    const conPrioridad = ideas.map((idea) => ({ idea: idea, prioridad: this._calcularPrioridad(idea) }));
    conPrioridad.sort((a, b) => {
      if (a.prioridad !== b.prioridad) return a.prioridad - b.prioridad;
      const fa = new Date(a.idea.creadaEn || 0).getTime();
      const fb = new Date(b.idea.creadaEn || 0).getTime();
      return fa - fb;
    });
    const menor = conPrioridad[0].idea;
    const indice = ideas.findIndex((i) => i.id === menor.id);
    if (indice !== -1) ideas.splice(indice, 1);
    return menor;
  }

  _registrar(banco, input) {
    banco.ideas = Array.isArray(banco.ideas) ? banco.ideas : [];
    const idea = this._crearIdea(input);
    const existente = banco.ideas.find((i) => i.id === idea.id);
    if (existente) {
      return { idea: existente, descartada: null, yaExistia: true };
    }
    banco.ideas.push(idea);
    let descartada = null;
    if (banco.ideas.length > this.tope) {
      descartada = this._descartarMenorPrioridad(banco.ideas);
    }
    return { idea: idea, descartada: descartada, yaExistia: false };
  }

  _aparcar(banco, id) {
    const idea = (banco.ideas || []).find((i) => i.id === id);
    if (!idea) return { ok: false, motivo: 'no_encontrada' };
    if (idea.estado === 'Aparcada' || idea.estado === 'PendienteDeEvidencia' || idea.pendienteDeEvidencia === true) {
      return { ok: true, idea: idea, yaAparcada: true };
    }
    idea.estado = 'Aparcada';
    idea.decision = 10;
    idea.pendienteDeEvidencia = true;
    idea.aparcadaEn = new Date().toISOString();
    idea.actualizadaEn = idea.aparcadaEn;
    return { ok: true, idea: idea, yaAparcada: false };
  }

  _seleccionar(banco, id) {
    const idea = (banco.ideas || []).find((i) => i.id === id);
    if (!idea) return { ok: false, motivo: 'no_encontrada' };
    if (idea.estado === 'Seleccionada') {
      return { ok: true, idea: idea, yaSeleccionada: true };
    }
    idea.estado = 'Seleccionada';
    idea.decision = 1;
    idea.fechaSeleccion = new Date().toISOString();
    idea.actualizadaEn = idea.fechaSeleccion;
    idea.pendienteDeEvidencia = false;
    return { ok: true, idea: idea, yaSeleccionada: false };
  }

  _estaAparcada(idea) {
    return idea.estado === 'Aparcada' || idea.estado === 'PendienteDeEvidencia' || idea.pendienteDeEvidencia === true;
  }

  _listar(banco, estado) {
    const ideas = Array.isArray(banco.ideas) ? banco.ideas.slice() : [];
    if (!estado || estado === 'todas' || estado === 'todos') return ideas;
    const e = String(estado).toLowerCase();
    if (e === 'enbanco') return ideas.filter((i) => !this._estaAparcada(i));
    if (e === 'aparcada' || e === 'pendientedeevidencia' || e === 'pendiente_de_evidencia' || e === 'pendiente de evidencia') {
      return ideas.filter((i) => this._estaAparcada(i));
    }
    return ideas.filter((i) => String(i.estado || '').toLowerCase() === e);
  }

  async _emitir(respuesta, evento, payload) {
    if (respuesta && typeof respuesta.publicar === 'function') {
      return respuesta.publicar(evento, payload);
    }
    if (typeof this.publicar === 'function') return this.publicar(evento, payload);
    if (typeof this.emitir === 'function') return this.emitir(evento, payload);
    return undefined;
  }

  async onRegistrarRequest(evento, contexto, respuesta) {
    const datos = this._datos(evento);
    const requestId = datos.request_id;
    try {
      const resultado = await this._mutar(contexto, (banco) => this._registrar(banco, datos));
      if (resultado.descartada) {
        await this._emitir(respuesta, 'newsletter.banco.tope_alcanzado', {
          request_id: requestId,
          descartada: resultado.descartada,
          tope: this.tope
        });
      }
      await this._emitir(respuesta, 'newsletter.idea.registrada', {
        request_id: requestId,
        idea: resultado.idea,
        descartada: resultado.descartada
      });
      await this._emitir(respuesta, 'newsletter.idea.registrar.response', {
        request_id: requestId,
        status: 'ok',
        data: { idea: resultado.idea, descartada: resultado.descartada, yaExistia: resultado.yaExistia }
      });
    } catch (error) {
      await this._emitir(respuesta, 'newsletter.idea.registrar.response', {
        request_id: requestId,
        status: 'error',
        data: { mensaje: error.message }
      });
    }
  }

  async onAparcarRequest(evento, contexto, respuesta) {
    const datos = this._datos(evento);
    const requestId = datos.request_id;
    const id = datos.id || datos.idea_id;
    try {
      const resultado = await this._mutar(contexto, (banco) => this._aparcar(banco, id));
      if (!resultado.ok) {
        await this._emitir(respuesta, 'newsletter.idea.aparcar.response', {
          request_id: requestId,
          status: 'error',
          data: { motivo: resultado.motivo }
        });
        return;
      }
      await this._emitir(respuesta, 'newsletter.idea.aparcada', {
        request_id: requestId,
        idea: resultado.idea,
        yaAparcada: resultado.yaAparcada
      });
      await this._emitir(respuesta, 'newsletter.idea.aparcar.response', {
        request_id: requestId,
        status: 'ok',
        data: { idea: resultado.idea, yaAparcada: resultado.yaAparcada }
      });
    } catch (error) {
      await this._emitir(respuesta, 'newsletter.idea.aparcar.response', {
        request_id: requestId,
        status: 'error',
        data: { mensaje: error.message }
      });
    }
  }

  async onListarRequest(evento, contexto, respuesta) {
    const datos = this._datos(evento);
    const requestId = datos.request_id;
    try {
      const banco = await this._cargar(contexto);
      const ideas = this._listar(banco, datos.estado);
      await this._emitir(respuesta, 'newsletter.banco.listar.response', {
        request_id: requestId,
        status: 'ok',
        data: { estado: datos.estado || 'todas', total: ideas.length, ideas: ideas }
      });
    } catch (error) {
      await this._emitir(respuesta, 'newsletter.banco.listar.response', {
        request_id: requestId,
        status: 'error',
        data: { mensaje: error.message }
      });
    }
  }

  async onSeleccionarRequest(evento, contexto, respuesta) {
    const datos = this._datos(evento);
    const requestId = datos.request_id;
    const id = datos.id || datos.idea_id;
    try {
      const resultado = await this._mutar(contexto, (banco) => this._seleccionar(banco, id));
      if (!resultado.ok) {
        await this._emitir(respuesta, 'newsletter.banco.seleccionar.response', {
          request_id: requestId,
          status: 'error',
          data: { motivo: resultado.motivo }
        });
        return;
      }
      await this._emitir(respuesta, 'newsletter.banco.seleccionar.response', {
        request_id: requestId,
        status: 'ok',
        data: { idea: resultado.idea, yaSeleccionada: resultado.yaSeleccionada }
      });
    } catch (error) {
      await this._emitir(respuesta, 'newsletter.banco.seleccionar.response', {
        request_id: requestId,
        status: 'error',
        data: { mensaje: error.message }
      });
    }
  }

  async onProjectActivated(evento, contexto) {
    try {
      const banco = await this._cargar(contexto);
      if (!Array.isArray(banco.ideas)) banco.ideas = [];
      await this._guardar(banco);
    } catch (_error) {
      // Si no se puede restaurar, el próximo comando reintentará la carga.
    }
  }
}

module.exports = BancoIdeas;
