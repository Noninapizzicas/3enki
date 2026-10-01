/**
 * Módulo Estado de presentación fiscal — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'estado-presentacion-fiscal' alimentado por su blueprint (estado-presentacion-fiscal.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import EstadoPresentacionFiscalPanel from './EstadoPresentacionFiscalPanel.svelte';

export const estadoPresentacionFiscalModule: UIModule = {
  manifest: {
    id: 'estado-presentacion-fiscal',
    name: 'Estado de presentación fiscal',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'estado-presentacion-fiscal-btn',
      icon: '🏛️',
      label: 'Estado fiscal',
      action: { type: 'panel', panelId: 'estado-presentacion-fiscal-panel' },
      order: 43
    },
    panels: [{
      id: 'estado-presentacion-fiscal-panel',
      title: 'Estado de presentación fiscal',
      size: 'lg'
    }]
  },
  PanelComponent: EstadoPresentacionFiscalPanel
};

export default estadoPresentacionFiscalModule;

export { default as EstadoPresentacionFiscalPanel } from './EstadoPresentacionFiscalPanel.svelte';
