/**
 * Módulo busqueda-repositorios — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'busqueda-repositorios' alimentado por su blueprint (busqueda-repositorios.blueprint.json, sección `ui`).
 * Nada artesanal: este trío es el mismo para CUALQUIER módulo — solo cambia el blueprint.
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import BusquedaRepositoriosPanel from './BusquedaRepositoriosPanel.svelte';

export const busquedaRepositoriosModule: UIModule = {
  manifest: {
    id: 'busqueda-repositorios',
    name: 'Buscar Modelos',
    version: '0.1.0',
    zone: 'chat-tools',
    button: {
      id: 'busqueda-repositorios-btn',
      icon: '🔍',
      label: 'Buscar',
      action: { type: 'panel', panelId: 'busqueda-repositorios-panel' },
      order: 26
    },
    panels: [{
      id: 'busqueda-repositorios-panel',
      title: 'Buscar Modelos',
      size: 'lg'
    }]
  },
  PanelComponent: BusquedaRepositoriosPanel
};

export default busquedaRepositoriosModule;

export { default as BusquedaRepositoriosPanel } from './BusquedaRepositoriosPanel.svelte';
