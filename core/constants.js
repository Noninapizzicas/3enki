/**
 * CONSTANTES CENTRALIZADAS DEL SISTEMA
 *
 * Este archivo es la ÚNICA fuente de verdad para:
 * - Nombres de eventos MQTT
 * - Rutas de APIs HTTP
 * - Nombres de campos en requests/responses
 * - Códigos de error
 * - Configuraciones comunes
 *
 * ⚠️ IMPORTANTE: NUNCA hardcodear estos valores en los módulos.
 * ⚠️ SIEMPRE importar desde este archivo.
 */

// ============================================
// EVENTOS MQTT - Estructura: {domain}.{action}.{type}
// ============================================

const EVENTS = {
  // === PROYECTOS ===
  PROJECT: {
    CREATED: 'project.created',
    UPDATED: 'project.updated',
    DELETED: 'project.deleted',
    ACTIVATED: 'project.activated',

    LIST_REQUEST: 'project.list.request',
    LIST_RESPONSE: 'project.list.response',
    GET_REQUEST: 'project.get.request',
    GET_RESPONSE: 'project.get.response',
    CREATE_REQUEST: 'project.create.request',
    CREATE_RESPONSE: 'project.create.response',
    UPDATE_REQUEST: 'project.update.request',
    UPDATE_RESPONSE: 'project.update.response',
    DELETE_REQUEST: 'project.delete.request',
    DELETE_RESPONSE: 'project.delete.response'
  },

  // === CONVERSACIONES ===
  CONVERSATION: {
    CREATED: 'conversation.created',
    UPDATED: 'conversation.updated',
    DELETED: 'conversation.deleted',
    SELECTED: 'conversation.selected',

    LIST_REQUEST: 'conversation.list.request',
    LIST_RESPONSE: 'conversation.list.response',
    GET_REQUEST: 'conversation.get.request',
    GET_RESPONSE: 'conversation.get.response',
    CREATE_REQUEST: 'conversation.create.request',
    CREATE_RESPONSE: 'conversation.create.response'
  },

  // === MENSAJES DE CHAT ===
  MESSAGE: {
    SENT: 'message.sent',
    RECEIVED: 'message.received',
    AI_RECEIVED: 'message.ai.received',

    SEND_REQUEST: 'message.send.request',
    SEND_RESPONSE: 'message.send.response',
    LIST_REQUEST: 'message.list.request',
    LIST_RESPONSE: 'message.list.response'
  },

  // === ARCHIVOS ===
  FILE: {
    CREATED: 'file.created',
    UPDATED: 'file.updated',
    DELETED: 'file.deleted',
    RENAMED: 'file.renamed',

    LIST_REQUEST: 'file.list.request',
    LIST_RESPONSE: 'file.list.response',
    CONTENT_REQUEST: 'file.content.request',
    CONTENT_RESPONSE: 'file.content.response',
    CREATE_REQUEST: 'file.create.request',
    CREATE_RESPONSE: 'file.create.response',
    DELETE_REQUEST: 'file.delete.request',
    DELETE_RESPONSE: 'file.delete.response',
    SEARCH_REQUEST: 'file.search.request',
    SEARCH_RESPONSE: 'file.search.response'
  },

  // === EDITOR ===
  EDITOR: {
    OPENED: 'editor.opened',
    SAVED: 'editor.saved',
    CLOSED: 'editor.closed',
    ERROR: 'editor.error',

    OPEN_REQUEST: 'editor.open.request',
    OPEN_RESPONSE: 'editor.open.response',
    SAVE_REQUEST: 'editor.save.request',
    SAVE_RESPONSE: 'editor.save.response',
    VALIDATE_REQUEST: 'editor.validate.request',
    VALIDATE_RESPONSE: 'editor.validate.response',
    FORMAT_REQUEST: 'editor.format.request',
    FORMAT_RESPONSE: 'editor.format.response'
  },

  // === PDF ===
  PDF: {
    LOADED: 'pdf.loaded',
    ERROR: 'pdf.error',

    VIEW_REQUEST: 'pdf.view.request',
    VIEW_RESPONSE: 'pdf.view.response',
    EXTRACT_REQUEST: 'pdf.extract.request',
    EXTRACT_RESPONSE: 'pdf.extract.response',
    METADATA_REQUEST: 'pdf.metadata.request',
    METADATA_RESPONSE: 'pdf.metadata.response',
    LIST_REQUEST: 'pdf.list.request',
    LIST_RESPONSE: 'pdf.list.response'
  },

  // === AI / LLM ===
  AI: {
    CHAT_REQUEST: 'ai.chat.request',
    CHAT_RESPONSE: 'ai.chat.response',
    GENERATE_REQUEST: 'ai.generate.request',
    GENERATE_RESPONSE: 'ai.generate.response',
    PROVIDER_CHANGED: 'ai.provider.changed',
    ERROR: 'ai.error'
  },

  // === PROMPTS ===
  PROMPT: {
    CREATED: 'prompt.created',
    UPDATED: 'prompt.updated',
    DELETED: 'prompt.deleted',

    LIST_REQUEST: 'prompt.list.request',
    LIST_RESPONSE: 'prompt.list.response',
    GET_REQUEST: 'prompt.get.request',
    GET_RESPONSE: 'prompt.get.response',
    RENDER_REQUEST: 'prompt.render.request',
    RENDER_RESPONSE: 'prompt.render.response'
  },

  // === CREDENCIALES ===
  CREDENTIAL: {
    CREATED: 'credential.created',
    UPDATED: 'credential.updated',
    DELETED: 'credential.deleted',

    LIST_REQUEST: 'credential.list.request',
    LIST_RESPONSE: 'credential.list.response',
    GET_REQUEST: 'credential.get.request',
    GET_RESPONSE: 'credential.get.response',
    RESOLVE_REQUEST: 'credential.resolve.request',
    RESOLVE_RESPONSE: 'credential.resolve.response'
  },

  // === BASE DE DATOS ===
  DB: {
    QUERY_REQUEST: 'db.query.request',
    QUERY_RESPONSE: 'db.query.response',
    EXECUTE_REQUEST: 'db.execute.request',
    EXECUTE_RESPONSE: 'db.execute.response'
  },

  // === TOOLS / FUNCTIONS ===
  TOOL: {
    REGISTERED: 'tool.registered',
    UNREGISTERED: 'tool.unregistered',

    CALL_REQUEST: 'tool.call.request',
    CALL_RESPONSE: 'tool.call.response',
    CALL_SUCCESS: 'tool.call.success',
    CALL_FAILED: 'tool.call.failed',
    LIST_REQUEST: 'tool.list.request',
    LIST_RESPONSE: 'tool.list.response'
  },

  // === STORAGE ===
  STORAGE: {
    INFO_REQUEST: 'storage.info.request',
    INFO_RESPONSE: 'storage.info.response',
    UPLOAD_REQUEST: 'storage.upload.request',
    UPLOAD_RESPONSE: 'storage.upload.response'
  }
};

// ============================================
// RUTAS DE APIs HTTP - Estructura: /modules/{module}/{resource}
// ============================================

const API_ROUTES = {
  // === PROYECTOS ===
  PROJECT: {
    BASE: '/modules/project-manager',
    LIST: '/modules/project-manager/projects',
    GET: '/modules/project-manager/projects/:id',
    CREATE: '/modules/project-manager/projects',
    UPDATE: '/modules/project-manager/projects/:id',
    DELETE: '/modules/project-manager/projects/:id',
    ACTIVE: '/modules/project-manager/projects/active'
  },

  // === CONVERSACIONES ===
  CONVERSATION: {
    BASE: '/modules/conversation-manager',
    LIST: '/modules/conversation-manager/conversations',
    GET: '/modules/conversation-manager/conversations/:id',
    CREATE: '/modules/conversation-manager/conversations',
    DELETE: '/modules/conversation-manager/conversations/:id',
    MESSAGES: '/modules/conversation-manager/conversations/:id/messages'
  },

  // === ARCHIVOS ===
  FILE: {
    BASE: '/modules/file-browser',
    LIST: '/modules/file-browser/files',
    GET_CONTENT: '/modules/file-browser/files/content',
    CREATE: '/modules/file-browser/files',
    DELETE: '/modules/file-browser/files',
    SEARCH: '/modules/file-browser/files/search'
  },

  // === EDITOR ===
  EDITOR: {
    BASE: '/modules/text-editor',
    OPEN: '/modules/text-editor/editor/open',
    SAVE: '/modules/text-editor/editor/save',
    VALIDATE: '/modules/text-editor/editor/validate',
    FORMAT: '/modules/text-editor/editor/format'
  },

  // === PDF ===
  PDF: {
    BASE: '/modules/pdf-viewer',
    VIEW: '/modules/pdf-viewer/pdf/view',
    EXTRACT_TEXT: '/modules/pdf-viewer/pdf/extract-text',
    METADATA: '/modules/pdf-viewer/pdf/metadata',
    LIST: '/modules/pdf-viewer/pdf/list'
  },

  // === AI ===
  AI: {
    BASE: '/modules/ai-gateway',
    CHAT: '/modules/ai-gateway/chat',
    PROVIDERS: '/modules/ai-gateway/providers',
    PROVIDER_CURRENT: '/modules/ai-gateway/provider/current',
    CONFIG: '/modules/ai-gateway/config'
  },

  // === PROMPTS ===
  PROMPT: {
    BASE: '/modules/prompt-manager',
    LIST: '/modules/prompt-manager/prompts',
    GET: '/modules/prompt-manager/prompts/:id',
    CREATE: '/modules/prompt-manager/prompts',
    RENDER: '/modules/prompt-manager/prompts/render'
  },

  // === CREDENCIALES ===
  CREDENTIAL: {
    BASE: '/modules/credential-manager',
    LIST: '/modules/credential-manager/credentials',
    GET: '/modules/credential-manager/credentials/:key',
    CREATE: '/modules/credential-manager/credentials',
    RESOLVE: '/modules/credential-manager/credentials/resolve'
  },

  // === TOOLS ===
  TOOL: {
    BASE: '/modules/tool-orchestrator',
    LIST: '/modules/tool-orchestrator/tools',
    CALL: '/modules/tool-orchestrator/tools/call'
  }
};

// ============================================
// CAMPOS ESTÁNDAR EN REQUESTS/RESPONSES
// ============================================

const FIELDS = {
  // Campos comunes en requests
  REQUEST: {
    ID: 'request_id',
    PROJECT_ID: 'project_id',
    CONVERSATION_ID: 'conversation_id',
    FILE_PATH: 'file_path',
    CONTENT: 'content',
    TIMESTAMP: 'timestamp'
  },

  // Campos comunes en responses
  RESPONSE: {
    SUCCESS: 'success',
    DATA: 'data',
    ERROR: 'error',
    MESSAGE: 'message',
    REQUEST_ID: 'request_id'
  },

  // Campos de paginación
  PAGINATION: {
    PAGE: 'page',
    LIMIT: 'limit',
    OFFSET: 'offset',
    TOTAL: 'total',
    COUNT: 'count'
  },

  // Campos de filtrado
  FILTER: {
    QUERY: 'query',
    SEARCH: 'search',
    FILTER: 'filter',
    SORT: 'sort',
    ORDER: 'order'
  }
};

// ============================================
// CÓDIGOS Y MENSAJES DE ERROR
// ============================================

const ERRORS = {
  // Errores de validación (400)
  VALIDATION: {
    MISSING_FIELD: 'Missing required field',
    INVALID_FORMAT: 'Invalid format',
    INVALID_JSON: 'Invalid JSON',
    FILE_TOO_LARGE: 'File too large',
    UNSUPPORTED_FORMAT: 'Unsupported format'
  },

  // Errores de autenticación (401)
  AUTH: {
    UNAUTHORIZED: 'Unauthorized',
    INVALID_TOKEN: 'Invalid token',
    TOKEN_EXPIRED: 'Token expired'
  },

  // Errores de autorización (403)
  FORBIDDEN: {
    ACCESS_DENIED: 'Access denied',
    INSUFFICIENT_PERMISSIONS: 'Insufficient permissions',
    PATH_TRAVERSAL: 'Path traversal detected'
  },

  // Errores de recursos (404)
  NOT_FOUND: {
    RESOURCE_NOT_FOUND: 'Resource not found',
    FILE_NOT_FOUND: 'File not found',
    PROJECT_NOT_FOUND: 'Project not found',
    CONVERSATION_NOT_FOUND: 'Conversation not found'
  },

  // Errores del servidor (500)
  SERVER: {
    INTERNAL_ERROR: 'Internal server error',
    DATABASE_ERROR: 'Database error',
    FILE_SYSTEM_ERROR: 'File system error',
    NETWORK_ERROR: 'Network error'
  }
};

// ============================================
// CONFIGURACIONES COMUNES
// ============================================

const CONFIG = {
  // Límites de tamaño
  LIMITS: {
    MAX_FILE_SIZE: 5242880,           // 5MB
    MAX_PDF_SIZE: 52428800,           // 50MB
    MAX_MESSAGE_LENGTH: 4000,
    MAX_FILENAME_LENGTH: 255,
    MAX_PROMPT_LENGTH: 10000
  },

  // Timeouts
  TIMEOUTS: {
    API_REQUEST: 30000,               // 30 segundos
    AI_REQUEST: 120000,               // 2 minutos
    DB_QUERY: 10000,                  // 10 segundos
    FILE_OPERATION: 5000              // 5 segundos
  },

  // Formatos soportados
  FORMATS: {
    TEXT: ['md', 'txt', 'json', 'html', 'css', 'js', 'yaml', 'yml', 'xml'],
    IMAGES: ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg'],
    DOCUMENTS: ['pdf', 'doc', 'docx'],
    CODE: ['js', 'ts', 'py', 'java', 'cpp', 'c', 'go', 'rs', 'rb']
  },

  // Niveles de credenciales
  CREDENTIAL_LEVELS: {
    GLOBAL: 'GLOBAL',
    PROJECT: 'PROJECT',
    CLIENT: 'CLIENT',
    CUSTOM: 'CUSTOM'
  },

  // Estados
  STATUS: {
    PENDING: 'pending',
    IN_PROGRESS: 'in_progress',
    COMPLETED: 'completed',
    FAILED: 'failed',
    CANCELLED: 'cancelled'
  }
};

// ============================================
// HELPERS PARA CONSTRUIR EVENTOS/RUTAS
// ============================================

const HELPERS = {
  /**
   * Construye un nombre de evento completo
   * @param {string} domain - Dominio del evento (ej: 'file', 'project')
   * @param {string} action - Acción (ej: 'created', 'updated')
   * @param {string} type - Tipo opcional (ej: 'request', 'response')
   * @returns {string} Nombre completo del evento
   */
  buildEventName(domain, action, type = null) {
    return type ? `${domain}.${action}.${type}` : `${domain}.${action}`;
  },

  /**
   * Construye una ruta de API
   * @param {string} module - Nombre del módulo
   * @param {string} resource - Recurso
   * @param {Object} params - Parámetros a reemplazar
   * @returns {string} Ruta completa
   */
  buildApiRoute(module, resource, params = {}) {
    let route = `/modules/${module}/${resource}`;

    Object.keys(params).forEach(key => {
      route = route.replace(`:${key}`, params[key]);
    });

    return route;
  },

  /**
   * Construye una estructura de request estándar
   * @param {string} request_id - ID único de request
   * @param {Object} data - Datos del request
   * @returns {Object} Request estructurado
   */
  buildRequest(request_id, data = {}) {
    return {
      [FIELDS.REQUEST.ID]: request_id,
      [FIELDS.REQUEST.TIMESTAMP]: new Date().toISOString(),
      ...data
    };
  },

  /**
   * Construye una estructura de response estándar
   * @param {boolean} success - Si fue exitoso
   * @param {Object} data - Datos de respuesta
   * @param {string} error - Mensaje de error (si aplica)
   * @returns {Object} Response estructurado
   */
  buildResponse(success, data = null, error = null) {
    const response = {
      [FIELDS.RESPONSE.SUCCESS]: success
    };

    if (data !== null) {
      response[FIELDS.RESPONSE.DATA] = data;
    }

    if (error !== null) {
      response[FIELDS.RESPONSE.ERROR] = error;
    }

    return response;
  },

  /**
   * Genera un request_id único
   * @returns {string} UUID v4
   */
  generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
};

// ============================================
// AUTO-UI - Sistema de interfaces auto-generadas
// ============================================

const UI = {
  // === EVENTOS UI ===
  EVENTS: {
    // Renderizado
    RENDER_REQUEST: 'ui.render.request',
    RENDER_COMPLETE: 'ui.render.complete',
    RENDER_ERROR: 'ui.render.error',

    // Componentes
    COMPONENT_MOUNTED: 'ui.component.mounted',
    COMPONENT_UPDATED: 'ui.component.updated',
    COMPONENT_DESTROYED: 'ui.component.destroyed',
    COMPONENT_ERROR: 'ui.component.error',

    // Interacciones
    ACTION_TRIGGERED: 'ui.action.triggered',
    ACTION_COMPLETED: 'ui.action.completed',
    ACTION_FAILED: 'ui.action.failed',

    // Estado
    STATE_CHANGED: 'ui.state.changed',
    THEME_CHANGED: 'ui.theme.changed',
    VIEW_CHANGED: 'ui.view.changed',

    // Real-time
    SSE_CONNECTED: 'ui.sse.connected',
    SSE_DISCONNECTED: 'ui.sse.disconnected',
    SSE_MESSAGE: 'ui.sse.message',
    SSE_ERROR: 'ui.sse.error'
  },

  // === TIPOS DE COMPONENTES ===
  COMPONENTS: {
    // Core - Elementos básicos
    BUTTON: 'button',
    INPUT: 'input',
    SELECT: 'select',
    CHECKBOX: 'checkbox',
    RADIO: 'radio',
    TEXTAREA: 'textarea',
    TOGGLE: 'toggle',

    // Layout - Estructura
    CARD: 'card',
    MODAL: 'modal',
    SIDEBAR: 'sidebar',
    GRID: 'grid',
    TABS: 'tabs',
    ACCORDION: 'accordion',
    DRAWER: 'drawer',
    DIVIDER: 'divider',

    // Data - Visualización de datos
    TABLE: 'table',
    LIST: 'list',
    TREE: 'tree',
    PAGINATION: 'pagination',
    FILTER: 'filter',
    SORT: 'sort',

    // Feedback - Retroalimentación
    TOAST: 'toast',
    PROGRESS: 'progress',
    SKELETON: 'skeleton',
    SPINNER: 'spinner',
    EMPTY_STATE: 'empty-state',
    BADGE: 'badge',
    TOOLTIP: 'tooltip',
    ALERT: 'alert',

    // Form - Formularios
    FORM: 'form',
    FIELD: 'field',
    LABEL: 'label',
    ERROR_MESSAGE: 'error-message',

    // Navigation
    NAV: 'nav',
    BREADCRUMB: 'breadcrumb',
    MENU: 'menu',
    DROPDOWN: 'dropdown'
  },

  // === INTERACCIONES ===
  INTERACTIONS: {
    // Mouse
    CLICK: 'click',
    DOUBLE_CLICK: 'dblclick',
    HOLD: 'hold',
    HOVER: 'hover',
    CONTEXT_MENU: 'contextmenu',

    // Touch
    TAP: 'tap',
    LONG_PRESS: 'longpress',
    SWIPE_LEFT: 'swipe-left',
    SWIPE_RIGHT: 'swipe-right',
    SWIPE_UP: 'swipe-up',
    SWIPE_DOWN: 'swipe-down',
    PINCH: 'pinch',

    // Drag & Drop
    DRAG_START: 'dragstart',
    DRAG: 'drag',
    DRAG_END: 'dragend',
    DROP: 'drop',

    // Form
    FOCUS: 'focus',
    BLUR: 'blur',
    CHANGE: 'change',
    INPUT: 'input',
    SUBMIT: 'submit',

    // Keyboard
    KEY_DOWN: 'keydown',
    KEY_UP: 'keyup',
    KEY_PRESS: 'keypress'
  },

  // === ACCIONES ===
  ACTIONS: {
    // Navegación
    NAVIGATE: 'navigate',
    BACK: 'back',
    FORWARD: 'forward',
    REFRESH: 'refresh',
    REDIRECT: 'redirect',

    // CRUD
    CREATE: 'create',
    READ: 'read',
    UPDATE: 'update',
    DELETE: 'delete',
    LIST: 'list',

    // UI Modales
    OPEN_MODAL: 'open-modal',
    CLOSE_MODAL: 'close-modal',
    OPEN_DRAWER: 'open-drawer',
    CLOSE_DRAWER: 'close-drawer',

    // UI Feedback
    SHOW_TOAST: 'show-toast',
    SHOW_ALERT: 'show-alert',
    SHOW_CONFIRM: 'show-confirm',
    SHOW_LOADING: 'show-loading',
    HIDE_LOADING: 'hide-loading',

    // UI Toggle
    TOGGLE: 'toggle',
    EXPAND: 'expand',
    COLLAPSE: 'collapse',
    SHOW: 'show',
    HIDE: 'hide',

    // Datos
    FETCH: 'fetch',
    SUBMIT: 'submit',
    VALIDATE: 'validate',
    RESET: 'reset',
    CLEAR: 'clear',

    // Selección
    SELECT: 'select',
    DESELECT: 'deselect',
    SELECT_ALL: 'select-all',
    DESELECT_ALL: 'deselect-all',

    // Eventos
    EMIT: 'emit',
    SUBSCRIBE: 'subscribe',
    UNSUBSCRIBE: 'unsubscribe',

    // Clipboard
    COPY: 'copy',
    PASTE: 'paste',
    CUT: 'cut',

    // Export
    EXPORT_CSV: 'export-csv',
    EXPORT_JSON: 'export-json',
    EXPORT_PDF: 'export-pdf',
    PRINT: 'print'
  },

  // === TIPOS DE VISTAS ===
  VIEWS: {
    LIST: 'list',
    DETAIL: 'detail',
    FORM: 'form',
    DASHBOARD: 'dashboard',
    KANBAN: 'kanban',
    CALENDAR: 'calendar',
    TIMELINE: 'timeline',
    GRID: 'grid',
    CHART: 'chart'
  },

  // === VARIANTES DE COMPONENTES ===
  VARIANTS: {
    PRIMARY: 'primary',
    SECONDARY: 'secondary',
    SUCCESS: 'success',
    WARNING: 'warning',
    DANGER: 'danger',
    INFO: 'info',
    GHOST: 'ghost',
    OUTLINE: 'outline',
    LINK: 'link'
  },

  // === TAMAÑOS ===
  SIZES: {
    XS: 'xs',
    SM: 'sm',
    MD: 'md',
    LG: 'lg',
    XL: 'xl',
    FULL: 'full'
  },

  // === RUTAS AUTO-UI ===
  ROUTES: {
    BASE: '/auto-ui',
    DASHBOARD: '/auto-ui',
    MODULE: '/auto-ui/:module',
    MODULE_VIEW: '/auto-ui/:module/:view',
    MODULE_ITEM: '/auto-ui/:module/:view/:id',
    EVENTS_SSE: '/auto-ui/events',
    THEME: '/auto-ui/theme',
    COMPONENTS: '/auto-ui/components',
    FORM: '/auto-ui/:module/form',
    FORM_EDIT: '/auto-ui/:module/form/:id'
  },

  // === CONFIGURACIÓN UI ===
  CONFIG: {
    // Interacciones
    HOLD_DURATION: 2000,
    DOUBLE_CLICK_DELAY: 300,
    DEBOUNCE_DELAY: 300,
    THROTTLE_DELAY: 100,

    // Feedback
    TOAST_DURATION: 3000,
    TOAST_MAX: 5,
    LOADING_DELAY: 200,

    // Animaciones
    ANIMATION_FAST: 150,
    ANIMATION_NORMAL: 250,
    ANIMATION_SLOW: 350,

    // SSE
    SSE_RECONNECT_DELAY: 1000,
    SSE_MAX_RETRIES: 5,

    // Paginación
    PAGE_SIZES: [10, 25, 50, 100],
    DEFAULT_PAGE_SIZE: 25,

    // Validación
    VALIDATE_ON_BLUR: true,
    VALIDATE_ON_CHANGE: false,
    VALIDATE_ON_SUBMIT: true
  },

  // === HELPERS UI ===
  HELPERS: {
    /**
     * Construye una ruta Auto-UI
     */
    buildRoute(module, view = null, id = null) {
      let route = `/auto-ui/${module}`;
      if (view) route += `/${view}`;
      if (id) route += `/${id}`;
      return route;
    },

    /**
     * Construye un evento UI
     */
    buildEvent(component, action) {
      return `ui.${component}.${action}`;
    },

    /**
     * Genera ID único para componente
     */
    generateComponentId(type) {
      return `${type}-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
    },

    /**
     * Construye data-attributes para interacciones
     */
    buildDataAttributes(interactions) {
      return Object.entries(interactions)
        .map(([event, config]) => `data-${event}='${JSON.stringify(config)}'`)
        .join(' ');
    }
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  EVENTS,
  API_ROUTES,
  FIELDS,
  ERRORS,
  CONFIG,
  HELPERS,
  UI
};
