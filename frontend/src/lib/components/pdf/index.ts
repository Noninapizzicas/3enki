/**
 * PDF Viewer UI Components
 * ========================
 *
 * Componentes para visualización de archivos PDF.
 *
 * Uso principal:
 *   import { PdfViewerButton } from '$components/pdf';
 *
 *   <PdfViewerButton
 *     {file}
 *     {projectId}
 *     on:extractText={handleExtractText}
 *   />
 *
 * Interacción dual (enableAdd=false):
 * - Tap: abrir visor PDF
 * - Long press: configuración (zoom, extraer texto)
 *
 * Capacidades:
 * - Visualización de PDF
 * - Control de zoom (25% - 400%)
 * - Extracción de texto para IA
 * - Metadata del documento
 *
 * @module components/pdf
 * @version 1.0.0
 */

// Main component - use this
export { default as PdfViewerButton } from './PdfViewerButton.svelte';

// Individual panels (for advanced use)
export { default as PdfViewerPanel } from './PdfViewerPanel.svelte';
export { default as PdfViewerConfigPanel } from './PdfViewerConfigPanel.svelte';

// Types
export type { PdfFile } from './PdfViewerPanel.svelte';
