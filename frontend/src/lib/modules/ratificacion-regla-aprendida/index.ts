/**
 * Módulo Ratificación de regla aprendida — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'ratificacion-regla-aprendida' alimentado por su blueprint (ratificacion-regla-aprendida.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import RatificacionReglaAprendidaPanel from './RatificacionReglaAprendidaPanel.svelte';

export const ratificacionReglaAprendidaModule: UIModule = {
  manifest: {
    id: 'ratificacion-regla-aprendida',
    name: 'Ratificación de regla aprendida',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'ratificacion-regla-aprendida-btn',
      icon: '⚖️',
      label: 'Ratificar regla',
      action: { type: 'panel', panelId: 'ratificacion-regla-aprendida-panel' },
      order: 95
    },
    panels: [{
      id: 'ratificacion-regla-aprendida-panel',
      title: 'Ratificación de regla aprendida',
      size: 'lg'
    }]
  },
  PanelComponent: RatificacionReglaAprendidaPanel
};

export default ratificacionReglaAprendidaModule;

export { default as RatificacionReglaAprendidaPanel } from './RatificacionReglaAprendidaPanel.svelte';
