/**
 * Conversation Manager UI Components
 * ===================================
 *
 * Componentes para gestión de conversaciones.
 *
 * Uso principal:
 *   import { ConversationButton } from '$components/conversations';
 *
 *   <ConversationButton
 *     {projectId}
 *     on:select={handleSelect}
 *     on:add={handleAdd}
 *     on:config={handleConfig}
 *   />
 *
 * Interacción triple:
 * - Tap: seleccionar conversación
 * - Doble tap: crear nueva conversación
 * - Long press: configurar conversación
 *
 * @module components/conversations
 * @version 1.0.0
 */

// Main component - use this
export { default as ConversationButton } from './ConversationButton.svelte';

// Individual panels (for advanced use)
export { default as ConversationAddPanel } from './ConversationAddPanel.svelte';
export { default as ConversationConfigPanel } from './ConversationConfigPanel.svelte';

// Legacy component (full chat functionality)
export { default as ConversationPanel } from './ConversationPanel.svelte';

// Types
export type { Conversation } from './ConversationConfigPanel.svelte';
