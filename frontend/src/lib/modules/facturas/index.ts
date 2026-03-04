/**
 * Módulo Facturas
 *
 * Procesamiento de facturas: cualquier formato → datos estructurados.
 * Se integra en LazyShell con work-bar + chat + panel flotante.
 */

import type { UIModule } from '$lib/ui-core';
import FacturasPanel from './FacturasPanel.svelte';

export const facturasModule: UIModule = {
  manifest: {
    id: 'facturas',
    name: 'Facturas',
    version: '1.0.0',
    zone: 'work-bar',
    button: {
      id: 'facturas-btn',
      icon: '🧾',
      label: 'Facturas',
      action: { type: 'panel', panelId: 'facturas-panel' },
      order: 1
    },
    panels: [{
      id: 'facturas-panel',
      title: 'Facturas',
      size: 'lg'
    }]
  },
  PanelComponent: FacturasPanel
};

export default facturasModule;

// Re-export component for direct use
export { default as FacturasPanel } from './FacturasPanel.svelte';

// Re-export store functions
export {
  facturasStore,
  filteredFacturas,
  selectedFactura,
  facturasStats,
  facturasLoading,
  facturasError,
  initFacturasSubscriptions,
  loadFacturas,
  loadStats,
  getFactura,
  updateFactura,
  reprocesarFactura,
  subirFactura,
  exportarExcel,
  marcarPagada,
  setActiveTab,
  selectFactura,
  setFilter,
  clearError,
  type Factura,
  type FacturaEstado,
  type FacturaSource,
  type FacturasState
} from '$lib/stores/facturas';
