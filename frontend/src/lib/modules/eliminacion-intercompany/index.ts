/**
 * Módulo Eliminación intercompany — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'eliminacion-intercompany' alimentado por su blueprint (eliminacion-intercompany.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EliminacionIntercompanyPanel from './EliminacionIntercompanyPanel.svelte';

export const eliminacionIntercompanyModule: UIModule = {
  manifest: {
    id: 'eliminacion-intercompany',
    name: 'Eliminación intercompany',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'eliminacion-intercompany-btn',
      icon: '📊',
      label: 'Intercompany',
      action: { type: 'panel', panelId: 'eliminacion-intercompany-panel' },
      order: 225
    },
    panels: [{
      id: 'eliminacion-intercompany-panel',
      title: 'Eliminación intercompany',
      size: 'lg'
    }]
  },
  PanelComponent: EliminacionIntercompanyPanel
};

export default eliminacionIntercompanyModule;

export { default as EliminacionIntercompanyPanel } from './EliminacionIntercompanyPanel.svelte';
