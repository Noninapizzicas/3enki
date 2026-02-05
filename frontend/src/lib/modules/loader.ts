/**
 * Module Loader - Autodescubrimiento de módulos UI
 *
 * Escanea automáticamente los módulos basándose en manifest.json
 * Similar al patrón del backend que usa module.json + index.js
 *
 * Uso:
 *   import { getModuleDefinitions, loadModule } from './loader';
 *   const defs = getModuleDefinitions();
 *   const module = await loadModule('project');
 */

import type { LazyModuleDefinition } from '$lib/ui-core/lazy-registry';
import type { UIZone } from '$lib/ui-core/types';

// Tipo para el manifest.json de cada módulo
export interface ModuleManifest {
  id: string;
  name: string;
  version: string;
  zone: UIZone;
  order?: number;
  icon: string;
  label: string;
  dependencies?: string[];
  critical?: boolean;
  heavy?: boolean;
  // Rutas donde el módulo es visible en work-bar (sin definir = todas)
  routes?: string[];
}

// ============================================================================
// AUTODESCUBRIMIENTO CON import.meta.glob
// ============================================================================

// Cargar todos los manifest.json de forma eager (sincrono)
const manifests = import.meta.glob<ModuleManifest>(
  './*/manifest.json',
  { eager: true, import: 'default' }
);

// Cargar los módulos de forma lazy
const moduleLoaders = import.meta.glob<{ default: any }>(
  './*/index.ts'
);

// ============================================================================
// DEFINICIONES GENERADAS AUTOMÁTICAMENTE
// ============================================================================

/**
 * Genera LazyModuleDefinition[] a partir de los manifests descubiertos
 */
function buildDefinitions(): LazyModuleDefinition[] {
  const definitions: LazyModuleDefinition[] = [];

  for (const [path, manifest] of Object.entries(manifests)) {
    // path es algo como './project/manifest.json'
    const moduleDir = path.replace('/manifest.json', '');
    const loaderPath = `${moduleDir}/index.ts`;

    if (moduleLoaders[loaderPath]) {
      definitions.push({
        id: manifest.id,
        zone: manifest.zone,
        order: manifest.order ?? 99,
        icon: manifest.icon,
        label: manifest.label,
        dependencies: manifest.dependencies,
        routes: manifest.routes,
        loader: () => moduleLoaders[loaderPath]().then(m => m.default)
      });
    }
  }

  // Ordenar por zona y luego por order
  return definitions.sort((a, b) => {
    if (a.zone !== b.zone) return a.zone.localeCompare(b.zone);
    return (a.order ?? 99) - (b.order ?? 99);
  });
}

// Cache de definiciones
let _definitions: LazyModuleDefinition[] | null = null;

/**
 * Obtener todas las definiciones de módulos (autodescubiertas)
 */
export function getModuleDefinitions(): LazyModuleDefinition[] {
  if (!_definitions) {
    _definitions = buildDefinitions();
  }
  return _definitions;
}

/**
 * Obtener definiciones por zona
 */
export function getDefinitionsByZone(zone: string): LazyModuleDefinition[] {
  return getModuleDefinitions()
    .filter(d => d.zone === zone)
    .sort((a, b) => (a.order ?? 99) - (b.order ?? 99));
}

/**
 * Obtener una definición por ID
 */
export function getDefinition(id: string): LazyModuleDefinition | undefined {
  return getModuleDefinitions().find(d => d.id === id);
}

/**
 * Cargar un módulo por ID
 */
export async function loadModule(id: string): Promise<any> {
  const def = getDefinition(id);
  if (!def) {
    throw new Error(`Module not found: ${id}`);
  }
  return def.loader();
}

/**
 * IDs de módulos críticos (se precargan)
 */
export function getCriticalModules(): string[] {
  return Object.values(manifests)
    .filter(m => m.critical)
    .map(m => m.id);
}

/**
 * IDs de módulos pesados (se cargan en background)
 */
export function getHeavyModules(): string[] {
  return Object.values(manifests)
    .filter(m => m.heavy)
    .map(m => m.id);
}

/**
 * Obtener todos los manifests
 */
export function getAllManifests(): ModuleManifest[] {
  return Object.values(manifests);
}

/**
 * Debug: listar módulos descubiertos
 */
export function debugListModules(): void {
  console.log('[ModuleLoader] Discovered modules:');
  for (const manifest of Object.values(manifests)) {
    console.log(`  - ${manifest.id} (${manifest.zone}) v${manifest.version}`);
  }
}
