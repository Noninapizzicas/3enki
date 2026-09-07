/**
 * Módulo Ciclo Impresión — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'ciclo-impresion' alimentado por su blueprint (ciclo-impresion.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CicloImpresionPanel from './CicloImpresionPanel.svelte';

export const cicloImpresionModule: UIModule = {
  manifest: {
    id: 'ciclo-impresion',
    name: 'Ciclo Impresión',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'ciclo-impresion-btn',
      icon: '⚙️',
      label: 'Ciclo',
      action: { type: 'panel', panelId: 'ciclo-impresion-panel' },
      order: 22
    },
    panels: [{
      id: 'ciclo-impresion-panel',
      title: 'Ciclo Impresión',
      size: 'lg'
    }]
  },
  PanelComponent: CicloImpresionPanel
};

export default cicloImpresionModule;

export { default as CicloImpresionPanel } from './CicloImpresionPanel.svelte';
