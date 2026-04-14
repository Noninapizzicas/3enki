/**
 * Stores Index - Exportaciones centralizadas
 *
 * Agrupa todos los stores de la aplicación:
 * - UI: panel activo, workbar, notificaciones
 * - Workspace: proyecto, provider, modelo, prompt
 * - Chat: mensajes, conversación
 * - Attachments: archivos adjuntos
 * - Persistence: guardar/cargar estado
 */

// UI Store
export {
  activePanel,
  workBarExpanded,
  notifications,
  notificationCount,
  isPanelOpen,
  openPanel,
  closePanel,
  toggleWorkBar,
  expandWorkBar,
  collapseWorkBar,
  addNotification,
  removeNotification,
  clearNotifications,
  notifySuccess,
  notifyError,
  notifyWarning,
  notifyInfo
} from './ui';

// Workspace Store
export {
  WORKSPACES,
  activeProject,
  activeProvider,
  activeModel,
  activePrompt,
  credentialStatus,
  activeWorkspace,
  workspaceConfig,
  hasProject,
  hasProvider,
  hasValidCredentials,
  selectProject,
  clearProject,
  selectProvider,
  clearProvider,
  selectPrompt,
  clearPrompt,
  initWorkspaceSubscriptions,
  getActiveProject,
  getActiveProvider,
  getActiveModel,
  getPersistedWorkspace
} from './workspace';

// Chat Store
export {
  messages,
  conversationId,
  isStreaming,
  streamingMessageId,
  messageCount,
  hasConversation,
  lastMessage,
  userMessages,
  assistantMessages,
  toolStatus,
  sendMessage,
  addMessage,
  endStreaming,
  stopGeneration,
  loadConversation,
  newConversation,
  clearMessages,
  clearConversation,
  toggleMessageContext,
  initChatSubscriptions,
  getMessages,
  getConversationId,
  getIsStreaming
} from './chat';

// Attachments Store
export {
  attachments,
  attachmentCount,
  hasAttachments,
  canAddMore,
  totalSize,
  addAttachment,
  addAttachments,
  removeAttachment,
  removeAttachmentByPath,
  clearAttachments,
  getFileType,
  getAttachmentIcon,
  formatFileSize,
  getAttachments,
  getAttachmentCount
} from './attachments';

// Persistence Store
export {
  loadState,
  saveState,
  getState,
  clearState,
  saveWorkspace,
  saveUI,
  savePanelSize,
  getPanelSize,
  saveConversation
} from './persistence';

// Theme Store
export {
  themeMode,
  effectiveTheme,
  themeColors,
  setTheme,
  toggleTheme,
  applyTheme
} from './theme';
export type { ThemeMode, ThemeColors } from './theme';

// Credentials Store (MQTT-based)
export {
  credentialsStore,
  initCredentialsSubscriptions,
  requestState as requestCredentialsState,
  createCredential,
  updateCredential,
  deleteCredential,
  testCredential,
  selectCredential,
  setActiveTab as setCredentialsTab,
  clearTestResult,
  allCredentials,
  globalCredentials,
  projectCredentials,
  clientCredentials,
  customCredentials,
  selectedCredential,
  providers as credentialProviders,
  levels as credentialLevels,
  isLoading as credentialsLoading,
  hasError as credentialsHasError,
  credentialError,
  credentialCount,
  activeTab as credentialsActiveTab,
  testResult as credentialsTestResult
} from './credentials';
export type { Credential, ProviderOption, LevelOption, CredentialsState } from './credentials';

// Projects Store (MQTT-based)
export {
  projectsStore,
  initProjectsSubscriptions,
  requestProjectsState,
  createProject as createProjectMqtt,
  updateProject as updateProjectMqtt,
  deleteProject as deleteProjectMqtt,
  activateProject as activateProjectMqtt,
  addFeatures as addFeaturesMqtt,
  listFeatures as listFeaturesMqtt,
  projectsList,
  activeProjectId as activeProjectIdMqtt,
  activeProjectData,
  projectsLoading,
  projectsError,
  projectsCount,
  hasProjects
} from './projects';
export type { Project, ProjectsState } from './projects';

// Conversations Store (MQTT-based)
export {
  conversationsStore,
  initConversations,
  loadConversations,
  loadConversation as loadConversationById,
  createConversation,
  updateConversation,
  deleteConversation,
  sendMessage as sendConversationMessage,
  selectConversation,
  clearActiveConversation,
  clearError as clearConversationError,
  resetConversations,
  toggleMessageContext as toggleConversationMessageContext,
  loadContextStats,
  conversationsList,
  conversationSections,
  activeConversationId,
  activeConversation,
  conversationMessages,
  conversationsLoading,
  conversationsSending,
  conversationsError,
  hasConversations,
  hasActiveConversation,
  messagesInContext,
  contextCount,
  contextWindow,
  contextStats
} from './conversations';
export type { Conversation, Message, ConversationSection, ConversationsState, ContextStats } from './conversations';

// Menu Generator Store
export {
  generationStore,
  generateFromText,
  generateFromFile,
  resetGeneration,
  initGenerationSubscriptions,
  generationStep,
  generationError,
  generationResult,
  isGenerating
} from './menu-generator';
export type { GenerationStep, GenerationState, GenerationResult } from './menu-generator';

// Carta Manager Store
export {
  cartaManagerStore,
  loadCartas,
  getCarta,
  selectCarta,
  initCartaManagerSubscriptions,
  sortedCartas,
  selectedCarta,
  cartaLoading,
  cartaError,
  cartaCount
} from './carta-manager';
export type { Carta, CartaResumen, CartaMeta, Categoria, Producto, Ingrediente, CartaManagerState } from './carta-manager';

// Carta Design Store
export {
  cartaDesignStore,
  loadCartaForDesign,
  loadProfiles,
  loadGallery,
  initCartaDesignSubscriptions,
  designProfiles,
  designGallery,
  designLoading,
  designError,
  cartaLoaded,
  cartaResumen
} from './carta-design';
export type { DesignProfile, DesignMeta, CartaDesignState, CartaResumen } from './carta-design';

// HTML Preview Store
export {
  htmlPreviewStore,
  showHtmlPreview,
  initHtmlPreviewSubscriptions,
  registerHtmlPreviewTopic
} from './html-preview';
export type { HtmlPreviewState } from './html-preview';

// Facturas Store (MQTT-based)
export {
  facturasStore,
  initFacturasSubscriptions,
  loadFacturas,
  loadStats as loadFacturasStats,
  getFactura,
  updateFactura,
  reprocesarFactura,
  subirFactura,
  exportarExcel,
  marcarPagada,
  setActiveTab as setFacturasTab,
  selectFactura,
  setFilter as setFacturasFilter,
  clearError as clearFacturasError,
  filteredFacturas,
  selectedFactura,
  activeTab as facturasActiveTab,
  facturasStats,
  facturasLoading,
  facturasError,
  currentFilter as facturasFilter
} from './facturas';
export type { Factura, FacturaEstado, FacturaSource, FacturasState } from './facturas';
