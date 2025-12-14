/**
 * Modules Index - Registro centralizado de módulos
 *
 * Exporta todos los módulos y una función para registrarlos.
 */

import { register, unregister } from '$lib/ui-core';
import { projectModule } from './project';
import { providerModule } from './provider';
import { promptsModule } from './prompts';
import { credentialsModule } from './credentials';
import { historyModule } from './history';
import { filesModule } from './files';
import { editorModule } from './editor';
import { pdfModule } from './pdf';

// Exportar módulos individuales
export { projectModule } from './project';
export { providerModule } from './provider';
export { promptsModule } from './prompts';
export { credentialsModule } from './credentials';
export { historyModule } from './history';
export { filesModule } from './files';
export { editorModule } from './editor';
export { pdfModule } from './pdf';

// Lista de todos los módulos
export const allModules = [
  projectModule,
  providerModule,
  promptsModule,
  credentialsModule,
  historyModule,
  filesModule,
  editorModule,
  pdfModule,
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

/**
 * Desregistrar todos los módulos (cleanup para HMR)
 */
export function unregisterAllModules(): void {
  for (const module of allModules) {
    unregister(module.manifest.id);
  }
  console.log(`[Modules] ${allModules.length} módulos desregistrados`);
}
