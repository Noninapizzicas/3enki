/**
 * Módulo Emisión de factura de venta — ENVOLTORIO del generador schema→UI (patrón interfaz-dinamico).
 * Un único componente (BlueprintForm) renderiza las zonas del panel del módulo
 * 'emision-factura-venta' alimentado por su blueprint (emision-factura-venta.blueprint.json, sección `ui`).
 * F7 (construir-interfaz): envoltorio mínimo; el BlueprintForm llama mqttRequest directo.
 * moduleId="contabilidad" = el DOMINIO MQTT real (ui_handlers del module.json).
 */

import type { UIModule } from '$lib/ui-core';
import EmisionFacturaVentaPanel from './EmisionFacturaVentaPanel.svelte';

export const emisionFacturaVentaModule: UIModule = {
  manifest: {
    id: 'emision-factura-venta',
    name: 'Emisión de factura de venta',
    version: '0.1.0',
    zone: 'system-bar',
    button: {
      id: 'emision-factura-venta-btn',
      icon: '🧾',
      label: 'Emitir factura',
      action: { type: 'panel', panelId: 'emision-factura-venta-panel' },
      order: 84
    },
    panels: [{
      id: 'emision-factura-venta-panel',
      title: 'Emisión de factura de venta',
      size: 'lg'
    }]
  },
  PanelComponent: EmisionFacturaVentaPanel
};

export default emisionFacturaVentaModule;

export { default as EmisionFacturaVentaPanel } from './EmisionFacturaVentaPanel.svelte';
