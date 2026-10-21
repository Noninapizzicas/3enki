/**
 * Módulo Aviso al negocio — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'aviso-al-negocio' alimentado por su blueprint (aviso-al-negocio.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AvisoAlNegocioPanel from './AvisoAlNegocioPanel.svelte';

export const AvisoAlNegocioModule: UIModule = {
  manifest: {
    id: 'aviso-al-negocio',
    name: 'Aviso al negocio',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'aviso-al-negocio-btn',
      icon: '📣',
      label: 'Aviso negocio',
      action: { type: 'panel', panelId: 'aviso-al-negocio-panel' },
      order: 108
    },
    panels: [{
      id: 'aviso-al-negocio-panel',
      title: 'Aviso al negocio',
      size: 'lg'
    }]
  },
  PanelComponent: AvisoAlNegocioPanel
};

export default AvisoAlNegocioModule;

export { default as AvisoAlNegocioPanel } from './AvisoAlNegocioPanel.svelte';
