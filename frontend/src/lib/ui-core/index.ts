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
  getPanelComponent as registryGetPanelComponent,
  getPanelConfig as registryGetPanelConfig,
  updateAppState,
  getAppState,
  workBarModules,
  chatConfigModules,
  chatToolsModules,
  systemBarModules,
  activePanel as registryActivePanel,
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
  activeModule,
  // Panel API unificada: siempre usa lazy-registry
  openPanel,
  closePanel,
  activePanel,
  getPanelComponent,
  getPanelConfig
} from './lazy-registry';

// MQTT Request/Response
export {
  mqttRequest,
  listRequest,
  getRequest,
  createRequest,
  updateRequest,
  deleteRequest,
  cancelRequest,
  cancelAllRequests,
  getPendingCount,
  MqttTimeoutError,
  MqttRequestError,
  MqttNotConnectedError
} from './mqtt-request';
