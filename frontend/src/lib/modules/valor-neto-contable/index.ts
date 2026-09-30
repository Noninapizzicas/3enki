/**
 * Módulo Valor neto contable — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'valor-neto-contable' alimentado por su blueprint (valor-neto-contable.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ValorNetoContablePanel from './ValorNetoContablePanel.svelte';

export const valorNetoContableModule: UIModule = {
  manifest: {
    id: 'valor-neto-contable',
    name: 'Valor neto contable',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'valor-neto-contable-btn',
      icon: '📊',
      label: 'VNC',
      action: { type: 'panel', panelId: 'valor-neto-contable-panel' },
      order: 221
    },
    panels: [{
      id: 'valor-neto-contable-panel',
      title: 'Valor neto contable',
      size: 'lg'
    }]
  },
  PanelComponent: ValorNetoContablePanel
};

export default valorNetoContableModule;

export { default as ValorNetoContablePanel } from './ValorNetoContablePanel.svelte';
