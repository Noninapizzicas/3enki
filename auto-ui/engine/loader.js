/**
 * Auto-UI Module Loader
 *
 * Carga y gestiona módulos, componentes y temas para Auto-UI
 */

const fs = require('fs');
const path = require('path');
const { UI } = require('../../core/constants');

class Loader {
  constructor(options = {}) {
    this.modulesPath = options.modulesPath || path.join(process.cwd(), 'modules');
    this.componentsPath = options.componentsPath || path.join(process.cwd(), 'auto-ui', 'components');
    this.themesPath = options.themesPath || path.join(process.cwd(), 'auto-ui', 'config', 'themes');
    this.themePath = options.themePath || path.join(process.cwd(), 'auto-ui', 'config', 'theme.json');

    this.logger = options.logger || console;

    // Caches
    this.modules = new Map();
    this.components = new Map();
    this.theme = null;
  }

  // ==========================================
  // Módulos
  // ==========================================

  /**
   * Carga todos los módulos disponibles
   */
  async loadModules() {
    this.modules.clear();

    if (!fs.existsSync(this.modulesPath)) {
      this.logger.warn('[Loader] Modules path not found:', this.modulesPath);
      return [];
    }

    const dirs = fs.readdirSync(this.modulesPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const dir of dirs) {
      const moduleJsonPath = path.join(this.modulesPath, dir, 'module.json');

      if (fs.existsSync(moduleJsonPath)) {
        try {
          const content = fs.readFileSync(moduleJsonPath, 'utf-8');
          const moduleConfig = JSON.parse(content);

          // Añadir metadata
          moduleConfig._path = path.join(this.modulesPath, dir);
          moduleConfig._hasViews = fs.existsSync(path.join(this.modulesPath, dir, 'views'));

          // Cargar vistas si existen
          if (moduleConfig._hasViews) {
            moduleConfig._views = this.loadModuleViews(path.join(this.modulesPath, dir, 'views'));
          }

          this.modules.set(moduleConfig.name, moduleConfig);

          this.logger.info('[Loader] Module loaded:', moduleConfig.name);
        } catch (error) {
          this.logger.error('[Loader] Failed to load module:', dir, error.message);
        }
      }
    }

    return Array.from(this.modules.values());
  }

  /**
   * Carga las vistas de un módulo
   */
  loadModuleViews(viewsPath) {
    const views = {};

    if (!fs.existsSync(viewsPath)) return views;

    const files = fs.readdirSync(viewsPath)
      .filter(f => f.endsWith('.json'));

    for (const file of files) {
      try {
        const content = fs.readFileSync(path.join(viewsPath, file), 'utf-8');
        const viewConfig = JSON.parse(content);
        const viewName = file.replace('.json', '');
        views[viewName] = viewConfig;
      } catch (error) {
        this.logger.error('[Loader] Failed to load view:', file, error.message);
      }
    }

    return views;
  }

  /**
   * Obtiene un módulo por nombre
   */
  getModule(name) {
    return this.modules.get(name);
  }

  /**
   * Lista todos los módulos
   */
  listModules() {
    return Array.from(this.modules.values()).map(m => ({
      name: m.name,
      version: m.version,
      description: m.description,
      ui: m.ui || null,
      hasViews: m._hasViews
    }));
  }

  /**
   * Lista módulos con UI habilitada
   */
  listUIModules() {
    return this.listModules().filter(m => m.ui?.enabled !== false);
  }

  // ==========================================
  // Componentes
  // ==========================================

  /**
   * Carga todos los componentes disponibles
   */
  async loadComponents() {
    this.components.clear();

    if (!fs.existsSync(this.componentsPath)) {
      this.logger.warn('[Loader] Components path not found:', this.componentsPath);
      return [];
    }

    // Cargar de cada categoría
    const categories = fs.readdirSync(this.componentsPath, { withFileTypes: true })
      .filter(d => d.isDirectory())
      .map(d => d.name);

    for (const category of categories) {
      const categoryPath = path.join(this.componentsPath, category);
      const files = fs.readdirSync(categoryPath)
        .filter(f => f.endsWith('.json'));

      for (const file of files) {
        try {
          const content = fs.readFileSync(path.join(categoryPath, file), 'utf-8');
          const component = JSON.parse(content);

          component._category = category;
          component._file = file;

          this.components.set(component.name, component);

          this.logger.info('[Loader] Component loaded:', component.name);
        } catch (error) {
          this.logger.error('[Loader] Failed to load component:', file, error.message);
        }
      }
    }

    return Array.from(this.components.values());
  }

  /**
   * Obtiene un componente por nombre
   */
  getComponent(name) {
    return this.components.get(name);
  }

  /**
   * Lista todos los componentes
   */
  listComponents() {
    return Array.from(this.components.values()).map(c => ({
      name: c.name,
      type: c.type,
      category: c._category,
      hasVariants: !!c.variants,
      interactions: Object.keys(c.interactions || {})
    }));
  }

  // ==========================================
  // Tema
  // ==========================================

  /**
   * Carga el tema activo
   */
  loadTheme() {
    try {
      if (fs.existsSync(this.themePath)) {
        const content = fs.readFileSync(this.themePath, 'utf-8');
        this.theme = JSON.parse(content);
        this.logger.info('[Loader] Theme loaded:', this.theme.name);
      } else {
        this.theme = this.getDefaultTheme();
        this.logger.warn('[Loader] Using default theme');
      }
    } catch (error) {
      this.logger.error('[Loader] Failed to load theme:', error.message);
      this.theme = this.getDefaultTheme();
    }

    return this.theme;
  }

  /**
   * Tema por defecto
   */
  getDefaultTheme() {
    return {
      name: 'default',
      colors: {
        bg: '#0f1216',
        'bg-card': '#1a1d24',
        text: '#ffffff',
        'text-muted': '#9ca3af',
        primary: '#3b82f6',
        success: '#22c55e',
        warning: '#f59e0b',
        danger: '#ef4444',
        border: '#374151'
      },
      spacing: {
        xs: '4px',
        sm: '8px',
        md: '16px',
        lg: '24px',
        xl: '32px'
      },
      radius: {
        sm: '4px',
        md: '8px',
        lg: '12px'
      }
    };
  }

  /**
   * Obtiene el tema activo
   */
  getTheme() {
    if (!this.theme) {
      this.loadTheme();
    }
    return this.theme;
  }

  /**
   * Lista temas disponibles
   */
  listThemes() {
    if (!fs.existsSync(this.themesPath)) return [];

    return fs.readdirSync(this.themesPath)
      .filter(f => f.endsWith('.json'))
      .map(f => f.replace('.json', ''));
  }

  /**
   * Cambia el tema activo
   */
  setTheme(themeName) {
    const themePath = path.join(this.themesPath, `${themeName}.json`);

    if (!fs.existsSync(themePath)) {
      throw new Error(`Theme '${themeName}' not found`);
    }

    // Copiar tema a theme.json activo
    fs.copyFileSync(themePath, this.themePath);

    // Recargar
    this.loadTheme();

    return this.theme;
  }

  // ==========================================
  // Utilidades
  // ==========================================

  /**
   * Recarga todo
   */
  async reloadAll() {
    await this.loadModules();
    await this.loadComponents();
    this.loadTheme();

    return {
      modules: this.modules.size,
      components: this.components.size,
      theme: this.theme?.name
    };
  }

  /**
   * Obtiene estadísticas
   */
  getStats() {
    return {
      modules: {
        total: this.modules.size,
        withUI: this.listUIModules().length
      },
      components: {
        total: this.components.size,
        byCategory: this.getComponentsByCategory()
      },
      theme: this.theme?.name || 'none'
    };
  }

  /**
   * Agrupa componentes por categoría
   */
  getComponentsByCategory() {
    const byCategory = {};

    for (const [name, component] of this.components) {
      const category = component._category || 'unknown';
      if (!byCategory[category]) {
        byCategory[category] = [];
      }
      byCategory[category].push(name);
    }

    return byCategory;
  }
}

module.exports = Loader;
