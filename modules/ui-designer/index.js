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
      },
      dropdown: {
        label: 'Dropdown',
        icon: '📋',
        category: 'action',
        description: 'Menú desplegable',
        defaultProps: { label: 'Opciones', items: [] }
      },

      // Additional Layout
      sidebar: {
        label: 'Sidebar',
        icon: '📑',
        category: 'layout',
        description: 'Barra lateral de navegación',
        defaultProps: { title: 'Sidebar', items: [] }
      },
      footer: {
        label: 'Footer',
        icon: '🔻',
        category: 'layout',
        description: 'Pie de página',
        defaultProps: { text: '© 2024 Event-Core' }
      },
      panel: {
        label: 'Panel',
        icon: '🗂️',
        category: 'layout',
        description: 'Panel con cabecera',
        defaultProps: { title: '', content: '' }
      },

      // Additional Data
      tree: {
        label: 'Tree',
        icon: '🌳',
        category: 'data',
        description: 'Vista de árbol jerárquico',
        defaultProps: { items: [] }
      },
      chart: {
        label: 'Chart',
        icon: '📈',
        category: 'data',
        description: 'Gráfico de datos',
        defaultProps: { title: 'Gráfico', type: 'bar', data: [60, 80, 45, 90, 70] }
      },
      'event-stream': {
        label: 'Event Stream',
        icon: '📡',
        category: 'data',
        description: 'Flujo de eventos en tiempo real',
        defaultProps: { title: 'Eventos', events: [] }
      },

      // Additional Form
      'file-upload': {
        label: 'File Upload',
        icon: '📁',
        category: 'form',
        description: 'Carga de archivos',
        defaultProps: { label: '', placeholder: 'Arrastra archivos aquí' }
      },
      'date-picker': {
        label: 'Date Picker',
        icon: '📅',
        category: 'form',
        description: 'Selector de fecha',
        defaultProps: { label: '', value: '' }
      },

      // Additional Feedback
      toast: {
        label: 'Toast',
        icon: '🔔',
        category: 'feedback',
        description: 'Notificación emergente',
        defaultProps: { title: '', message: '', icon: 'ℹ️' }
      },
      progress: {
        label: 'Progress',
        icon: '📊',
        category: 'feedback',
        description: 'Barra de progreso',
        defaultProps: { label: '', value: 50 }
      },
      skeleton: {
        label: 'Skeleton',
        icon: '💀',
        category: 'feedback',
        description: 'Placeholder de carga',
        defaultProps: { avatar: false }
      },

      // Additional Navigation
      menu: {
        label: 'Menu',
        icon: '☰',
        category: 'navigation',
        description: 'Menú de navegación',
        defaultProps: { items: [] }
      },

      // AI Components
      'chat-input': {
        label: 'Chat Input',
        icon: '💬',
        category: 'ai',
        description: 'Campo de entrada para chat',
        defaultProps: { placeholder: 'Escribe un mensaje...', sendLabel: '➤' }
      },
      'conversation-panel': {
        label: 'Conversation Panel',
        icon: '🗨️',
        category: 'ai',
        description: 'Panel de conversación',
        defaultProps: { title: 'Conversación', welcomeMessage: '¡Hola! ¿En qué puedo ayudarte?' }
      },
      'prompt-selector': {
        label: 'Prompt Selector',
        icon: '📝',
        category: 'ai',
        description: 'Selector de prompts',
        defaultProps: { label: 'Seleccionar Prompt', prompts: [] }
      },

      // Custom/Extensibility
      custom: {
        label: 'Custom',
        icon: '🧩',
        category: 'custom',
        description: 'Componente personalizado',
        defaultProps: { description: '' }
      },
      slot: {
        label: 'Slot',
        icon: '📥',
        category: 'custom',
        description: 'Área para contenido dinámico',
        defaultProps: { name: 'default' }
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
          categories: ['layout', 'data', 'form', 'feedback', 'navigation', 'action', 'ai', 'custom']
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
  // HTTP API Handlers - Actions
  // ==========================================

  async handlePublishTemplate(req, context) {
    try {
      const { id } = req.params;
      const template = this.templates.get(id);

      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      if (template.status === 'published') {
        return { status: 400, data: { error: 'El template ya está publicado' } };
      }

      template.status = 'published';
      template.published_at = new Date().toISOString();
      template.updated_at = new Date().toISOString();
      this.templates.set(id, template);
      await this.persistToJSON();

      if (this.eventBus) {
        await this.eventBus.publish('ui-designer.template.published', {
          template_id: id,
          name: template.name,
          target_module: template.target_module
        });
      }

      this.logger.info('ui-designer.template.published', { template_id: id, name: template.name });
      return { status: 200, data: { template } };
    } catch (error) {
      this.logger.error('ui-designer.publish.error', { error: error.message });
      return { status: 500, data: { error: 'Error al publicar template' } };
    }
  }

  async handleArchiveTemplate(req, context) {
    try {
      const { id } = req.params;
      const template = this.templates.get(id);

      if (!template) {
        return { status: 404, data: { error: 'Template no encontrado' } };
      }

      if (template.status === 'archived') {
        return { status: 400, data: { error: 'El template ya está archivado' } };
      }

      template.status = 'archived';
      template.archived_at = new Date().toISOString();
      template.updated_at = new Date().toISOString();
      this.templates.set(id, template);
      await this.persistToJSON();

      this.logger.info('ui-designer.template.archived', { template_id: id, name: template.name });
      return { status: 200, data: { template } };
    } catch (error) {
      this.logger.error('ui-designer.archive.error', { error: error.message });
      return { status: 500, data: { error: 'Error al archivar template' } };
    }
  }

  // ==========================================
  // HTTP API Handlers - Layouts
  // ==========================================

  async handleListLayouts(req, context) {
    try {
      const layouts = [
        { type: 'single-column', label: 'Una Columna', icon: '▐', description: 'Layout de una sola columna', config: { gap: 'md', maxWidth: '4xl' } },
        { type: 'two-column', label: 'Dos Columnas', icon: '▐▐', description: 'Dos columnas iguales', config: { gap: 'md', ratio: '1:1' } },
        { type: 'three-column', label: 'Tres Columnas', icon: '▐▐▐', description: 'Tres columnas iguales', config: { gap: 'md' } },
        { type: 'grid', label: 'Grid Responsive', icon: '⊞', description: 'Grid adaptable', config: { columns: 3, gap: 'md' } },
        { type: 'tabs', label: 'Tabs/Pestañas', icon: '☰', description: 'Contenido en pestañas', config: { variant: 'default' } },
        { type: 'sidebar', label: 'Sidebar + Content', icon: '▌▐', description: 'Barra lateral + contenido', config: { sidebarWidth: '250px', position: 'left' } },
        { type: 'split', label: 'Split View', icon: '◧', description: 'Vista dividida', config: { ratio: '1:1', resizable: true } },
        { type: 'kanban', label: 'Kanban Board', icon: '▥', description: 'Tablero Kanban', config: { columns: ['Todo', 'In Progress', 'Done'] } }
      ];

      return { status: 200, data: { layouts } };
    } catch (error) {
      this.logger.error('ui-designer.layouts.error', { error: error.message });
      return { status: 500, data: { error: 'Error al listar layouts' } };
    }
  }

  async handleGetLayout(req, context) {
    try {
      const { type } = req.params;
      const layoutsRes = await this.handleListLayouts(req, context);
      const layout = layoutsRes.data.layouts.find(l => l.type === type);

      if (!layout) {
        return { status: 404, data: { error: 'Layout no encontrado' } };
      }

      return { status: 200, data: { layout } };
    } catch (error) {
      this.logger.error('ui-designer.layout.error', { error: error.message });
      return { status: 500, data: { error: 'Error al obtener layout' } };
    }
  }

  // ==========================================
  // HTTP API Handlers - Predefined Templates
  // ==========================================

  async handleGetPredefinedTemplates(req, context) {
    try {
      const templates = [
        {
          name: 'dashboard-basic',
          display_name: 'Dashboard Básico',
          description: 'Dashboard con stats y tabla',
          icon: '📊',
          type: 'dashboard',
          category: 'analytics',
          layout: { type: 'single-column', config: { gap: 'md' } },
          components: [
            { id: 'header', component: 'header', props: { title: 'Dashboard', subtitle: 'Resumen general' }, position: { section: 'header', order: 0 } },
            { id: 'stat1', component: 'stat-card', props: { label: 'Total', value: '0', icon: '📊', color: 'primary' }, position: { section: 'main', order: 0 } },
            { id: 'stat2', component: 'stat-card', props: { label: 'Activos', value: '0', icon: '✅', color: 'success' }, position: { section: 'main', order: 1 } },
            { id: 'table', component: 'table', props: { columns: [], sortable: true, paginated: true }, position: { section: 'main', order: 2 } }
          ]
        },
        {
          name: 'crud-form',
          display_name: 'Formulario CRUD',
          description: 'Formulario crear/editar',
          icon: '📝',
          type: 'form',
          category: 'data',
          layout: { type: 'single-column', config: { gap: 'md', maxWidth: 'lg' } },
          components: [
            { id: 'header', component: 'header', props: { title: 'Nuevo Registro' }, position: { section: 'header', order: 0 } },
            { id: 'form', component: 'form', props: { submitLabel: 'Guardar' }, position: { section: 'main', order: 0 } },
            { id: 'name', component: 'input', props: { label: 'Nombre', required: true }, position: { section: 'main', order: 1 } },
            { id: 'desc', component: 'textarea', props: { label: 'Descripción', rows: 4 }, position: { section: 'main', order: 2 } }
          ]
        },
        {
          name: 'ai-chat',
          display_name: 'Chat con IA',
          description: 'Interfaz de chat IA',
          icon: '🤖',
          type: 'view',
          category: 'ai',
          layout: { type: 'single-column', config: { gap: 'md' } },
          components: [
            { id: 'header', component: 'header', props: { title: 'Asistente IA' }, position: { section: 'header', order: 0 } },
            { id: 'conversation', component: 'conversation-panel', props: { title: 'Chat' }, position: { section: 'main', order: 0 } },
            { id: 'input', component: 'chat-input', props: { placeholder: 'Escribe tu mensaje...' }, position: { section: 'footer', order: 0 } }
          ]
        },
        {
          name: 'list-with-filters',
          display_name: 'Lista con Filtros',
          description: 'Lista con búsqueda y filtros',
          icon: '📋',
          type: 'view',
          category: 'data',
          layout: { type: 'single-column', config: { gap: 'md' } },
          components: [
            { id: 'header', component: 'header', props: { title: 'Lista' }, position: { section: 'header', order: 0 } },
            { id: 'search', component: 'input', props: { placeholder: 'Buscar...' }, position: { section: 'main', order: 0 } },
            { id: 'list', component: 'list', props: { items: [] }, position: { section: 'main', order: 1 } },
            { id: 'pagination', component: 'pagination', props: { total: 0, perPage: 10 }, position: { section: 'main', order: 2 } }
          ]
        }
      ];

      return { status: 200, data: { templates } };
    } catch (error) {
      this.logger.error('ui-designer.predefined.error', { error: error.message });
      return { status: 500, data: { error: 'Error al obtener templates predefinidos' } };
    }
  }

  async handleCreateFromPredefined(req, context) {
    try {
      const { template_name, custom_name } = req.body || {};

      if (!template_name) {
        return { status: 400, data: { error: 'template_name requerido' } };
      }

      const predefinedRes = await this.handleGetPredefinedTemplates(req, context);
      const predefined = predefinedRes.data.templates.find(t => t.name === template_name);

      if (!predefined) {
        return { status: 404, data: { error: 'Template predefinido no encontrado' } };
      }

      const now = new Date().toISOString();
      const newName = custom_name || `${predefined.name}-${Date.now()}`;

      const template = {
        id: this.generateId(),
        name: newName,
        display_name: custom_name ? custom_name.replace(/-/g, ' ').replace(/\b\w/g, l => l.toUpperCase()) : predefined.display_name,
        description: predefined.description,
        icon: predefined.icon,
        type: predefined.type,
        category: predefined.category,
        status: 'draft',
        layout: JSON.parse(JSON.stringify(predefined.layout)),
        components: JSON.parse(JSON.stringify(predefined.components)).map(c => ({ ...c, id: `${c.id}_${Date.now()}` })),
        theme: {},
        permissions: ['user'],
        tags: ['predefined'],
        version: '1.0.0',
        created_at: now,
        updated_at: now
      };

      this.templates.set(template.id, template);
      await this.persistToJSON();

      this.logger.info('ui-designer.template.created_from_predefined', { template_id: template.id, predefined: template_name });
      return { status: 201, data: { template } };
    } catch (error) {
      this.logger.error('ui-designer.create_from_predefined.error', { error: error.message });
      return { status: 500, data: { error: 'Error al crear desde predefinido' } };
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
