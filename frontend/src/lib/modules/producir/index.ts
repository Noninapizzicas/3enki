/**
 * Módulo Producir — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'producir' alimentado por su blueprint (producir.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * Zona chat-tools (barra inferior del chat): producir es un chat_tool (motor de cálculo puro).
 */

import type { UIModule } from '$lib/ui-core';
import ProducirPanel from './ProducirPanel.svelte';

export const producirModule: UIModule = {
  manifest: {
    id: 'producir',
    name: 'Producir',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'producir-btn',
      icon: '🏭',
      label: 'Producir',
      action: { type: 'panel', panelId: 'producir-panel' },
      order: 13
    },
    panels: [{
      id: 'producir-panel',
      title: 'Producir',
      size: 'lg'
    }]
  },
  PanelComponent: ProducirPanel
};

export default producirModule;

export { default as ProducirPanel } from './ProducirPanel.svelte';
