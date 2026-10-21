const BaseModule = require('../_shared/base-module');

class BancoIdeas extends BaseModule {
  constructor() {
    super();
    this.name = 'banco-ideas';
    this.version = '0.1.0';
    this._ideas = [];
    this._contador = 0;
  }

  _atender(evento, contexto, respuesta, siguiente) {
    switch (evento) {
      case 'banco-ideas.crear.request':
        return this._crearIdea(contexto, respuesta);
      case 'banco-ideas.listar.request':
        return this._listarIdeas(contexto, respuesta);
      case 'banco-ideas.obtener.request':
        return this._obtenerIdea(contexto, respuesta);
      default:
        return siguiente();
    }
  }

  _crearIdea(contexto, respuesta) {
    const { texto, autor } = contexto || {};
    if (!texto || typeof texto !== 'string' || !texto.trim()) {
      return respuesta({ ok: false, error: 'texto_requerido' });
    }
    this._contador += 1;
    const idea = {
      id: String(this._contador),
      texto: texto.trim(),
      autor: (autor && typeof autor === 'string' && autor.trim()) ? autor.trim() : 'anónimo',
      creadaEn: new Date().toISOString()
    };
    this._ideas.push(idea);
    return respuesta({ ok: true, idea });
  }

  _listarIdeas(contexto, respuesta) {
    const { limite } = contexto || {};
    const ideas = typeof limite === 'number' && limite >= 0 ? this._ideas.slice(0, limite) : this._ideas.slice();
    return respuesta({ ok: true, ideas });
  }

  _obtenerIdea(contexto, respuesta) {
    const { id } = contexto || {};
    if (!id) {
      return respuesta({ ok: false, error: 'id_requerido' });
    }
    const idea = this._ideas.find((i) => i.id === String(id));
    if (!idea) {
      return respuesta({ ok: false, error: 'idea_no_encontrada', id: String(id) });
    }
    return respuesta({ ok: true, idea });
  }
}

module.exports = BancoIdeas;
