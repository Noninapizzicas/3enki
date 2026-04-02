/**
 * Carta Design v2.0.0
 *
 * Estudio de diseño profesional de cartas impresas.
 *
 * Arquitectura v2: El LLM es "director creativo" — genera un JSON de
 * decisiones (design project). El código renderiza el HTML determinísticamente.
 *
 * Flujo:
 *   1. LLM llama design.load_carta → datos + marketing_hints
 *   2. LLM genera JSON de decisiones creativas (paleta, layout, marketing)
 *   3. LLM llama design.create_project → código renderiza HTML completo
 *   4. HTML se abre automáticamente en HtmlPreviewPanel
 *   5. Usuario ve preview → Ctrl+P → PDF perfecto
 *
 * El HTML nunca se trunca: el motor de render genera todas las líneas
 * determinísticamente sin importar el número de productos.
 */

const path = require('path');
const fs = require('fs').promises;
const RenderEngine = require('./render-engine');
const { resolveProject } = require('./design-project-schema');

class CartaDesignModule {
  constructor() {
    this.name = 'carta-design';
    this.version = '2.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    this.projectPaths = new Map();
    this.builtinProfiles = new Map();
    this.renderEngine = new RenderEngine();
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(context) {
    this.eventBus = context.eventBus;
    this.logger = context.logger;
    this.metrics = context.metrics;

    await this.loadBuiltinProfiles();

    this.logger.info('module.loaded', { module: this.name, version: this.version, profiles: this.builtinProfiles.size });
  }

  async onUnload() {
    this.projectPaths.clear();
    this.builtinProfiles.clear();
    this.logger.info('module.unloaded', { module: this.name });
  }

  async onProjectActivated(event) {
    const data = event.data || event;
    const { project_id, base_path, metadata } = data;
    const resolvedBase = (metadata?.is_system === true) ? process.cwd() : base_path;
    if (resolvedBase) {
      this.projectPaths.set(project_id, {
        featurePath: path.join(resolvedBase, 'storage', 'pizzepos'),
        storagePath: path.join(resolvedBase, 'storage')
      });
    }
    this.logger.info('carta-design.project.activated', { project_id });
  }

  async onProjectDeactivated() { /* no-op */ }

  async onCartaGenerada(event) {
    const data = event?.data || event?.payload || event;
    this.logger.info('carta-design.carta.updated', {
      project_id: data?.project_id,
      carta_id: data?.meta?.id || data?.carta_id
    });
  }

  // ==========================================
  // Built-in design profiles
  // ==========================================

  async loadBuiltinProfiles() {
    const dir = path.join(__dirname, 'design-profiles');
    try {
      const files = await fs.readdir(dir);
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          const raw = await fs.readFile(path.join(dir, file), 'utf-8');
          const profile = JSON.parse(raw);
          if (profile.id) {
            profile.builtin = true;
            this.builtinProfiles.set(profile.id, profile);
          }
        } catch (_) {}
      }
    } catch (_) {}
    this.logger.info('carta-design.profiles.loaded', { count: this.builtinProfiles.size });
  }

  // ==========================================
  // Path helpers
  // ==========================================

  getPaths(projectId) {
    return this.projectPaths.get(projectId);
  }

  cartasDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'cartas') : null;
  }

  outputDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'carta-design', 'designs') : null;
  }

  profilesDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'carta-design', 'profiles') : null;
  }

  projectsDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'carta-design', 'projects') : null;
  }

  defaultCartasDir() {
    return path.join(process.cwd(), 'storage', 'pizzepos', 'cartas');
  }

  defaultOutputDir() {
    return path.join(process.cwd(), 'storage', 'pizzepos', 'carta-design', 'designs');
  }

  defaultProfilesDir() {
    return path.join(process.cwd(), 'storage', 'pizzepos', 'carta-design', 'profiles');
  }

  defaultProjectsDir() {
    return path.join(process.cwd(), 'storage', 'pizzepos', 'carta-design', 'projects');
  }

  // ==========================================
  // Tool: design.load_carta (mejorada con marketing_hints)
  // ==========================================

  async toolLoadCarta({ carta_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };

    const carta = await this.loadCarta(carta_id, project_id);
    if (!carta) {
      return { status: 404, error: `Carta "${carta_id}" no encontrada. Usa menu.save_carta o menu.generate primero.` };
    }

    const categorias = (carta.categorias || []).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const productos = carta.productos || [];

    const catStats = categorias.map(cat => {
      const prods = productos.filter(p => p.categoria === cat.id);
      const precios = prods.map(p => p.precio).filter(p => typeof p === 'number' && p > 0);
      const sorted = [...precios].sort((a, b) => b - a);
      return {
        id: cat.id,
        nombre: cat.nombre,
        icon: cat.icon || null,
        productos: prods.length,
        precio_min: precios.length > 0 ? Math.min(...precios) : 0,
        precio_max: precios.length > 0 ? Math.max(...precios) : 0,
        precio_medio: precios.length > 0 ? +(precios.reduce((a, b) => a + b, 0) / precios.length).toFixed(2) : 0,
        // Marketing hints por categoría
        needs_miller_split: prods.length > 9,
        top_price_products: sorted.length >= 2
          ? prods.filter(p => p.precio === sorted[0] || p.precio === sorted[1]).map(p => ({ id: p.id, nombre: p.nombre, precio: p.precio }))
          : []
      };
    });

    const todosPrecios = productos.map(p => p.precio).filter(p => typeof p === 'number' && p > 0);
    const totalProductos = productos.length;

    let layoutSugerido;
    if (totalProductos <= 15) layoutSugerido = 'single_column';
    else if (totalProductos <= 30) layoutSugerido = 'two_column';
    else if (totalProductos <= 50) layoutSugerido = 'three_column';
    else layoutSugerido = 'multi_column';

    this.metrics?.increment('design.load_carta.total');

    return {
      status: 200,
      data: {
        carta_id: carta.meta?.id || carta_id,
        nombre: carta.meta?.nombre || 'Carta',
        categorias,
        productos,
        layout_hints: {
          total_productos: totalProductos,
          total_categorias: categorias.length,
          categorias_stats: catStats,
          precio_min: todosPrecios.length > 0 ? Math.min(...todosPrecios) : 0,
          precio_max: todosPrecios.length > 0 ? Math.max(...todosPrecios) : 0,
          precio_medio: todosPrecios.length > 0 ? +(todosPrecios.reduce((a, b) => a + b, 0) / todosPrecios.length).toFixed(2) : 0,
          layout_sugerido: layoutSugerido,
          orientacion_sugerida: totalProductos > 25 ? 'landscape' : 'portrait'
        },
        marketing_hints: {
          star_candidates: this.findStarCandidates(productos, categorias),
          miller_violations: catStats.filter(c => c.needs_miller_split).map(c => ({ id: c.id, nombre: c.nombre, count: c.productos }))
        }
      }
    };
  }

  /**
   * Encuentra candidatos a productos estrella (mayor precio por categoría)
   */
  findStarCandidates(productos, categorias) {
    const candidates = [];
    for (const cat of categorias) {
      const prods = productos.filter(p => p.categoria === cat.id && typeof p.precio === 'number');
      if (prods.length === 0) continue;
      const sorted = [...prods].sort((a, b) => b.precio - a.precio);
      if (sorted[0]) candidates.push({ id: sorted[0].id, nombre: sorted[0].nombre, categoria: cat.id, precio: sorted[0].precio });
    }
    return candidates;
  }

  // ==========================================
  // Tool: design.create_project (NUEVA — la principal)
  // ==========================================

  async toolCreateProject({ carta_id, design_project, nombre, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!design_project || typeof design_project !== 'object') {
      return { status: 400, error: 'Se requiere design_project (JSON de decisiones creativas)' };
    }

    // 1. Cargar carta
    const carta = await this.loadCarta(carta_id, project_id);
    if (!carta) {
      return { status: 404, error: `Carta "${carta_id}" no encontrada` };
    }

    // 2. Resolver proyecto: defaults ← profile ← overrides
    const { resolved, warnings } = resolveProject(design_project, this.builtinProfiles);

    // 3. Renderizar HTML
    const html = this.renderEngine.render(resolved, carta);

    // 4. Guardar proyecto JSON
    const projDir = this.projectsDir(project_id) || this.defaultProjectsDir();
    await fs.mkdir(projDir, { recursive: true });
    const ts = Date.now().toString(36);
    const slug = (nombre || resolved.nombre || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    const projectFilename = `${carta_id}_${slug}_${ts}.project.json`;
    await fs.writeFile(path.join(projDir, projectFilename), JSON.stringify(resolved, null, 2), 'utf-8');

    // 5. Guardar HTML
    const result = await this.toolSave({
      carta_id,
      html,
      nombre: nombre || resolved.nombre || `Diseño ${carta_id}`,
      profile_id: design_project.profile_base || null,
      project_id
    });

    if (result.error) return result;

    this.metrics?.increment('design.create_project.total');
    this.logger.info('carta-design.project.created', {
      carta_id,
      profile_base: design_project.profile_base,
      layout: resolved.design?.layout,
      products: carta.productos?.length,
      warnings: warnings.length
    });

    return {
      status: 200,
      data: {
        ...result.data,
        project_file: projectFilename,
        warnings: warnings.length > 0 ? warnings : undefined,
        message: `Diseño generado con ${carta.productos?.length || 0} productos y abierto en preview.`
      }
    };
  }

  // ==========================================
  // UI Handler: design.render (para frontend)
  // ==========================================

  async handleRender(data) {
    const result = await this.toolCreateProject({
      carta_id: data?.carta_id,
      design_project: data?.design_project || {},
      nombre: data?.nombre,
      project_id: data?.project_id
    });
    if (result.error) {
      throw { status: result.status || 400, code: 'RENDER_ERROR', message: result.error };
    }
    return result.data;
  }

  // ==========================================
  // Tool: design.profiles
  // ==========================================

  async toolProfiles({ project_id }) {
    const builtin = Array.from(this.builtinProfiles.values());
    const custom = await this.listProjectProfiles(project_id);

    return {
      status: 200,
      data: {
        builtin,
        custom,
        total: builtin.length + custom.length
      }
    };
  }

  // ==========================================
  // Tool: design.save (mantiene compatibilidad)
  // ==========================================

  async toolSave({ carta_id, html, nombre, profile_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!html || html.length < 50) return { status: 400, error: 'Se requiere html' };

    const dir = this.outputDir(project_id) || this.defaultOutputDir();
    await fs.mkdir(dir, { recursive: true });

    const ts = Date.now().toString(36);
    const slug = (nombre || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    const filename = `${carta_id}_${slug}_${ts}.html`;
    const absolutePath = path.join(dir, filename);

    await fs.writeFile(absolutePath, html, 'utf-8');

    const meta = {
      carta_id,
      nombre: nombre || 'Diseño sin nombre',
      profile_id: profile_id || null,
      filename,
      size_bytes: Buffer.byteLength(html, 'utf-8'),
      created_at: new Date().toISOString()
    };
    await fs.writeFile(absolutePath + '.meta.json', JSON.stringify(meta, null, 2), 'utf-8');

    await this.eventBus.publish('carta.html.generada', {
      carta_id,
      html,
      title: nombre || `Diseño ${carta_id}`,
      filename,
      profile_id: profile_id || null
    });

    const paths = this.getPaths(project_id);
    const storagePath = paths?.storagePath || path.join(process.cwd(), 'storage');
    const relativePath = '/' + path.relative(storagePath, absolutePath).replace(/\\/g, '/');

    this.metrics?.increment('design.save.total');
    this.logger.info('carta-design.save', { carta_id, filename, size: meta.size_bytes });

    return {
      status: 200,
      data: {
        carta_id,
        filename,
        path: relativePath,
        size_bytes: meta.size_bytes,
        message: `Diseño guardado y abierto en preview.`
      }
    };
  }

  // ==========================================
  // Tool: design.save_profile
  // ==========================================

  async toolSaveProfile({ nombre, description, color_palette, fonts, layout_type, style_notes, project_id }) {
    if (!nombre) return { status: 400, error: 'Se requiere nombre para el perfil' };

    const id = 'custom_' + nombre.toLowerCase()
      .normalize('NFD').replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '_').replace(/^_+|_+$/g, '');

    const profile = {
      id, nombre,
      description: description || '',
      color_palette: color_palette || {},
      fonts: fonts || {},
      layout_type: layout_type || 'auto',
      style_notes: style_notes || '',
      builtin: false,
      created_at: new Date().toISOString()
    };

    const dir = this.profilesDir(project_id) || this.defaultProfilesDir();
    await fs.mkdir(dir, { recursive: true });
    await fs.writeFile(path.join(dir, `${id}.json`), JSON.stringify(profile, null, 2), 'utf-8');

    this.metrics?.increment('design.save_profile.total');
    return { status: 201, data: { ...profile, message: `Perfil "${nombre}" guardado con ID "${id}".` } };
  }

  // ==========================================
  // Tool: design.delete_profile
  // ==========================================

  async toolDeleteProfile({ profile_id, project_id }) {
    if (!profile_id) return { status: 400, error: 'Se requiere profile_id' };
    if (this.builtinProfiles.has(profile_id)) {
      return { status: 403, error: `"${profile_id}" es un perfil built-in y no se puede eliminar.` };
    }
    const dir = this.profilesDir(project_id) || this.defaultProfilesDir();
    try {
      await fs.unlink(path.join(dir, `${profile_id}.json`));
      return { status: 200, data: { profile_id, message: `Perfil "${profile_id}" eliminado.` } };
    } catch (_) {
      return { status: 404, error: `Perfil "${profile_id}" no encontrado.` };
    }
  }

  // ==========================================
  // Tool: design.gallery
  // ==========================================

  async toolGallery({ carta_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };

    const dir = this.outputDir(project_id) || this.defaultOutputDir();
    let designs = [];

    try {
      const files = await fs.readdir(dir);
      const metaFiles = files.filter(f => f.startsWith(carta_id + '_') && f.endsWith('.meta.json'));
      for (const file of metaFiles) {
        try {
          designs.push(JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8')));
        } catch (_) {}
      }
      designs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (_) {}

    this.metrics?.increment('design.gallery.total');
    return { status: 200, data: { carta_id, designs, total: designs.length } };
  }

  // ==========================================
  // Helpers
  // ==========================================

  async loadCarta(cartaId, projectId) {
    const dir = this.cartasDir(projectId);
    if (dir) {
      try {
        return JSON.parse(await fs.readFile(path.join(dir, `${cartaId}.json`), 'utf-8'));
      } catch (_) {}
    }
    for (const [pid, paths] of this.projectPaths) {
      if (pid === projectId) continue;
      try {
        return JSON.parse(await fs.readFile(path.join(paths.featurePath, 'cartas', `${cartaId}.json`), 'utf-8'));
      } catch (_) {}
    }
    try {
      return JSON.parse(await fs.readFile(path.join(this.defaultCartasDir(), `${cartaId}.json`), 'utf-8'));
    } catch (_) {
      return null;
    }
  }

  async listProjectProfiles(projectId) {
    const dir = this.profilesDir(projectId) || this.defaultProfilesDir();
    try {
      const files = await fs.readdir(dir);
      const profiles = [];
      for (const file of files.filter(f => f.endsWith('.json'))) {
        try {
          profiles.push(JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8')));
        } catch (_) {}
      }
      return profiles;
    } catch (_) {
      return [];
    }
  }
}

module.exports = CartaDesignModule;
