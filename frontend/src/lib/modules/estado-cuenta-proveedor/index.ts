/**
 * Módulo Estado de cuenta — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'estado-cuenta-proveedor' alimentado por su blueprint (estado-cuenta-proveedor.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import EstadoCuentaProveedorPanel from './EstadoCuentaProveedorPanel.svelte';

export const estadoCuentaProveedorModule: UIModule = {
  manifest: {
    id: 'estado-cuenta-proveedor',
    name: 'Estado de cuenta',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'estado-cuenta-proveedor-btn',
      icon: '🏭',
      label: 'Estado cta.',
      action: { type: 'panel', panelId: 'estado-cuenta-proveedor-panel' },
      order: 152
    },
    panels: [{
      id: 'estado-cuenta-proveedor-panel',
      title: 'Estado de cuenta',
      size: 'lg'
    }]
  },
  PanelComponent: EstadoCuentaProveedorPanel
};

export default estadoCuentaProveedorModule;

export { default as EstadoCuentaProveedorPanel } from './EstadoCuentaProveedorPanel.svelte';
