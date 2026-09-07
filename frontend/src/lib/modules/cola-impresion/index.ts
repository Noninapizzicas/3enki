/**
 * Módulo Cola Impresión — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cola-impresion' alimentado por su blueprint (cola-impresion.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ColaImpresionPanel from './ColaImpresionPanel.svelte';

export const colaImpresionModule: UIModule = {
  manifest: {
    id: 'cola-impresion',
    name: 'Cola Impresión',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cola-impresion-btn',
      icon: '🖨️',
      label: 'Cola',
      action: { type: 'panel', panelId: 'cola-impresion-panel' },
      order: 21
    },
    panels: [{
      id: 'cola-impresion-panel',
      title: 'Cola Impresión',
      size: 'lg'
    }]
  },
  PanelComponent: ColaImpresionPanel
};

export default colaImpresionModule;

export { default as ColaImpresionPanel } from './ColaImpresionPanel.svelte';
