/**
 * UI Core - Sistema modular de UI
 *
 * Arquitectura:
 * - Shell: renderiza zonas dinámicamente
 * - Módulos: plugins UI que se auto-registran
 * - EventBus: comunicación 100% por eventos
 * - Registry: autodescubrimiento de módulos
 */

export * from './types';
export { eventBus } from './event-bus';
export { registry } from './registry';
export { default as Shell } from './Shell.svelte';
