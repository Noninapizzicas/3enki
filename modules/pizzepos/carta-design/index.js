/**
 * Carta Design v1.0.0
 *
 * Estudio de diseño profesional de cartas impresas.
 * El LLM genera HTML5+CSS completo — este módulo provee las tools
 * para cargar datos, guardar diseños y gestionar perfiles de estilo.
 *
 * Flujo:
 *   1. LLM llama design.load_carta → recibe datos + metadata de layout
 *   2. LLM genera HTML5+CSS en su respuesta (guiado por prompt.json)
 *   3. LLM llama design.save → HTML se abre en HtmlPreviewPanel
 *   4. Usuario ve preview → Ctrl+P → PDF perfecto
 *
 * El valor está en prompt.json: psicología de ventas, marketing
 * gastronómico, jerarquía visual, color psychology, CSS print patterns.
 */

const path = require('path');
const fs = require('fs').promises;

class CartaDesignModule {
  constructor() {
    this.name = 'carta-design';
    this.version = '1.0.0';
    this.eventBus = null;
    this.logger = null;
    this.metrics = null;

    this.projectPaths = new Map();
    this.builtinProfiles = new Map();
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
    const projectId = data?.project_id;
    const cartaId = data?.meta?.id || data?.carta_id;
    this.logger.info('carta-design.carta.updated', {
      project_id: projectId,
      carta_id: cartaId,
      productos: data?.productos?.length,
      categorias: data?.categorias?.length
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
    return p ? path.join(p.featurePath, 'cartas-html') : null;
  }

  profilesDir(projectId) {
    const p = this.getPaths(projectId);
    return p ? path.join(p.featurePath, 'design-profiles') : null;
  }

  defaultCartasDir() {
    return path.join(process.cwd(), 'storage', 'pizzepos', 'cartas');
  }

  defaultOutputDir() {
    return path.join(process.cwd(), 'storage', 'pizzepos', 'cartas-html');
  }

  defaultProfilesDir() {
    return path.join(process.cwd(), 'storage', 'pizzepos', 'design-profiles');
  }

  // ==========================================
  // Tool: design.load_carta
  // ==========================================

  async toolLoadCarta({ carta_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };

    const carta = await this.loadCarta(carta_id, project_id);
    if (!carta) {
      return { status: 404, error: `Carta "${carta_id}" no encontrada. Usa menu.save_carta o menu.generate primero.` };
    }

    // Enriquecer con metadata de layout
    const categorias = (carta.categorias || []).sort((a, b) => (a.orden || 0) - (b.orden || 0));
    const productos = carta.productos || [];

    const catStats = categorias.map(cat => {
      const prods = productos.filter(p => p.categoria === cat.id);
      const precios = prods.map(p => p.precio).filter(p => typeof p === 'number');
      return {
        id: cat.id,
        nombre: cat.nombre,
        icon: cat.icon || null,
        productos: prods.length,
        precio_min: precios.length > 0 ? Math.min(...precios) : 0,
        precio_max: precios.length > 0 ? Math.max(...precios) : 0,
        precio_medio: precios.length > 0 ? +(precios.reduce((a, b) => a + b, 0) / precios.length).toFixed(2) : 0
      };
    });

    const todosPrecios = productos.map(p => p.precio).filter(p => typeof p === 'number');
    const totalProductos = productos.length;

    // Sugerencia de layout
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
        }
      }
    };
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
  // Tool: design.save
  // ==========================================

  async toolSave({ carta_id, html, nombre, profile_id, project_id }) {
    if (!carta_id) return { status: 400, error: 'Se requiere carta_id' };
    if (!html || html.length < 50) return { status: 400, error: 'Se requiere html (HTML5+CSS completo)' };

    const dir = this.outputDir(project_id) || this.defaultOutputDir();
    await fs.mkdir(dir, { recursive: true });

    const ts = Date.now().toString(36);
    const slug = (nombre || 'design').toLowerCase().replace(/[^a-z0-9]+/g, '_').slice(0, 30);
    const filename = `${carta_id}_${slug}_${ts}.html`;
    const absolutePath = path.join(dir, filename);

    await fs.writeFile(absolutePath, html, 'utf-8');

    // Guardar metadata del diseño
    const meta = {
      carta_id,
      nombre: nombre || 'Diseño sin nombre',
      profile_id: profile_id || null,
      filename,
      size_bytes: Buffer.byteLength(html, 'utf-8'),
      created_at: new Date().toISOString()
    };
    await fs.writeFile(absolutePath + '.meta.json', JSON.stringify(meta, null, 2), 'utf-8');

    // Publicar evento → HtmlPreviewPanel se abre automáticamente
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
    this.logger.info('carta-design.save', { carta_id, filename, size: meta.size_bytes, profile_id });

    return {
      status: 200,
      data: {
        carta_id,
        filename,
        path: relativePath,
        size_bytes: meta.size_bytes,
        message: `Diseño guardado y abierto en preview. Usa el botón Imprimir para exportar a PDF.`
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
      id,
      nombre,
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
    this.logger.info('carta-design.profile.saved', { id, nombre });

    return {
      status: 201,
      data: { ...profile, message: `Perfil "${nombre}" guardado con ID "${id}".` }
    };
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
      this.logger.info('carta-design.profile.deleted', { profile_id });
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
          const raw = await fs.readFile(path.join(dir, file), 'utf-8');
          designs.push(JSON.parse(raw));
        } catch (_) {}
      }

      designs.sort((a, b) => new Date(b.created_at) - new Date(a.created_at));
    } catch (_) {}

    this.metrics?.increment('design.gallery.total');

    return {
      status: 200,
      data: {
        carta_id,
        designs,
        total: designs.length
      }
    };
  }

  // ==========================================
  // Helpers
  // ==========================================

  async loadCarta(cartaId, projectId) {
    // Ruta del proyecto
    const dir = this.cartasDir(projectId);
    if (dir) {
      try {
        return JSON.parse(await fs.readFile(path.join(dir, `${cartaId}.json`), 'utf-8'));
      } catch (_) {}
    }

    // Fallback: todos los proyectos
    for (const [pid, paths] of this.projectPaths) {
      if (pid === projectId) continue;
      try {
        return JSON.parse(await fs.readFile(path.join(paths.featurePath, 'cartas', `${cartaId}.json`), 'utf-8'));
      } catch (_) {}
    }

    // Último fallback: ruta por defecto
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
          const profile = JSON.parse(await fs.readFile(path.join(dir, file), 'utf-8'));
          profiles.push(profile);
        } catch (_) {}
      }
      return profiles;
    } catch (_) {
      return [];
    }
  }
}

module.exports = CartaDesignModule;
