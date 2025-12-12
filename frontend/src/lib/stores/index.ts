/**
 * Stores Index - Exportaciones centralizadas
 *
 * Agrupa todos los stores de la aplicación:
 * - UI: panel activo, workbar, notificaciones
 * - Workspace: proyecto, provider, modelo, prompt
 * - Chat: mensajes, conversación, streaming
 * - Attachments: archivos adjuntos
 */

// UI Store
export {
  activePanel,
  workBarExpanded,
  notifications,
  notificationCount,
  hasNotifications,
  openPanel,
  closePanel,
  toggleWorkBar,
  expandWorkBar,
  collapseWorkBar,
  addNotification,
  removeNotification,
  clearNotifications,
  getActivePanel,
  getWorkBarExpanded
} from './ui';

// Workspace Store
export {
  activeProject,
  activeProvider,
  activeModel,
  activePrompt,
  credentialStatus,
  activeWorkspace,
  workspaceModules,
  hasProject,
  hasProvider,
  hasPrompt,
  credentialsValid,
  selectProject,
  selectProvider,
  selectPrompt,
  updateCredentials,
  clearWorkspace,
  initWorkspaceSubscriptions,
  getActiveProject,
  getActiveProvider,
  getActiveModel
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
  sendMessage,
  addMessage,
  endStreaming,
  loadConversation,
  newConversation,
  clearMessages,
  clearConversation,
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
