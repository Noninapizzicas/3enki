/**
 * Módulo Cambios desde la última revisión — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cambio-desde-ultima-revision' alimentado por su blueprint (cambio-desde-ultima-revision.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CambioDesdeUltimaRevisionPanel from './CambioDesdeUltimaRevisionPanel.svelte';

export const cambioDesdeUltimaRevisionModule: UIModule = {
  manifest: {
    id: 'cambio-desde-ultima-revision',
    name: 'Cambios desde la última revisión',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cambio-desde-ultima-revision-btn',
      icon: '🗂️',
      label: 'Cambios',
      action: { type: 'panel', panelId: 'cambio-desde-ultima-revision-panel' },
      order: 142
    },
    panels: [{
      id: 'cambio-desde-ultima-revision-panel',
      title: 'Cambios desde la última revisión',
      size: 'lg'
    }]
  },
  PanelComponent: CambioDesdeUltimaRevisionPanel
};

export default cambioDesdeUltimaRevisionModule;

export { default as CambioDesdeUltimaRevisionPanel } from './CambioDesdeUltimaRevisionPanel.svelte';
