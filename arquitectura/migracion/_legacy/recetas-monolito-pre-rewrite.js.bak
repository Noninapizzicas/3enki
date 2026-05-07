/**
 * modules/recetas — almacenamiento JSON por proyecto
 *
 * Una sola fuente de verdad por proyecto: data/projects/{slug}/recetas.json
 *
 * Estructura del archivo:
 * {
 *   "_version": "1.0",
 *   "_updated_at": "iso",
 *   "recetas":              [ Receta, ... ],
 *   "ingredientes_catalogo":[ Ingrediente, ... ]
 * }
 *
 * Cero SQL. Cero schema. Cero junction tables. Si añades un campo, las recetas viejas
 * no lo tienen y las nuevas sí — sin migrar nada.
 *
 * Acceso al archivo via eventos fs.read.request / fs.write.request al módulo
 * filesystem. Path absoluto con prefijo @/projects/{slug}/recetas.json para no
 * depender del proyecto activo de filesystem (multi-tenancy seguro).
 *
 * Concurrencia: cola interna por project_id — solo una operación write a la vez.
 */

const crypto = require('crypto');

// ============================================================
// Tools que el LLM puede invocar
// ============================================================
const TOOL_HANDLERS = {
  'recetas.crear':            'crear',
  'recetas.listar':           'listar',
  'recetas.obtener':          'obtener',
  'recetas.buscar':           'buscar',
  'recetas.actualizar':       'actualizar',
  'recetas.historial':        'historial',
  'recetas.revertir':         'revertir',
  'recetas.eliminar':         'eliminar',
  'recetas.estadisticas':     'estadisticas',
  'recetas.ingredientes':     'ingredientes',
  'recetas.actualizar_precio':'actualizarPrecio',
  'recetas.analizar':         'analizar',
  'recetas.investigar_receta':'investigarReceta'
};

// Campos sin los cuales una receta se considera incompleta
const CAMPOS_REQUERIDOS_PARA_COMPLETA = ['ingredientes', 'porciones', 'instrucciones'];

// ============================================================

class RecetasModule {
  constructor() {
    this.name = 'recetas';
    this.version = '2.0.0';
    this.logger = null;
    this.eventBus = null;

    // project_id → slug (cache)
    this.projectSlugs = new Map();

    // project_id → Promise (cola para serializar writes)
    this.writeQueues = new Map();

    // request_id → { resolve, reject, timer } para fs.* y project.*
    this.pendingFs = new Map();
    this.pendingProject = new Map();
  }

  async onLoad(context) {
    this.logger = context.logger;
    this.eventBus = context.eventBus;
    this.logger.info('recetas.loaded', { storage: 'json-per-project' });
  }

  async onUnload() {
    for (const { timer } of this.pendingFs.values()) clearTimeout(timer);
    for (const { timer } of this.pendingProject.values()) clearTimeout(timer);
    this.pendingFs.clear();
    this.pendingProject.clear();
  }

  // ============================================================
  // Eventos del proyecto — cacheamos slug
  // ============================================================

  onProjectActivated(event) {
    const data = event.data || event;
    const id = data.project_id || data.id;
    const project = data.project || null;
    if (id && project?.slug) this.projectSlugs.set(id, project.slug);
  }

  onProjectDeactivated() { /* no-op por ahora; mantenemos cache */ }

  // ============================================================
  // Resolver project_id → slug (si no está en cache, lo pedimos)
  // ============================================================

  async _slugForProject(project_id) {
    if (!project_id) throw new Error('project_id requerido');
    if (this.projectSlugs.has(project_id)) return this.projectSlugs.get(project_id);

    const request_id = crypto.randomUUID();
    const slug = await new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingProject.delete(request_id);
        reject(new Error(`project.get timeout para ${project_id}`));
      }, 5000);
      this.pendingProject.set(request_id, { resolve, reject, timer });
      this.eventBus.publish('project.get.request', { request_id, project_id });
    });
    this.projectSlugs.set(project_id, slug);
    return slug;
  }

  onProjectGetResponse(event) {
    const { request_id, project, error } = event.data || event;
    const p = this.pendingProject.get(request_id);
    if (!p) return;
    clearTimeout(p.timer); this.pendingProject.delete(request_id);
    if (error || !project) return p.reject(new Error(error || 'Project not found'));
    p.resolve(project.slug);
  }

  // ============================================================
  // Filesystem — leer/escribir archivo JSON del proyecto
  // ============================================================

  _pathFor(slug) {
    return `@/projects/${slug}/recetas.json`;
  }

  async _readFile(slug) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        reject(new Error(`fs.read timeout: ${slug}`));
      }, 8000);
      this.pendingFs.set(request_id, { resolve, reject, timer, op: 'read' });
      this.eventBus.publish('fs.read.request', { request_id, path: this._pathFor(slug) });
    });
  }

  async _writeFile(slug, content) {
    const request_id = crypto.randomUUID();
    return new Promise((resolve, reject) => {
      const timer = setTimeout(() => {
        this.pendingFs.delete(request_id);
        reject(new Error(`fs.write timeout: ${slug}`));
      }, 8000);
      this.pendingFs.set(request_id, { resolve, reject, timer, op: 'write' });
      this.eventBus.publish('fs.write.request', {
        request_id, path: this._pathFor(slug), content, encoding: 'utf-8'
      });
    });
  }

  onFsReadResponse(event) {
    const { request_id, content, status, error } = event.data || event;
    const p = this.pendingFs.get(request_id);
    if (!p) return;
    clearTimeout(p.timer); this.pendingFs.delete(request_id);
    if (status === 404) return p.resolve(null); // archivo no existe todavía
    if (error || status >= 400) return p.reject(new Error(error || `fs.read status ${status}`));
    p.resolve(content);
  }

  onFsWriteResponse(event) {
    const { request_id, error, status } = event.data || event;
    const p = this.pendingFs.get(request_id);
    if (!p) return;
    clearTimeout(p.timer); this.pendingFs.delete(request_id);
    if (error || status >= 400) return p.reject(new Error(error || `fs.write status ${status}`));
    p.resolve(true);
  }

  // ============================================================
  // Carga / guardado del store — con cola por proyecto
  // ============================================================

  _emptyStore() {
    return {
      _version: '1.0',
      _updated_at: new Date().toISOString(),
      recetas: [],
      ingredientes_catalogo: []
    };
  }

  async _loadStore(slug) {
    const raw = await this._readFile(slug);
    if (raw == null) return this._emptyStore();
    try {
      const parsed = JSON.parse(raw);
      // Garantizar arrays presentes (forwards compatible)
      parsed.recetas = Array.isArray(parsed.recetas) ? parsed.recetas : [];
      parsed.ingredientes_catalogo = Array.isArray(parsed.ingredientes_catalogo) ? parsed.ingredientes_catalogo : [];
      return parsed;
    } catch (err) {
      this.logger.error('recetas.store.parse.failed', { slug, error: err.message });
      throw new Error('recetas.json corrupto: ' + err.message);
    }
  }

  async _saveStore(slug, store) {
    store._updated_at = new Date().toISOString();
    await this._writeFile(slug, JSON.stringify(store, null, 2));
  }

  /**
   * Encola una operación que lee + modifica + escribe atómicamente para un proyecto.
   * Garantiza que dos tool calls concurrentes sobre el mismo proyecto no se pisen.
   */
  async _withStore(project_id, mutator) {
    const slug = await this._slugForProject(project_id);
    const prev = this.writeQueues.get(project_id) || Promise.resolve();
    const next = prev
      .catch(() => {}) // no propagar error de operación previa al siguiente
      .then(async () => {
        const store = await this._loadStore(slug);
        const result = await mutator(store);
        await this._saveStore(slug, store);
        return result;
      });
    this.writeQueues.set(project_id, next);
    try { return await next; }
    finally {
      // Si esta era la última, limpiar la entrada
      if (this.writeQueues.get(project_id) === next) this.writeQueues.delete(project_id);
    }
  }

  /** Solo lectura: no necesita cola. */
  async _readOnly(project_id, reader) {
    const slug = await this._slugForProject(project_id);
    const store = await this._loadStore(slug);
    return reader(store);
  }

  // ============================================================
  // Helpers de dominio
  // ============================================================

  _calcIncompleta(receta) {
    const pendientes = [];
    for (const campo of CAMPOS_REQUERIDOS_PARA_COMPLETA) {
      const v = receta[campo];
      const vacio = v == null || (Array.isArray(v) && v.length === 0) || v === '';
      if (vacio) pendientes.push(campo);
    }
    receta.incompleta = pendientes.length > 0;
    receta.campos_pendientes = pendientes;
    return receta;
  }

  _normalizeIngredientes(ingredientes) {
    if (ingredientes == null) return [];
    if (typeof ingredientes === 'string') {
      // Texto libre del usuario: lo metemos como un solo item con notas
      return [{ nombre: ingredientes.trim(), cantidad: null, unidad: null, notas: 'texto libre' }];
    }
    if (!Array.isArray(ingredientes)) return [];
    return ingredientes.map(it => {
      if (typeof it === 'string') return { nombre: it.trim(), cantidad: null, unidad: null };
      if (typeof it !== 'object' || it == null) return { nombre: String(it), cantidad: null, unidad: null };
      return {
        nombre: (it.nombre ?? it.name ?? it.ingrediente ?? '').toString().trim(),
        cantidad: it.cantidad ?? it.quantity ?? null,
        unidad:   it.unidad   ?? it.unit     ?? null,
        notas:    it.notas    ?? it.notes    ?? undefined
      };
    }).filter(i => i.nombre);
  }

  _normalizeInstrucciones(input) {
    if (input == null) return [];
    if (typeof input === 'string') return input.split(/\n+|\.\s+/).map(s => s.trim()).filter(Boolean);
    if (!Array.isArray(input)) return [];
    return input.map(s => String(s).trim()).filter(Boolean);
  }

  _formatIngredientesText(arr) {
    if (!arr || !arr.length) return null;
    return arr.map(i => {
      const head = [i.cantidad, i.unidad].filter(v => v != null && v !== '').join(' ').trim();
      const body = head && i.nombre ? `${head} de ${i.nombre}` : (i.nombre || head || '');
      const suffix = i.notas ? ` (${i.notas})` : '';
      return body ? `- ${body}${suffix}` : null;
    }).filter(Boolean).join('\n');
  }

  _findRecetaByRefBuilder(store) {
    return (ref) => {
      if (!ref) return null;
      // Por id exacto
      let r = store.recetas.find(x => x.id === ref);
      if (r) return r;
      // Por nombre (case-insensitive, primer match en estado activa)
      const refLower = String(ref).toLowerCase().trim();
      r = store.recetas.find(x => x.nombre.toLowerCase() === refLower && x.estado === 'activa');
      if (r) return r;
      // Por nombre parcial
      r = store.recetas.find(x => x.nombre.toLowerCase().includes(refLower) && x.estado === 'activa');
      return r || null;
    };
  }

  // ============================================================
  // Tools — implementaciones limpias sobre el store JSON
  // ============================================================

  async crear(params) {
    const { proyecto_id, nombre } = params;
    if (!proyecto_id) return { error: 'proyecto_id requerido' };
    if (!nombre || !nombre.trim()) return { error: 'nombre requerido' };

    const ingredientes = this._normalizeIngredientes(params.ingredientes);
    const instrucciones = this._normalizeInstrucciones(params.instrucciones);

    return this._withStore(proyecto_id, (store) => {
      // No duplicar nombres dentro del mismo proyecto entre activas
      const dup = store.recetas.find(r => r.nombre.toLowerCase() === nombre.toLowerCase().trim() && r.estado === 'activa');
      if (dup) {
        return {
          error: 'Ya existe una receta activa con ese nombre',
          existing_id: dup.id
        };
      }

      const id = crypto.randomUUID();
      const now = Date.now();
      const receta = {
        id,
        nombre: nombre.trim(),
        descripcion: params.descripcion || null,
        ingredientes,
        instrucciones,
        porciones: params.porciones ?? null,
        tiempo_min: params.tiempo_min ?? params.tiempo_preparacion ?? null,
        dificultad: params.dificultad ?? null,
        categorias: Array.isArray(params.categorias) ? params.categorias : [],
        etiquetas: Array.isArray(params.etiquetas) ? params.etiquetas : [],
        estado: 'activa',
        fuente: params.fuente || 'manual',
        notas: params.notas || null,
        created_at: now,
        updated_at: now,
        version: 1,
        history: []
      };
      this._calcIncompleta(receta);
      store.recetas.push(receta);

      this.eventBus.publish('receta.creada', { proyecto_id, id, nombre: receta.nombre, timestamp: now });

      return {
        id,
        nombre: receta.nombre,
        status: 'creada',
        incompleta: receta.incompleta,
        campos_pendientes: receta.campos_pendientes,
        ingredientes_formateados: this._formatIngredientesText(ingredientes),
        version: 1
      };
    });
  }

  async listar(params) {
    const { proyecto_id } = params;
    return this._readOnly(proyecto_id, (store) => {
      let r = store.recetas;
      if (params.estado) r = r.filter(x => x.estado === params.estado);
      else r = r.filter(x => x.estado !== 'archivada'); // por defecto solo activas/borrador
      if (params.solo_incompletas) r = r.filter(x => x.incompleta);
      const limit = params.limit ?? 100;
      const items = r
        .sort((a, b) => (b.updated_at || 0) - (a.updated_at || 0))
        .slice(0, limit)
        .map(x => ({ id: x.id, nombre: x.nombre, porciones: x.porciones, dificultad: x.dificultad,
                     incompleta: x.incompleta, campos_pendientes: x.campos_pendientes,
                     estado: x.estado, version: x.version, updated_at: x.updated_at }));
      return { total: items.length, recetas: items };
    });
  }

  async obtener(params) {
    const { proyecto_id, receta_id, nombre } = params;
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id || nombre);
      if (!r) return { error: 'Receta no encontrada', ref: receta_id || nombre };
      // No enviar el history completo en obtener (puede ser pesado)
      const { history, ...rest } = r;
      return { ...rest, ingredientes_formateados: this._formatIngredientesText(r.ingredientes), versiones_anteriores: history.length };
    });
  }

  async buscar(params) {
    const { proyecto_id } = params;
    return this._readOnly(proyecto_id, (store) => {
      let r = store.recetas.filter(x => x.estado === 'activa');

      if (params.texto) {
        const t = params.texto.toLowerCase();
        r = r.filter(x => x.nombre.toLowerCase().includes(t)
                       || (x.descripcion || '').toLowerCase().includes(t)
                       || x.ingredientes.some(i => (i.nombre || '').toLowerCase().includes(t)));
      }
      if (params.ingrediente) {
        const t = params.ingrediente.toLowerCase();
        r = r.filter(x => x.ingredientes.some(i => (i.nombre || '').toLowerCase().includes(t)));
      }
      if (params.categoria) {
        r = r.filter(x => (x.categorias || []).some(c => c.toLowerCase() === params.categoria.toLowerCase()));
      }
      if (params.etiqueta) {
        r = r.filter(x => (x.etiquetas || []).some(e => e.toLowerCase() === params.etiqueta.toLowerCase()));
      }
      if (params.dificultad_max != null) r = r.filter(x => x.dificultad != null && x.dificultad <= params.dificultad_max);
      if (params.dificultad_min != null) r = r.filter(x => x.dificultad != null && x.dificultad >= params.dificultad_min);
      if (params.tiempo_max != null)     r = r.filter(x => x.tiempo_min != null && x.tiempo_min <= params.tiempo_max);
      if (params.porciones != null)      r = r.filter(x => x.porciones === params.porciones);

      const limit = params.limit ?? 50;
      const items = r.slice(0, limit).map(x => ({
        id: x.id, nombre: x.nombre, porciones: x.porciones, tiempo_min: x.tiempo_min,
        dificultad: x.dificultad, categorias: x.categorias, etiquetas: x.etiquetas
      }));
      return { total: items.length, recetas: items };
    });
  }

  async actualizar(params) {
    const { proyecto_id, receta_id, cambios = {} } = params;
    if (!receta_id) return { error: 'receta_id requerido' };

    return this._withStore(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) return { error: 'Receta no encontrada', ref: receta_id };

      // Snapshot de la versión actual al history (sin history para evitar recursión)
      const { history: _h, ...snapshot } = r;
      r.history.push({ ...snapshot, _archived_at: Date.now() });

      // Aplicar cambios soportados
      const aplicados = {};
      const setIf = (k, transform) => {
        if (k in cambios) {
          const v = transform ? transform(cambios[k]) : cambios[k];
          aplicados[k] = { antes: r[k], despues: v };
          r[k] = v;
        }
      };
      setIf('nombre');
      setIf('descripcion');
      setIf('porciones');
      setIf('tiempo_min');
      setIf('dificultad');
      setIf('estado');
      setIf('notas');
      setIf('fuente');
      setIf('ingredientes', this._normalizeIngredientes.bind(this));
      setIf('instrucciones', this._normalizeInstrucciones.bind(this));
      if ('categorias' in cambios)  { aplicados.categorias = { antes: r.categorias,  despues: cambios.categorias  }; r.categorias  = cambios.categorias; }
      if ('etiquetas' in cambios)   { aplicados.etiquetas  = { antes: r.etiquetas,   despues: cambios.etiquetas   }; r.etiquetas   = cambios.etiquetas; }

      r.version += 1;
      r.updated_at = Date.now();
      this._calcIncompleta(r);

      this.eventBus.publish('receta.actualizada', { proyecto_id, id: r.id, nombre: r.nombre, version: r.version, timestamp: r.updated_at });

      return {
        id: r.id, nombre: r.nombre, version: r.version, cambios_aplicados: aplicados,
        incompleta: r.incompleta, campos_pendientes: r.campos_pendientes
      };
    });
  }

  async historial(params) {
    const { proyecto_id, receta_id } = params;
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) return { error: 'Receta no encontrada', ref: receta_id };
      const versiones = r.history.map(h => ({
        version: h.version, archived_at: h._archived_at,
        nombre: h.nombre, porciones: h.porciones, dificultad: h.dificultad,
        ingredientes_count: (h.ingredientes || []).length
      }));
      return {
        receta_id: r.id, nombre: r.nombre, version_actual: r.version,
        versiones_anteriores: versiones.length, historial: versiones
      };
    });
  }

  async revertir(params) {
    const { proyecto_id, receta_id, target_version } = params;
    if (target_version == null) return { error: 'target_version requerido' };

    return this._withStore(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) return { error: 'Receta no encontrada', ref: receta_id };

      const target = r.history.find(h => h.version === target_version);
      if (!target) return { error: `version ${target_version} no encontrada`, versiones_disponibles: r.history.map(h => h.version) };

      // Snapshot actual al history
      const { history: _h, ...snapshot } = r;
      r.history.push({ ...snapshot, _archived_at: Date.now() });

      // Restaurar campos de la versión target
      const { _archived_at, version: _v, history: _hh, ...restore } = target;
      Object.assign(r, restore);
      r.version += 1; // nueva versión "post-revertida"
      r.updated_at = Date.now();
      this._calcIncompleta(r);

      this.eventBus.publish('receta.actualizada', { proyecto_id, id: r.id, nombre: r.nombre, version: r.version, timestamp: r.updated_at, motivo: 'revertir' });

      return { id: r.id, nombre: r.nombre, revertida_a_version: target_version, version_actual: r.version };
    });
  }

  async eliminar(params) {
    const { proyecto_id, receta_id } = params;
    return this._withStore(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) return { error: 'Receta no encontrada', ref: receta_id };
      if (r.estado === 'archivada') return { id: r.id, nombre: r.nombre, status: 'ya_estaba_archivada' };
      r.estado = 'archivada';
      r.updated_at = Date.now();
      this.eventBus.publish('receta.eliminada', { proyecto_id, id: r.id, nombre: r.nombre, timestamp: r.updated_at });
      return { id: r.id, nombre: r.nombre, status: 'archivada' };
    });
  }

  async estadisticas(params) {
    const { proyecto_id } = params;
    return this._readOnly(proyecto_id, (store) => {
      const por_estado = { activa: 0, archivada: 0, borrador: 0 };
      let incompletas = 0;
      let con_precios = 0;
      const ingredientesUsados = new Set();
      for (const r of store.recetas) {
        por_estado[r.estado] = (por_estado[r.estado] || 0) + 1;
        if (r.incompleta) incompletas += 1;
        for (const i of r.ingredientes || []) ingredientesUsados.add((i.nombre || '').toLowerCase());
      }
      for (const ing of store.ingredientes_catalogo) {
        if (ing.precio_mercado != null) con_precios += 1;
      }
      return {
        total_recetas: store.recetas.length,
        por_estado,
        incompletas,
        ingredientes_catalogo: store.ingredientes_catalogo.length,
        ingredientes_con_precio: con_precios,
        ingredientes_usados_unicos: ingredientesUsados.size
      };
    });
  }

  async ingredientes(params) {
    const { proyecto_id } = params;
    return this._readOnly(proyecto_id, (store) => {
      let arr = store.ingredientes_catalogo;
      if (params.categoria) arr = arr.filter(i => (i.categoria || '').toLowerCase() === params.categoria.toLowerCase());
      return { total: arr.length, ingredientes: arr };
    });
  }

  async actualizarPrecio(params) {
    const { proyecto_id, nombre, precio_mercado, unidad, fuente, categoria } = params;
    if (!nombre) return { error: 'nombre requerido' };
    if (precio_mercado == null) return { error: 'precio_mercado requerido' };

    return this._withStore(proyecto_id, (store) => {
      const nombreLower = nombre.toLowerCase().trim();
      let item = store.ingredientes_catalogo.find(i => (i.nombre || '').toLowerCase() === nombreLower);
      const now = Date.now();
      if (!item) {
        item = { nombre: nombre.trim(), categoria: categoria || null, unidad: unidad || null,
                 precio_mercado, fuente: fuente || 'manual', created_at: now, updated_at: now };
        store.ingredientes_catalogo.push(item);
      } else {
        item.precio_mercado = precio_mercado;
        if (unidad) item.unidad = unidad;
        if (categoria) item.categoria = categoria;
        if (fuente) item.fuente = fuente;
        item.updated_at = now;
      }
      this.eventBus.publish('ingrediente.precio.actualizado', { proyecto_id, nombre: item.nombre, precio_mercado, timestamp: now });
      return { nombre: item.nombre, precio_mercado, unidad: item.unidad, status: 'actualizado' };
    });
  }

  /**
   * Análisis profundo de receta. Devuelve datos estructurados; el LLM
   * compone la narrativa. Cruza ingredientes con catálogo si hay precios.
   */
  async analizar(params) {
    const { proyecto_id, receta_id } = params;
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const r = find(receta_id);
      if (!r) return { error: 'Receta no encontrada', ref: receta_id };
      if (r.incompleta) {
        return { error: 'Receta incompleta — faltan campos para analizar', campos_pendientes: r.campos_pendientes };
      }

      // Cruzar ingredientes con catálogo
      const cat = new Map(store.ingredientes_catalogo.map(i => [(i.nombre || '').toLowerCase(), i]));
      let costeTotal = 0;
      let costeReal = true;
      const detalles = (r.ingredientes || []).map(i => {
        const matched = cat.get((i.nombre || '').toLowerCase());
        const precio_mercado = matched?.precio_mercado ?? null;
        if (precio_mercado == null) costeReal = false;
        // Cálculo simple: si cantidad y precio están en mismas unidades, multiplica.
        // Si no, dejar coste null y avisar en notas.
        let coste = null;
        if (precio_mercado != null && i.cantidad != null && (matched.unidad === i.unidad || !matched.unidad)) {
          coste = Number((i.cantidad * precio_mercado).toFixed(4));
          costeTotal += coste;
        }
        return { nombre: i.nombre, cantidad: i.cantidad, unidad: i.unidad, precio_mercado, coste, en_catalogo: !!matched };
      });

      const costePorPorcion = (r.porciones && r.porciones > 0 && costeReal) ? Number((costeTotal / r.porciones).toFixed(2)) : null;

      return {
        receta_id: r.id, nombre: r.nombre, porciones: r.porciones,
        tiempo_min: r.tiempo_min, dificultad: r.dificultad,
        ingredientes: detalles,
        coste_total: costeReal ? Number(costeTotal.toFixed(2)) : null,
        coste_por_porcion: costePorPorcion,
        coste_es_real: costeReal,
        nota: costeReal ? 'Coste calculado con precios reales del catálogo' : 'Faltan precios en catálogo para algunos ingredientes — coste no calculable'
      };
    });
  }

  /**
   * Investigación de receta: si existe en el proyecto, la devuelve. Si no,
   * devuelve estructura vacía indicando que el LLM debe proponerla. Esta tool
   * no llama al LLM por dentro: el LLM principal compone la propuesta usando
   * el resultado de esta tool.
   */
  async investigarReceta(params) {
    const { proyecto_id, nombre_receta } = params;
    if (!nombre_receta) return { error: 'nombre_receta requerido' };
    return this._readOnly(proyecto_id, (store) => {
      const find = this._findRecetaByRefBuilder(store);
      const existing = find(nombre_receta);
      if (existing) {
        return {
          existe_en_proyecto: true,
          receta: { id: existing.id, nombre: existing.nombre, version: existing.version,
                    incompleta: existing.incompleta, ingredientes: existing.ingredientes,
                    porciones: existing.porciones, instrucciones: existing.instrucciones }
        };
      }
      return {
        existe_en_proyecto: false,
        nombre_receta,
        instruccion_para_llm: 'No existe esta receta en el proyecto. Proponla al usuario con ingredientes (cantidad, unidad), instrucciones, porciones, tiempo y dificultad estimados. Cuando el usuario confirme, llama recetas.crear con esos datos.'
      };
    });
  }

  // ============================================================
  // Wrapper de tools — recibe evento, normaliza project_id, llama handler
  // ============================================================

  async _toolDispatch(toolName, event) {
    const data = event.data || event;
    const { request_id, project_id, ...rest } = data;
    const params = { ...rest, proyecto_id: project_id ?? rest.proyecto_id };
    const handlerName = TOOL_HANDLERS[toolName];
    if (!handlerName) {
      return this.eventBus.publish(`${toolName}.response`, { request_id, error: `unknown tool ${toolName}` });
    }
    try {
      const result = await this[handlerName](params);
      await this.eventBus.publish(`${toolName}.response`, { request_id, result });
    } catch (err) {
      this.logger.error(`${toolName}.failed`, { error: err.message });
      await this.eventBus.publish(`${toolName}.response`, { request_id, error: err.message });
    }
  }

  // Handlers expuestos al loader (subscribes en module.json)
  async onToolCrear(e)             { return this._toolDispatch('recetas.crear', e); }
  async onToolListar(e)            { return this._toolDispatch('recetas.listar', e); }
  async onToolObtener(e)           { return this._toolDispatch('recetas.obtener', e); }
  async onToolBuscar(e)            { return this._toolDispatch('recetas.buscar', e); }
  async onToolActualizar(e)        { return this._toolDispatch('recetas.actualizar', e); }
  async onToolHistorial(e)         { return this._toolDispatch('recetas.historial', e); }
  async onToolRevertir(e)          { return this._toolDispatch('recetas.revertir', e); }
  async onToolEliminar(e)          { return this._toolDispatch('recetas.eliminar', e); }
  async onToolEstadisticas(e)      { return this._toolDispatch('recetas.estadisticas', e); }
  async onToolIngredientes(e)      { return this._toolDispatch('recetas.ingredientes', e); }
  async onToolActualizarPrecio(e)  { return this._toolDispatch('recetas.actualizar_precio', e); }
  async onToolAnalizar(e)          { return this._toolDispatch('recetas.analizar', e); }
  async onToolInvestigarReceta(e)  { return this._toolDispatch('recetas.investigar_receta', e); }

  // UI handlers (mismos handlers, formato distinto: { status, data, error })
  async _uiAdapt(handlerName, request) {
    const params = { ...request, proyecto_id: request.project_id ?? request.proyecto_id };
    try {
      const result = await this[handlerName](params);
      if (result && result.error) return { status: 400, error: result.error };
      return { status: 200, data: result };
    } catch (err) {
      this.logger.error(`recetas.ui.${handlerName}.failed`, { error: err.message });
      return { status: 500, error: err.message };
    }
  }

  async handleCrear(req)            { return this._uiAdapt('crear', req); }
  async handleListar(req)           { return this._uiAdapt('listar', req); }
  async handleObtener(req)          { return this._uiAdapt('obtener', req); }
  async handleBuscar(req)           { return this._uiAdapt('buscar', req); }
  async handleActualizar(req)       { return this._uiAdapt('actualizar', req); }
  async handleHistorial(req)        { return this._uiAdapt('historial', req); }
  async handleRevertir(req)         { return this._uiAdapt('revertir', req); }
  async handleEliminar(req)         { return this._uiAdapt('eliminar', req); }
  async handleEstadisticas(req)     { return this._uiAdapt('estadisticas', req); }
  async handleIngredientes(req)     { return this._uiAdapt('ingredientes', req); }
  async handleActualizarPrecio(req) { return this._uiAdapt('actualizarPrecio', req); }
  async handleAnalizar(req)         { return this._uiAdapt('analizar', req); }
  async handleInvestigarReceta(req) { return this._uiAdapt('investigarReceta', req); }
}

module.exports = RecetasModule;
