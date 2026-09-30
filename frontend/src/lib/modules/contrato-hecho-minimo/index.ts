/**
 * Módulo Contrato de hecho mínimo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'contrato-hecho-minimo' alimentado por su blueprint (contrato-hecho-minimo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ContratoHechoMinimoPanel from './ContratoHechoMinimoPanel.svelte';

export const contratoHechoMinimoModule: UIModule = {
  manifest: {
    id: 'contrato-hecho-minimo',
    name: 'Contrato de hecho mínimo',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'contrato-hecho-minimo-btn',
      icon: '⚙️',
      label: 'Contrato',
      action: { type: 'panel', panelId: 'contrato-hecho-minimo-panel' },
      order: 204
    },
    panels: [{
      id: 'contrato-hecho-minimo-panel',
      title: 'Contrato de hecho mínimo',
      size: 'lg'
    }]
  },
  PanelComponent: ContratoHechoMinimoPanel
};

export default contratoHechoMinimoModule;

export { default as ContratoHechoMinimoPanel } from './ContratoHechoMinimoPanel.svelte';
