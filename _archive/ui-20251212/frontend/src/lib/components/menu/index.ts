/**
 * Menu Generator Module Exports (uisis = UI System compliant)
 * ==============================
 * Componentes UI para el módulo menu-generator.
 * Genera menús JSON desde cartas físicas (PDF/imagen) usando IA.
 *
 * Interacciones:
 * - tap: Selector de menús/conversaciones
 * - dbl tap: Crear nueva conversación
 * - long press: Configurar menú (validar, exportar, POS)
 *
 * @module components/menu
 */

// Botón principal con triple interacción
export { default as MenuGeneratorButton } from './uisis-MenuGeneratorButton.svelte';

// Paneles
export { default as MenuGeneratorAddPanel } from './uisis-MenuGeneratorAddPanel.svelte';
export { default as MenuGeneratorConfigPanel } from './uisis-MenuGeneratorConfigPanel.svelte';
