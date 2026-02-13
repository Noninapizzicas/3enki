/**
 * UI Renderer Module
 * Motor de renderizado automático de UIs desde configuración JSON
 */

const fs = require('fs').promises;
const path = require('path');

class UIRendererModule {
  constructor() {
    this.name = 'ui-renderer';
    this.version = '1.0.0';

    // Estado
    this.components = new Map();
    this.moduleConfigs = new Map();
    this.cache = new Map();

    // Dependencias (inyectadas)
    this.logger = null;
    this.metrics = null;
    this.eventBus = null;
    this.core = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  async onLoad(core) {
    this.logger = core.logger;
    this.metrics = core.metrics;
    this.eventBus = core.eventBus;
    this.core = core;

    this.logger.info('ui-renderer.loading', { module: this.name });

    // Cargar componentes desde ui-components/
    await this.loadComponents();

    // Cargar configuraciones UI de todos los módulos
    await this.loadModuleConfigs();

    this.logger.info('ui-renderer.loaded', {
      module: this.name,
      components_count: this.components.size,
      modules_count: this.moduleConfigs.size
    });
  }

  async onUnload() {
    this.logger.info('ui-renderer.unloading', { module: this.name });
    this.cache.clear();
  }

  // ==========================================
  // Component & Config Loading
  // ==========================================

  async loadComponents() {
    const componentsPath = path.join(__dirname, '../../ui-components');

    try {
      const files = await fs.readdir(componentsPath);

      for (const file of files) {
        if (file.endsWith('.component.json')) {
          const componentPath = path.join(componentsPath, file);
          const content = await fs.readFile(componentPath, 'utf8');
          const componentData = JSON.parse(content);

          this.components.set(componentData.component, componentData);

          this.logger.info('component.loaded', {
            component: componentData.component,
            version: componentData.version
          });
        }
      }

      this.metrics.gauge('components.loaded.count', this.components.size);

    } catch (error) {
      this.logger.error('components.load_error', {
        error: error.message,
        stack: error.stack
      });
    }
  }

  async loadModuleConfigs() {
    const modulesPath = path.join(__dirname, '../');

    try {
      const modules = await fs.readdir(modulesPath);

      for (const moduleName of modules) {
        if (moduleName === 'ui-renderer') continue;

        const moduleJsonPath = path.join(modulesPath, moduleName, 'module.json');

        try {
          const content = await fs.readFile(moduleJsonPath, 'utf8');
          const moduleData = JSON.parse(content);

          if (moduleData.ui && moduleData.ui.enabled) {
            this.moduleConfigs.set(moduleName, moduleData.ui);

            this.logger.info('module-ui.loaded', {
              module: moduleName,
              views: Object.keys(moduleData.ui.views || {})
            });
          }
        } catch (error) {
          // Módulo sin module.json o sin UI - ignorar
        }
      }

    } catch (error) {
      this.logger.error('module-configs.load_error', {
        error: error.message
      });
    }
  }

  // ==========================================
  // HTTP API Handlers
  // ==========================================

  async handleRenderUI(req, context) {
    const start_time = Date.now();
    const moduleName = context.params.module;
    const viewName = context.params.view || 'main';

    this.logger.info('ui.render.start', {
      module: moduleName,
      view: viewName,
      correlation_id: context.correlationId || req.request_id
    });

    try {
      // Obtener configuración del módulo
      const moduleUI = this.moduleConfigs.get(moduleName);

      if (!moduleUI) {
        return {
          status: 404,
          
          data: this.renderError(`Módulo "${moduleName}" no tiene UI configurada`)
        };
      }

      // Obtener vista
      const viewConfig = moduleUI.views[viewName];

      if (!viewConfig) {
        return {
          status: 404,
          
          data: this.renderError(`Vista "${viewName}" no encontrada en módulo "${moduleName}"`)
        };
      }

      // Renderizar UI
      const html = await this.renderView(moduleName, viewName, viewConfig, moduleUI);

      // Métricas
      this.metrics.increment('ui.rendered.total');
      this.metrics.timing('ui.render.duration', Date.now() - start_time);

      // Publicar evento
      await this.eventBus.publish('ui.rendered', {
        module: moduleName,
        view: viewName
      }, {
        correlationId: context.correlationId || req.request_id
      });

      this.logger.info('ui.rendered', {
        module: moduleName,
        view: viewName,
        duration: Date.now() - start_time,
        correlation_id: context.correlationId || req.request_id
      });

      return {
        status: 200,
        
        data: { _responseType: 'html', content: html }
      };

    } catch (error) {
      this.metrics.increment('ui.render_error.total');

      this.logger.error('ui.render.error', {
        module: moduleName,
        view: viewName,
        error: error.message,
        stack: error.stack,
        correlation_id: context.correlationId || req.request_id
      });

      return {
        status: 500,
        
        data: this.renderError(`Error al renderizar: ${error.message}`)
      };
    }
  }

  async handleGetComponent(req, context) {
    const componentName = context.params.name;
    const component = this.components.get(componentName);

    if (!component) {
      return {
        status: 404,
        data: { error: `Componente "${componentName}" no encontrado` }
      };
    }

    return {
      status: 200,
      data: { component }
    };
  }

  async handleRenderComponent(req, context) {
    const componentName = context.params.name;
    const componentData = this.components.get(componentName);

    if (!componentData) {
      return {
        status: 404,
        data: { error: `Componente "${componentName}" no encontrado` }
      };
    }

    const props = context.body || {};

    try {
      const html = await this.renderComponent(componentName, componentData, props);

      this.metrics.increment('component.rendered.total');

      return {
        status: 200,
        
        data: { _responseType: 'html', content: html }
      };

    } catch (error) {
      this.logger.error('component.render.error', {
        component: componentName,
        error: error.message
      });

      return {
        status: 500,
        data: { error: error.message }
      };
    }
  }

  async handleListComponents(req, context) {
    const components = Array.from(this.components.keys()).map(name => {
      const data = this.components.get(name);
      return {
        component: name,
        version: data.version,
        description: data.description
      };
    });

    return {
      status: 200,
      data: { components, count: components.length }
    };
  }

  async handleHealthCheck(req, context) {
    return {
      status: 200,
      data: {
        status: 'healthy',
        uptime: process.uptime(),
        components_loaded: this.components.size,
        modules_with_ui: this.moduleConfigs.size,
        timestamp: new Date().toISOString(),
        version: this.version
      }
    };
  }

  async handleGetMetrics(req, context) {
    return {
      status: 200,
      data: {
        counters: {
          'ui.rendered.total': this.metrics.getCounter('ui.rendered.total') || 0,
          'ui.render_error.total': this.metrics.getCounter('ui.render_error.total') || 0
        },
        gauges: {
          'components.loaded.count': this.components.size,
          'modules.with_ui.count': this.moduleConfigs.size
        }
      }
    };
  }

  // ==========================================
  // Rendering Logic
  // ==========================================

  async renderView(moduleName, viewName, viewConfig, moduleUI) {
    const layout = viewConfig.layout || 'full-width';

    // Generar HTML según el layout
    let contentHTML = '';

    if (layout === 'sidebar-content') {
      contentHTML = await this.renderSidebarContentLayout(moduleName, viewConfig, moduleUI);
    } else if (layout === 'full-width') {
      contentHTML = await this.renderFullWidthLayout(moduleName, viewConfig, moduleUI);
    } else {
      throw new Error(`Layout "${layout}" no soportado`);
    }

    // Wrap en template base
    return this.wrapInBaseTemplate(moduleName, viewName, moduleUI, contentHTML);
  }

  async renderSidebarContentLayout(moduleName, viewConfig, moduleUI) {
    const sidebar = viewConfig.sidebar || {};
    const content = viewConfig.content || {};
    const header = viewConfig.header || {};
    const sidebarPosition = sidebar.position || 'left';

    let html = '<div class="app-layout sidebar-content">';

    // Header
    if (header.show !== false) {
      html += this.renderHeader(header);
    }

    // Flex direction basado en posición
    const flexStyle = sidebarPosition === 'right' ? 'flex-direction: row-reverse;' : '';
    html += `<div class="app-main" style="${flexStyle}">`;

    // Sidebar
    if (sidebar.sections) {
      html += '<aside class="app-sidebar" style="width: ' + (sidebar.width || '200px') + '">';
      html += await this.renderSidebar(sidebar);
      html += '</aside>';
    }

    // Content
    html += '<div class="app-content" id="app-content">';
    html += await this.renderContent(content);
    html += '</div>';

    html += '</div>'; // app-main
    html += '</div>'; // app-layout

    return html;
  }

  async renderFullWidthLayout(moduleName, viewConfig, moduleUI) {
    const content = viewConfig.content || {};

    let html = '<div class="app-layout full-width">';
    html += await this.renderContent(content);
    html += '</div>';

    return html;
  }

  renderHeader(headerConfig) {
    let html = '<header class="app-header">';
    html += `<h1 class="app-header-title">${headerConfig.title || 'UI'}</h1>`;

    if (headerConfig.info && Array.isArray(headerConfig.info)) {
      html += '<div class="app-header-info">';

      for (const info of headerConfig.info) {
        html += `<div class="app-header-info-item" id="${info.id}">`;
        html += `<span class="label">${info.label || ''}</span>`;
        html += `<span class="value">-</span>`;
        html += '</div>';
      }

      html += '</div>';
    }

    html += '</header>';
    return html;
  }

  async renderSidebar(sidebarConfig) {
    let html = '';

    for (const section of sidebarConfig.sections) {
      html += '<div class="sidebar-section">';

      if (section.title) {
        html += `<h3 class="sidebar-section-title">${section.title}</h3>`;
      }

      if (section.buttons) {
        for (const button of section.buttons) {
          html += await this.renderButton(button);
        }
      }

      html += '</div>';
    }

    return html;
  }

  async renderContent(contentConfig) {
    if (contentConfig.type === 'grid') {
      return this.renderGrid(contentConfig);
    } else if (contentConfig.type === 'form') {
      return this.renderForm(contentConfig);
    }

    return '<div class="content-placeholder">Contenido</div>';
  }

  renderGrid(gridConfig) {
    const config = gridConfig.config || {};
    const endpoint = config.endpoint || '';
    const mqttTopics = config.mqtt_topics || [];
    const emptyState = config.empty_state || {};
    const itemComponent = config.item_component || 'cuenta-button';

    // Cargar configuración del componente desde JSON
    const componentData = this.components.get(itemComponent) || {};
    const tipos = componentData.tipos || {};
    const estados = componentData.estados || {};
    const touchZones = componentData.touch_zones || {};
    const dimensions = componentData.dimensions || {};

    let html = '';

    // Loading state
    html += '<div class="grid-container" id="grid-container">';
    html += '<div class="loading-state">';
    html += '<div class="spinner"></div>';
    html += '<p>Cargando...</p>';
    html += '</div>';
    html += '</div>';

    // Script para cargar datos y renderizar - usa configuración del componente JSON
    html += `
    <script>
      (function() {
        const gridContainer = document.getElementById('grid-container');
        const endpoint = '${endpoint}';
        const mqttTopics = ${JSON.stringify(mqttTopics)};

        // Configuración de tipos desde componente JSON
        const tipoConfig = ${JSON.stringify(tipos)};

        // Configuración de estados desde componente JSON
        const estadoConfig = {};
        const estadosRaw = ${JSON.stringify(estados)};
        Object.keys(estadosRaw).forEach(key => {
          const e = estadosRaw[key];
          estadoConfig[key] = {
            emoji: e.emoji,
            marcos: [e.marcos.exterior_1, e.marcos.exterior_2, e.marcos.exterior_3]
          };
        });

        // Touch zones desde componente JSON
        const touchZones = ${JSON.stringify(touchZones)};

        // Cargar datos iniciales
        fetch(endpoint)
          .then(res => res.json())
          .then(data => {
            const items = data.data || data.cuentas || data || [];
            renderGrid(Array.isArray(items) ? items : []);
          })
          .catch(err => {
            gridContainer.innerHTML = '<div class="error-state"><div class="icon">⚠️</div><p>Error: ' + err.message + '</p></div>';
          });

        function renderGrid(items) {
          if (!items || items.length === 0) {
            gridContainer.innerHTML = \`
              <div class="empty-state">
                <div class="icon">${emptyState.icon || '📋'}</div>
                <h3>${emptyState.title || 'No hay cuentas activas'}</h3>
                <p>${emptyState.description || 'Crea una nueva cuenta para comenzar'}</p>
              </div>
            \`;
            return;
          }

          let html = '<div class="cuentas-grid">';
          items.forEach(item => {
            html += renderCuentaButton(item);
          });
          html += '</div>';

          gridContainer.innerHTML = html;
        }

        function renderCuentaButton(cuenta) {
          const tipo = tipoConfig[cuenta.tipo] || tipoConfig.local || {};
          const estado = estadoConfig[cuenta.estado] || estadoConfig.pendiente || { emoji: '⏱️', marcos: ['#fbbf24', '#f59e0b', '#d97706'] };
          const marcos = estado.marcos || ['#666', '#555', '#444'];

          // Obtener zonas del JSON
          const zones = touchZones.zones || [
            { id: 'left', action: 'navigate-comandero', target: '/ui/comandero?cuenta_id={id}' },
            { id: 'right', action: 'navigate-cobros', target: '/ui/cobros?cuenta_id={id}' }
          ];

          return \`
            <button class="cuenta-btn" data-id="\${cuenta.id}" onclick="handleCuentaClick('\${cuenta.id}', event)">
              <div class="cuenta-btn-frame1" style="background: \${marcos[0]}">
                <div class="cuenta-btn-frame2" style="background: \${marcos[1]}">
                  <div class="cuenta-btn-frame3" style="background: \${marcos[2]}">
                    <div class="cuenta-btn-bg" style="background: \${tipo.background || '#667eea'}">
                      <span class="cuenta-btn-emoji-tipo">\${tipo.emoji || '📋'}</span>
                      <span class="cuenta-btn-emoji-estado">\${estado.emoji}</span>
                      <div class="cuenta-btn-content">
                        <div class="cuenta-btn-nombre">\${cuenta.nombre || 'Sin nombre'}</div>
                        <div class="cuenta-btn-hora">\${cuenta.hora || '--:--'}</div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
              <div class="cuenta-btn-zones">
                \${zones.map(zone => \`<div class="cuenta-btn-zone \${zone.id}" data-target="\${zone.target}"></div>\`).join('')}
              </div>
            </button>
          \`;
        }

        // Handler de clicks en cuentas - usa targets del JSON
        window.handleCuentaClick = function(cuentaId, event) {
          const target = event.target.closest('.cuenta-btn-zone');
          if (target && target.dataset.target) {
            const url = target.dataset.target.replace('{id}', cuentaId);
            window.location.href = url;
          }
        };

        // TODO: Conectar MQTT para actualizaciones en tiempo real
      })();
    </script>
    `;

    return html;
  }

  renderForm(formConfig) {
    return '<div class="form-placeholder">Formulario</div>';
  }

  async renderButton(buttonConfig) {
    const componentName = buttonConfig.component || 'button';
    const icon = buttonConfig.icon || '';
    const label = buttonConfig.label || '';
    const tipo = buttonConfig.tipo || '';

    // Si es cuenta-type-button - estilo compacto solo emoji
    if (componentName === 'cuenta-type-button') {
      const componentData = this.components.get('cuenta-type-button');
      const tipoConfig = componentData?.tipos?.[tipo] || {};

      const emoji = tipoConfig.emoji || icon;
      const background = tipoConfig.background || '#666';
      const shadow = tipoConfig.shadow || '0 4px 12px rgba(0,0,0,0.3)';

      // Action config from JSON - el renderer interpreta, no hardcodea
      const actionConfig = buttonConfig.action || {};
      const actionData = JSON.stringify(actionConfig).replace(/"/g, '&quot;');

      return `
        <button class="cuenta-type-btn-compact action-btn"
                style="background: ${background}; box-shadow: ${shadow};"
                data-tipo="${tipo}"
                data-action='${actionData}'
                title="${tipoConfig.label || tipo}">
          <span class="emoji">${emoji}</span>
        </button>
      `;
    }

    // Botón con acción definida en JSON
    if (buttonConfig.action) {
      const actionConfig = buttonConfig.action;
      const actionData = JSON.stringify(actionConfig).replace(/"/g, '&quot;');

      return `
        <button class="btn-compact action-btn ${buttonConfig.style || ''}"
                title="${label}"
                data-action='${actionData}'>
          ${icon ? `<span class="icon">${icon}</span>` : ''}
        </button>
      `;
    }

    // Botón genérico compacto
    return `
      <button class="btn-compact ${buttonConfig.style || ''}" title="${label}">
        ${icon ? `<span class="icon">${icon}</span>` : ''}
      </button>
    `;
  }

  async renderComponent(componentName, componentData, props) {
    // Renderizado genérico básico
    return `<div class="component component-${componentName}">${JSON.stringify(props)}</div>`;
  }

  wrapInBaseTemplate(moduleName, viewName, moduleUI, contentHTML) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>${moduleUI.title || moduleName}</title>

  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }

    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0F1216;
      color: #ffffff;
    }

    .app-layout { display: flex; flex-direction: column; height: 100vh; }

    .app-header {
      background: #1a1d24;
      padding: 1rem 1.5rem;
      border-bottom: 1px solid rgba(255,255,255,0.05);
      display: flex;
      justify-content: space-between;
      align-items: center;
    }

    .app-header-title { font-size: 1.25rem; font-weight: 700; }

    .app-header-info {
      display: flex;
      gap: 1.5rem;
      font-size: 0.875rem;
      color: #9ca3af;
    }

    .app-main { display: flex; flex: 1; overflow: hidden; }

    .cuenta-type-btn {
      width: 100%;
      min-height: 56px;
      padding: 12px 16px;
      border: none;
      border-radius: 12px;
      font-size: 14px;
      font-weight: 600;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      gap: 10px;
      margin-bottom: 0.5rem;
      transition: all 0.15s ease;
    }

    .cuenta-type-btn:hover {
      transform: translateY(-2px) scale(1.02);
    }

    .cuenta-type-btn .emoji { font-size: 24px; }
    .cuenta-type-btn .label { flex: 1; text-align: left; }

    .btn {
      width: 100%;
      padding: 0.75rem 1rem;
      border: none;
      border-radius: 8px;
      font-size: 14px;
      font-weight: 500;
      cursor: pointer;
      background: #6b7280;
      color: white;
      display: flex;
      align-items: center;
      gap: 8px;
      margin-bottom: 0.5rem;
    }

    .btn:hover { background: #4b5563; }

    /* Botones compactos para sidebar estrecha */
    .cuenta-type-btn-compact {
      width: 100%;
      height: 44px;
      padding: 8px;
      border: none;
      border-radius: 10px;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      transition: all 0.15s ease;
    }

    .cuenta-type-btn-compact:hover {
      transform: scale(1.1);
      filter: brightness(1.1);
    }

    .cuenta-type-btn-compact:active {
      transform: scale(0.95);
    }

    .cuenta-type-btn-compact .emoji {
      font-size: 22px;
      line-height: 1;
    }

    .btn-compact {
      width: 100%;
      height: 44px;
      padding: 8px;
      border: none;
      border-radius: 10px;
      background: #6b7280;
      color: white;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      margin-bottom: 8px;
      transition: all 0.15s ease;
    }

    .btn-compact:hover {
      transform: scale(1.1);
      background: #4b5563;
    }

    .btn-compact .icon {
      font-size: 20px;
    }

    /* Sidebar sin títulos de sección cuando es compacta */
    .app-sidebar {
      background: #1a1d24;
      padding: 12px 8px;
      border-left: 1px solid rgba(255,255,255,0.05);
      overflow-y: auto;
      display: flex;
      flex-direction: column;
      gap: 4px;
    }

    .sidebar-section {
      margin-bottom: 8px;
    }

    .sidebar-section-title {
      display: none; /* Ocultar títulos en modo compacto */
    }

    .app-content {
      flex: 1;
      padding: 1.5rem;
      overflow-y: auto;
    }

    .grid-container { width: 100%; }

    .grid {
      display: grid;
      grid-template-columns: repeat(2, 1fr);
      gap: 1rem;
      max-width: 600px;
    }

    .grid-item {
      background: #1a1d24;
      padding: 1.5rem;
      border-radius: 12px;
      cursor: pointer;
      transition: all 0.2s;
    }

    .grid-item:hover {
      transform: translateY(-2px);
      box-shadow: 0 4px 12px rgba(0,0,0,0.3);
    }

    .loading-state, .empty-state, .error-state {
      text-align: center;
      padding: 4rem 2rem;
      color: #9ca3af;
    }

    .spinner {
      width: 40px;
      height: 40px;
      border: 3px solid rgba(255,255,255,0.1);
      border-top-color: #ffffff;
      border-radius: 50%;
      animation: spin 0.8s linear infinite;
      margin: 0 auto 1rem;
    }

    @keyframes spin { to { transform: rotate(360deg); } }

    .empty-state .icon { font-size: 4rem; margin-bottom: 1rem; opacity: 0.5; }

    /* Grid de cuentas */
    .cuentas-grid {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(125px, 1fr));
      gap: 12px;
      max-width: 100%;
    }

    /* Cuenta button con 3 marcos */
    .cuenta-btn {
      position: relative;
      width: 125px;
      height: 75px;
      border: none;
      border-radius: 12px;
      cursor: pointer;
      padding: 0;
      background: transparent;
      transition: all 0.15s ease;
    }

    .cuenta-btn:hover {
      transform: translateY(-3px) scale(1.02);
    }

    .cuenta-btn:active {
      transform: scale(0.98);
    }

    .cuenta-btn-frame1 {
      width: 100%;
      height: 100%;
      border-radius: 12px;
      padding: 3px;
    }

    .cuenta-btn-frame2 {
      width: 100%;
      height: 100%;
      border-radius: 10px;
      padding: 3px;
    }

    .cuenta-btn-frame3 {
      width: 100%;
      height: 100%;
      border-radius: 8px;
      padding: 3px;
    }

    .cuenta-btn-bg {
      width: 100%;
      height: 100%;
      border-radius: 6px;
      padding: 8px;
      display: flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      position: relative;
    }

    .cuenta-btn-emoji-tipo {
      font-size: 20px;
      position: absolute;
      top: 6px;
      left: 8px;
    }

    .cuenta-btn-emoji-estado {
      font-size: 14px;
      position: absolute;
      top: 6px;
      right: 8px;
    }

    .cuenta-btn-content {
      text-align: center;
      margin-top: 6px;
    }

    .cuenta-btn-nombre {
      font-size: 12px;
      font-weight: 600;
      color: white;
      text-shadow: 0 1px 2px rgba(0,0,0,0.3);
      white-space: nowrap;
      overflow: hidden;
      text-overflow: ellipsis;
      max-width: 90px;
    }

    .cuenta-btn-hora {
      font-size: 10px;
      color: rgba(255,255,255,0.8);
      margin-top: 2px;
    }

    /* Zonas de click split-button */
    .cuenta-btn-zones {
      position: absolute;
      top: 0;
      left: 0;
      right: 0;
      bottom: 0;
      display: flex;
      border-radius: 12px;
      overflow: hidden;
    }

    .cuenta-btn-zone {
      flex: 1;
      cursor: pointer;
      transition: background 0.15s ease;
    }

    .cuenta-btn-zone:hover {
      background: rgba(255,255,255,0.1);
    }

    .cuenta-btn-zone.left {
      border-right: 1px solid rgba(255,255,255,0.1);
    }

    @media (max-width: 768px) {
      .cuentas-grid {
        grid-template-columns: repeat(auto-fill, minmax(110px, 1fr));
        gap: 8px;
      }

      .cuenta-btn {
        width: 110px;
        height: 70px;
      }
    }
  </style>
</head>
<body>
  ${contentHTML}

  <script>
    // Action Handler - Interpreta action.type desde JSON
    (function() {
      document.querySelectorAll('.action-btn').forEach(btn => {
        btn.addEventListener('click', async function() {
          const actionData = this.dataset.action;
          if (!actionData) return;

          try {
            const action = JSON.parse(actionData.replace(/&quot;/g, '"'));
            await executeAction(action, this);
          } catch (err) {
            console.error('Error parsing action:', err);
          }
        });
      });

      async function executeAction(action, element) {
        switch (action.type) {
          case 'create-and-navigate':
            await handleCreateAndNavigate(action, element);
            break;

          case 'refresh-data':
            window.location.reload();
            break;

          case 'navigate':
            window.location.href = action.url;
            break;

          case 'api-call':
            await handleApiCall(action);
            break;

          default:
            console.warn('Unknown action type:', action.type);
        }
      }

      async function handleCreateAndNavigate(action, element) {
        const tipo = element.dataset.tipo || 'local';

        try {
          const response = await fetch(action.endpoint, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ tipo: tipo })
          });

          const data = await response.json();

          if (response.ok && data.data) {
            const newId = data.data.id;
            const navigateUrl = action.navigate_to.replace('{new_id}', newId);
            window.location.href = navigateUrl;
          } else {
            console.error('Error creating:', data.error || 'Unknown error');
          }
        } catch (err) {
          console.error('Error in create-and-navigate:', err);
        }
      }

      async function handleApiCall(action) {
        try {
          const response = await fetch(action.endpoint, {
            method: action.method || 'GET',
            headers: { 'Content-Type': 'application/json' },
            body: action.body ? JSON.stringify(action.body) : undefined
          });

          const data = await response.json();

          if (action.on_success === 'refresh') {
            window.location.reload();
          }

          return data;
        } catch (err) {
          console.error('Error in api-call:', err);
        }
      }
    })();
  </script>
</body>
</html>`;
  }

  renderError(message) {
    return `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <title>Error</title>
  <style>
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0F1216;
      color: #ffffff;
      display: flex;
      align-items: center;
      justify-content: center;
      height: 100vh;
      margin: 0;
    }
    .error-container {
      text-align: center;
      padding: 2rem;
    }
    .error-icon { font-size: 4rem; margin-bottom: 1rem; }
    .error-title { font-size: 1.5rem; font-weight: 700; margin-bottom: 0.5rem; }
    .error-message { color: #9ca3af; }
  </style>
</head>
<body>
  <div class="error-container">
    <div class="error-icon">⚠️</div>
    <h1 class="error-title">Error</h1>
    <p class="error-message">${message}</p>
  </div>
</body>
</html>`;
  }
}

module.exports = UIRendererModule;
