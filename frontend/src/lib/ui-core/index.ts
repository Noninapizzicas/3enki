/**
 * UI Core - Sistema modular de UI sobre MQTT
 *
 * Arquitectura:
 * - MQTT: Toda comunicación pasa por el broker
 * - Registry: Gestiona módulos por zona
 * - LazyRegistry: Carga módulos bajo demanda
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
  lastMessage,
  setupVisibilityHandler,
  removeVisibilityHandler
} from './mqtt';

// Registry (legacy - compatibilidad)
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

// Lazy Registry (nuevo sistema)
export {
  defineModule,
  loadModule,
  mountModule,
  unmountModule,
  preloadModules,
  getLoadedModule,
  isModuleLoaded,
  isModuleMounted,
  setActiveModule,
  workBarDefinitions,
  chatConfigDefinitions,
  chatToolsDefinitions,
  systemBarDefinitions,
  moduleLoadState,
  loadedModules,
  activeModule
} from './lazy-registry';
