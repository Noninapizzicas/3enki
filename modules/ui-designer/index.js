/**
 * Módulo UI Designer
 *
 * Diseñador visual de interfaces para módulos Event-Core.
 * Permite crear vistas, modales, formularios y dashboards con drag & drop.
 *
 * @module ui-designer
 * @version 1.0.0
 */

const fs = require('fs').promises;
const path = require('path');
const crypto = require('crypto');

class UiDesignerModule {
  constructor() {
    this.name = 'ui-designer';
    this.version = '1.0.0';

    // Estado interno
    this.templates = new Map();
    this.dataDir = path.join(process.cwd(), 'modules', 'ui-designer', 'data');
    this.dataFile = path.join(this.dataDir, 'templates.json');

    // Configuración
    this.startTime = Date.now();

    // Dependencias (inyectadas en onLoad)
    this.logger = null;
    this.eventBus = null;

    // Componentes disponibles (registry)
    this.componentRegistry = this.initComponentRegistry();
  }

  // ==========================================
  // Component Registry
  // ==========================================

  initComponentRegistry() {
    return {
      // Layout
      header: {
        label: 'Header',
        icon: '📌',
        category: 'layout',
        description: 'Encabezado con título y acciones',
        defaultProps: { title: 'Título', subtitle: '' }
      },
      card: {
        label: 'Card',
        icon: '🃏',
        category: 'layout',
        description: 'Contenedor con título y contenido',
        defaultProps: { title: '', variant: 'default' }
      },
      section: {
        label: 'Section',
        icon: '📦',
        category: 'layout',
        description: 'Sección contenedora',
        defaultProps: { title: '', collapsible: false }
      },

      // Data
      table: {
        label: 'Tabla',
        icon: '📋',
        category: 'data',
        description: 'Tabla de datos',
        defaultProps: { columns: [], sortable: true, paginated: true }
      },
      'stat-card': {
        label: 'Stat Card',
        icon: '📊',
        category: 'data',
        description: 'Tarjeta de estadística',
        defaultProps: { label: 'Total', value: '0', icon: '📊', color: 'primary' }
      },
      list: {
        label: 'Lista',
        icon: '📝',
        category: 'data',
        description: 'Lista de items',
        defaultProps: { items: [] }
      },
      grid: {
        label: 'Grid',
        icon: '⊞',
        category: 'data',
        description: 'Grid de cards',
        defaultProps: { columns: 3, gap: 'md' }
      },

      // Form
      form: {
        label: 'Formulario',
        icon: '📝',
        category: 'form',
        description: 'Contenedor de formulario',
        defaultProps: { submitLabel: 'Guardar' }
      },
      input: {
        label: 'Input',
        icon: '✏️',
        category: 'form',
        description: 'Campo de texto',
        defaultProps: { label: '', placeholder: '', type: 'text', required: false }
      },
      textarea: {
        label: 'Textarea',
        icon: '📄',
        category: 'form',
        description: 'Área de texto',
        defaultProps: { label: '', placeholder: '', rows: 4 }
      },
      select: {
        label: 'Select',
        icon: '📜',
        category: 'form',
        description: 'Selector desplegable',
        defaultProps: { label: '', options: [], placeholder: 'Seleccionar...' }
      },
      checkbox: {
        label: 'Checkbox',
        icon: '☑️',
        category: 'form',
        description: 'Casilla de verificación',
        defaultProps: { label: '', checked: false }
      },
      radio: {
        label: 'Radio',
        icon: '🔘',
        category: 'form',
        description: 'Botón de radio',
        defaultProps: { label: '', options: [] }
      },

      // Feedback
      modal: {
        label: 'Modal',
        icon: '🪟',
        category: 'feedback',
        description: 'Ventana modal',
        defaultProps: { title: '', size: 'md' }
      },
      alert: {
        label: 'Alert',
        icon: '⚠️',
        category: 'feedback',
        description: 'Mensaje de alerta',
        defaultProps: { variant: 'info', message: '' }
      },
      spinner: {
        label: 'Spinner',
        icon: '🔄',
        category: 'feedback',
        description: 'Indicador de carga',
        defaultProps: { size: 'md' }
      },

      // Navigation
      tabs: {
        label: 'Tabs',
        icon: '☰',
        category: 'navigation',
        description: 'Navegación por pestañas',
        defaultProps: { items: [], activeTab: '' }
      },
      breadcrumb: {
        label: 'Breadcrumb',
        icon: '🧭',
        category: 'navigation',
        description: 'Navegación de migas',
        defaultProps: { items: [] }
      },
      pagination: {
        label: 'Pagination',
        icon: '📖',
        category: 'navigation',
        description: 'Paginación',
        defaultProps: { total: 0, perPage: 10 }
      },

      // Actions
      button: {
        label: 'Botón',
        icon: '🔘',
        category: 'action',
        description: 'Botón de acción',
        defaultProps: { label: 'Botón', variant: 'primary', size: 'md' }
      },
      'button-group': {
        label: 'Button Group',
        icon: '🔲',
        category: 'action',
        description: 'Grupo de botones',
        defaultProps: { buttons: [] }
      }
    };
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.eventBus = core.eventBus;

    this.logger.info('ui-designer.loading', {
      module: this.name,
      version: this.version
    });

    // Cargar templates persistidos
    await this.loadFromJSON();

    this.logger.info('ui-designer.loaded', {
      module: this.name,
      templates_count: this.templates.size
    });
  }

  async onUnload() {
    this.logger.info('ui-designer.unloading', { module: this.name });
    await this.persistToJSON();
    this.logger.info('ui-designer.unloaded', { module: this.name });
  }

  // ==========================================
  // Helpers
  // ==========================================

  generateId() {
    return crypto.randomBytes(8).toString('hex');
  }

  // ==========================================
  // HTTP API Handlers - Templates CRUD
  // ==========================================

  async handleListTemplates(req, context) {
    try {
      const { type, category, status, search, page = 1, limit = 20 } = req.query || {};

      let templates = Array.from(this.templates.values());

      // Filtros
      if (type) {
        templates = templates.filter(t => t.type === type);
      }
      if (category) {
        templates = templates.filter(t => t.category === category);
      }
      if (status) {
        templates = templates.filter(t => t.status === status);
      }
      if (search) {
        const searchLower = search.toLowerCase();
        templates = templates.filter(t =>
          t.name.toLowerCase().includes(searchLower) ||
          t.display_name?.toLowerCase().includes(searchLower) ||
          t.description?.toLowerCase().includes(searchLower)
        );
      }

      // Ordenar por fecha de actualización
      templates.sort((a, b) => new Date(b.updated_at || b.created_at) - new Date(a.updated_at || a.created_at));

      // Paginación
      const total = templates.length;
      const offset = (page - 1) * limit;
      const paginated = templates.slice(offset, offset + limit);

      return {
        status: 200,
        data: {
          templates: paginated,
          pagination: {
            total,
            page: Number(page),
            limit: Number(limit),
            pages: Math.ceil(total / limit)
          }
        }
      };
    } catch (error) {
      this.logger.error('ui-designer.list.error', { error: error.message });
      return { status: 500, data: { error: 'Error al listar templates' } };
    }
  }

  async handleCreateTemplate(req, context) {
    try {
      const body = req.body || {};

      // Validaciones básicas
      if (!body.name || !body.type) {
        return { status: 400, data: { error: 'name y type son requeridos' } };
      }

      // Verificar nombre único
      const exists = Array.from(this.templates.values()).find(t => t.name === body.name);
      if (exists) {
        return { status: 400, data: { error: `Template "${body.name}" ya existe` } };
      }

      const now = new Date().toISOString();
      const template = {
        id: this.generateId(),
        name: body.name,
        display_name: body.display_name || body.name,
        description: body.description || '',
        icon: body.icon || '📄',
        type: body.type,
        category: body.category || 'general',
        status: 'draft',
        layout: body.layout || { type: 'single-column', config: { gap: 'md' } },
        components: body.components || [],
        theme: body.theme || {},
        permissions: body.permissions || ['user'],
        tags: body.tags || [],
        version: '1.0.0',
        created_at: now,
        updated_at: now
      };

      this.templates.set(template.id, template);
      await this.persistToJSON();

      // Emitir evento
      if (this.eventBus) {
        await this.eventBus.publish('ui-designer.template.created', {
          template_id: template.id,
          name: template.name,
          type: template.type
        });
      }

      this.logger.info('ui-designer.template.created', {
        template_id: template.id,
        name: template.name
      });

      return { status: 201, data: { template } };
    } catch (error) {
      this.logger.error('ui-designer.create.error', { error: error.message });
      return { status: 500, data: { error: 'Error al crear template' } };
    }
  }

  async handleGetTemplate(req, context) {
    try {
      const { id } = req.params;
      const template = this.templates.get(id);

      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      return { status: 200, data: { template } };
    } catch (error) {
      this.logger.error('ui-designer.get.error', { error: error.message });
      return { status: 500, data: { error: 'Error al obtener template' } };
    }
  }

  async handleUpdateTemplate(req, context) {
    try {
      const { id } = req.params;
      const body = req.body || {};

      const template = this.templates.get(id);
      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      // Actualizar campos permitidos
      const updatable = ['display_name', 'description', 'icon', 'type', 'category',
        'layout', 'components', 'theme', 'permissions', 'tags', 'status'];

      const changes = {};
      for (const field of updatable) {
        if (body[field] !== undefined) {
          changes[field] = body[field];
          template[field] = body[field];
        }
      }

      template.updated_at = new Date().toISOString();
      this.templates.set(id, template);
      await this.persistToJSON();

      // Emitir evento
      if (this.eventBus) {
        await this.eventBus.publish('ui-designer.template.updated', {
          template_id: id,
          changes
        });
      }

      return { status: 200, data: { template } };
    } catch (error) {
      this.logger.error('ui-designer.update.error', { error: error.message });
      return { status: 500, data: { error: 'Error al actualizar template' } };
    }
  }

  async handleDeleteTemplate(req, context) {
    try {
      const { id } = req.params;
      const template = this.templates.get(id);

      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      this.templates.delete(id);
      await this.persistToJSON();

      // Emitir evento
      if (this.eventBus) {
        await this.eventBus.publish('ui-designer.template.deleted', {
          template_id: id,
          name: template.name
        });
      }

      return { status: 200, data: { deleted: true, id } };
    } catch (error) {
      this.logger.error('ui-designer.delete.error', { error: error.message });
      return { status: 500, data: { error: 'Error al eliminar template' } };
    }
  }

  async handleDuplicateTemplate(req, context) {
    try {
      const { id } = req.params;
      const original = this.templates.get(id);

      if (!original) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      const now = new Date().toISOString();
      const duplicate = {
        ...JSON.parse(JSON.stringify(original)),
        id: this.generateId(),
        name: `${original.name}-copy`,
        display_name: `${original.display_name} (copia)`,
        status: 'draft',
        created_at: now,
        updated_at: now
      };

      this.templates.set(duplicate.id, duplicate);
      await this.persistToJSON();

      return { status: 201, data: { template: duplicate } };
    } catch (error) {
      this.logger.error('ui-designer.duplicate.error', { error: error.message });
      return { status: 500, data: { error: 'Error al duplicar template' } };
    }
  }

  // ==========================================
  // HTTP API Handlers - Components
  // ==========================================

  async handleListComponents(req, context) {
    try {
      const { category } = req.query || {};

      let components = Object.entries(this.componentRegistry).map(([name, config]) => ({
        name,
        ...config
      }));

      if (category) {
        components = components.filter(c => c.category === category);
      }

      // Agrupar por categoría
      const grouped = components.reduce((acc, comp) => {
        if (!acc[comp.category]) {
          acc[comp.category] = [];
        }
        acc[comp.category].push(comp);
        return acc;
      }, {});

      return {
        status: 200,
        data: {
          components,
          grouped,
          categories: ['layout', 'data', 'form', 'feedback', 'navigation', 'action']
        }
      };
    } catch (error) {
      this.logger.error('ui-designer.components.error', { error: error.message });
      return { status: 500, data: { error: 'Error al listar componentes' } };
    }
  }

  async handleGetComponentSchema(req, context) {
    try {
      const { name } = req.params;
      const component = this.componentRegistry[name];

      if (!component) {
        return { status: 404, data: { error: 'Componente no encontrado' } };
      }

      return {
        status: 200,
        data: {
          name,
          ...component
        }
      };
    } catch (error) {
      this.logger.error('ui-designer.component-schema.error', { error: error.message });
      return { status: 500, data: { error: 'Error al obtener schema' } };
    }
  }

  // ==========================================
  // HTTP API Handlers - Export
  // ==========================================

  async handleExportYaml(req, context) {
    try {
      const { template_id } = req.body || {};

      if (!template_id) {
        return { status: 400, data: { error: 'template_id requerido' } };
      }

      const template = this.templates.get(template_id);
      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      // Generar YAML blueprint
      const yaml = this.generateYamlBlueprint(template);

      // Emitir evento
      if (this.eventBus) {
        await this.eventBus.publish('ui-designer.export.yaml', {
          template_id,
          name: template.name
        });
      }

      return {
        status: 200,
        data: {
          yaml,
          filename: `${template.name}.yaml`
        }
      };
    } catch (error) {
      this.logger.error('ui-designer.export-yaml.error', { error: error.message });
      return { status: 500, data: { error: 'Error al exportar YAML' } };
    }
  }

  async handleExportSvelte(req, context) {
    try {
      const { template_id } = req.body || {};

      if (!template_id) {
        return { status: 400, data: { error: 'template_id requerido' } };
      }

      const template = this.templates.get(template_id);
      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      // Generar código Svelte
      const svelte = this.generateSvelteCode(template);

      // Emitir evento
      if (this.eventBus) {
        await this.eventBus.publish('ui-designer.export.svelte', {
          template_id,
          name: template.name,
          components_count: template.components.length
        });
      }

      return {
        status: 200,
        data: {
          svelte,
          filename: `${this.toPascalCase(template.name)}.svelte`
        }
      };
    } catch (error) {
      this.logger.error('ui-designer.export-svelte.error', { error: error.message });
      return { status: 500, data: { error: 'Error al exportar Svelte' } };
    }
  }

  async handleExportJson(req, context) {
    try {
      const { template_id } = req.body || {};

      if (!template_id) {
        return { status: 400, data: { error: 'template_id requerido' } };
      }

      const template = this.templates.get(template_id);
      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      // Generar sección UI para module.json
      const uiSection = this.generateModuleJsonUi(template);

      return {
        status: 200,
        data: {
          ui: uiSection,
          filename: 'module.json (ui section)'
        }
      };
    } catch (error) {
      this.logger.error('ui-designer.export-json.error', { error: error.message });
      return { status: 500, data: { error: 'Error al exportar JSON' } };
    }
  }

  // ==========================================
  // Export Generators
  // ==========================================

  generateYamlBlueprint(template) {
    const lines = [
      `# Blueprint generado por UI Designer`,
      `# Fecha: ${new Date().toISOString()}`,
      ``,
      `name: ${template.name}`,
      `description: ${template.description || template.display_name}`,
      `version: ${template.version}`,
      `author: UI Designer`,
      `icon: "${template.icon}"`,
      ``,
      `# UI Configuration`,
      `ui:`,
      `  enabled: true`,
      `  layout: ${template.layout?.type || 'single-column'}`,
      `  features:`,
      `    - create`,
      `    - edit`,
      `    - delete`,
      ``,
      `# Components`,
      `components:`
    ];

    for (const comp of template.components) {
      lines.push(`  - id: ${comp.id}`);
      lines.push(`    component: ${comp.component}`);
      if (comp.props && Object.keys(comp.props).length > 0) {
        lines.push(`    props:`);
        for (const [key, value] of Object.entries(comp.props)) {
          const valueStr = typeof value === 'string' ? `"${value}"` : JSON.stringify(value);
          lines.push(`      ${key}: ${valueStr}`);
        }
      }
      if (comp.position) {
        lines.push(`    position:`);
        for (const [key, value] of Object.entries(comp.position)) {
          lines.push(`      ${key}: ${value}`);
        }
      }
    }

    return lines.join('\n');
  }

  generateSvelteCode(template) {
    const imports = new Set(['onMount']);
    const componentImports = {
      layout: [],
      ui: [],
      data: [],
      feedback: [],
      navigation: []
    };

    // Analizar componentes usados
    for (const comp of template.components) {
      const registry = this.componentRegistry[comp.component];
      if (registry) {
        const pascalName = this.toPascalCase(comp.component);
        switch (registry.category) {
          case 'layout':
            componentImports.layout.push(pascalName);
            break;
          case 'data':
            componentImports.data.push(pascalName);
            break;
          case 'form':
            componentImports.ui.push(pascalName);
            break;
          case 'feedback':
            componentImports.feedback.push(pascalName);
            break;
          case 'navigation':
            componentImports.navigation.push(pascalName);
            break;
          case 'action':
            componentImports.ui.push(pascalName);
            break;
        }
      }
    }

    let code = `<script lang="ts">
  import { onMount } from 'svelte';
`;

    // Agregar imports de componentes
    if (componentImports.layout.length > 0) {
      code += `  import { ${[...new Set(componentImports.layout)].join(', ')} } from '$components/layout';\n`;
    }
    if (componentImports.ui.length > 0) {
      code += `  import { ${[...new Set(componentImports.ui)].join(', ')} } from '$components/ui';\n`;
    }
    if (componentImports.data.length > 0) {
      code += `  import { ${[...new Set(componentImports.data)].join(', ')} } from '$components/data';\n`;
    }
    if (componentImports.feedback.length > 0) {
      code += `  import { ${[...new Set(componentImports.feedback)].join(', ')} } from '$components/feedback';\n`;
    }
    if (componentImports.navigation.length > 0) {
      code += `  import { ${[...new Set(componentImports.navigation)].join(', ')} } from '$components/navigation';\n`;
    }

    code += `
  // State
  let loading = true;

  onMount(() => {
    loading = false;
  });
</script>

<svelte:head>
  <title>${template.display_name} - Event-Core</title>
</svelte:head>

<div class="p-6">
`;

    // Generar componentes
    for (const comp of template.components) {
      code += this.generateSvelteComponent(comp);
    }

    code += `</div>
`;

    return code;
  }

  generateSvelteComponent(comp) {
    const tag = this.toPascalCase(comp.component);
    const props = comp.props || {};

    let propsStr = '';
    for (const [key, value] of Object.entries(props)) {
      if (typeof value === 'string') {
        propsStr += ` ${key}="${value}"`;
      } else if (typeof value === 'boolean') {
        propsStr += value ? ` ${key}` : '';
      } else {
        propsStr += ` ${key}={${JSON.stringify(value)}}`;
      }
    }

    return `  <${tag}${propsStr} />\n`;
  }

  generateModuleJsonUi(template) {
    return {
      enabled: true,
      version: '2.0',
      title: template.display_name,
      icon: template.icon,
      description: template.description,
      views: {
        main: {
          type: template.type,
          layout: template.layout,
          permissions: template.permissions,
          sections: template.components.map(comp => ({
            id: comp.id,
            widget: comp.component,
            config: comp.props || {}
          }))
        }
      }
    };
  }

  toPascalCase(str) {
    return str
      .split('-')
      .map(part => part.charAt(0).toUpperCase() + part.slice(1))
      .join('');
  }

  // ==========================================
  // Health Check
  // ==========================================

  async handleHealthCheck(req, context) {
    const uptime = (Date.now() - this.startTime) / 1000;

    return {
      status: 200,
      data: {
        status: 'healthy',
        module: this.name,
        version: this.version,
        uptime,
        templates_count: this.templates.size,
        components_count: Object.keys(this.componentRegistry).length,
        timestamp: new Date().toISOString()
      }
    };
  }

  // ==========================================
  // Persistencia JSON
  // ==========================================

  async loadFromJSON() {
    try {
      try {
        await fs.access(this.dataDir);
      } catch (error) {
        await fs.mkdir(this.dataDir, { recursive: true });
      }

      try {
        await fs.access(this.dataFile);
      } catch (error) {
        this.logger.info('ui-designer.load.first_run', {
          message: 'No hay templates persistidos, iniciando desde cero'
        });
        return;
      }

      const fileContent = await fs.readFile(this.dataFile, 'utf8');
      const parsed = JSON.parse(fileContent);

      if (parsed.templates) {
        for (const template of parsed.templates) {
          this.templates.set(template.id, template);
        }
      }

      this.logger.info('ui-designer.loaded_from_json', {
        file: this.dataFile,
        templates_count: this.templates.size
      });
    } catch (error) {
      this.logger.error('ui-designer.load.error', {
        error: error.message,
        file: this.dataFile
      });
    }
  }

  async persistToJSON() {
    try {
      const snapshot = {
        version: this.version,
        templates: Array.from(this.templates.values()),
        metadata: {
          saved_at: new Date().toISOString(),
          count: this.templates.size
        }
      };

      const tempFile = `${this.dataFile}.tmp`;
      await fs.writeFile(tempFile, JSON.stringify(snapshot, null, 2), 'utf8');
      await fs.rename(tempFile, this.dataFile);

      this.logger.debug('ui-designer.persisted_to_json', {
        file: this.dataFile,
        count: this.templates.size
      });
    } catch (error) {
      this.logger.error('ui-designer.persist.error', {
        error: error.message,
        file: this.dataFile
      });
    }
  }
}

module.exports = UiDesignerModule;
