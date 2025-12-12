/**
 * UI Module Registry - Registro y coordinación de módulos
 *
 * Responsabilidades:
 * - Registrar/desregistrar módulos
 * - Agrupar módulos por zona (derived stores)
 * - Gestionar suscripciones MQTT de módulos
 * - Proporcionar contexto a módulos
 * - Obtener componentes de panel
 */

import { writable, derived, get } from 'svelte/store';
import { publish, subscribe as mqttSubscribe } from './mqtt';
import type { UIModule, UIZone, ModuleContext, AppState } from './types';

// ============================================================================
// ESTADO INTERNO
// ============================================================================

const modulesStore = writable<Map<string, UIModule>>(new Map());

// Cleanup functions de suscripciones MQTT por módulo
const moduleSubscriptions = new Map<string, Array<() => void>>();

// Estado de la app para iconos/badges dinámicos
const appStateStore = writable<AppState>({
  project: null,
  provider: null,
  model: null,
  prompt: null,
  credentials: { valid: false, providers: [] },
  conversationCount: 0
});

// Panel activo
const activePanelStore = writable<string | null>(null);

// ============================================================================
// CONTEXTO PARA MÓDULOS
// ============================================================================

function createModuleContext(moduleId: string): ModuleContext {
  return {
    publish: (topic: string, payload: unknown) => {
      publish(topic, payload);
    },

    subscribe: (pattern: string, handler: (topic: string, payload: unknown) => void) => {
      const unsub = mqttSubscribe(pattern, handler);

      // Guardar para cleanup automático
      if (!moduleSubscriptions.has(moduleId)) {
        moduleSubscriptions.set(moduleId, []);
      }
      moduleSubscriptions.get(moduleId)!.push(unsub);

      return unsub;
    },

    openPanel: (panelId: string) => {
      activePanelStore.set(panelId);
    },

    closePanel: () => {
      activePanelStore.set(null);
    }
  };
}

// ============================================================================
// FUNCIONES DE FILTRADO POR ZONA
// ============================================================================

function filterByZone(modules: Map<string, UIModule>, zone: UIZone): UIModule[] {
  return [...modules.values()]
    .filter(m => m.manifest.zone === zone)
    .sort((a, b) => (a.manifest.button.order ?? 99) - (b.manifest.button.order ?? 99));
}

// ============================================================================
// API PÚBLICA - REGISTRO
// ============================================================================

/**
 * Registrar un módulo UI
 */
export function register(module: UIModule): () => void {
  const { id } = module.manifest;

  // Verificar duplicado
  if (get(modulesStore).has(id)) {
    console.warn(`[Registry] Module "${id}" already registered, skipping`);
    return () => {};
  }

  // Añadir al store
  modulesStore.update((m) => {
    m.set(id, module);
    return new Map(m);
  });

  // Crear contexto y llamar onMount
  const ctx = createModuleContext(id);

  if (module.onMount) {
    try {
      module.onMount(ctx);
    } catch (err) {
      console.error(`[Registry] Error in onMount for "${id}":`, err);
    }
  }

  // Suscribir a topics declarados en manifest
  if (module.manifest.mqtt?.subscribes && module.onMessage) {
    for (const topic of module.manifest.mqtt.subscribes) {
      const handler = module.onMessage[topic];
      if (handler) {
        const unsub = mqttSubscribe(topic, handler);
        if (!moduleSubscriptions.has(id)) {
          moduleSubscriptions.set(id, []);
        }
        moduleSubscriptions.get(id)!.push(unsub);
      }
    }
  }

  console.log(`[Registry] Module "${id}" registered in zone "${module.manifest.zone}"`);

  // Retornar función de cleanup
  return () => unregister(id);
}

/**
 * Desregistrar un módulo UI
 */
export function unregister(moduleId: string): void {
  const module = get(modulesStore).get(moduleId);

  if (!module) {
    console.warn(`[Registry] Module "${moduleId}" not found`);
    return;
  }

  // Llamar onUnmount
  if (module.onUnmount) {
    try {
      module.onUnmount();
    } catch (err) {
      console.error(`[Registry] Error in onUnmount for "${moduleId}":`, err);
    }
  }

  // Limpiar suscripciones MQTT
  const subs = moduleSubscriptions.get(moduleId);
  if (subs) {
    for (const unsub of subs) {
      unsub();
    }
    moduleSubscriptions.delete(moduleId);
  }

  // Remover del store
  modulesStore.update((m) => {
    m.delete(moduleId);
    return new Map(m);
  });

  console.log(`[Registry] Module "${moduleId}" unregistered`);
}

/**
 * Desregistrar todos los módulos de una zona
 */
export function unregisterZone(zone: UIZone): void {
  const modules = get(modulesStore);

  for (const [id, module] of modules) {
    if (module.manifest.zone === zone) {
      unregister(id);
    }
  }
}

/**
 * Obtener un módulo por ID
 */
export function getModule(moduleId: string): UIModule | undefined {
  return get(modulesStore).get(moduleId);
}

// ============================================================================
// API PÚBLICA - PANELES
// ============================================================================

/**
 * Abrir un panel
 */
export function openPanel(panelId: string): void {
  activePanelStore.set(panelId);
}

/**
 * Cerrar el panel activo
 */
export function closePanel(): void {
  activePanelStore.set(null);
}

/**
 * Obtener componente de un panel por ID
 */
export function getPanelComponent(panelId: string) {
  const modules = get(modulesStore);

  for (const module of modules.values()) {
    const panel = module.manifest.panels?.find(p => p.id === panelId);
    if (panel) {
      return module.PanelComponent || null;
    }
  }

  return null;
}

/**
 * Obtener config de un panel por ID
 */
export function getPanelConfig(panelId: string) {
  const modules = get(modulesStore);

  for (const module of modules.values()) {
    const panel = module.manifest.panels?.find(p => p.id === panelId);
    if (panel) {
      return panel;
    }
  }

  return null;
}

// ============================================================================
// API PÚBLICA - APP STATE
// ============================================================================

/**
 * Actualizar estado de la app (para iconos dinámicos)
 */
export function updateAppState(partial: Partial<AppState>): void {
  appStateStore.update(state => ({ ...state, ...partial }));
}

/**
 * Obtener estado actual de la app
 */
export function getAppState(): AppState {
  return get(appStateStore);
}

// ============================================================================
// STORES DERIVADOS POR ZONA
// ============================================================================

/**
 * Módulos de la barra de trabajo (plegable, arriba)
 */
export const workBarModules = derived(modulesStore, ($m) => filterByZone($m, 'work-bar'));

/**
 * Módulos de la barra config del chat
 */
export const chatConfigModules = derived(modulesStore, ($m) => filterByZone($m, 'chat-config'));

/**
 * Módulos de la barra de herramientas del chat
 */
export const chatToolsModules = derived(modulesStore, ($m) => filterByZone($m, 'chat-tools'));

/**
 * Módulos de la barra lateral sistema
 */
export const systemBarModules = derived(modulesStore, ($m) => filterByZone($m, 'system-bar'));

/**
 * Panel activo
 */
export const activePanel = {
  subscribe: activePanelStore.subscribe,
  set: activePanelStore.set
};

/**
 * Estado de la app (readonly para componentes)
 */
export const appState = { subscribe: appStateStore.subscribe };

/**
 * Todos los módulos (readonly)
 */
export const modules = { subscribe: modulesStore.subscribe };
