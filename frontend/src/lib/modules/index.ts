/**
 * Modules Index - Registro centralizado de módulos
 *
 * Exporta todos los módulos y una función para registrarlos.
 *
 * OPTIMIZACIÓN: Los módulos pesados (PDF, Editor) se cargan de forma
 * diferida (lazy) para no bloquear la carga inicial de la página.
 */

import { register, unregister } from '$lib/ui-core';

// Módulos ligeros - se cargan inmediatamente (necesarios para UI)
import { projectModule } from './project';
import { providerModule } from './provider';
import { promptsModule } from './prompts';
import { credentialsModule } from './credentials';
import { historyModule } from './history';
import { filesModule } from './files';

// Módulos pesados - se cargan bajo demanda (PDF.js, Monaco Editor)
// NO importar aquí: editorModule, pdfModule

// Exportar módulos individuales
export { projectModule } from './project';
export { providerModule } from './provider';
export { promptsModule } from './prompts';
export { credentialsModule } from './credentials';
export { historyModule } from './history';
export { filesModule } from './files';
// Lazy exports para módulos pesados
export const editorModule = () => import('./editor').then(m => m.editorModule);
export const pdfModule = () => import('./pdf').then(m => m.pdfModule);

// Lista de módulos esenciales (carga inmediata)
export const coreModules = [
  projectModule,
  providerModule,
  promptsModule,
  credentialsModule,
  historyModule,
  filesModule,
];

// Módulos pesados que se cargan en background
const heavyModuleLoaders = [
  () => import('./editor').then(m => m.editorModule),
  () => import('./pdf').then(m => m.pdfModule),
];

// Lista completa (para compatibilidad - solo módulos core cargados)
export const allModules = coreModules;

/**
 * Registrar todos los módulos en el sistema
 * OPTIMIZADO: Carga módulos core inmediatamente, pesados en background
 */
export function registerAllModules(): void {
  // 1. Registrar módulos esenciales inmediatamente (UI visible rápido)
  for (const module of coreModules) {
    register(module);
  }
  console.log(`[Modules] ${coreModules.length} módulos core registrados`);

  // 2. Cargar módulos pesados en background (no bloquea UI)
  setTimeout(() => {
    Promise.all(heavyModuleLoaders.map(loader => loader()))
      .then(heavyModules => {
        for (const module of heavyModules) {
          register(module);
        }
        console.log(`[Modules] ${heavyModules.length} módulos pesados cargados en background`);
      })
      .catch(err => {
        console.warn('[Modules] Error cargando módulos pesados:', err);
      });
  }, 100); // Pequeño delay para priorizar renderizado inicial
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
  // Desregistrar módulos core
  for (const module of coreModules) {
    unregister(module.manifest.id);
  }
  // Desregistrar módulos pesados (pueden no estar cargados)
  unregister('editor');
  unregister('pdf');
  console.log(`[Modules] Módulos desregistrados`);
}
