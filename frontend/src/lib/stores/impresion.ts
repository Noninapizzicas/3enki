/**
 * Impresion Store - MQTT Request/Response
 *
 * Comunicacion via MQTT con patron Request/Response:
 * - domain: "impresion"
 * - actions: estado, conectar, ticket, historial, health, metrics
 *
 * Migrado de vanilla JS (fetch REST) al patron estandar del sistema.
 */

import { writable, derived } from 'svelte/store';
import { subscribe } from '$lib/ui-core/mqtt';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface TransporteEstado {
  modo: 'dispositivo' | 'tcp' | 'comando';
  estado: 'desconectado' | 'conectando' | 'conectado' | 'error';
  dispositivo?: string;
  mac?: string | null;
  tcp?: string;
}

export interface EstadoResponse {
  modulo: { name: string; version: string };
  impresora: { ancho: string; chars_linea: number };
  transporte: TransporteEstado;
}

export interface MetricsResponse {
  comandas_generadas: number;
  reimpresiones: number;
  errores: number;
  errores_transporte: number;
  historial_size: number;
  transporte_estado: string;
}

export interface ComandaRegistro {
  comanda_id: string;
  pedido_id: string;
  cuenta_id: string;
  canal: string | null;
  items_count: number;
  reimpresion: boolean;
  generada_at: string;
}

export interface HistorialResponse {
  comandas: ComandaRegistro[];
  total: number;
}

export interface ComandaItem {
  nombre: string;
  cantidad: number;
  ingredientes?: string[];
  variaciones?: {
    ingredientes_quitar?: string[];
    ingredientes_anadir?: string[];
    [key: string]: unknown;
  };
  tipo?: string;
  pizza_izquierda?: string;
  pizza_derecha?: string;
  notas?: string;
}

export interface ConectarParams {
  modo: 'dispositivo' | 'tcp' | 'comando';
  mac?: string;
  dispositivo?: string;
  rfcomm_canal?: number;
  tcp_host?: string;
  tcp_puerto?: number;
  comando?: string;
}

export type Canal = 'mesa' | 'telefono' | 'llevar' | 'glovo';

export type ImpresionTab = 'reimprimir' | 'historial' | 'config';

export interface ImpresionState {
  // Transporte / estado impresora
  transporte: TransporteEstado | null;
  moduloInfo: { name: string; version: string } | null;
  impresoraInfo: { ancho: string; chars_linea: number } | null;

  // Metrics
  metrics: MetricsResponse | null;

  // Historial
  historial: ComandaRegistro[];
  historialTotal: number;

  // UI state
  activeTab: ImpresionTab;
  loading: boolean;
  error: string | null;
  resultado: { type: 'ok' | 'error' | 'info'; message: string } | null;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: ImpresionState = {
  transporte: null,
  moduloInfo: null,
  impresoraInfo: null,
  metrics: null,
  historial: [],
  historialTotal: 0,
  activeTab: 'reimprimir',
  loading: false,
  error: null,
  resultado: null
};

// =============================================================================
// STORE
// =============================================================================

export const impresionStore = writable<ImpresionState>(initialState);

// =============================================================================
// ACTIONS - Request/Response Pattern
// =============================================================================

/**
 * Carga el estado actual de la impresora y transporte
 */
export async function loadEstado(): Promise<void> {
  try {
    const response = await mqttRequest<EstadoResponse>('impresion', 'estado');
    const data = response.data;

    impresionStore.update(s => ({
      ...s,
      moduloInfo: data.modulo,
      impresoraInfo: data.impresora,
      transporte: data.transporte
    }));
  } catch (error) {
    console.error('[Impresion] loadEstado failed:', getErrorMessage(error));
  }
}

/**
 * Carga metricas del modulo
 */
export async function loadMetrics(): Promise<void> {
  try {
    const response = await mqttRequest<MetricsResponse>('impresion', 'metrics');

    impresionStore.update(s => ({
      ...s,
      metrics: response.data
    }));
  } catch (error) {
    console.error('[Impresion] loadMetrics failed:', getErrorMessage(error));
  }
}

/**
 * Carga historial de comandas
 */
export async function loadHistorial(limit = 30): Promise<void> {
  impresionStore.update(s => ({ ...s, loading: true }));

  try {
    const response = await mqttRequest<HistorialResponse>('impresion', 'historial', { limit });

    impresionStore.update(s => ({
      ...s,
      historial: response.data.comandas || [],
      historialTotal: response.data.total || 0,
      loading: false
    }));
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    impresionStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Impresion] loadHistorial failed:', errorMessage);
  }
}

/**
 * (Re)conectar impresora con config dada
 */
export async function conectarImpresora(params: ConectarParams): Promise<boolean> {
  impresionStore.update(s => ({
    ...s,
    loading: true,
    resultado: { type: 'info', message: 'Conectando...' }
  }));

  try {
    const response = await mqttRequest<TransporteEstado>('impresion', 'conectar', params);

    impresionStore.update(s => ({
      ...s,
      transporte: response.data,
      loading: false,
      resultado: { type: 'ok', message: 'Impresora conectada' }
    }));

    // Recargar estado completo
    await loadEstado();
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    impresionStore.update(s => ({
      ...s,
      loading: false,
      resultado: { type: 'error', message: errorMessage }
    }));
    console.error('[Impresion] conectar failed:', errorMessage);
    return false;
  }
}

/**
 * Reconectar impresora con config actual (sin cambiar params)
 */
export async function reconectarImpresora(): Promise<boolean> {
  return conectarImpresora({} as ConectarParams);
}

/**
 * Reimprimir comanda manualmente
 */
export async function imprimirComanda(
  cuenta_id: string,
  canal: Canal,
  items: ComandaItem[],
  pedido_id?: string,
  notas_generales?: string
): Promise<ComandaRegistro | null> {
  impresionStore.update(s => ({
    ...s,
    loading: true,
    resultado: { type: 'info', message: 'Imprimiendo...' }
  }));

  try {
    const payload: Record<string, unknown> = { cuenta_id, canal, items };
    if (pedido_id) payload.pedido_id = pedido_id;
    if (notas_generales) payload.notas_generales = notas_generales;

    const response = await mqttRequest<ComandaRegistro>('impresion', 'ticket', payload);

    impresionStore.update(s => ({
      ...s,
      loading: false,
      resultado: { type: 'ok', message: `Comanda impresa (${response.data.comanda_id})` }
    }));

    // Recargar historial
    await loadHistorial();
    return response.data;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    impresionStore.update(s => ({
      ...s,
      loading: false,
      resultado: { type: 'error', message: errorMessage }
    }));
    console.error('[Impresion] imprimir failed:', errorMessage);
    return null;
  }
}

// =============================================================================
// TICKET DE VENTA
// =============================================================================

export interface TicketVentaItem {
  nombre: string;
  cantidad: number;
  precio_unitario: number;
  precio_total?: number;
}

export interface DatosNegocio {
  nombre?: string;
  direccion?: string;
  telefono?: string;
  nif?: string;
}

export interface TicketVentaParams {
  cuenta_id: string;
  project_id?: string;
  destino?: string;
  canal?: Canal;
  items: TicketVentaItem[];
  subtotal?: number;
  iva?: number | { porcentaje: number; importe: number };
  total: number;
  metodo_pago?: string;
  propina?: number;
  referencia_pago?: string;
  datos_negocio?: DatosNegocio;
}

export interface ImpresoraInfo {
  device_id: string;
  project_id: string;
  online: boolean;
  printer_ready: boolean;
  printer_name: string | null;
  ip: string | null;
  last_seen: string;
}

/**
 * Carga impresoras de ambas fuentes: módulo impresion (auto-discovery MQTT)
 * y perifericos (registry). Merge por device_id, preferencia a impresion.
 */
export async function loadImpresoras(): Promise<ImpresoraInfo[]> {
  const results: Map<string, ImpresoraInfo> = new Map();

  // Fuente 1: módulo impresion (ESP32 descubiertos por MQTT directo)
  try {
    const res = await mqttRequest<{ impresoras: ImpresoraInfo[]; total: number }>('impresion', 'impresoras', {}, { timeout: 4000 });
    for (const imp of res.data?.impresoras || []) {
      results.set(imp.device_id, imp);
    }
  } catch {}

  // Fuente 2: perifericos (registry — impresoras registradas manualmente o por auto-discovery)
  try {
    const res2 = await mqttRequest<any>('perifericos', 'listar-por-capacidad', { capacidad: 'imprimir' }, { timeout: 4000 });
    for (const p of res2.data?.dispositivos || []) {
      const id = p.metadata?.esp32_device_id || p.nombre;
      if (!results.has(id)) {
        results.set(id, {
          device_id: id,
          project_id: p.metadata?.project_id || '',
          online: p.estado === 'online',
          printer_ready: p.conectado || false,
          printer_name: p.metadata?.printer_name || p.nombre,
          ip: p.metadata?.ip || null,
          last_seen: ''
        });
      }
    }
  } catch {}

  return Array.from(results.values());
}

/**
 * Imprime ticket de venta (recibo para el cliente con precios)
 */
export async function imprimirTicketVenta(params: TicketVentaParams): Promise<boolean> {
  impresionStore.update(s => ({
    ...s,
    loading: true,
    resultado: { type: 'info', message: 'Imprimiendo ticket...' }
  }));

  try {
    const response = await mqttRequest<any>('impresion', 'ticket-venta', params);

    impresionStore.update(s => ({
      ...s,
      loading: false,
      resultado: { type: 'ok', message: `Ticket impreso (${response.data.comanda_id})` }
    }));

    await loadHistorial();
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    impresionStore.update(s => ({
      ...s,
      loading: false,
      resultado: { type: 'error', message: errorMessage }
    }));
    console.error('[Impresion] ticket venta failed:', errorMessage);
    return false;
  }
}

// =============================================================================
// UI STATE ACTIONS
// =============================================================================

export function setActiveTab(tab: ImpresionTab): void {
  impresionStore.update(s => ({ ...s, activeTab: tab, resultado: null }));
}

export function clearResultado(): void {
  impresionStore.update(s => ({ ...s, resultado: null }));
}

export function clearError(): void {
  impresionStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Estado de conexion del transporte */
export const transporteEstado = derived(impresionStore, $s =>
  $s.transporte?.estado || 'desconectado'
);

/** Esta conectada la impresora? */
export const isConectada = derived(impresionStore, $s =>
  $s.transporte?.estado === 'conectado'
);

/** Total de comandas impresas */
export const totalComandas = derived(impresionStore, $s => {
  if (!$s.metrics) return 0;
  return ($s.metrics.comandas_generadas || 0) + ($s.metrics.reimpresiones || 0);
});

/** Tab activa */
export const activeTab = derived(impresionStore, $s => $s.activeTab);

/** Estado de carga */
export const isLoading = derived(impresionStore, $s => $s.loading);

/** Error actual */
export const impresionError = derived(impresionStore, $s => $s.error);

// =============================================================================
// INITIALIZATION
// =============================================================================

let pollInterval: ReturnType<typeof setInterval> | null = null;

/**
 * Inicializa suscripciones MQTT y carga datos iniciales
 */
export function initImpresionSubscriptions(): () => void {
  // Carga inicial
  loadEstado();
  loadMetrics();

  // Suscribirse a eventos de impresion en tiempo real
  const unsubComanda = subscribe('impresion.comanda_generada', (_topic, payload) => {
    const data = payload?.data || payload;
    // Agregar al historial en tiempo real
    impresionStore.update(s => ({
      ...s,
      historial: [data as ComandaRegistro, ...s.historial].slice(0, 100),
      historialTotal: s.historialTotal + 1
    }));
    // Actualizar metrics
    loadMetrics();
  });

  const unsubError = subscribe('impresion.error', (_topic, payload) => {
    const data = payload?.data || payload;
    const msg = (data as { error?: string })?.error || 'Error de impresion';
    impresionStore.update(s => ({
      ...s,
      resultado: { type: 'error', message: msg }
    }));
  });

  // Poll estado cada 15s
  pollInterval = setInterval(() => {
    loadEstado();
  }, 15000);

  // Cleanup
  return () => {
    unsubComanda();
    unsubError();
    if (pollInterval) {
      clearInterval(pollInterval);
      pollInterval = null;
    }
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Timeout - servidor no responde';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Error desconocido';
}
