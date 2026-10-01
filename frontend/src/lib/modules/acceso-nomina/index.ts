/**
 * Módulo Acceso a nómina — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'acceso-nomina' alimentado por su blueprint (acceso-nomina.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AccesoNominaPanel from './AccesoNominaPanel.svelte';

export const AccesoNominaModule: UIModule = {
  manifest: {
    id: 'acceso-nomina',
    name: 'Acceso a nómina',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'acceso-nomina-btn',
      icon: '🔐',
      label: 'Acceso nómina',
      action: { type: 'panel', panelId: 'acceso-nomina-panel' },
      order: 101
    },
    panels: [{
      id: 'acceso-nomina-panel',
      title: 'Acceso a nómina',
      size: 'lg'
    }]
  },
  PanelComponent: AccesoNominaPanel
};

export default AccesoNominaModule;

export { default as AccesoNominaPanel } from './AccesoNominaPanel.svelte';
