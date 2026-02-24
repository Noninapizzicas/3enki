/**
 * Modulo Impresion - Comandas de cocina e impresora Bluetooth
 *
 * Migrado de vanilla JS standalone a modulo UI integrado.
 * Usa MQTT Request/Response en vez de REST fetch().
 *
 * Zona: work-bar
 * Icono dinamico: segun estado del transporte
 *
 * MQTT:
 * - Publica: impresion/estado, impresion/conectar, impresion/ticket, impresion/historial
 * - Suscribe: impresion.comanda_generada, impresion.error
 */

export { default as ImpresionPanel } from './ImpresionPanel.svelte';

// Re-export store functions
export {
  impresionStore,
  transporteEstado,
  isConectada,
  totalComandas,
  activeTab,
  isLoading,
  impresionError,
  initImpresionSubscriptions,
  loadEstado,
  loadMetrics,
  loadHistorial,
  conectarImpresora,
  reconectarImpresora,
  imprimirComanda,
  setActiveTab,
  clearResultado,
  clearError,
  type ImpresionState,
  type ImpresionTab,
  type Canal,
  type ComandaItem,
  type ComandaRegistro,
  type ConectarParams,
  type TransporteEstado
} from '$lib/stores/impresion';
