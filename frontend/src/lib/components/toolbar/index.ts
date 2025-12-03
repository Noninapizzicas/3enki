// Toolbar Components - Sistema de barras flotantes
// Ver CONTEXT_UI.md para filosofía y especificaciones

// Componentes base
export { default as FloatingToolbar } from './FloatingToolbar.svelte';
export { default as ToolbarIcon } from './ToolbarIcon.svelte';

// Barras específicas
export { default as ModuleToolbar } from './ModuleToolbar.svelte';
export { default as EcosystemToolbar } from './EcosystemToolbar.svelte';
export { default as ChatToolbar } from './ChatToolbar.svelte';

// Layout completo
export { default as MobileChatWorkspace } from './MobileChatWorkspace.svelte';

// Tipos
export type { ToolbarIconConfig, ActionConfig } from './FloatingToolbar.svelte';
