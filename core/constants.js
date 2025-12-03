/**
 * CONSTANTES CENTRALIZADAS DEL SISTEMA
 *
 * ⚠️  ARCHIVO AUTO-GENERADO - NO EDITAR MANUALMENTE
 *
 * Generado por: scripts/generate-constants.js
 * Fuente: module.json de cada módulo
 *
 * Para regenerar: npm run generate:constants
 *
 * Este archivo es la ÚNICA fuente de verdad para:
 * - Nombres de eventos MQTT
 * - Rutas de APIs HTTP
 */

// ============================================
// EVENTOS MQTT - Generados desde module.json
// ============================================

const EVENTS = {
  // === AI ===
  AI: {
    ERROR: 'ai.error',
    PROVIDERS: 'ai.providers',
    REQUEST: 'ai.request',
    RESPONSE: 'ai.response',
    USAGE: 'ai.usage',
  },

  // === BOTON ===
  BOTON: {
    PULSADO: 'boton.pulsado',
  },

  // === CAJA ===
  CAJA: {
    CERRADA: 'caja.cerrada',
  },

  // === CATALOGO ===
  CATALOGO: {
    ACTUALIZADO: 'catalogo.actualizado',
  },

  // === CATEGORIA ===
  CATEGORIA: {
    ACTUALIZADA: 'categoria.actualizada',
    CREADA: 'categoria.creada',
    LISTAR: 'categoria.listar',
    OBTENER: 'categoria.obtener',
    ORDEN_ACTUALIZADO: 'categoria.orden_actualizado',
  },

  // === COBRO ===
  COBRO: {
    COMPLETADO: 'cobro.completado',
    FALLIDO: 'cobro.fallido',
    INICIADO: 'cobro.iniciado',
    LISTAR: 'cobro.listar',
    OBTENER: 'cobro.obtener',
    POR_CUENTA: 'cobro.por_cuenta',
    PROCESADO: 'cobro.procesado',
    REEMBOLSADO: 'cobro.reembolsado',
  },

  // === COCINA ===
  COCINA: {
    ACTIVOS: 'cocina.activos',
    HISTORIAL: 'cocina.historial',
    ITEM_PREPARADO: 'cocina.item_preparado',
    PEDIDO_LISTO: 'cocina.pedido_listo',
  },

  // === CONVERSATIONS ===
  CONVERSATIONS: {
    LIST: 'conversations.list',
  },

  // === CREDENTIAL ===
  CREDENTIAL: {
    DELETED: 'credential.deleted',
    RESOLVED: 'credential.resolved',
    RESOLVE_FAILED: 'credential.resolve.failed',
    RESOLVE_REQUEST: 'credential.resolve.request',
    RESOLVE_RESPONSE: 'credential.resolve.response',
    SAVED: 'credential.saved',
    UPDATED: 'credential.updated',
  },

  // === CUENTA ===
  CUENTA: {
    ACTUALIZADA: 'cuenta.actualizada',
    CERRADA: 'cuenta.cerrada',
    CREADA: 'cuenta.creada',
    ELIMINADA: 'cuenta.eliminada',
    ESTADO_CAMBIADO: 'cuenta.estado_cambiado',
    LISTAR: 'cuenta.listar',
    OBTENER: 'cuenta.obtener',
  },

  // === DIA ===
  DIA: {
    INICIADO: 'dia.iniciado',
  },

  // === FUNCTION ===
  FUNCTION: {
    EXECUTED: 'function.executed',
    EXECUTE_REQUEST: 'function.execute.request',
    EXECUTE_RESPONSE: 'function.execute.response',
    FAILED: 'function.failed',
    GENERATED: 'function.generated',
    GENERATION_ERROR: 'function.generation.error',
    GET_REQUEST: 'function.get.request',
    GET_RESPONSE: 'function.get.response',
    LIST_REQUEST: 'function.list.request',
    LIST_RESPONSE: 'function.list.response',
  },

  // === INGREDIENTE ===
  INGREDIENTE: {
    ACTUALIZADO: 'ingrediente.actualizado',
    BUSCAR: 'ingrediente.buscar',
    CREADO: 'ingrediente.creado',
    LISTAR: 'ingrediente.listar',
    OBTENER: 'ingrediente.obtener',
  },

  // === LLEVAR ===
  LLEVAR: {
    ACTIVOS: 'llevar.activos',
    LISTOS: 'llevar.listos',
    TICKET_CREADO: 'llevar.ticket_creado',
    TICKET_ENTREGADO: 'llevar.ticket_entregado',
    TICKET_LISTO: 'llevar.ticket_listo',
  },

  // === MENU ===
  MENU: {
    ERROR: 'menu.error',
    GENERADO: 'menu.generado',
    OBTENER_ULTIMO: 'menu.obtener_ultimo',
    VALIDADO: 'menu.validado',
  },

  // === MENU-GENERATOR ===
  MENU_GENERATOR: {
    CONVERSATION_CREATED: 'menu-generator.conversation.created',
    MENU_CREATED: 'menu-generator.menu.created',
    MENU_EXPORTED: 'menu-generator.menu.exported',
    MESSAGE_RECEIVED: 'menu-generator.message.received',
    MESSAGE_SENT: 'menu-generator.message.sent',
  },

  // === MESA ===
  MESA: {
    ABIERTA: 'mesa.abierta',
    CAMARERO_ASIGNADO: 'mesa.camarero_asignado',
    CERRADA: 'mesa.cerrada',
  },

  // === MESAS ===
  MESAS: {
    DISPONIBLES: 'mesas.disponibles',
    OCUPADAS: 'mesas.ocupadas',
  },

  // === METRICAS ===
  METRICAS: {
    ALERTA: 'metricas.alerta',
    COUNTERS: 'metricas.counters',
    GAUGES: 'metricas.gauges',
    OBTENER: 'metricas.obtener',
    SNAPSHOT: 'metricas.snapshot',
  },

  // === NOTA ===
  NOTA: {
    ACTUALIZADA: 'nota.actualizada',
    CREADA: 'nota.creada',
    ELIMINADA: 'nota.eliminada',
    LISTAR: 'nota.listar',
    OBTENER: 'nota.obtener',
  },

  // === PEDIDO ===
  PEDIDO: {
    CANCELADO: 'pedido.cancelado',
    COMPLETADO: 'pedido.completado',
    CREADO: 'pedido.creado',
    ENVIADO_COCINA: 'pedido.enviado_cocina',
    ITEM_ACTUALIZADO: 'pedido.item_actualizado',
    ITEM_AGREGADO: 'pedido.item_agregado',
    ITEM_ELIMINADO: 'pedido.item_eliminado',
    LISTAR: 'pedido.listar',
    OBTENER: 'pedido.obtener',
    POR_CUENTA: 'pedido.por_cuenta',
  },

  // === PERSISTENCIA ===
  PERSISTENCIA: {
    CUADRE_CAJA: 'persistencia.cuadre_caja',
    EVENTOS: 'persistencia.eventos',
    VENTAS: 'persistencia.ventas',
  },

  // === PLUGIN ===
  PLUGIN: {
    ERROR: 'plugin.error',
    GET_REQUEST: 'plugin.get.request',
    GET_RESPONSE: 'plugin.get.response',
    LIST_REQUEST: 'plugin.list.request',
    LIST_RESPONSE: 'plugin.list.response',
    LOADED: 'plugin.loaded',
    RELOADED: 'plugin.reloaded',
    UNLOADED: 'plugin.unloaded',
  },

  // === PRODUCTO ===
  PRODUCTO: {
    ACTUALIZADO: 'producto.actualizado',
    BUSCAR: 'producto.buscar',
    CREADO: 'producto.creado',
    ELIMINADO: 'producto.eliminado',
    LISTAR: 'producto.listar',
    OBTENER: 'producto.obtener',
  },

  // === TELEFONO ===
  TELEFONO: {
    CONTACTOS: 'telefono.contactos',
    CONTACTO_IDENTIFICADO: 'telefono.contacto_identificado',
    LISTO_PARA_RECOGER: 'telefono.listo_para_recoger',
    LLAMADA_DETECTADA: 'telefono.llamada_detectada',
    PEDIDO_CREADO: 'telefono.pedido_creado',
    PENDIENTES: 'telefono.pendientes',
  },

  // === TEMPLATES ===
  TEMPLATES: {
    LIST: 'templates.list',
  },

  // === TOOL ===
  TOOL: {
    CALL_FAILED: 'tool.call.failed',
    CALL_REQUEST: 'tool.call.request',
    CALL_RESPONSE: 'tool.call.response',
    CALL_SUCCESS: 'tool.call.success',
    GET_REQUEST: 'tool.get.request',
    GET_RESPONSE: 'tool.get.response',
    LIST_REQUEST: 'tool.list.request',
    LIST_RESPONSE: 'tool.list.response',
    REGISTERED: 'tool.registered',
    UNREGISTERED: 'tool.unregistered',
  },

  // === UI ===
  UI: {
    ACCION: 'ui.accion',
    RENDERED: 'ui.rendered',
    RENDER_ERROR: 'ui.render_error',
  },

  // === VARIACION ===
  VARIACION: {
    CALCULAR_PRECIO: 'variacion.calcular_precio',
    RECHAZADA: 'variacion.rechazada',
    VALIDADA: 'variacion.validada',
    VALIDAR: 'variacion.validar',
  },

  // === WILDCARD ===
  WILDCARD: {
    ACTUALIZADO: '*.actualizado',
    COMPLETADO: '*.completado',
    CREADO: '*.creado',
    ELIMINADO: '*.eliminado',
    ERROR: '*.error',
  },

};

// ============================================
// RUTAS DE APIs HTTP - Generadas desde module.json
// ============================================

const API_ROUTES = {
  ADMIN: {
    BASE: '/modules/admin-panel',
    UI: '/modules/admin-panel/',
    DASHBOARD_DATA: '/modules/admin-panel/api/dashboard',
    LIST_MODULES: '/modules/admin-panel/api/modules',
    LIST_PLUGINS: '/modules/admin-panel/api/plugins',
    TOGGLE_PLUGIN: '/modules/admin-panel/api/plugins/:name/toggle',
    LIST_AGENTS: '/modules/admin-panel/api/agents',
    CREATE_AGENT: '/modules/admin-panel/api/agents',
    DELETE_AGENT: '/modules/admin-panel/api/agents/:id',
    LIST_PROMPTS: '/modules/admin-panel/api/prompts',
    GET_PROMPT: '/modules/admin-panel/api/prompts/:name',
    CREATE_PROMPT: '/modules/admin-panel/api/prompts',
    UPDATE_PROMPT: '/modules/admin-panel/api/prompts/:name',
  },

  AGENT: {
    BASE: '/modules/ai-agent-framework',
    REGISTER_AGENT: '/modules/ai-agent-framework/agents',
    LIST_AGENTS: '/modules/ai-agent-framework/agents',
    GET_AGENT: '/modules/ai-agent-framework/agents/:id',
    UPDATE_AGENT: '/modules/ai-agent-framework/agents/:id',
    DELETE_AGENT: '/modules/ai-agent-framework/agents/:id',
    TRIGGER_AGENT: '/modules/ai-agent-framework/agents/:id/trigger',
    GET_CONTEXT: '/modules/ai-agent-framework/agents/:id/context',
    CLEAR_CONTEXT: '/modules/ai-agent-framework/agents/:id/context',
    LIST_TOOLS: '/modules/ai-agent-framework/tools',
    GET_AGENT_STATS: '/modules/ai-agent-framework/agents/:id/stats',
  },

  AI: {
    BASE: '/modules/ai-gateway',
    CHAT_COMPLETION: '/modules/ai-gateway/chat',
    CHAT_STREAM: '/modules/ai-gateway/chat/stream',
    LIST_PROVIDERS: '/modules/ai-gateway/providers',
    LIST_MODELS: '/modules/ai-gateway/models',
    GET_USAGE: '/modules/ai-gateway/usage',
    TEST_PROVIDER: '/modules/ai-gateway/providers/test',
    HEALTH_CHECK: '/modules/ai-gateway/health',
    GET_METRICS: '/modules/ai-gateway/metrics',
  },

  CALLING: {
    BASE: '/modules/calling-generator',
    LIST_FUNCTIONS: '/modules/calling-generator/functions',
    GET_FUNCTION: '/modules/calling-generator/functions/:name',
    EXECUTE_FUNCTION: '/modules/calling-generator/functions/:name/execute',
    HEALTH_CHECK: '/modules/calling-generator/health',
    GET_METRICS: '/modules/calling-generator/metrics',
  },

  CATEGORIA: {
    BASE: '/modules/categorias',
    LIST_CATEGORIAS: '/modules/categorias/categorias',
    GET_CATEGORIA: '/modules/categorias/categorias/:id',
    CREATE_CATEGORIA: '/modules/categorias/categorias',
    UPDATE_CATEGORIA: '/modules/categorias/categorias/:id',
    REORDER_CATEGORIAS: '/modules/categorias/categorias/reorder',
    HEALTH_CHECK: '/modules/categorias/health',
    GET_METRICS: '/modules/categorias/metrics',
  },

  COBRO: {
    BASE: '/modules/cobros',
    INICIAR_COBRO: '/modules/cobros/cobros',
    LIST_COBROS: '/modules/cobros/cobros',
    GET_COBRO: '/modules/cobros/cobros/:id',
    CONFIRMAR_COBRO: '/modules/cobros/cobros/:id/confirmar',
    REEMBOLSAR_COBRO: '/modules/cobros/cobros/:id/reembolsar',
    LIST_METODOS_PAGO: '/modules/cobros/metodos-pago',
    HEALTH_CHECK: '/modules/cobros/health',
    GET_METRICS: '/modules/cobros/metrics',
  },

  COCINA: {
    BASE: '/modules/cocina',
    GET_ACTIVOS: '/modules/cocina/cocina/activos',
    GET_HISTORIAL: '/modules/cocina/cocina/historial',
    GET_PEDIDO: '/modules/cocina/cocina/pedidos/:pedido_id',
    PREPARAR_ITEM: '/modules/cocina/cocina/items/:item_id/preparar',
    MARCAR_LISTO: '/modules/cocina/cocina/pedidos/:pedido_id/listo',
    S_S_E_STREAM: '/modules/cocina/cocina/stream',
    HEALTH_CHECK: '/modules/cocina/health',
    GET_METRICS: '/modules/cocina/metrics',
  },

  COMANDERO: {
    BASE: '/modules/comandero',
    GET_PEDIDO: '/modules/comandero/pedido/:cuenta_id',
    ADD_ITEM: '/modules/comandero/pedido/:cuenta_id/items',
    REMOVE_ITEM: '/modules/comandero/pedido/:cuenta_id/items/:item_id',
    ENVIAR_COCINA: '/modules/comandero/pedido/:cuenta_id/enviar',
    HEALTH_CHECK: '/modules/comandero/health',
  },

  CREDENTIAL: {
    BASE: '/modules/credential-manager',
    SAVE_CREDENTIAL: '/modules/credential-manager/credentials',
    RESOLVE_CREDENTIAL: '/modules/credential-manager/credentials/resolve',
    LIST_CREDENTIALS: '/modules/credential-manager/credentials',
    UPDATE_CREDENTIAL: '/modules/credential-manager/credentials/:key',
    DELETE_CREDENTIAL: '/modules/credential-manager/credentials/:key',
    GET_LEVELS: '/modules/credential-manager/credentials/levels',
    HEALTH_CHECK: '/modules/credential-manager/health',
    GET_METRICS: '/modules/credential-manager/metrics',
  },

  CUENTA: {
    BASE: '/modules/cuentas',
    CREATE_CUENTA: '/modules/cuentas/cuentas',
    LIST_CUENTAS: '/modules/cuentas/cuentas',
    GET_CUENTA: '/modules/cuentas/cuentas/:id',
    DELETE_CUENTA: '/modules/cuentas/cuentas/:id',
    GET_STATS: '/modules/cuentas/stats',
    HEALTH_CHECK: '/modules/cuentas/health',
    GET_METRICS: '/modules/cuentas/metrics',
  },

  CUENTA_LLEVAR: {
    BASE: '/modules/cuentas-llevar',
    CREAR_TICKET: '/modules/cuentas-llevar/llevar/crear-ticket',
    MARCAR_LISTO: '/modules/cuentas-llevar/llevar/:id/listo',
    ENTREGAR: '/modules/cuentas-llevar/llevar/:id/entregar',
    GET_ACTIVOS: '/modules/cuentas-llevar/llevar/activos',
    GET_LISTOS: '/modules/cuentas-llevar/llevar/listos',
    GET_TICKET: '/modules/cuentas-llevar/llevar/:id',
    DISPLAY: '/modules/cuentas-llevar/llevar/display',
    HEALTH_CHECK: '/modules/cuentas-llevar/health',
    GET_METRICS: '/modules/cuentas-llevar/metrics',
  },

  CUENTA_MESA: {
    BASE: '/modules/cuentas-mesa',
    ABRIR_MESA: '/modules/cuentas-mesa/mesas/abrir',
    ASIGNAR_CAMARERO: '/modules/cuentas-mesa/mesas/:id/asignar-camarero',
    CERRAR_MESA: '/modules/cuentas-mesa/mesas/:id/cerrar',
    GET_DISPONIBLES: '/modules/cuentas-mesa/mesas/disponibles',
    GET_OCUPADAS: '/modules/cuentas-mesa/mesas/ocupadas',
    GET_MESA: '/modules/cuentas-mesa/mesas/:numero',
    LIST_ALL: '/modules/cuentas-mesa/mesas',
    HEALTH_CHECK: '/modules/cuentas-mesa/health',
    GET_METRICS: '/modules/cuentas-mesa/metrics',
  },

  CUENTA_TELEFONO: {
    BASE: '/modules/cuentas-telefono',
    LLAMADA_ENTRANTE: '/modules/cuentas-telefono/telefono/llamada-entrante',
    CREAR_PEDIDO: '/modules/cuentas-telefono/telefono/crear-pedido',
    GET_PENDIENTES: '/modules/cuentas-telefono/telefono/pendientes',
    GET_PEDIDO: '/modules/cuentas-telefono/telefono/:id',
    MARCAR_LISTO: '/modules/cuentas-telefono/telefono/:id/listo',
    GET_CONTACTOS: '/modules/cuentas-telefono/telefono/contactos',
    GUARDAR_CONTACTO: '/modules/cuentas-telefono/telefono/contactos',
    HEALTH_CHECK: '/modules/cuentas-telefono/health',
    GET_METRICS: '/modules/cuentas-telefono/metrics',
  },

  INGREDIENTE: {
    BASE: '/modules/ingredientes',
    LIST_INGREDIENTES: '/modules/ingredientes/ingredientes',
    GET_INGREDIENTE: '/modules/ingredientes/ingredientes/:id',
    SEARCH_INGREDIENTES: '/modules/ingredientes/ingredientes/search',
    LIST_ALERGENOS: '/modules/ingredientes/alergenos',
    UPDATE_INGREDIENTE: '/modules/ingredientes/ingredientes/:id',
    HEALTH_CHECK: '/modules/ingredientes/health',
    GET_METRICS: '/modules/ingredientes/metrics',
  },

  MENU: {
    BASE: '/modules/menu-generator',
    UPLOAD_MENU: '/modules/menu-generator/upload',
    LIST_MENUS: '/modules/menu-generator/menus',
    GET_MENU: '/modules/menu-generator/menus/:id',
    VALIDATE_MENU: '/modules/menu-generator/menus/:id/validate',
    EXPORT_MENU: '/modules/menu-generator/menus/:id/export',
    LIST_CONVERSATIONS: '/modules/menu-generator/conversations',
    CREATE_CONVERSATION: '/modules/menu-generator/conversations',
    GET_CONVERSATION: '/modules/menu-generator/conversations/:id',
    DELETE_CONVERSATION: '/modules/menu-generator/conversations/:id',
    GET_MESSAGES: '/modules/menu-generator/conversations/:id/messages',
    SEND_MESSAGE: '/modules/menu-generator/conversations/:id/messages',
    STREAM: '/modules/menu-generator/stream',
    GET_TEMPLATES: '/modules/menu-generator/templates',
    GET_TEMPLATE: '/modules/menu-generator/templates/:id',
    GET_HISTORY: '/modules/menu-generator/history',
    HEALTH_CHECK: '/modules/menu-generator/health',
    GET_METRICS: '/modules/menu-generator/metrics',
  },

  METRICAS: {
    BASE: '/modules/metricas',
    GET_ALL_METRICS: '/modules/metricas/metrics',
    GET_COUNTERS: '/modules/metricas/metrics/counters',
    GET_GAUGES: '/modules/metricas/metrics/gauges',
    GET_TIMINGS: '/modules/metricas/metrics/timings',
    GET_EVENT_METRICS: '/modules/metricas/metrics/eventos',
    RESET_METRICS: '/modules/metricas/metrics/reset',
    HEALTH_CHECK: '/modules/metricas/health',
  },

  NOTAS: {
    BASE: '/modules/notas',
    LIST_NOTAS: '/modules/notas/notas',
    GET_NOTA: '/modules/notas/notas/:id',
    CREATE_NOTA: '/modules/notas/notas',
    UPDATE_NOTA: '/modules/notas/notas/:id',
    DELETE_NOTA: '/modules/notas/notas/:id',
    TOGGLE_PIN: '/modules/notas/notas/:id/pin',
    HEALTH_CHECK: '/modules/notas/health',
    GET_METRICS: '/modules/notas/metrics',
  },

  PEDIDO: {
    BASE: '/modules/pedidos',
    CREATE_PEDIDO: '/modules/pedidos/pedidos',
    LIST_PEDIDOS: '/modules/pedidos/pedidos',
    GET_PEDIDO: '/modules/pedidos/pedidos/:id',
    AGREGAR_ITEM: '/modules/pedidos/pedidos/:id/items',
    ACTUALIZAR_ITEM: '/modules/pedidos/pedidos/:id/items/:item_id',
    ELIMINAR_ITEM: '/modules/pedidos/pedidos/:id/items/:item_id',
    ENVIAR_COCINA: '/modules/pedidos/pedidos/:id/enviar-cocina',
    COMPLETAR_PEDIDO: '/modules/pedidos/pedidos/:id/completar',
    CANCELAR_PEDIDO: '/modules/pedidos/pedidos/:id/cancelar',
    CALCULAR_TOTAL: '/modules/pedidos/pedidos/:id/total',
    HEALTH_CHECK: '/modules/pedidos/health',
    GET_METRICS: '/modules/pedidos/metrics',
  },

  PERSISTENCIA: {
    BASE: '/modules/persistencia-comandero',
    GET_CUENTAS_ACTIVAS: '/modules/persistencia-comandero/cuentas-activas',
    GET_EVENTOS: '/modules/persistencia-comandero/eventos',
    GET_EVENTOS_FECHA: '/modules/persistencia-comandero/eventos/:fecha',
    GET_VENTAS: '/modules/persistencia-comandero/ventas',
    GET_VENTAS_FECHA: '/modules/persistencia-comandero/ventas/:fecha',
    CUADRE_CAJA: '/modules/persistencia-comandero/cuadre-caja',
    CUADRE_CAJA_FECHA: '/modules/persistencia-comandero/cuadre-caja/:fecha',
    CIERRE_CAJA: '/modules/persistencia-comandero/cierre-caja',
    INICIAR_DIA: '/modules/persistencia-comandero/iniciar-dia',
    BACKUP: '/modules/persistencia-comandero/backup',
    HEALTH_CHECK: '/modules/persistencia-comandero/health',
    GET_METRICS: '/modules/persistencia-comandero/metrics',
  },

  PLUGIN: {
    BASE: '/modules/plugin-manager',
    GET_PLUGIN: '/modules/plugin-manager/plugins/:name',
    LIST_PLUGINS: '/modules/plugin-manager/plugins',
    RELOAD_PLUGINS: '/modules/plugin-manager/plugins/reload',
    HEALTH_CHECK: '/modules/plugin-manager/health',
    GET_METRICS: '/modules/plugin-manager/metrics',
  },

  PRODUCTO: {
    BASE: '/modules/productos',
    LIST_PRODUCTOS: '/modules/productos/productos',
    GET_PRODUCTO: '/modules/productos/productos/:id',
    SEARCH_PRODUCTOS: '/modules/productos/productos/search',
    LIST_CATEGORIAS: '/modules/productos/categorias',
    LIST_INGREDIENTES: '/modules/productos/ingredientes',
    LIST_PIZZAS: '/modules/productos/pizzas',
    UPDATE_PRODUCTO: '/modules/productos/productos/:id',
    DELETE_PRODUCTO: '/modules/productos/productos/:id',
    GET_STATS: '/modules/productos/stats',
    HEALTH_CHECK: '/modules/productos/health',
    GET_METRICS: '/modules/productos/metrics',
  },

  PROMPT: {
    BASE: '/modules/prompt-manager',
    CREATE_PROMPT: '/modules/prompt-manager/prompts',
    LIST_PROMPTS: '/modules/prompt-manager/prompts',
    GET_PROMPT: '/modules/prompt-manager/prompts/:id',
    UPDATE_PROMPT: '/modules/prompt-manager/prompts/:id',
    DELETE_PROMPT: '/modules/prompt-manager/prompts/:id',
    LIST_VERSIONS: '/modules/prompt-manager/prompts/:id/versions',
    RENDER_TEMPLATE: '/modules/prompt-manager/prompts/:id/render',
    GET_ANALYTICS: '/modules/prompt-manager/analytics',
    COMPARE_PROMPTS: '/modules/prompt-manager/prompts/compare',
  },

  TOOL: {
    BASE: '/modules/tool-orchestrator',
    LIST_TOOLS: '/modules/tool-orchestrator/tools',
    GET_TOOL: '/modules/tool-orchestrator/tools/:name',
    CALL_TOOL: '/modules/tool-orchestrator/tools/:name/call',
    REGISTER_TOOL: '/modules/tool-orchestrator/tools/register',
    UNREGISTER_TOOL: '/modules/tool-orchestrator/tools/:name',
    HEALTH_CHECK: '/modules/tool-orchestrator/health',
    GET_METRICS: '/modules/tool-orchestrator/metrics',
  },

  UI: {
    BASE: '/modules/ui-renderer',
    RENDER_U_I: '/modules/ui-renderer/ui/:module/:view?',
    GET_COMPONENT: '/modules/ui-renderer/component/:name',
    RENDER_COMPONENT: '/modules/ui-renderer/component/:name/render',
    LIST_COMPONENTS: '/modules/ui-renderer/components',
    HEALTH_CHECK: '/modules/ui-renderer/health',
    GET_METRICS: '/modules/ui-renderer/metrics',
  },

  VARIACION: {
    BASE: '/modules/variaciones',
    GET_VARIACIONES_PRODUCTO: '/modules/variaciones/productos/:producto_id/variaciones',
    VALIDAR_VARIACION: '/modules/variaciones/validar',
    CALCULAR_PRECIO: '/modules/variaciones/calcular-precio',
    HEALTH_CHECK: '/modules/variaciones/health',
    GET_METRICS: '/modules/variaciones/metrics',
  },

};

// ============================================
// REGISTRO DE MÓDULOS
// ============================================

const MODULES = {
  'admin-panel': {
    version: '1.0.0',
    events: {
      publishes: [],
      subscribes: [],
    },
  },
  'ai-agent-framework': {
    version: '1.0.0',
    events: {
      publishes: [],
      subscribes: [],
    },
  },
  'ai-gateway': {
    version: '1.0.0',
    events: {
      publishes: [],
      subscribes: [],
    },
  },
  'calling-generator': {
    version: '2.0.0',
    events: {
      publishes: ['function.generated', 'function.executed', 'function.failed', 'function.generation.error', 'function.get.response', 'function.list.response', 'function.execute.response'],
      subscribes: ['plugin.loaded', 'function.get.request', 'function.list.request', 'function.execute.request'],
    },
  },
  'credential-manager': {
    version: '2.0.0',
    events: {
      publishes: ['credential.saved', 'credential.updated', 'credential.deleted', 'credential.resolved', 'credential.resolve.failed', 'credential.resolve.response'],
      subscribes: ['credential.resolve.request'],
    },
  },
  'dashboard': {
    version: '2.0.0',
    events: {
      publishes: [],
      subscribes: [],
    },
  },
  'menu-generator': {
    version: '2.0.0',
    events: {
      publishes: ['ai.request', 'menu.generado', 'menu.validado', 'menu.error', 'menu-generator.conversation.created', 'menu-generator.message.sent', 'menu-generator.message.received', 'menu-generator.menu.created', 'menu-generator.menu.exported'],
      subscribes: ['ai.response', 'menu.obtener_ultimo', 'conversations.list', 'templates.list'],
    },
  },
  'metricas': {
    version: '1.0.0',
    events: {
      publishes: ['metricas.snapshot', 'metricas.alerta'],
      subscribes: ['*.creado', '*.actualizado', '*.eliminado', '*.error', '*.completado', 'metricas.obtener', 'metricas.counters', 'metricas.gauges'],
    },
  },
  'notas': {
    version: '1.0.0',
    events: {
      publishes: ['nota.creada', 'nota.actualizada', 'nota.eliminada'],
      subscribes: ['nota.obtener', 'nota.listar'],
    },
  },
  'plugin-manager': {
    version: '2.0.0',
    events: {
      publishes: ['plugin.loaded', 'plugin.unloaded', 'plugin.error', 'plugin.reloaded', 'plugin.get.response', 'plugin.list.response'],
      subscribes: ['plugin.get.request', 'plugin.list.request'],
    },
  },
  'prompt-manager': {
    version: '1.0.0',
    events: {
      publishes: [],
      subscribes: [],
    },
  },
  'tool-orchestrator': {
    version: '2.0.0',
    events: {
      publishes: ['tool.registered', 'tool.unregistered', 'tool.call.response', 'tool.call.success', 'tool.call.failed', 'tool.list.response', 'tool.get.response'],
      subscribes: ['tool.call.request', 'tool.list.request', 'tool.get.request'],
    },
  },
  'ai-gateway': {
    version: '2.1.0',
    events: {
      publishes: ['ai.response', 'ai.error', 'credential.resolve.request'],
      subscribes: ['ai.request', 'credential.saved', 'credential.updated', 'credential.deleted', 'credential.resolve.response', 'ai.providers', 'ai.usage'],
    },
  },
  'categorias': {
    version: '1.0.0',
    events: {
      publishes: ['categoria.creada', 'categoria.actualizada', 'categoria.orden_actualizado'],
      subscribes: ['menu.generado', 'categoria.obtener', 'categoria.listar'],
    },
  },
  'cobros': {
    version: '1.1.0',
    events: {
      publishes: ['cobro.iniciado', 'cobro.completado', 'cobro.fallido', 'cobro.reembolsado'],
      subscribes: ['pedido.completado', 'cuenta.creada', 'cobro.obtener', 'cobro.listar', 'cobro.por_cuenta'],
    },
  },
  'cocina': {
    version: '1.0.0',
    events: {
      publishes: ['cocina.item_preparado', 'cocina.pedido_listo'],
      subscribes: ['pedido.enviado_cocina', 'pedido.item_agregado', 'pedido.cancelado', 'cocina.activos', 'cocina.historial'],
    },
  },
  'comandero': {
    version: '1.0.0',
    events: {
      publishes: ['pedido.item_agregado', 'pedido.item_eliminado', 'pedido.enviado_cocina'],
      subscribes: ['cuenta.actualizada'],
    },
  },
  'credential-manager': {
    version: '2.0.0',
    events: {
      publishes: ['credential.saved', 'credential.updated', 'credential.deleted', 'credential.resolved', 'credential.resolve.failed', 'credential.resolve.response'],
      subscribes: ['credential.resolve.request'],
    },
  },
  'cuentas': {
    version: '2.0.0',
    events: {
      publishes: ['cuenta.creada', 'cuenta.actualizada', 'cuenta.eliminada', 'cuenta.estado_cambiado'],
      subscribes: ['pedido.item_agregado', 'pedido.item_eliminado', 'cobro.procesado', 'cuenta.obtener', 'cuenta.listar'],
    },
  },
  'cuentas-llevar': {
    version: '1.0.0',
    events: {
      publishes: ['llevar.ticket_creado', 'llevar.ticket_listo', 'llevar.ticket_entregado', 'cuenta.creada', 'cuenta.cerrada'],
      subscribes: ['cocina.pedido_listo', 'cobro.completado', 'llevar.activos', 'llevar.listos'],
    },
  },
  'cuentas-mesa': {
    version: '1.0.0',
    events: {
      publishes: ['mesa.abierta', 'mesa.camarero_asignado', 'mesa.cerrada', 'cuenta.creada', 'cuenta.cerrada'],
      subscribes: ['pedido.creado', 'cobro.completado', 'mesas.disponibles', 'mesas.ocupadas'],
    },
  },
  'cuentas-telefono': {
    version: '1.0.0',
    events: {
      publishes: ['telefono.llamada_detectada', 'telefono.contacto_identificado', 'telefono.pedido_creado', 'telefono.listo_para_recoger', 'cuenta.creada', 'cuenta.cerrada'],
      subscribes: ['cocina.pedido_listo', 'cobro.completado', 'telefono.pendientes', 'telefono.contactos'],
    },
  },
  'ingredientes': {
    version: '1.0.0',
    events: {
      publishes: ['ingrediente.creado', 'ingrediente.actualizado'],
      subscribes: ['menu.generado', 'producto.creado', 'ingrediente.obtener', 'ingrediente.listar', 'ingrediente.buscar'],
    },
  },
  'menu-generator': {
    version: '1.0.0',
    events: {
      publishes: ['ai.request', 'menu.generado', 'menu.validado', 'menu.error'],
      subscribes: ['ai.response', 'menu.obtener_ultimo'],
    },
  },
  'pedidos': {
    version: '1.0.0',
    events: {
      publishes: ['pedido.creado', 'pedido.item_agregado', 'pedido.item_actualizado', 'pedido.item_eliminado', 'pedido.enviado_cocina', 'pedido.completado', 'pedido.cancelado'],
      subscribes: ['variacion.validada', 'variacion.rechazada', 'cuenta.creada', 'pedido.obtener', 'pedido.listar', 'pedido.por_cuenta'],
    },
  },
  'persistencia-comandero': {
    version: '1.1.0',
    events: {
      publishes: ['caja.cerrada', 'dia.iniciado'],
      subscribes: ['boton.pulsado', 'ui.accion', 'cuenta.creada', 'cuenta.cerrada', 'cobro.iniciado', 'cobro.completado', 'cobro.reembolsado', 'pedido.creado', 'mesa.abierta', 'telefono.pedido_creado', 'llevar.ticket_creado', 'persistencia.eventos', 'persistencia.ventas', 'persistencia.cuadre_caja'],
    },
  },
  'productos': {
    version: '2.0.0',
    events: {
      publishes: ['producto.creado', 'producto.actualizado', 'producto.eliminado', 'catalogo.actualizado'],
      subscribes: ['menu.generado', 'menu.validado', 'producto.obtener', 'producto.listar', 'producto.buscar'],
    },
  },
  'ui-renderer': {
    version: '1.0.0',
    events: {
      publishes: ['ui.rendered', 'ui.render_error'],
      subscribes: [],
    },
  },
  'variaciones': {
    version: '1.0.0',
    events: {
      publishes: ['variacion.validada', 'variacion.rechazada'],
      subscribes: ['producto.creado', 'pedido.item_agregado', 'variacion.validar', 'variacion.calcular_precio'],
    },
  },
};

// ============================================
// HELPERS
// ============================================

const HELPERS = {
  /**
   * Valida que un evento esté registrado
   * @param {string} eventName - Nombre del evento
   * @returns {boolean} true si el evento es válido
   */
  isValidEvent(eventName) {
    const domain = eventName.split('.')[0].toUpperCase();
    if (!EVENTS[domain]) return false;

    const constName = eventName.split('.').slice(1).join('_').toUpperCase();
    return EVENTS[domain][constName] === eventName;
  },

  /**
   * Obtiene todos los eventos de un dominio
   * @param {string} domain - Dominio (ej: 'TOOL')
   * @returns {string[]} Lista de eventos
   */
  getEventsByDomain(domain) {
    return EVENTS[domain] ? Object.values(EVENTS[domain]) : [];
  },

  /**
   * Obtiene todos los eventos registrados
   * @returns {string[]} Lista de todos los eventos
   */
  getAllEvents() {
    const all = [];
    for (const domain of Object.values(EVENTS)) {
      all.push(...Object.values(domain));
    }
    return all;
  },

  /**
   * Genera un request_id único
   * @returns {string} Request ID
   */
  generateRequestId() {
    return 'req_' + Date.now() + '_' + Math.random().toString(36).substr(2, 9);
  }
};

// ============================================
// EXPORTS
// ============================================

module.exports = {
  EVENTS,
  API_ROUTES,
  MODULES,
  HELPERS
};
