/**
 * Project Manager UI Components
 * =============================
 *
 * Componentes para gestión de proyectos.
 *
 * Uso principal:
 *   import { ProjectButton } from '$components/projects';
 *
 *   <ProjectButton
 *     on:select={handleSelect}
 *     on:add={handleAdd}
 *     on:config={handleConfig}
 *   />
 *
 * Interacción triple:
 * - Tap: seleccionar proyecto
 * - Doble tap: crear nuevo proyecto
 * - Long press: configurar proyecto
 *
 * @module components/projects
 * @version 1.0.0
 */

// Main component - use this
export { default as ProjectButton } from './ProjectButton.svelte';

// Individual panels (for advanced use)
export { default as ProjectAddPanel } from './ProjectAddPanel.svelte';
export { default as ProjectConfigPanel } from './ProjectConfigPanel.svelte';

// Types
export type { Project } from './ProjectConfigPanel.svelte';
