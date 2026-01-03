/**
 * Layout Components - Exportaciones centralizadas
 *
 * Estructura de la UI:
 * - AppShell: Layout base reutilizable (slots: top-bar, content, controls, tools)
 * - Shell: Página de Chat (usa AppShell)
 * - WorkBar: Barra de módulos de trabajo (plegable)
 * - ChatArea: Área de mensajes
 * - ChatConfig: Configuración del chat
 * - ChatInput: Campo de entrada
 * - ChatTools: Herramientas y adjuntos
 * - SystemBar: Barra lateral de sistema
 * - Panel: Panel deslizable para módulos
 */

// Base layout (reutilizable para todas las páginas)
export { default as AppShell } from './AppShell.svelte';

// Page-specific layouts
export { default as Shell } from './Shell.svelte';

// Shared components
export { default as WorkBar } from './WorkBar.svelte';
export { default as SystemBar } from './SystemBar.svelte';
export { default as Panel } from './Panel.svelte';

// Chat-specific components
export { default as ChatArea } from './ChatArea.svelte';
export { default as ChatConfig } from './ChatConfig.svelte';
export { default as ChatInput } from './ChatInput.svelte';
export { default as ChatTools } from './ChatTools.svelte';

// Lazy loading versions
export { default as LazyShell } from './LazyShell.svelte';
export { default as LazyWorkBar } from './LazyWorkBar.svelte';
export { default as LazyPanel } from './LazyPanel.svelte';
