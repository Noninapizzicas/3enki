/**
 * Prompt Manager UI Components
 * ============================
 *
 * Componentes para gestión de prompts de IA.
 *
 * Uso principal:
 *   import { PromptButton } from '$components/prompts';
 *
 *   <PromptButton
 *     on:select={handleSelect}
 *     on:add={handleAdd}
 *     on:config={handleConfig}
 *   />
 *
 * Interacción triple:
 * - Tap: seleccionar prompt
 * - Doble tap: crear nuevo prompt
 * - Long press: configurar prompt
 *
 * @module components/prompts
 * @version 1.0.0
 */

// Main component - use this
export { default as PromptButton } from './PromptButton.svelte';

// Individual panels (for advanced use)
export { default as PromptAddPanel } from './PromptAddPanel.svelte';
export { default as PromptConfigPanel } from './PromptConfigPanel.svelte';

// Types
export type { Prompt } from './PromptConfigPanel.svelte';
