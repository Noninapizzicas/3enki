/**
 * Módulo Cuenta de proveedor — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'cuenta-proveedor' alimentado por su blueprint (cuenta-proveedor.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 */

import type { UIModule } from '$lib/ui-core';
import CuentaProveedorPanel from './CuentaProveedorPanel.svelte';

export const cuentaProveedorModule: UIModule = {
  manifest: {
    id: 'cuenta-proveedor',
    name: 'Cuenta de proveedor',
    version: '0.1.0',
    zone: 'work-bar',
    button: {
      id: 'cuenta-proveedor-btn',
      icon: '🏭',
      label: 'Cta. proveedor',
      action: { type: 'panel', panelId: 'cuenta-proveedor-panel' },
      order: 151
    },
    panels: [{
      id: 'cuenta-proveedor-panel',
      title: 'Cuenta de proveedor',
      size: 'lg'
    }]
  },
  PanelComponent: CuentaProveedorPanel
};

export default cuentaProveedorModule;

export { default as CuentaProveedorPanel } from './CuentaProveedorPanel.svelte';
