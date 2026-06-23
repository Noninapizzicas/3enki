/**
 * cupulas — REFLEJO JS (determinista). Un Obsidian INVERTIDO: la prosa es
 * mínima, el cuerpo de cada nota es pseudocódigo/OOP. La bóveda se organiza en
 * CÚPULAS TEMÁTICAS por TIPO DE PRIMITIVA del sistema (skill · agente · handler ·
 * blueprint · clase · …) — el eje es ABIERTO, no rígido. El lenguaje (oop/js/…)
 * es metadato OPCIONAL de la nota.
 *
 * Almacén = ficheros navegables (.md/.json) bajo storage/cupulas/<cupula>/<nota>.<ext>
 * + un _index.json que mantiene catálogo y ENLACES (wikilinks → grafo). Así un
 * humano lo abre en Obsidian y el reflejo resuelve el grafo de una sola lectura.
 *
 * El LLM REUTILIZA: cupulas.contexto trae el cuerpo (código) listo para reusar;
 * cupulas.buscar/grafo lo navegan; cupulas.crear_cupula/add_nota lo autoran.
 *
 * Extiende ModuloHibridoReflejo: aquí solo van los handlers de una línea + las
 * proyecciones deterministas. La fontanería del bus la pone la base.
 */

'use strict';

const ModuloHibridoReflejo = require('../_shared/modulo-hibrido-reflejo');

const VAULT = '/cupulas';
const INDICE = '/cupulas/_index.json';
const TIPOS_CONOCIDOS = ['skill', 'agente', 'handler', 'blueprint', 'clase'];
const FENCE = { js: 'javascript', javascript: 'javascript', python: 'python', py: 'python', rust: 'rust', go: 'go' };
const MAX_PROSA = 200;

class CupulasReflejo extends ModuloHibridoReflejo {
  constructor() {
    super();
    this.name = 'cupulas';
    this.version = '1.0.0';
  }

  // ── handlers UI/tools (devuelven {status, data}) ──
  handleCrearCupula(d) { return this._crearCupula(d); }
  handleAddNota(d) { return this._addNota(d); }
  handleGetNota(d) { return this._getNota(d); }
  handleListarCupulas(d) { return this._listarCupulas(d); }
  handleListarNotas(d) { return this._listarNotas(d); }
  handleBuscar(d) { return this._buscar(d); }
  handleGrafo(d) { return this._grafo(d); }
  handleContexto(d) { return this._contexto(d); }

  // ── handlers bus RPC (request/response correlada por la base) ──
  onCrearCupulaRequest(e) { return this._atender(e, 'crear_cupula', 'cupulas.crear_cupula.response', d => this._crearCupula(d)); }
  onAddNotaRequest(e) { return this._atender(e, 'add_nota', 'cupulas.add_nota.response', d => this._addNota(d)); }
  onGetNotaRequest(e) { return this._atender(e, 'get_nota', 'cupulas.get_nota.response', d => this._getNota(d)); }
  onListarCupulasRequest(e) { return this._atender(e, 'listar_cupulas', 'cupulas.listar_cupulas.response', d => this._listarCupulas(d)); }
  onListarNotasRequest(e) { return this._atender(e, 'listar_notas', 'cupulas.listar_notas.response', d => this._listarNotas(d)); }
  onBuscarRequest(e) { return this._atender(e, 'buscar', 'cupulas.buscar.response', d => this._buscar(d)); }
  onGrafoRequest(e) { return this._atender(e, 'grafo', 'cupulas.grafo.response', d => this._grafo(d)); }
  onContextoRequest(e) { return this._atender(e, 'contexto', 'cupulas.contexto.response', d => this._contexto(d)); }

  // =============================================================
  // Store de la bóveda — ficheros + un índice (vía el reflejo fs)
  // =============================================================
  async _leerIndice(pid) {
    const i = await this._leerJson(pid, INDICE);
    return i && i.cupulas ? i : { _version: 1, cupulas: {}, notas: {} };
  }

  async _guardarIndice(pid, idx) {
    idx._updated = new Date().toISOString();
    return this._escribirJson(pid, INDICE, idx);
  }

  async _escribirJson(pid, path, obj) {
    return this._rpc('fs.write.request', { project_id: pid, path, content: JSON.stringify(obj, null, 2), encoding: 'utf-8' });
  }

  async _escribirTexto(pid, path, txt) {
    return this._rpc('fs.write.request', { project_id: pid, path, content: txt, encoding: 'utf-8' });
  }

  async _leerTexto(pid, path) {
    const r = await this._rpc('fs.read.request', { project_id: pid, path, encoding: 'utf-8' });
    return r && r.status !== 404 && typeof r.content === 'string' ? r.content : null;
  }

  _slug(s) {
    return String(s || '').toLowerCase().trim()
      .normalize('NFD').replace(/[̀-ͯ]/g, '')
      .replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '');
  }

  _prosa(s) {
    return String(s || '').replace(/\s+/g, ' ').trim().slice(0, MAX_PROSA);
  }

  // Cuerpo de la nota en disco: frontmatter + 1 línea + el código. Prosa mínima.
  _renderMd(meta, contenido) {
    const fence = FENCE[(meta.lenguaje || '').toLowerCase()] || '';
    const fm = [
      '---',
      `id: ${meta.id}`,
      `cupula: ${meta.cupula}`,
      `tipo: ${meta.tipo}`,
      ...(meta.lenguaje ? [`lenguaje: ${meta.lenguaje}`] : []),
      `enlaces: [${(meta.enlaces || []).join(', ')}]`,
      '---'
    ].join('\n');
    const cab = `# ${meta.titulo}` + (meta.resumen ? `\n> ${meta.resumen}` : '');
    return `${fm}\n${cab}\n\n\`\`\`${fence}\n${contenido}\n\`\`\`\n`;
  }

  // =============================================================
  // Proyecciones deterministas
  // =============================================================
  async _crearCupula(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.tema) return this._invalid('tema');
    if (!input.tipo) return this._invalid('tipo'); // abierto: no enum, solo presencia

    const id = this._slug(input.tema);
    if (!id) return this._invalid('tema');

    const idx = await this._leerIndice(input.project_id);
    if (idx.cupulas[id]) {
      return this._errorResponse(409, 'CONFLICT_STATE', `cupula '${id}' ya existe`, { entity_type: 'cupula', entity_id: id });
    }

    idx.cupulas[id] = {
      id,
      tema: String(input.tema).trim(),
      tipo: String(input.tipo).trim(),
      descripcion: this._prosa(input.descripcion),
      notas: [],
      created_at: new Date().toISOString()
    };
    await this._guardarIndice(input.project_id, idx);
    await this._publicarEvento('cupulas.cupula_creada', { project_id: input.project_id, cupula_id: id, tipo: idx.cupulas[id].tipo }, input);

    return { status: 201, data: { cupula_id: id, tema: idx.cupulas[id].tema, tipo: idx.cupulas[id].tipo } };
  }

  async _addNota(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.cupula) return this._invalid('cupula');
    if (!input.titulo) return this._invalid('titulo');
    if (!input.contenido) return this._invalid('contenido');

    const idx = await this._leerIndice(input.project_id);
    const cupula = idx.cupulas[input.cupula];
    if (!cupula) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `cupula '${input.cupula}' no existe`, { entity_type: 'cupula', entity_id: input.cupula });
    }

    const id = this._slug(input.id || input.titulo);
    if (!id) return this._invalid('titulo');

    const formato = input.formato === 'json' ? 'json' : 'md';
    const enlaces = Array.isArray(input.enlaces) ? input.enlaces.map(x => this._slug(x)).filter(Boolean) : [];
    const meta = {
      id,
      cupula: input.cupula,
      titulo: String(input.titulo).trim(),
      tipo: String(input.tipo || cupula.tipo).trim(),
      lenguaje: input.lenguaje ? String(input.lenguaje).trim() : null,
      resumen: this._prosa(input.resumen),
      enlaces,
      formato,
      path: `${VAULT}/${input.cupula}/${id}.${formato}`,
      updated_at: new Date().toISOString()
    };

    const fichero = formato === 'json'
      ? JSON.stringify({ id, cupula: meta.cupula, tipo: meta.tipo, lenguaje: meta.lenguaje, resumen: meta.resumen, enlaces, contenido: input.contenido }, null, 2)
      : this._renderMd(meta, input.contenido);

    const w = await this._escribirTexto(input.project_id, meta.path, fichero);
    if (w && w.status && w.status >= 400) {
      return this._errorResponse(502, 'UPSTREAM_INVALID_RESPONSE', 'fs no pudo escribir la nota', { path: meta.path });
    }

    idx.notas[id] = meta;
    if (!cupula.notas.includes(id)) cupula.notas.push(id);
    await this._guardarIndice(input.project_id, idx);
    await this._publicarEvento('cupulas.nota_creada', { project_id: input.project_id, cupula: meta.cupula, nota_id: id, tipo: meta.tipo }, input);

    return { status: 201, data: { nota_id: id, cupula: meta.cupula, path: meta.path } };
  }

  async _getNota(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.nota_id) return this._invalid('nota_id');
    const idx = await this._leerIndice(input.project_id);
    const meta = idx.notas[this._slug(input.nota_id)] || idx.notas[input.nota_id];
    if (!meta) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', 'nota no encontrada', { entity_type: 'nota', entity_id: input.nota_id });
    }
    const contenido = await this._leerTexto(input.project_id, meta.path);
    return { status: 200, data: { ...meta, contenido } };
  }

  async _listarCupulas(input) {
    if (!input.project_id) return this._invalid('project_id');
    const idx = await this._leerIndice(input.project_id);
    let arr = Object.values(idx.cupulas);
    if (input.tipo) arr = arr.filter(c => c.tipo === input.tipo);
    return {
      status: 200,
      data: {
        total: arr.length,
        cupulas: arr.map(c => ({ id: c.id, tema: c.tema, tipo: c.tipo, descripcion: c.descripcion, notas_count: c.notas.length }))
      }
    };
  }

  async _listarNotas(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.cupula) return this._invalid('cupula');
    const idx = await this._leerIndice(input.project_id);
    const cupula = idx.cupulas[input.cupula];
    if (!cupula) {
      return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `cupula '${input.cupula}' no existe`, { entity_type: 'cupula', entity_id: input.cupula });
    }
    const notas = cupula.notas.map(id => idx.notas[id]).filter(Boolean)
      .map(({ id, titulo, tipo, lenguaje, resumen, enlaces }) => ({ id, titulo, tipo, lenguaje, resumen, enlaces }));
    return { status: 200, data: { cupula: cupula.id, tipo: cupula.tipo, total: notas.length, notas } };
  }

  async _buscar(input) {
    if (!input.project_id) return this._invalid('project_id');
    if (!input.q) return this._invalid('q');
    const idx = await this._leerIndice(input.project_id);
    const q = String(input.q).toLowerCase();
    const hit = (...xs) => xs.some(x => String(x || '').toLowerCase().includes(q));

    const notas = Object.values(idx.notas)
      .filter(n => hit(n.id, n.titulo, n.resumen, n.tipo, n.lenguaje, n.cupula))
      .map(({ id, titulo, tipo, lenguaje, resumen, cupula }) => ({ id, titulo, tipo, lenguaje, resumen, cupula }));
    const cupulas = Object.values(idx.cupulas)
      .filter(c => hit(c.id, c.tema, c.tipo, c.descripcion))
      .map(({ id, tema, tipo, descripcion }) => ({ id, tema, tipo, descripcion }));

    return { status: 200, data: { total: notas.length + cupulas.length, notas, cupulas } };
  }

  async _grafo(input) {
    if (!input.project_id) return this._invalid('project_id');
    const idx = await this._leerIndice(input.project_id);
    let notas = Object.values(idx.notas);
    if (input.cupula) notas = notas.filter(n => n.cupula === input.cupula);

    const presentes = new Set(notas.map(n => n.id));
    const nodes = notas.map(n => ({ id: n.id, tipo: n.tipo, lenguaje: n.lenguaje, cupula: n.cupula, titulo: n.titulo }));
    const edges = [];
    for (const n of notas) {
      for (const dst of (n.enlaces || [])) {
        if (idx.notas[dst] && (!input.cupula || presentes.has(dst))) edges.push({ from: n.id, to: dst });
      }
    }
    return { status: 200, data: { nodes, edges, total_nodes: nodes.length, total_edges: edges.length } };
  }

  // La superficie de REUTILIZACIÓN: el LLM tira de aquí y recibe el código listo.
  async _contexto(input) {
    if (!input.project_id) return this._invalid('project_id');
    const idx = await this._leerIndice(input.project_id);

    let ids = [];
    if (Array.isArray(input.ids) && input.ids.length) {
      ids = input.ids.map(x => this._slug(x));
    } else if (input.cupula) {
      const c = idx.cupulas[input.cupula];
      if (!c) return this._errorResponse(404, 'RESOURCE_NOT_FOUND', `cupula '${input.cupula}' no existe`, { entity_type: 'cupula', entity_id: input.cupula });
      ids = [...c.notas];
    } else if (input.q) {
      const q = String(input.q).toLowerCase();
      ids = Object.values(idx.notas)
        .filter(n => [n.id, n.titulo, n.resumen, n.tipo, n.lenguaje].some(x => String(x || '').toLowerCase().includes(q)))
        .map(n => n.id);
    } else {
      return this._errorResponse(400, 'INVALID_INPUT', 'indica cupula, ids o q', { field: 'selector' });
    }

    const limite = (typeof input.limite === 'number' && input.limite > 0) ? input.limite : 8;
    ids = ids.filter(id => idx.notas[id]).slice(0, limite);

    const notas = [];
    for (const id of ids) {
      const meta = idx.notas[id];
      const contenido = await this._leerTexto(input.project_id, meta.path);
      notas.push({ id, cupula: meta.cupula, tipo: meta.tipo, lenguaje: meta.lenguaje, titulo: meta.titulo, contenido });
    }
    const material = notas
      .map(n => `### ${n.cupula}/${n.id} · ${n.tipo}${n.lenguaje ? ' · ' + n.lenguaje : ''}\n${n.contenido || ''}`)
      .join('\n\n---\n\n');

    return { status: 200, data: { total: notas.length, notas, material } };
  }
}

module.exports = CupulasReflejo;
