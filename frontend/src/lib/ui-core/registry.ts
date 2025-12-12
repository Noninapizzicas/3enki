/**
 * UI Module Registry - Registro y gestión de módulos UI
 *
 * Responsabilidades:
 * - Registrar/desregistrar módulos
 * - Agregar botones por zona (derived store)
 * - Agregar paneles disponibles (derived store)
 * - Gestionar suscripciones MQTT de módulos
 * - Proporcionar contexto a módulos
 */

import { writable, derived, get } from 'svelte/store';
import { publish, subscribe as mqttSubscribe } from './mqtt';
import type {
  UIModule,
  UIButton,
  UIZone,
  UIModuleContext,
  PanelWithModule,
  TOPICS
} from './types';

// =============================================================================
// ESTADO INTERNO
// =============================================================================

const modulesStore = writable<Map<string, UIModule>>(new Map());

// Almacena funciones de cleanup de suscripciones MQTT por módulo
const moduleSubscriptions = new Map<string, Array<() => void>>();

// =============================================================================
// CONTEXTO PARA MÓDULOS
// =============================================================================

function createModuleContext(moduleId: string): UIModuleContext {
  return {
    publish: (topic: string, payload: Record<string, unknown>) => {
      publish(topic, { ...payload, _source: moduleId });
    },

    subscribe: (topic: string, handler: (payload: unknown) => void) => {
      const unsub = mqttSubscribe(topic, (_topic, payload) => handler(payload));

      // Guardar para cleanup automático
      if (!moduleSubscriptions.has(moduleId)) {
        moduleSubscriptions.set(moduleId, []);
      }
      moduleSubscriptions.get(moduleId)!.push(unsub);

      return unsub;
    },

    openPanel: (panelId: string) => {
      publish('ui/panel/open', { panelId, moduleId });
    },

    closePanel: () => {
      publish('ui/panel/close', {});
    }
  };
}

// =============================================================================
// FUNCIONES PÚBLICAS
// =============================================================================

/**
 * Registrar un módulo UI
 */
export function register(module: UIModule): void {
  const { id } = module.manifest;

  // Verificar duplicado
  if (get(modulesStore).has(id)) {
    console.warn(`[Registry] Module "${id}" already registered, skipping`);
    return;
  }

  // Añadir al store
  modulesStore.update((m) => {
    m.set(id, module);
    return new Map(m); // Nueva referencia para reactividad
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

  // Publicar evento de registro
  publish('ui/module/registered', { moduleId: id, name: module.manifest.name });

  console.log(`[Registry] Module "${id}" registered`);
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

  // Publicar evento
  publish('ui/module/unregistered', { moduleId });

  console.log(`[Registry] Module "${moduleId}" unregistered`);
}

/**
 * Obtener un módulo por ID
 */
export function getModule(moduleId: string): UIModule | undefined {
  return get(modulesStore).get(moduleId);
}

/**
 * Verificar si un módulo está registrado
 */
export function hasModule(moduleId: string): boolean {
  return get(modulesStore).has(moduleId);
}

// =============================================================================
// STORES DERIVADOS
// =============================================================================

/**
 * Store derivado: botones agrupados por zona
 */
export const buttonsByZone = derived(modulesStore, ($modules) => {
  const zones: Record<UIZone, UIButton[]> = {
    topbar: [],
    sidebar: [],
    bottombar: [],
    'chat-top': [],
    'chat-bottom': []
  };

  for (const module of $modules.values()) {
    const moduleZones = module.manifest.zones;
    if (!moduleZones) continue;

    for (const [zone, buttons] of Object.entries(moduleZones)) {
      if (buttons && zone in zones) {
        zones[zone as UIZone].push(...buttons);
      }
    }
  }

  // Ordenar por 'order' (menor primero, default 99)
  for (const zone of Object.keys(zones) as UIZone[]) {
    zones[zone].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
  }

  return zones;
});

/**
 * Store derivado: todos los paneles con su módulo
 */
export const panels = derived(modulesStore, ($modules) => {
  const allPanels: PanelWithModule[] = [];

  for (const [moduleId, module] of $modules.entries()) {
    const modulePanels = module.manifest.panels;
    if (!modulePanels) continue;

    for (const panel of modulePanels) {
      allPanels.push({ panel, moduleId });
    }
  }

  return allPanels;
});

/**
 * Store de módulos (readonly para componentes)
 */
export const modules = { subscribe: modulesStore.subscribe };
