/**
 * Module Definitions - Definiciones de módulos sin cargar
 *
 * Solo define ID, zona, ícono y loader.
 * El módulo real se importa bajo demanda cuando se navega a él.
 */

import type { LazyModuleDefinition } from '$lib/ui-core/lazy-registry';

// ============================================================================
// DEFINICIONES DE MÓDULOS
// ============================================================================

export const moduleDefinitions: LazyModuleDefinition[] = [
  // --- WORK BAR (barra superior colapsable) ---
  {
    id: 'project',
    zone: 'work-bar',
    order: 1,
    icon: '📁',
    label: 'Proyecto',
    loader: () => import('./project').then(m => m.projectModule)
  },
  {
    id: 'files',
    zone: 'work-bar',
    order: 2,
    icon: '🗂️',
    label: 'Archivos',
    loader: () => import('./files').then(m => m.filesModule),
    dependencies: ['project']
  },

  // --- CHAT CONFIG (configuración del chat) ---
  {
    id: 'provider',
    zone: 'chat-config',
    order: 1,
    icon: '🤖',
    label: 'Proveedor',
    loader: () => import('./provider').then(m => m.providerModule)
  },
  {
    id: 'prompts',
    zone: 'chat-config',
    order: 2,
    icon: '💬',
    label: 'Prompts',
    loader: () => import('./prompts').then(m => m.promptsModule)
  },

  // --- SYSTEM BAR (barra lateral derecha) ---
  {
    id: 'history',
    zone: 'system-bar',
    order: 1,
    icon: '📜',
    label: 'Historial',
    loader: () => import('./history').then(m => m.historyModule)
  },
  {
    id: 'credentials',
    zone: 'system-bar',
    order: 2,
    icon: '🔑',
    label: 'Credenciales',
    loader: () => import('./credentials').then(m => m.credentialsModule)
  }
];

// ============================================================================
// HELPERS
// ============================================================================

/**
 * Obtener definiciones por zona
 */
export function getDefinitionsByZone(zone: string): LazyModuleDefinition[] {
  return moduleDefinitions
    .filter(d => d.zone === zone)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/**
 * Obtener definición por ID
 */
export function getDefinition(id: string): LazyModuleDefinition | undefined {
  return moduleDefinitions.find(d => d.id === id);
}

/**
 * IDs de módulos críticos que se precargan después del bootstrap
 */
export const criticalModules = ['project', 'provider'];

/**
 * IDs de módulos pesados que se cargan en background
 */
export const heavyModules: string[] = [];
