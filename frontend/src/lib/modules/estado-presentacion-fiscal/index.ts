/**
 * Módulo Estado de presentación — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'estado-presentacion-fiscal' alimentado por su blueprint (estado-presentacion-fiscal.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EstadoPresentacionFiscalPanel from './EstadoPresentacionFiscalPanel.svelte';

export const estadoPresentacionFiscalModule: UIModule = {
  manifest: {
    id: 'estado-presentacion-fiscal',
    name: 'Estado de presentación',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'estado-presentacion-fiscal-btn',
      icon: '🧾',
      label: 'Presentación',
      action: { type: 'panel', panelId: 'estado-presentacion-fiscal-panel' },
      order: 68
    },
    panels: [{
      id: 'estado-presentacion-fiscal-panel',
      title: 'Estado de presentación',
      size: 'lg'
    }]
  },
  PanelComponent: EstadoPresentacionFiscalPanel
};

export default estadoPresentacionFiscalModule;

export { default as EstadoPresentacionFiscalPanel } from './EstadoPresentacionFiscalPanel.svelte';
