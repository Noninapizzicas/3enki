/**
 * Modules Index - Registro centralizado de módulos
 *
 * Usa el sistema de autodescubrimiento para cargar módulos.
 * No necesita importar cada módulo manualmente.
 */

import { register, unregister } from '$lib/ui-core';
import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';
import { getModuleDefinitions, loadModule, debugListModules } from './loader';

// Re-exportar desde loader (funciones principales)
export {
  getModuleDefinitions,
  getDefinitionsByZone,
  getDefinition,
  loadModule,
  getCriticalModules,
  getHeavyModules,
  getAllManifests,
  debugListModules,
  type ModuleManifest
} from './loader';

// Re-exportar constantes pre-evaluadas desde definitions (para compatibilidad)
export { moduleDefinitions, criticalModules, heavyModules } from './definitions';

/**
 * Registrar todos los módulos en el sistema
 * Carga cada módulo de forma lazy y lo registra
 */
export async function registerAllModules(): Promise<void> {
  const definitions = getModuleDefinitions();

  perfStart('Modules.registerAll');

  for (const def of definitions) {
    try {
      perfStart(`Module.${def.id}`);
      const module = await loadModule(def.id);
      register(module);
      perfEnd(`Module.${def.id}`);
    } catch (err) {
      console.error(`[Modules] Failed to load ${def.id}:`, err);
    }
  }

  perfEnd('Modules.registerAll');
  logMsg(`📦 ${definitions.length} módulos registrados`);
}

/**
 * Registrar módulos por zona
 */
export async function registerModulesByZone(zone: string): Promise<void> {
  const definitions = getModuleDefinitions().filter(d => d.zone === zone);

  for (const def of definitions) {
    try {
      const module = await loadModule(def.id);
      register(module);
    } catch (err) {
      console.error(`[Modules] Failed to load ${def.id}:`, err);
    }
  }

  console.log(`[Modules] ${definitions.length} módulos registrados en zona ${zone}`);
}

/**
 * Desregistrar todos los módulos (cleanup para HMR)
 */
export function unregisterAllModules(): void {
  const definitions = getModuleDefinitions();

  for (const def of definitions) {
    unregister(def.id);
  }

  console.log(`[Modules] Módulos desregistrados`);
}

// Debug en desarrollo
if (import.meta.env.DEV) {
  debugListModules();
}
