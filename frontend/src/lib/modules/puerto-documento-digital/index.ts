/**
 * Módulo Puerto de documento digital — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'puerto-documento-digital' alimentado por su blueprint (puerto-documento-digital.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import PuertoDocumentoDigitalPanel from './PuertoDocumentoDigitalPanel.svelte';

export const puertoDocumentoDigitalModule: UIModule = {
  manifest: {
    id: 'puerto-documento-digital',
    name: 'Puerto de documento digital',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'puerto-documento-digital-btn',
      icon: '📥',
      label: 'Documento digital',
      action: { type: 'panel', panelId: 'puerto-documento-digital-panel' },
      order: 89
    },
    panels: [{
      id: 'puerto-documento-digital-panel',
      title: 'Puerto de documento digital',
      size: 'lg'
    }]
  },
  PanelComponent: PuertoDocumentoDigitalPanel
};

export default puertoDocumentoDigitalModule;

export { default as PuertoDocumentoDigitalPanel } from './PuertoDocumentoDigitalPanel.svelte';
