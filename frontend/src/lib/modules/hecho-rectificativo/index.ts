/**
 * Módulo Hecho rectificativo — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'hecho-rectificativo' alimentado por su blueprint (hecho-rectificativo.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import HechoRectificativoPanel from './HechoRectificativoPanel.svelte';

export const hechoRectificativoModule: UIModule = {
  manifest: {
    id: 'hecho-rectificativo',
    name: 'Hecho rectificativo',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'hecho-rectificativo-btn',
      icon: '🔁',
      label: 'Hecho rectificativo',
      action: { type: 'panel', panelId: 'hecho-rectificativo-panel' },
      order: 85
    },
    panels: [{
      id: 'hecho-rectificativo-panel',
      title: 'Hecho rectificativo',
      size: 'lg'
    }]
  },
  PanelComponent: HechoRectificativoPanel
};

export default hechoRectificativoModule;

export { default as HechoRectificativoPanel } from './HechoRectificativoPanel.svelte';
