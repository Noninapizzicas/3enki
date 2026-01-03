/**
 * Module Definitions - Wrapper sobre el loader de autodescubrimiento
 *
 * NOTA: Este archivo ahora re-exporta desde loader.ts
 * El sistema de autodescubrimiento escanea manifest.json en cada módulo.
 *
 * Para agregar un nuevo módulo:
 * 1. Crear carpeta en modules/
 * 2. Crear manifest.json con id, zone, icon, label, etc.
 * 3. Crear index.ts exportando el UIModule como default
 *
 * ¡No hay que tocar este archivo!
 */

import {
  getModuleDefinitions,
  getDefinitionsByZone as _getDefsByZone,
  getDefinition as _getDef,
  getCriticalModules,
  getHeavyModules,
} from './loader';

// ============================================================================
// EXPORTS PARA COMPATIBILIDAD
// ============================================================================

// Array de definiciones (evalúa al importar)
export const moduleDefinitions = getModuleDefinitions();

// Helpers
export const getDefinitionsByZone = _getDefsByZone;
export const getDefinition = _getDef;

// Módulos por categoría
export const criticalModules = getCriticalModules();
export const heavyModules = getHeavyModules();
