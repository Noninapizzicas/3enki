/**
 * Modules Index - Registro centralizado de módulos
 *
 * Exporta todos los módulos y una función para registrarlos.
 */

import { register, unregister } from '$lib/ui-core';
import { perfStart, perfEnd, logMsg } from '$lib/utils/perf';

// Módulos disponibles
import { projectModule } from './project';
import { providerModule } from './provider';
import { promptsModule } from './prompts';
import { credentialsModule } from './credentials';
import { historyModule } from './history';
import { filesModule } from './files';

// Exportar módulos individuales
export { projectModule } from './project';
export { providerModule } from './provider';
export { promptsModule } from './prompts';
export { credentialsModule } from './credentials';
export { historyModule } from './history';
export { filesModule } from './files';

// Lista de módulos
export const coreModules = [
  projectModule,
  providerModule,
  promptsModule,
  credentialsModule,
  historyModule,
  filesModule,
];

// Lista completa
export const allModules = coreModules;

/**
 * Registrar todos los módulos en el sistema
 */
export function registerAllModules(): void {
  perfStart('Modules.registerCore');
  for (const module of coreModules) {
    perfStart(`Module.${module.manifest.id}`);
    register(module);
    perfEnd(`Module.${module.manifest.id}`);
  }
  perfEnd('Modules.registerCore');
  logMsg(`📦 ${coreModules.length} módulos registrados`);
}

/**
 * Registrar módulos por zona
 */
export function registerModulesByZone(zone: string): void {
  const zoneModules = allModules.filter(m => m.manifest.zone === zone);
  for (const module of zoneModules) {
    register(module);
  }
  console.log(`[Modules] ${zoneModules.length} módulos registrados en zona ${zone}`);
}

/**
 * Desregistrar todos los módulos (cleanup para HMR)
 */
export function unregisterAllModules(): void {
  for (const module of coreModules) {
    unregister(module.manifest.id);
  }
  console.log(`[Modules] Módulos desregistrados`);
}
