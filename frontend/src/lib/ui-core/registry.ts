/**
 * UI Module Registry - Registro de módulos UI
 * Patrón 1:1 con backend ModuleRegistry
 */

import { writable, derived, get } from 'svelte/store';
import { eventBus } from './event-bus';
import type { UIModule, UIButton, UIZone, UIContext } from './types';

function createRegistry() {
  const modules = writable<Map<string, UIModule>>(new Map());

  // Contexto compartido para módulos
  const context: UIContext = {
    emit: (type, data) => eventBus.emit(type, data),
    on: (type, handler) => eventBus.on(type, handler),
    openPanel: (id) => eventBus.emit('ui.panel.open', { panelId: id }),
    closePanel: () => eventBus.emit('ui.panel.close', {})
  };

  function register(module: UIModule): void {
    modules.update(m => {
      m.set(module.manifest.id, module);
      return m;
    });

    // Llamar onMount
    if (module.onMount) {
      module.onMount(context);
    }

    // Suscribir a eventos
    if (module.manifest.events?.listens && module.onEvent) {
      for (const eventType of module.manifest.events.listens) {
        if (module.onEvent[eventType]) {
          eventBus.on(eventType, module.onEvent[eventType]);
        }
      }
    }

    eventBus.emit('ui.module.registered', { moduleId: module.manifest.id });
  }

  function unregister(moduleId: string): void {
    const module = get(modules).get(moduleId);
    if (module?.onUnmount) {
      module.onUnmount();
    }
    modules.update(m => {
      m.delete(moduleId);
      return m;
    });
    eventBus.emit('ui.module.unregistered', { moduleId });
  }

  function getModule(moduleId: string): UIModule | undefined {
    return get(modules).get(moduleId);
  }

  // Store derivado: botones por zona
  const buttonsByZone = derived(modules, ($modules) => {
    const zones: Record<UIZone, UIButton[]> = {
      'topbar': [],
      'sidebar': [],
      'bottombar': [],
      'chat-top': [],
      'chat-bottom': []
    };

    for (const module of $modules.values()) {
      if (module.manifest.zones) {
        for (const [zone, buttons] of Object.entries(module.manifest.zones)) {
          if (buttons && zones[zone as UIZone]) {
            zones[zone as UIZone].push(...buttons);
          }
        }
      }
    }

    // Ordenar por order
    for (const zone of Object.keys(zones) as UIZone[]) {
      zones[zone].sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
    }

    return zones;
  });

  // Store derivado: todos los paneles
  const panels = derived(modules, ($modules) => {
    const allPanels: Array<{ moduleId: string; panel: { id: string; title: string; size?: string } }> = [];
    for (const [moduleId, module] of $modules.entries()) {
      if (module.manifest.panels) {
        for (const panel of module.manifest.panels) {
          allPanels.push({ moduleId, panel });
        }
      }
    }
    return allPanels;
  });

  return {
    modules,
    register,
    unregister,
    getModule,
    buttonsByZone,
    panels,
    context
  };
}

export const registry = createRegistry();
