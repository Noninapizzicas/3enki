/**
 * Módulo Historial del proceso — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'historial-proceso-contable' alimentado por su blueprint (historial-proceso-contable.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import HistorialProcesoContablePanel from './HistorialProcesoContablePanel.svelte';

export const historialProcesoContableModule: UIModule = {
  manifest: {
    id: 'historial-proceso-contable',
    name: 'Historial del proceso',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'historial-proceso-contable-btn',
      icon: '🗂️',
      label: 'Historial',
      action: { type: 'panel', panelId: 'historial-proceso-contable-panel' },
      order: 234
    },
    panels: [{
      id: 'historial-proceso-contable-panel',
      title: 'Historial del proceso',
      size: 'lg'
    }]
  },
  PanelComponent: HistorialProcesoContablePanel
};

export default historialProcesoContableModule;

export { default as HistorialProcesoContablePanel } from './HistorialProcesoContablePanel.svelte';
