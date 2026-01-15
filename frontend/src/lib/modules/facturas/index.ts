/**
 * Módulo Facturas
 *
 * Gestión de facturas por proyecto con:
 * - Lista con filtros y búsqueda
 * - Detalle y edición de datos extraídos
 * - Subida manual
 * - Exportación a Excel
 */

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
