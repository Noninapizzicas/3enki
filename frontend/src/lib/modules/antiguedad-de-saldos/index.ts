/**
 * Módulo Antigüedad de saldos — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'antiguedad-de-saldos' alimentado por su blueprint (antiguedad-de-saldos.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import AntiguedadDeSaldosPanel from './AntiguedadDeSaldosPanel.svelte';

export const antiguedadDeSaldosModule: UIModule = {
  manifest: {
    id: 'antiguedad-de-saldos',
    name: 'Antigüedad de saldos',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'antiguedad-de-saldos-btn',
      icon: '🏭',
      label: 'Antigüedad',
      action: { type: 'panel', panelId: 'antiguedad-de-saldos-panel' },
      order: 155
    },
    panels: [{
      id: 'antiguedad-de-saldos-panel',
      title: 'Antigüedad de saldos',
      size: 'lg'
    }]
  },
  PanelComponent: AntiguedadDeSaldosPanel
};

export default antiguedadDeSaldosModule;

export { default as AntiguedadDeSaldosPanel } from './AntiguedadDeSaldosPanel.svelte';
