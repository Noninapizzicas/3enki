/**
 * UI Module Types - Contrato para módulos UI
 *
 * Sigue el mismo patrón que los módulos backend:
 * - Manifest declarativo
 * - Zonas donde renderizar
 * - Eventos que emite/escucha
 * - Paneles que expone
 */

// ============================================================================
// ZONAS DE LA UI
// ============================================================================

/**
 * Zonas disponibles donde un módulo puede renderizar contenido
 */
export type UIZone =
  | 'topbar'      // Barra superior - módulo activo
  | 'sidebar'     // Barra lateral - ecosistema
  | 'central'     // Zona central - trabajo principal
  | 'bottombar'   // Barra inferior - acciones/IA
  | 'chat-top'    // Sub-barra chat superior - prepara mensaje
  | 'chat-bottom' // Sub-barra chat inferior - complementa mensaje
  | 'panel';      // Paneles flotantes

// ============================================================================
// ACCIONES DE BOTONES
// ============================================================================

/**
 * Tipos de acción que puede ejecutar un botón
 */
export type UIActionType =
  | 'navigate'  // Navegación a ruta
  | 'panel'     // Abrir panel
  | 'emit'      // Emitir evento
  | 'function'  // Ejecutar función
  | 'action';   // Acción personalizada

/**
 * Definición de una acción de botón
 */
export interface UIButtonAction {
  type: UIActionType;
  target?: string;        // Ruta para 'navigate'
  panelId?: string;       // Panel para 'panel'
  event?: string;         // Evento para 'emit'
  payload?: unknown;      // Payload para evento
  handler?: () => void;   // Handler para 'function'
  label: string;          // Etiqueta descriptiva
  toast?: string;         // Toast a mostrar después
  holdDuration?: number;  // Duración para long-press (ms)
}

/**
 * Variantes visuales de botón
 */
export type UIButtonVariant =
  | 'default'
  | 'primary'
  | 'secondary'
  | 'success'
  | 'warning'
  | 'danger'
  | 'info';

/**
 * Definición de un botón de módulo
 */
export interface UIModuleButton {
  id: string;
  emoji: string;
  label?: string;
  variant?: UIButtonVariant;
  primaryAction: UIButtonAction;      // 1 toque
  secondaryAction?: UIButtonAction;   // 2 toques
  tertiaryAction?: UIButtonAction;    // Pulsación larga
  badge?: string | number;
  badgeColor?: UIButtonVariant;
  displayValue?: string;
  indicator?: boolean;
  order?: number;                     // Orden en la zona
}

// ============================================================================
// PANELES
// ============================================================================

/**
 * Tamaños de panel
 */
export type UIPanelSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Definición de un panel de módulo
 */
export interface UIModulePanel {
  id: string;
  title: string;
  size?: UIPanelSize;
  component?: string;     // Nombre del componente Svelte
  props?: Record<string, unknown>;
}

// ============================================================================
// EVENTOS UI
// ============================================================================

/**
 * Declaración de eventos que un módulo publica/escucha
 */
export interface UIModuleEvents {
  publishes?: string[];   // Eventos que este módulo emite
  subscribes?: string[];  // Eventos que este módulo escucha
}

/**
 * Envelope de evento UI (similar al backend)
 */
export interface UIEventEnvelope {
  event_id: string;
  event_type: string;
  timestamp: string;
  source: {
    module_id: string;
  };
  data: unknown;
  metadata?: Record<string, unknown>;
}

/**
 * Handler de evento UI
 */
export type UIEventHandler = (envelope: UIEventEnvelope) => void | Promise<void>;

// ============================================================================
// MÓDULO UI
// ============================================================================

/**
 * Manifest de un módulo UI
 * Declarativo: describe qué expone el módulo sin lógica
 */
export interface UIModuleManifest {
  id: string;
  name: string;
  version: string;
  description?: string;
  icon?: string;

  // Zonas donde renderiza contenido
  zones?: {
    topbar?: UIModuleButton[];
    sidebar?: UIModuleButton[];
    bottombar?: UIModuleButton[];
    'chat-top'?: UIModuleButton[];
    'chat-bottom'?: UIModuleButton[];
  };

  // Paneles que expone
  panels?: UIModulePanel[];

  // Eventos
  events?: UIModuleEvents;
}

/**
 * Instancia de un módulo UI
 * Contiene la lógica y handlers
 */
export interface UIModuleInstance {
  /**
   * Llamado cuando el módulo se monta en el Shell
   * @param context Contexto del Shell (eventBus, etc)
   */
  onMount?(context: UIModuleContext): void | Promise<void>;

  /**
   * Llamado cuando el módulo se desmonta
   */
  onUnmount?(): void | Promise<void>;

  /**
   * Handlers de eventos
   * Map: eventType -> handler
   */
  eventHandlers?: Record<string, UIEventHandler>;

  /**
   * Handlers de acciones de botón
   * Map: actionId -> handler
   */
  actionHandlers?: Record<string, (payload?: unknown) => void | Promise<void>>;

  /**
   * Componentes de panel
   * Map: panelId -> SvelteComponent
   */
  panelComponents?: Record<string, unknown>; // SvelteComponent type
}

/**
 * Módulo UI completo (manifest + instance)
 */
export interface UIModule {
  manifest: UIModuleManifest;
  instance?: UIModuleInstance;
}

// ============================================================================
// CONTEXTO DEL SHELL
// ============================================================================

/**
 * Contexto que el Shell provee a los módulos
 */
export interface UIModuleContext {
  /**
   * Emitir un evento
   */
  emit: (eventType: string, data: unknown) => void;

  /**
   * Suscribirse a un evento
   * @returns Función de desuscripción
   */
  on: (eventType: string, handler: UIEventHandler) => () => void;

  /**
   * Abrir un panel
   */
  openPanel: (panelId: string, props?: Record<string, unknown>) => void;

  /**
   * Cerrar panel activo
   */
  closePanel: () => void;

  /**
   * Mostrar toast
   */
  toast: (message: string, type?: 'info' | 'success' | 'warning' | 'error') => void;

  /**
   * Navegar a ruta
   */
  navigate: (path: string) => void;
}

// ============================================================================
// REGISTRY TYPES
// ============================================================================

/**
 * Datos de módulo registrado
 */
export interface RegisteredUIModule {
  manifest: UIModuleManifest;
  instance?: UIModuleInstance;
  registeredAt: number;
}

/**
 * Estadísticas del registry
 */
export interface UIRegistryStats {
  total_modules: number;
  modules_by_zone: Record<UIZone, number>;
  total_panels: number;
  total_events: {
    publishes: number;
    subscribes: number;
  };
}

// ============================================================================
// SHELL TYPES
// ============================================================================

/**
 * Estado del Shell
 */
export interface ShellState {
  activePanel: string | null;
  activePanelProps?: Record<string, unknown>;
  chatExpanded: boolean;
  zones: {
    topbar: UIModuleButton[];
    sidebar: UIModuleButton[];
    bottombar: UIModuleButton[];
    'chat-top': UIModuleButton[];
    'chat-bottom': UIModuleButton[];
  };
}

/**
 * Props del Shell (MobileWorkspaceLayout modular)
 */
export interface ShellProps {
  showChat?: boolean;
  showSideBar?: boolean;
  sideBarPosition?: 'left' | 'right';
  sideBarSize?: number;
  sideBarTransparent?: boolean;
  sideBarOpacity?: number;
  chatPlaceholder?: string;
  chatLoading?: boolean;
}
