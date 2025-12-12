/**
 * Text Editor UI Components
 * =========================
 *
 * Componentes para edición de archivos de texto.
 *
 * Uso principal:
 *   import { TextEditorButton } from '$components/editor';
 *
 *   <TextEditorButton
 *     {file}
 *     {projectId}
 *     on:save={handleSave}
 *   />
 *
 * Interacción dual (enableAdd=false):
 * - Tap: abrir editor
 * - Long press: configuración
 *
 * Formatos soportados:
 * - MD, JSON, TXT, JS, TS, HTML, CSS, YAML, XML
 *
 * @module components/editor
 * @version 1.0.0
 */

// Main component - use this (uisis = UI System compliant)
export { default as TextEditorButton } from './uisis-TextEditorButton.svelte';

// Individual panels (for advanced use)
export { default as TextEditorPanel } from './uisis-TextEditorPanel.svelte';
export { default as TextEditorConfigPanel } from './uisis-TextEditorConfigPanel.svelte';

// Types
export type { FileInfo } from './uisis-TextEditorPanel.svelte';
export type { EditorSettings } from './uisis-TextEditorConfigPanel.svelte';
