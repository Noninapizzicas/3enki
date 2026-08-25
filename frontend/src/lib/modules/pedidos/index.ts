/**
 * Módulo Pedidos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'pedidos' alimentado por su blueprint (pedidos.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import PedidosPanel from './PedidosPanel.svelte';

export const pedidosModule: UIModule = {
  manifest: {
    id: 'pedidos',
    name: 'Pedidos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'pedidos-btn',
      icon: '📋',
      label: 'Pedidos',
      action: { type: 'panel', panelId: 'pedidos-panel' },
      order: 15
    },
    panels: [{
      id: 'pedidos-panel',
      title: 'Pedidos',
      size: 'lg'
    }]
  },
  PanelComponent: PedidosPanel
};

export default pedidosModule;

export { default as PedidosPanel } from './PedidosPanel.svelte';
