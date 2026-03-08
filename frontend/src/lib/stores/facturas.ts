/**
 * Facturas Store - MQTT Request/Response + Real-time Events
 *
 * Gestión de facturas por proyecto:
 * - CRUD via mqttRequest
 * - Real-time updates via subscriptions
 * - Integración con flow-engine events
 */

import { writable, derived, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { activeProject } from './workspace';

// =============================================================================
// TYPES
// =============================================================================

export type FacturaEstado = 'pendiente' | 'procesando' | 'procesada' | 'error' | 'exportada';
export type FacturaSource = 'telegram' | 'gmail' | 'manual';

export interface Factura {
  id: number;
  nombre_archivo: string;
  source: FacturaSource;
  path_original: string;
  path_procesada?: string;
  path_ocr?: string;
  estado: FacturaEstado;
  // Datos extraídos
  numero_factura?: string;
  fecha_factura?: string;
  nif_proveedor?: string;
  nombre_proveedor?: string;
  concepto?: string;
  base_imponible?: number;
  porcentaje_iva?: number;
  cuota_iva?: number;
  total?: number;
  categoria?: string;
  // Estado de pago
  estado_pago?: 'pendiente' | 'pagada';
  fecha_pago?: string;
  // Metadatos
  ocr_confidence?: number;
  error_mensaje?: string;
  exportada_semana?: string;
  origen?: Record<string, unknown>;
  created_at: string;
  updated_at: string;
}

export interface FacturasState {
  facturas: Factura[];
  selectedId: number | null;
  filter: {
    estado: FacturaEstado | 'todas';
    source: FacturaSource | 'todas';
    search: string;
  };
  stats: {
    total: number;
    pendientes: number;
    procesadas: number;
    errores: number;
    exportadas: number;
  };
  loading: boolean;
  error: string | null;
  activeTab: 'lista' | 'detalle' | 'subir' | 'config';
}

interface ListResponse {
  facturas: Factura[];
  total: number;
}

interface StatsResponse {
  total: number;
  pendientes: number;
  procesadas: number;
  errores: number;
  exportadas: number;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: FacturasState = {
  facturas: [],
  selectedId: null,
  filter: {
    estado: 'todas',
    source: 'todas',
    search: ''
  },
  stats: {
    total: 0,
    pendientes: 0,
    procesadas: 0,
    errores: 0,
    exportadas: 0
  },
  loading: false,
  error: null,
  activeTab: 'lista'
};

// =============================================================================
// STORE
// =============================================================================

export const facturasStore = writable<FacturasState>(initialState);

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Carga la lista de facturas del proyecto activo
 */
export async function loadFacturas(): Promise<void> {
  const project = get(activeProject);
  if (!project?.id) {
    facturasStore.update(s => ({ ...s, error: 'No hay proyecto activo' }));
    return;
  }

  facturasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ListResponse>('facturas', 'listar', {
      proyecto: project.id
    });

    facturasStore.update(s => ({
      ...s,
      facturas: response.data.facturas || [],
      loading: false,
      error: null
    }));

    // También cargar estadísticas
    await loadStats();

    console.log('[Facturas] Loaded:', response.data.total, 'facturas');
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    facturasStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Facturas] Load failed:', errorMessage);
  }
}

/**
 * Carga estadísticas
 */
export async function loadStats(): Promise<void> {
  const project = get(activeProject);
  if (!project?.id) return;

  try {
    const response = await mqttRequest<StatsResponse>('facturas', 'estadisticas', {
      proyecto: project.id
    });

    facturasStore.update(s => ({
      ...s,
      stats: response.data
    }));
  } catch (error) {
    console.error('[Facturas] Stats failed:', getErrorMessage(error));
  }
}

/**
 * Obtiene una factura por ID
 */
export async function getFactura(id: number): Promise<Factura | null> {
  const project = get(activeProject);
  if (!project?.id) return null;

  try {
    const response = await mqttRequest<{ factura: Factura }>('facturas', 'obtener', {
      proyecto: project.id,
      id
    });
    return response.data.factura;
  } catch (error) {
    console.error('[Facturas] Get failed:', getErrorMessage(error));
    return null;
  }
}

/**
 * Actualiza una factura
 */
export async function updateFactura(
  id: number,
  datos: Partial<Factura>
): Promise<boolean> {
  const project = get(activeProject);
  if (!project?.id) return false;

  facturasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    await mqttRequest('facturas', 'actualizar', {
      proyecto: project.id,
      id,
      datos
    });

    // Actualizar en el store local
    facturasStore.update(s => ({
      ...s,
      facturas: s.facturas.map(f => f.id === id ? { ...f, ...datos } : f),
      loading: false
    }));

    console.log('[Facturas] Updated:', id);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    facturasStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Facturas] Update failed:', errorMessage);
    return false;
  }
}

/**
 * Reprocesa una factura con OCR
 */
export async function reprocesarFactura(id: number): Promise<boolean> {
  const project = get(activeProject);
  if (!project?.id) return false;

  try {
    await mqttRequest('facturas', 'reprocesar', {
      proyecto: project.id,
      id
    });

    // Actualizar estado local
    facturasStore.update(s => ({
      ...s,
      facturas: s.facturas.map(f =>
        f.id === id ? { ...f, estado: 'procesando' as FacturaEstado } : f
      )
    }));

    console.log('[Facturas] Reprocesando:', id);
    return true;
  } catch (error) {
    console.error('[Facturas] Reprocesar failed:', getErrorMessage(error));
    return false;
  }
}

/**
 * Sube una factura manualmente
 */
export async function subirFactura(
  file: File,
  source: FacturaSource = 'manual'
): Promise<boolean> {
  const project = get(activeProject);
  if (!project?.id) return false;

  facturasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    // Convertir archivo a base64
    const base64 = await fileToBase64(file);

    await mqttRequest('facturas', 'subir', {
      proyecto: project.id,
      archivo: {
        nombre: file.name,
        contenido: base64,
        mimeType: file.type
      },
      source
    });

    // Recargar lista
    await loadFacturas();

    console.log('[Facturas] Uploaded:', file.name);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    facturasStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Facturas] Upload failed:', errorMessage);
    return false;
  }
}

/**
 * Exporta facturas a Excel
 */
export async function exportarExcel(): Promise<string | null> {
  const project = get(activeProject);
  if (!project?.id) return null;

  facturasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<{ path: string; total: number }>('facturas', 'exportar', {
      proyecto: project.id
    });

    facturasStore.update(s => ({ ...s, loading: false }));

    // Recargar para actualizar estados
    await loadFacturas();

    console.log('[Facturas] Exported:', response.data.total, 'facturas');
    return response.data.path;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    facturasStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[Facturas] Export failed:', errorMessage);
    return null;
  }
}

/**
 * Marca pago de una factura
 */
export async function marcarPagada(id: number, pagada: boolean = true): Promise<boolean> {
  return updateFactura(id, {
    estado_pago: pagada ? 'pagada' : 'pendiente',
    fecha_pago: pagada ? new Date().toISOString().split('T')[0] : undefined
  });
}

// =============================================================================
// UI ACTIONS
// =============================================================================

export function setActiveTab(tab: FacturasState['activeTab']): void {
  facturasStore.update(s => ({ ...s, activeTab: tab }));
}

export function selectFactura(id: number | null): void {
  facturasStore.update(s => ({
    ...s,
    selectedId: id,
    activeTab: id ? 'detalle' : s.activeTab
  }));
}

export function setFilter(filter: Partial<FacturasState['filter']>): void {
  facturasStore.update(s => ({
    ...s,
    filter: { ...s.filter, ...filter }
  }));
}

export function clearError(): void {
  facturasStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

/**
 * Inicializa suscripciones a eventos en tiempo real
 */
export function initFacturasSubscriptions(): () => void {
  // Limpiar suscripciones anteriores
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Escuchar factura recibida
  cleanupFns.push(
    mqttSubscribe('factura.recibida', (event: any) => {
      const data = event?.data || event?.payload || event;
      const project = get(activeProject);

      if (data?.projectId === project?.id) {
        console.log('[Facturas] Nueva factura recibida:', data.id);
        loadFacturas(); // Recargar lista
      }
    })
  );

  // Escuchar factura procesada
  cleanupFns.push(
    mqttSubscribe('factura.procesada', (event: any) => {
      const data = event?.data || event?.payload || event;
      const project = get(activeProject);

      if (data?.projectId === project?.id) {
        console.log('[Facturas] Factura procesada:', data.id);

        // Actualizar en store local
        facturasStore.update(s => ({
          ...s,
          facturas: s.facturas.map(f =>
            f.id === data.id ? { ...f, ...data.datos, estado: 'procesada' as FacturaEstado } : f
          )
        }));

        loadStats();
      }
    })
  );

  // Escuchar errores de procesamiento
  cleanupFns.push(
    mqttSubscribe('factura.error', (event: any) => {
      const data = event?.data || event?.payload || event;
      const project = get(activeProject);

      if (data?.projectId === project?.id) {
        console.log('[Facturas] Error en factura:', data.id, data.error);

        facturasStore.update(s => ({
          ...s,
          facturas: s.facturas.map(f =>
            f.id === data.id ? { ...f, estado: 'error' as FacturaEstado, error_mensaje: data.error } : f
          )
        }));

        loadStats();
      }
    })
  );

  // Escuchar exportación completada
  cleanupFns.push(
    mqttSubscribe('factura.exportada', (event: any) => {
      const data = event?.data || event?.payload || event;
      const project = get(activeProject);

      if (data?.projectId === project?.id) {
        console.log('[Facturas] Exportación completada:', data.total, 'facturas');
        loadFacturas();
      }
    })
  );

  // Cargar facturas iniciales
  loadFacturas();

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Timeout - el servidor no respondió';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Error desconocido';
}

function fileToBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.readAsDataURL(file);
    reader.onload = () => {
      const result = reader.result as string;
      // Quitar el prefijo data:...;base64,
      const base64 = result.split(',')[1];
      resolve(base64);
    };
    reader.onerror = error => reject(error);
  });
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Facturas filtradas */
export const filteredFacturas = derived(facturasStore, $s => {
  let result = $s.facturas;

  // Filtrar por estado
  if ($s.filter.estado !== 'todas') {
    result = result.filter(f => f.estado === $s.filter.estado);
  }

  // Filtrar por source
  if ($s.filter.source !== 'todas') {
    result = result.filter(f => f.source === $s.filter.source);
  }

  // Filtrar por búsqueda
  if ($s.filter.search) {
    const search = $s.filter.search.toLowerCase();
    result = result.filter(f =>
      f.nombre_archivo.toLowerCase().includes(search) ||
      f.nombre_proveedor?.toLowerCase().includes(search) ||
      f.numero_factura?.toLowerCase().includes(search) ||
      f.concepto?.toLowerCase().includes(search)
    );
  }

  return result;
});

/** Factura seleccionada */
export const selectedFactura = derived(facturasStore, $s =>
  $s.facturas.find(f => f.id === $s.selectedId) || null
);

/** Tab activa */
export const activeTab = derived(facturasStore, $s => $s.activeTab);

/** Estadísticas */
export const facturasStats = derived(facturasStore, $s => $s.stats);

/** Loading state */
export const facturasLoading = derived(facturasStore, $s => $s.loading);

/** Error */
export const facturasError = derived(facturasStore, $s => $s.error);

/** Filtros actuales */
export const currentFilter = derived(facturasStore, $s => $s.filter);
