/**
 * Cuentas Store — Estado y operaciones MQTT
 *
 * Backend: modules/pizzepos/cuentas (uiHandler domain: 'cuenta')
 * Persistencia: modules/pizzepos/persistencia-comandero (domain: 'persistencia')
 *
 * Operaciones: create, list, get, delete, stats, health
 * Eventos RT: cuenta.creada, cuenta.actualizada, cuenta.eliminada, cuenta.estado_cambiado
 *
 * La fuente de verdad para cuentas activas es persistencia.cuentas_activas
 *
 * IMPORTANTE: Todas las operaciones reciben project_id como primer parámetro
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';

// =============================================================================
// TYPES
// =============================================================================

export type TipoCuenta = 'local' | 'delivery' | 'llevar';
export type EstadoCuenta = 'pendiente' | 'con_pedido' | 'en_preparacion' | 'listo' | 'para_cobrar' | 'cobrado';

export interface Cuenta {
  id: string;
  tipo: TipoCuenta;
  nombre: string;
  estado: EstadoCuenta;
  hora: string;
  items: number;
  total: number;
  alerta: boolean;
  created_at: string;
  updated_at: string;
}

export interface CuentasState {
  cuentas: Cuenta[];
  loading: boolean;
  error: string | null;
}

// =============================================================================
// COLORS
// =============================================================================

export const TIPO_COLORS: Record<TipoCuenta, string> = {
  local: '#3b82f6',
  delivery: '#f59e0b',
  llevar: '#22c55e'
};

export const TIPO_ICONS: Record<TipoCuenta, string> = {
  local: '\uD83C\uDFE0',
  delivery: '\uD83D\uDEF5',
  llevar: '\uD83D\uDCE6'
};

export const TIPO_LABELS: Record<TipoCuenta, string> = {
  local: 'Local',
  delivery: 'Delivery',
  llevar: 'Llevar'
};

// Mapeo de tipos de persistencia a tipos del store
const TIPO_MAP: Record<string, TipoCuenta> = {
  mesa: 'local',
  local: 'local',
  telefono: 'delivery',
  delivery: 'delivery',
  llevar: 'llevar',
  recoger: 'llevar'
};

// Mapeo de estado de persistencia a EstadoCuenta
function mapEstadoPersistencia(cuenta: any): EstadoCuenta {
  if (cuenta.estado === 'abierta') {
    if (!cuenta.pedidos || cuenta.pedidos.length === 0) return 'pendiente';
    // Si tiene pedidos, verificar si están enviados a cocina
    return 'con_pedido';
  }
  return 'pendiente';
}

// =============================================================================
// STORE
// =============================================================================

export const cuentasStore = writable<CuentasState>({
  cuentas: [],
  loading: false,
  error: null
});

// Derivados
export const cuentas = derived(cuentasStore, $s => $s.cuentas);
export const cuentasLoading = derived(cuentasStore, $s => $s.loading);
export const cuentasError = derived(cuentasStore, $s => $s.error);
export const cuentasCount = derived(cuentasStore, $s => $s.cuentas.length);

// =============================================================================
// OPERATIONS
// =============================================================================

export async function createCuenta(projectId: string, tipo: TipoCuenta, nombre?: string): Promise<Cuenta | null> {
  try {
    console.log('[Cuentas] createCuenta request:', { project_id: projectId, tipo, nombre });
    const res = await mqttRequest<Cuenta>('cuenta', 'create', {
      project_id: projectId,
      tipo,
      nombre: nombre || undefined
    });
    console.log('[Cuentas] createCuenta response:', res);

    // res.data is the cuenta object directly (unwrapped by UIRequestHandler)
    // Handle both unwrapped (cuenta) and legacy double-wrapped ({ status, data: cuenta })
    const cuenta = (res.data as any)?.id ? res.data : (res.data as any)?.data || res.data;
    return cuenta || null;
  } catch (err: any) {
    console.error('[Cuentas] createCuenta error:', err);
    cuentasStore.update(s => ({ ...s, error: err.message || 'Error al crear cuenta' }));
    return null;
  }
}

export async function listCuentas(projectId: string, tipo?: TipoCuenta, estado?: EstadoCuenta): Promise<void> {
  cuentasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const res = await mqttRequest<any>('cuenta', 'list', {
      project_id: projectId,
      tipo: tipo || undefined,
      estado: estado || undefined
    });
    // Handle both unwrapped { cuentas } and legacy double-wrapped { data: { cuentas } }
    const data = res.data;
    const cuentasList = data?.cuentas || data?.data?.cuentas || [];
    cuentasStore.update(s => ({
      ...s,
      cuentas: cuentasList,
      loading: false
    }));
  } catch (err: any) {
    cuentasStore.update(s => ({
      ...s,
      loading: false,
      error: err.message || 'Error al listar cuentas'
    }));
  }
}

export async function getCuenta(projectId: string, id: string): Promise<Cuenta | null> {
  try {
    const res = await mqttRequest<any>('cuenta', 'get', { project_id: projectId, id });
    // Handle both unwrapped (cuenta) and legacy double-wrapped ({ data: cuenta })
    const cuenta = (res.data as any)?.id ? res.data : (res.data as any)?.data || res.data;
    return cuenta || null;
  } catch {
    return null;
  }
}

export async function deleteCuenta(projectId: string, id: string): Promise<boolean> {
  try {
    await mqttRequest<any>('cuenta', 'delete', { project_id: projectId, id });
    return true;
  } catch (err: any) {
    cuentasStore.update(s => ({ ...s, error: err.message || 'Error al eliminar cuenta' }));
    return false;
  }
}

export async function getStats(projectId: string): Promise<any> {
  try {
    const res = await mqttRequest<any>('cuenta', 'stats', { project_id: projectId });
    return res.data?.data || res.data || null;
  } catch {
    return null;
  }
}

// =============================================================================
// MESA — Canal principal (cuentas-canales strategy)
// =============================================================================

export interface MesaActiva {
  cuenta_id: string;
  nombre: string;
  numero: number;
  comensales: number | null;
  camarero: string | null;
  estado: string;
  total: number;
  hora_apertura: string;
  tiempo_ocupada?: number;
}

/**
 * Abre una mesa via cuentas-canales → mesa strategy
 * Nombre libre: "Mesa 1", "Mesa de Manolo", etc. Si no se pasa, auto-numera.
 * Devuelve el cuenta_id generado (ej: mesa_1_20260222_001)
 */
export async function createMesa(projectId: string, nombre?: string, comensales?: number): Promise<string | null> {
  try {
    const res = await mqttRequest<any>('mesa', 'abrir', {
      project_id: projectId,
      nombre: nombre || undefined,
      comensales: comensales || undefined
    });
    const data = res?.data?.cuenta_id ? res.data : res?.data?.data;
    return data?.cuenta_id || null;
  } catch (err: any) {
    console.error('[Cuentas] createMesa error:', err);
    cuentasStore.update(s => ({ ...s, error: err.message || 'Error al abrir mesa' }));
    return null;
  }
}

// =============================================================================
// PERSISTENCIA — Fuente de verdad para cuentas activas
// =============================================================================

/**
 * Carga cuentas activas desde persistencia-comandero
 * Esta es la fuente de verdad — sobrevive reinicios del servidor/cliente
 */
export async function loadCuentasFromPersistencia(projectId: string, tipo?: string): Promise<void> {
  cuentasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const res = await mqttRequest<any>('persistencia', 'cuentas_activas', {
      project_id: projectId,
      tipo: tipo || undefined
    });

    // Handle both unwrapped { cuentas } and legacy double-wrapped { data: { cuentas } }
    const pData = res?.data?.cuentas ? res.data : res?.data?.data;
    if (res?.status === 200 && pData?.cuentas) {
      const cuentasPersistencia = pData.cuentas;

      // Convertir formato persistencia → formato store
      const cuentas: Cuenta[] = cuentasPersistencia.map((cp: any) => ({
        id: cp.cuenta_id,
        tipo: TIPO_MAP[cp.tipo] || 'local',
        nombre: cp.datos_especificos?.nombre || cp.origen || `${cp.tipo} ${cp.cuenta_id.slice(-4)}`,
        estado: mapEstadoPersistencia(cp),
        hora: formatHora(cp.created_at),
        items: countItems(cp.pedidos),
        total: cp.total || 0,
        alerta: checkAlerta(cp),
        created_at: cp.created_at,
        updated_at: cp.updated_at
      }));

      cuentasStore.update(s => ({
        ...s,
        cuentas,
        loading: false
      }));

      console.log('[Cuentas] Loaded from persistencia:', cuentas.length, 'project:', projectId);
    } else {
      // Si no hay cuentas o error, usar lista vacía
      cuentasStore.update(s => ({
        ...s,
        cuentas: [],
        loading: false
      }));
    }
  } catch (err: any) {
    console.error('[Cuentas] Error loading from persistencia:', err);
    cuentasStore.update(s => ({
      ...s,
      loading: false,
      error: err.message || 'Error al cargar cuentas desde persistencia'
    }));

    // Fallback: intentar cargar desde módulo cuentas
    await listCuentas(projectId, tipo as TipoCuenta);
  }
}

/**
 * Obtener cuenta activa con sus pedidos desde persistencia
 */
export async function getCuentaFromPersistencia(projectId: string, cuenta_id: string): Promise<any | null> {
  try {
    const res = await mqttRequest<any>('persistencia', 'cuentas_activas', { project_id: projectId });

    // Handle both unwrapped { cuentas } and legacy double-wrapped { data: { cuentas } }
    const pData2 = res?.data?.cuentas ? res.data : res?.data?.data;
    if (res?.status === 200 && pData2?.cuentas) {
      const cuenta = pData2.cuentas.find((c: any) => c.cuenta_id === cuenta_id);
      return cuenta || null;
    }
    return null;
  } catch {
    return null;
  }
}

// Helpers para mapeo
function formatHora(isoDate: string): string {
  try {
    const date = new Date(isoDate);
    return date.toLocaleTimeString('es-ES', { hour: '2-digit', minute: '2-digit' });
  } catch {
    return '--:--';
  }
}

function countItems(pedidos: any[] | undefined): number {
  if (!pedidos || pedidos.length === 0) return 0;
  return pedidos.reduce((total, p) => {
    if (p.items && Array.isArray(p.items)) {
      return total + p.items.reduce((sum: number, item: any) => sum + (item.cantidad || 1), 0);
    }
    return total;
  }, 0);
}

function checkAlerta(cuenta: any): boolean {
  // Alerta si lleva más de 30 minutos sin actividad
  if (!cuenta.updated_at) return false;
  const updated = new Date(cuenta.updated_at).getTime();
  const now = Date.now();
  const minutos = (now - updated) / (1000 * 60);
  return minutos > 30;
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

export function initCuentasSubscriptions(projectId: string): () => void {
  const cleanups: (() => void)[] = [];

  // cuenta.creada → recargar desde persistencia
  cleanups.push(
    mqttSubscribe('cuenta.creada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      // Solo recargar si es del mismo proyecto
      if (data.project_id && data.project_id !== projectId) return;

      // Recargar desde persistencia (fuente de verdad)
      loadCuentasFromPersistencia(projectId);
    })
  );

  // cuenta.actualizada → actualizar en store
  cleanups.push(
    mqttSubscribe('cuenta.actualizada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      if (data.project_id && data.project_id !== projectId) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? { ...c, ...data.cambios, updated_at: data.updated_at || c.updated_at }
            : c
        )
      }));
    })
  );

  // cuenta.eliminada → quitar del store
  cleanups.push(
    mqttSubscribe('cuenta.eliminada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      if (data.project_id && data.project_id !== projectId) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.filter(c => c.id !== data.cuenta_id)
      }));
    })
  );

  // cuenta.estado_cambiado → actualizar estado
  cleanups.push(
    mqttSubscribe('cuenta.estado_cambiado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      if (data.project_id && data.project_id !== projectId) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? { ...c, estado: data.estado, updated_at: new Date().toISOString() }
            : c
        )
      }));
    })
  );

  // mesa.abierta → recargar desde persistencia
  cleanups.push(
    mqttSubscribe('mesa.abierta', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (data?.project_id && data.project_id !== projectId) return;
      loadCuentasFromPersistencia(projectId);
    })
  );

  // pedido.creado → recargar (actualiza total e items en persistencia)
  cleanups.push(
    mqttSubscribe('pedido.creado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (data?.project_id && data.project_id !== projectId) return;
      loadCuentasFromPersistencia(projectId);
    })
  );

  // cuenta.cerrada → recargar (elimina de persistencia)
  cleanups.push(
    mqttSubscribe('cuenta.cerrada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (data?.project_id && data.project_id !== projectId) return;
      loadCuentasFromPersistencia(projectId);
    })
  );

  // Carga inicial desde persistencia (fuente de verdad)
  loadCuentasFromPersistencia(projectId);

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
