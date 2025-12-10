// Toolbar Components - Sistema de barras flotantes
// Ver CONTEXT_UI.md y UI-SYSTEM-PLAN.md para filosofía y especificaciones

// Componentes base (uisis = UI System compliant)
export { default as FloatingToolbar } from './uisis-FloatingToolbar.svelte';
export { default as ToolbarIcon } from './uisis-ToolbarIcon.svelte';

// Barras específicas
export { default as ModuleToolbar } from './uisis-ModuleToolbar.svelte';
export { default as EcosystemToolbar } from './uisis-EcosystemToolbar.svelte';
export { default as ChatToolbar } from './uisis-ChatToolbar.svelte';
export { default as TopToolbar } from './uisis-TopToolbar.svelte';

// Layout completo
export { default as MobileChatWorkspace } from './uisis-MobileChatWorkspace.svelte';

// Tipos
export type { ToolbarIconConfig, ActionConfig } from './uisis-FloatingToolbar.svelte';
