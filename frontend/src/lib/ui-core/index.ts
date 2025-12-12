/**
 * UI Core - Sistema modular de UI sobre MQTT
 *
 * Arquitectura:
 * - MQTT: Toda comunicación pasa por el broker (mismo que backend)
 * - Shell: Renderiza zonas dinámicamente
 * - Registry: Gestiona módulos y sus suscripciones
 * - Módulos: Plugins UI que se auto-registran
 *
 * El frontend es simplemente otro "core" conectado al broker MQTT.
 */

// Tipos
export * from './types';

// MQTT Client
export {
  connect,
  disconnect,
  publish,
  subscribe,
  isConnected,
  status,
  error,
  connected,
  lastMessage
} from './mqtt';

// Registry
export {
  register,
  unregister,
  getModule,
  hasModule,
  buttonsByZone,
  panels,
  modules
} from './registry';

// Componentes
export { default as Shell } from './Shell.svelte';
