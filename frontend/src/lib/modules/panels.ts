/**
 * Panel Loaders - Metadata + carga lazy de paneles
 *
 * Solo metadata aquí. Los componentes se importan bajo demanda.
 */

import type { ComponentType } from 'svelte';

export interface PanelDef {
  id: string;
  title: string;
  icon: string;
  size: 'sm' | 'md' | 'lg';
  position?: 'top' | 'bottom' | 'left' | 'right' | 'center';
  zone: 'work-bar' | 'chat-config' | 'chat-tools' | 'system-bar';
  order: number;
  // Si false, no muestra botón en la barra (solo accesible via openPanel)
  showInBar?: boolean;
  // Loader - importa el componente bajo demanda
  loader: () => Promise<{ default: ComponentType }>;
}

// Cache de componentes ya cargados
const componentCache = new Map<string, ComponentType>();

/**
 * Definiciones de paneles - SIN importar componentes
 */
export const panels: Record<string, PanelDef> = {
  // === WORK BAR ===
  project: {
    id: 'project',
    title: 'Proyecto',
    icon: '📁',
    size: 'md',
    position: 'top',
    zone: 'work-bar',
    order: 1,
    loader: () => import('$lib/modules/project/ProjectPanel.svelte')
  },

  // === CHAT TOOLS (barra inferior junto al chat) ===
  files: {
    id: 'files',
    title: 'Archivos',
    icon: '🗂️',
    size: 'lg',
    position: 'left',
    zone: 'chat-tools',
    order: 1,
    loader: () => import('$lib/modules/files/FilesPanel.svelte')
  },

  // === CHAT CONFIG ===
  provider: {
    id: 'provider',
    title: 'Proveedor IA',
    icon: '🤖',
    size: 'sm',
    position: 'top',
    zone: 'chat-config',
    order: 1,
    loader: () => import('$lib/modules/provider/ProviderPanel.svelte')
  },
  prompts: {
    id: 'prompts',
    title: 'Prompts',
    icon: '🧘',
    size: 'lg',
    position: 'top',
    zone: 'chat-config',
    order: 2,
    loader: () => import('$lib/modules/prompts/PromptsPanel.svelte')
  },
  conversations: {
    id: 'conversations',
    title: 'Conversaciones',
    icon: '💬',
    size: 'lg',
    position: 'top',
    zone: 'chat-config',
    order: 2.5,
    loader: () => import('$lib/modules/conversations/ConversationsPanel.svelte')
  },
  'credentials-list': {
    id: 'credentials-list',
    title: 'Credenciales',
    icon: '🔐',
    size: 'md',
    position: 'top',
    zone: 'chat-config',
    order: 3,
    loader: () => import('$lib/modules/credentials/CredentialsPanel.svelte')
  },

  // === SYSTEM BAR ===
  history: {
    id: 'history',
    title: 'Historial',
    icon: '📜',
    size: 'md',
    position: 'right',
    zone: 'system-bar',
    order: 1,
    loader: () => import('$lib/modules/history/HistoryPanel.svelte')
  }
};

/**
 * Obtener paneles por zona (solo los que muestran botón)
 */
export function getPanelsByZone(zone: PanelDef['zone']): PanelDef[] {
  return Object.values(panels)
    .filter(p => p.zone === zone && p.showInBar !== false)
    .sort((a, b) => a.order - b.order);
}

/**
 * Cargar componente de un panel (con cache)
 */
export async function loadPanelComponent(panelId: string): Promise<ComponentType | null> {
  // Revisar cache
  if (componentCache.has(panelId)) {
    return componentCache.get(panelId)!;
  }

  const panel = panels[panelId];
  if (!panel) {
    console.error(`[Panels] Panel "${panelId}" not found`);
    return null;
  }

  try {
    console.log(`[Panels] Loading "${panelId}"...`);
    const start = performance.now();

    const module = await panel.loader();
    const Component = module.default;

    // Guardar en cache
    componentCache.set(panelId, Component);

    console.log(`[Panels] "${panelId}" loaded in ${(performance.now() - start).toFixed(1)}ms`);
    return Component;
  } catch (err) {
    console.error(`[Panels] Failed to load "${panelId}":`, err);
    return null;
  }
}

/**
 * Obtener definición de panel
 */
export function getPanel(panelId: string): PanelDef | undefined {
  return panels[panelId];
}

/**
 * Verificar si un panel está en cache
 */
export function isPanelLoaded(panelId: string): boolean {
  return componentCache.has(panelId);
}
