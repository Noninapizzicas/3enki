/**
 * Módulo Escritor del diario — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'escritor-diario' alimentado por su blueprint (escritor-diario.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import EscritorDiarioPanel from './EscritorDiarioPanel.svelte';

export const escritorDiarioModule: UIModule = {
  manifest: {
    id: 'escritor-diario',
    name: 'Escritor del diario',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'escritor-diario-btn',
      icon: '📓',
      label: 'Escritor diario',
      action: { type: 'panel', panelId: 'escritor-diario-panel' },
      order: 92
    },
    panels: [{
      id: 'escritor-diario-panel',
      title: 'Escritor del diario',
      size: 'lg'
    }]
  },
  PanelComponent: EscritorDiarioPanel
};

export default escritorDiarioModule;

export { default as EscritorDiarioPanel } from './EscritorDiarioPanel.svelte';
