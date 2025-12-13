/**
 * Modules Index - Registro centralizado de módulos
 *
 * Exporta todos los módulos y una función para registrarlos.
 */

import { register } from '$lib/ui-core';
import { projectModule } from './project';
import { providerModule } from './provider';
import { promptsModule } from './prompts';
import { filesModule } from './files';

// Exportar módulos individuales
export { projectModule } from './project';
export { providerModule } from './provider';
export { promptsModule } from './prompts';
export { filesModule } from './files';

// Lista de todos los módulos
export const allModules = [
  projectModule,
  providerModule,
  promptsModule,
  filesModule,
];

/**
 * Registrar todos los módulos en el sistema
 */
export function registerAllModules(): void {
  for (const module of allModules) {
    register(module);
  }
  console.log(`[Modules] ${allModules.length} módulos registrados`);
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
