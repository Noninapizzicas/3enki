/**
 * Módulo Etiquetado analítico — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'etiquetado-analitico' alimentado por su blueprint (etiquetado-analitico.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EtiquetadoAnaliticoPanel from './EtiquetadoAnaliticoPanel.svelte';

export const etiquetadoAnaliticoModule: UIModule = {
  manifest: {
    id: 'etiquetado-analitico',
    name: 'Etiquetado analítico',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'etiquetado-analitico-btn',
      icon: '📊',
      label: 'Etiquetar',
      action: { type: 'panel', panelId: 'etiquetado-analitico-panel' },
      order: 226
    },
    panels: [{
      id: 'etiquetado-analitico-panel',
      title: 'Etiquetado analítico',
      size: 'lg'
    }]
  },
  PanelComponent: EtiquetadoAnaliticoPanel
};

export default etiquetadoAnaliticoModule;

export { default as EtiquetadoAnaliticoPanel } from './EtiquetadoAnaliticoPanel.svelte';
