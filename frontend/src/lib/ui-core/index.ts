/**
 * UI Core - Sistema modular de UI sobre MQTT
 *
 * Arquitectura:
 * - MQTT: Toda comunicación pasa por el broker
 * - Registry: Gestiona módulos por zona
 * - Stores: Estado reactivo compartido
 * - Layout: Componentes de estructura
 *
 * El frontend es otro "core" conectado al broker MQTT.
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
  unregisterZone,
  getModule,
  openPanel,
  closePanel,
  getPanelComponent,
  getPanelConfig,
  updateAppState,
  getAppState,
  workBarModules,
  chatConfigModules,
  chatToolsModules,
  systemBarModules,
  activePanel,
  appState,
  modules
} from './registry';
