/**
 * UI Module Types - Contrato para módulos UI
 * Sigue el mismo patrón que los módulos backend
 */

// ============================================================================
// ZONAS
// ============================================================================

export type UIZone = 'topbar' | 'sidebar' | 'bottombar' | 'chat-top' | 'chat-bottom';

// ============================================================================
// BOTONES
// ============================================================================

export interface UIButtonAction {
  type: 'panel' | 'emit' | 'navigate';
  panel?: string;
  event?: string;
  payload?: unknown;
  route?: string;
  label: string;
}

export interface UIButton {
  id: string;
  emoji: string;
  label?: string;
  badge?: string | number;
  primary: UIButtonAction;
  secondary?: UIButtonAction;
  tertiary?: UIButtonAction;
  order?: number;
}

// ============================================================================
// PANELES
// ============================================================================

export interface UIPanel {
  id: string;
  title: string;
  size?: 'sm' | 'md' | 'lg' | 'full';
}

// ============================================================================
// EVENTOS
// ============================================================================

export interface UIEvent {
  id: string;
  type: string;
  timestamp: number;
  source: string;
  data: unknown;
}

export type UIEventHandler = (event: UIEvent) => void;

// ============================================================================
// MÓDULO UI
// ============================================================================

export interface UIModuleManifest {
  id: string;
  name: string;
  version: string;
  icon?: string;

  // Zonas donde renderiza
  zones?: Partial<Record<UIZone, UIButton[]>>;

  // Paneles que expone
  panels?: UIPanel[];

  // Eventos
  events?: {
    emits?: string[];
    listens?: string[];
  };
}

export interface UIModule {
  manifest: UIModuleManifest;

  // Lifecycle
  onMount?: (ctx: UIContext) => void;
  onUnmount?: () => void;

  // Handlers
  onEvent?: Record<string, UIEventHandler>;
  onAction?: Record<string, (payload?: unknown) => void>;

  // Componente del panel (Svelte)
  PanelComponent?: unknown;
}

// ============================================================================
// CONTEXTO
// ============================================================================

export interface UIContext {
  emit: (type: string, data: unknown) => void;
  on: (type: string, handler: UIEventHandler) => () => void;
  openPanel: (panelId: string) => void;
  closePanel: () => void;
}
