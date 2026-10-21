/**
 * Módulo Regla de contrapartida — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'regla-contrapartida' alimentado por su blueprint (regla-contrapartida.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import ReglaContrapartidaPanel from './ReglaContrapartidaPanel.svelte';

export const reglaContrapartidaModule: UIModule = {
  manifest: {
    id: 'regla-contrapartida',
    name: 'Regla de contrapartida',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'regla-contrapartida-btn',
      icon: '🧭',
      label: 'Regla contrapartida',
      action: { type: 'panel', panelId: 'regla-contrapartida-panel' },
      order: 49
    },
    panels: [{
      id: 'regla-contrapartida-panel',
      title: 'Regla de contrapartida',
      size: 'lg'
    }]
  },
  PanelComponent: ReglaContrapartidaPanel
};

export default reglaContrapartidaModule;

export { default as ReglaContrapartidaPanel } from './ReglaContrapartidaPanel.svelte';
