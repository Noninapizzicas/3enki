/**
 * Ecosystem Components (UI-SYSTEM-PLAN Compliant)
 *
 * Barra lateral del ecosistema con navegación global.
 *
 * Botones:
 * - Módulos (enableAdd=true): marketplace
 * - Sistema (enableAdd=false): configuración
 * - Alertas (enableAdd=false): notificaciones
 * - Usuario (enableAdd=false): perfil
 *
 * Interacción triple:
 * - TAP: Panel Select
 * - DOUBLE TAP: Panel Add (si enableAdd=true)
 * - LONG PRESS: Panel Config
 */

export { default as EcosystemToolbar } from './EcosystemToolbar.svelte';

/** @deprecated Use the toolbar/EcosystemToolbar for backwards compatibility */
export { default as EcosystemToolbarLegacy } from '$components/toolbar/EcosystemToolbar.svelte';
