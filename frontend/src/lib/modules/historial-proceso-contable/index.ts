/**
 * Módulo Historial del proceso contable — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'historial-proceso-contable' alimentado por su blueprint (historial-proceso-contable.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import HistorialProcesoContablePanel from './HistorialProcesoContablePanel.svelte';

export const historialProcesoContableModule: UIModule = {
  manifest: {
    id: 'historial-proceso-contable',
    name: 'Historial del proceso contable',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'historial-proceso-contable-btn',
      icon: '🗂️',
      label: 'Historial proceso',
      action: { type: 'panel', panelId: 'historial-proceso-contable-panel' },
      order: 86
    },
    panels: [{
      id: 'historial-proceso-contable-panel',
      title: 'Historial del proceso contable',
      size: 'lg'
    }]
  },
  PanelComponent: HistorialProcesoContablePanel
};

export default historialProcesoContableModule;

export { default as HistorialProcesoContablePanel } from './HistorialProcesoContablePanel.svelte';
