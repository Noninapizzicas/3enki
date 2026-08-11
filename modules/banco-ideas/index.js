const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');
const PosPersistencia = require('../_shared/pos-persistencia');
const crypto = require('crypto');

class BancoIdeasReflejo extends ModuloHibridoReflejo {
  constructor(config = {}) {
    super(config);
    this.name = 'banco-ideas';
    this.version = '0.1.0';
    this.ideas = new Map();
    this._persistencia = new PosPersistencia({
      modulo: this,
      file: 'banco-ideas.json',
      snapshot: (project_id) => this._snapshot(project_id),
      hidratar: (project_id, data) => this._hidratar(project_id, data)
    });
  }

  _snapshot(project_id) {
    const ideas = [];
    const prefijo = `${project_id}:`;
    for (const [key, idea] of this.ideas.entries()) {
      if (key.startsWith(prefijo)) {
        ideas.push(idea);
      }
    }
    return { ideas };
  }

  _hidratar(project_id, data) {
    if (!data || !Array.isArray(data.ideas)) return;
    for (const idea of data.ideas) {
      if (idea && idea.id) {
        this.ideas.set(`${project_id}:${idea.id}`, idea);
      }
    }
  }

  onUnload() {
    if (this._persistencia) {
      this._persistencia.flush();
      this._persistencia.detener();
    }
    if (typeof super.onUnload === 'function') {
      super.onUnload();
    }
  }

  async onProjectActivated(e) {
    const d = (e && e.data) || e || {};
    if (d.project_id) {
      await this._persistencia.restaurar(d.project_id);
    }
  }

  _registrar(input) {
    const datos = input || {};
    const { project_id, titulo, nicho, valor, probabilidad, esfuerzo, estado, notas } = datos;
    if (!project_id || !titulo || !nicho || valor === undefined || probabilidad === undefined || esfuerzo === undefined) {
      return { status: 400, data: { error: 'faltan_campos_requeridos' } };
    }
    const idea = {
      id: crypto.randomUUID(),
      project_id,
      titulo,
      nicho,
      valor,
      probabilidad,
      esfuerzo,
      estado: estado || 'nueva',
      notas: notas || null,
      creada_en: new Date().toISOString()
    };
    this.ideas.set(`${project_id}:${idea.id}`, idea);
    this._persistencia.marcarDirty(project_id);
    if (this.eventBus && typeof this.eventBus.publish === 'function') {
      this.eventBus.publish('newsletter.banco.idea.registrada', { idea, project_id });
    }
    return { status: 200, data: { idea } };
  }

  _listar(input) {
    const datos = input || {};
    const { project_id, nicho, estado } = datos;
    if (!project_id) {
      return { status: 400, data: { error: 'project_id_requerido' } };
    }
    const ideas = [];
    const prefijo = `${project_id}:`;
    for (const [key, idea] of this.ideas.entries()) {
      if (!key.startsWith(prefijo)) continue;
      if (nicho && idea.nicho !== nicho) continue;
      if (estado && idea.estado !== estado) continue;
      ideas.push(idea);
    }
    ideas.sort((a, b) => (b.creada_en || '').localeCompare(a.creada_en || ''));
    return { status: 200, data: { ideas } };
  }

  _obtener(input) {
    const datos = input || {};
    const { project_id, id } = datos;
    if (!project_id || !id) {
      return { status: 400, data: { error: 'project_id_e_id_requeridos' } };
    }
    const idea = this.ideas.get(`${project_id}:${id}`);
    if (!idea) {
      return { status: 404, data: { error: 'idea_no_encontrada' } };
    }
    return { status: 200, data: { idea } };
  }

  _eliminar(input) {
    const datos = input || {};
    const { project_id, id } = datos;
    if (!project_id || !id) {
      return { status: 400, data: { error: 'project_id_e_id_requeridos' } };
    }
    const key = `${project_id}:${id}`;
    if (!this.ideas.has(key)) {
      return { status: 404, data: { error: 'idea_no_encontrada' } };
    }
    this.ideas.delete(key);
    this._persistencia.marcarDirty(project_id);
    return { status: 200, data: { eliminada: true, id } };
  }

  onRegistrarRequest(e) {
    return this._atender(e, 'registrar', 'newsletter.banco.ideas.registrar.response', (d) => this._registrar(d));
  }

  onListarRequest(e) {
    return this._atender(e, 'listar', 'newsletter.banco.ideas.listar.response', (d) => this._listar(d));
  }

  onObtenerRequest(e) {
    return this._atender(e, 'obtener', 'newsletter.banco.ideas.obtener.response', (d) => this._obtener(d));
  }

  onEliminarRequest(e) {
    return this._atender(e, 'eliminar', 'newsletter.banco.ideas.eliminar.response', (d) => this._eliminar(d));
  }
}

module.exports = BancoIdeasReflejo;
