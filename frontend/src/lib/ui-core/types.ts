/**
 * UI Core Types - Contratos para el sistema de UI modular
 *
 * Principios:
 * - Tipos estrictos, sin 'unknown' donde se pueda evitar
 * - Compatibles con el backend (misma estructura de eventos)
 * - Documentación inline
 */

import type { SvelteComponent, ComponentType } from 'svelte';

// =============================================================================
// MQTT TOPICS
// =============================================================================

/**
 * Estructura de topics MQTT usados por la UI
 * Sigue la convención del backend: core/{coreId}/{category}/{...}
 */
export const TOPICS = {
  // Eventos de UI
  UI_PANEL_OPEN: 'ui/panel/open',
  UI_PANEL_CLOSE: 'ui/panel/close',
  UI_MODULE_REGISTERED: 'ui/module/registered',
  UI_MODULE_UNREGISTERED: 'ui/module/unregistered',

  // Eventos de dominio (ejemplos)
  PROVIDER_SELECTED: 'provider/selected',
  MODEL_SELECTED: 'model/selected',
  CREDENTIAL_RESOLVED: 'credential/resolved'
} as const;

export type Topic = typeof TOPICS[keyof typeof TOPICS] | string;

// =============================================================================
// ZONAS DE UI
// =============================================================================

/**
 * Zonas donde los módulos pueden renderizar botones
 */
export type UIZone =
  | 'topbar'      // Barra superior
  | 'sidebar'     // Barra lateral derecha
  | 'bottombar'   // Barra inferior
  | 'chat-top'    // Encima del input de chat
  | 'chat-bottom'; // Debajo del input de chat

// =============================================================================
// ACCIONES DE BOTÓN
// =============================================================================

/**
 * Acción que ejecuta un botón al hacer click
 */
export type UIButtonAction =
  | { type: 'panel'; panelId: string }
  | { type: 'publish'; topic: string; payload?: Record<string, unknown> }
  | { type: 'navigate'; route: string };

// =============================================================================
// BOTONES
// =============================================================================

/**
 * Botón que un módulo registra en una zona
 */
export interface UIButton {
  /** Identificador único del botón */
  id: string;

  /** Emoji o icono a mostrar */
  emoji: string;

  /** Texto accesible (aria-label y tooltip) */
  label: string;

  /** Badge opcional (notificaciones, contadores) */
  badge?: string | number;

  /** Acción al hacer click */
  action: UIButtonAction;

  /** Orden de aparición (menor = primero) */
  order?: number;
}

// =============================================================================
// PANELES
// =============================================================================

/**
 * Tamaños de panel disponibles
 */
export type PanelSize = 'sm' | 'md' | 'lg' | 'xl' | 'full';

/**
 * Panel que un módulo puede abrir
 */
export interface UIPanel {
  /** Identificador único del panel */
  id: string;

  /** Título mostrado en el header */
  title: string;

  /** Tamaño del panel */
  size: PanelSize;
}

// =============================================================================
// MÓDULOS
// =============================================================================

/**
 * Manifest declarativo de un módulo UI
 */
export interface UIModuleManifest {
  /** Identificador único del módulo */
  id: string;

  /** Nombre para mostrar */
  name: string;

  /** Versión semver */
  version: string;

  /** Icono del módulo */
  icon?: string;

  /** Botones a registrar por zona */
  zones?: Partial<Record<UIZone, UIButton[]>>;

  /** Paneles que expone este módulo */
  panels?: UIPanel[];

  /** Topics MQTT que usa */
  mqtt?: {
    /** Topics a los que publica */
    publishes?: string[];
    /** Topics a los que se suscribe */
    subscribes?: string[];
  };
}

/**
 * Contexto disponible para módulos
 */
export interface UIModuleContext {
  /** Publicar a un topic MQTT */
  publish: (topic: string, payload: Record<string, unknown>) => void;

  /** Suscribirse a un topic MQTT (retorna unsub) */
  subscribe: (topic: string, handler: (payload: unknown) => void) => () => void;

  /** Abrir un panel por ID */
  openPanel: (panelId: string) => void;

  /** Cerrar el panel actual */
  closePanel: () => void;
}

/**
 * Handler de mensaje MQTT
 */
export type MqttHandler = (topic: string, payload: unknown) => void;

/**
 * Módulo UI completo
 */
export interface UIModule {
  /** Manifest declarativo */
  manifest: UIModuleManifest;

  /** Callback al registrar el módulo */
  onMount?: (ctx: UIModuleContext) => void;

  /** Callback al desregistrar el módulo */
  onUnmount?: () => void;

  /** Handlers para topics MQTT específicos */
  onMessage?: Record<string, MqttHandler>;

  /** Componente Svelte para renderizar paneles */
  PanelComponent?: ComponentType<SvelteComponent<{ panelId: string }>>;
}

// =============================================================================
// ESTADO DEL REGISTRY
// =============================================================================

/**
 * Estado del panel activo
 */
export interface ActivePanel {
  panelId: string;
  moduleId: string;
}

/**
 * Panel con su módulo asociado
 */
export interface PanelWithModule {
  panel: UIPanel;
  moduleId: string;
}
