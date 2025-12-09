/**
 * File Browser UI Components
 * ==========================
 *
 * Componentes para navegación y gestión de archivos.
 *
 * Uso principal:
 *   import { FileBrowserButton } from '$components/files';
 *
 *   <FileBrowserButton
 *     {projectId}
 *     on:select={handleSelect}
 *     on:openEditor={handleOpenEditor}
 *     on:openPdf={handleOpenPdf}
 *   />
 *
 * Interacción triple:
 * - Tap: navegar archivos (árbol)
 * - Doble tap: crear archivo/carpeta
 * - Long press: configurar archivo
 *
 * @module components/files
 * @version 1.0.0
 */

// Main component - use this
export { default as FileBrowserButton } from './FileBrowserButton.svelte';

// Individual panels (for advanced use)
export { default as FileBrowserAddPanel } from './FileBrowserAddPanel.svelte';
export { default as FileBrowserConfigPanel } from './FileBrowserConfigPanel.svelte';

// Types
export type { FileItem } from './FileBrowserConfigPanel.svelte';
