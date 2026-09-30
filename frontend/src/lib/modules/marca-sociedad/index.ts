/**
 * Módulo Marca de sociedad — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'marca-sociedad' alimentado por su blueprint (marca-sociedad.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import MarcaSociedadPanel from './MarcaSociedadPanel.svelte';

export const marcaSociedadModule: UIModule = {
  manifest: {
    id: 'marca-sociedad',
    name: 'Marca de sociedad',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'marca-sociedad-btn',
      icon: '📊',
      label: 'Sociedad',
      action: { type: 'panel', panelId: 'marca-sociedad-panel' },
      order: 224
    },
    panels: [{
      id: 'marca-sociedad-panel',
      title: 'Marca de sociedad',
      size: 'lg'
    }]
  },
  PanelComponent: MarcaSociedadPanel
};

export default marcaSociedadModule;

export { default as MarcaSociedadPanel } from './MarcaSociedadPanel.svelte';
