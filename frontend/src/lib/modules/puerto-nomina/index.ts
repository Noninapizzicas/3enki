/**
 * Módulo Puerto de nómina — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'puerto-nomina' alimentado por su blueprint (puerto-nomina.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import PuertoNominaPanel from './PuertoNominaPanel.svelte';

export const puertoNominaModule: UIModule = {
  manifest: {
    id: 'puerto-nomina',
    name: 'Puerto de nómina',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'puerto-nomina-btn',
      icon: '💼',
      label: 'Puerto nómina',
      action: { type: 'panel', panelId: 'puerto-nomina-panel' },
      order: 47
    },
    panels: [{
      id: 'puerto-nomina-panel',
      title: 'Puerto de nómina',
      size: 'lg'
    }]
  },
  PanelComponent: PuertoNominaPanel
};

export default puertoNominaModule;

export { default as PuertoNominaPanel } from './PuertoNominaPanel.svelte';
