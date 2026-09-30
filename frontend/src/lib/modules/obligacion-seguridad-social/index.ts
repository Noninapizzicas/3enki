/**
 * Módulo Obligación Seguridad Social — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'obligacion-seguridad-social' alimentado por su blueprint (obligacion-seguridad-social.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import ObligacionSeguridadSocialPanel from './ObligacionSeguridadSocialPanel.svelte';

export const obligacionSeguridadSocialModule: UIModule = {
  manifest: {
    id: 'obligacion-seguridad-social',
    name: 'Obligación Seguridad Social',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'obligacion-seguridad-social-btn',
      icon: '👤',
      label: 'Seg. Social',
      action: { type: 'panel', panelId: 'obligacion-seguridad-social-panel' },
      order: 113
    },
    panels: [{
      id: 'obligacion-seguridad-social-panel',
      title: 'Obligación Seguridad Social',
      size: 'lg'
    }]
  },
  PanelComponent: ObligacionSeguridadSocialPanel
};

export default obligacionSeguridadSocialModule;

export { default as ObligacionSeguridadSocialPanel } from './ObligacionSeguridadSocialPanel.svelte';
