/**
 * Módulo Aviso de cuadre — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'aviso-cuadre' alimentado por su blueprint (aviso-cuadre.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import AvisoCuadrePanel from './AvisoCuadrePanel.svelte';

export const AvisoCuadreModule: UIModule = {
  manifest: {
    id: 'aviso-cuadre',
    name: 'Aviso de cuadre',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'aviso-cuadre-btn',
      icon: '⚖️',
      label: 'Aviso cuadre',
      action: { type: 'panel', panelId: 'aviso-cuadre-panel' },
      order: 100
    },
    panels: [{
      id: 'aviso-cuadre-panel',
      title: 'Aviso de cuadre',
      size: 'lg'
    }]
  },
  PanelComponent: AvisoCuadrePanel
};

export default AvisoCuadreModule;

export { default as AvisoCuadrePanel } from './AvisoCuadrePanel.svelte';
