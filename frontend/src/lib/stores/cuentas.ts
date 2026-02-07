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

export async function createCuenta(tipo: TipoCuenta, nombre?: string): Promise<Cuenta | null> {
  try {
    console.log('[Cuentas] createCuenta request:', { tipo, nombre });
    const res = await mqttRequest<Cuenta>('cuenta', 'create', {
      tipo,
      nombre: nombre || undefined
    });
    console.log('[Cuentas] createCuenta response:', res);

    // La respuesta viene en res.data directamente
    if (res.status === 201 || res.status === 200) {
      return res.data || null;
    }
    console.error('[Cuentas] createCuenta failed status:', res.status);
    return null;
  } catch (err: any) {
    console.error('[Cuentas] createCuenta error:', err);
    cuentasStore.update(s => ({ ...s, error: err.message || 'Error al crear cuenta' }));
    return null;
  }
}

export async function listCuentas(tipo?: TipoCuenta, estado?: EstadoCuenta): Promise<void> {
  cuentasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const res = await mqttRequest<any>('cuenta', 'list', {
      tipo: tipo || undefined,
      estado: estado || undefined
    });
    cuentasStore.update(s => ({
      ...s,
      cuentas: res.data?.cuentas || [],
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

export async function getCuenta(id: string): Promise<Cuenta | null> {
  try {
    const res = await mqttRequest<any>('cuenta', 'get', { id });
    return res.data || null;
  } catch {
    return null;
  }
}

export async function deleteCuenta(id: string): Promise<boolean> {
  try {
    await mqttRequest<any>('cuenta', 'delete', { id });
    return true;
  } catch (err: any) {
    cuentasStore.update(s => ({ ...s, error: err.message || 'Error al eliminar cuenta' }));
    return false;
  }
}

export async function getStats(): Promise<any> {
  try {
    const res = await mqttRequest<any>('cuenta', 'stats');
    return res.data || null;
  } catch {
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
export async function loadCuentasFromPersistencia(tipo?: string): Promise<void> {
  cuentasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const res = await mqttRequest<any>('persistencia', 'cuentas_activas', {
      tipo: tipo || undefined
    });

    if (res?.status === 200 && res?.data?.cuentas) {
      const cuentasPersistencia = res.data.cuentas;

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

      console.log('[Cuentas] Loaded from persistencia:', cuentas.length);
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
    await listCuentas(tipo as TipoCuenta);
  }
}

/**
 * Obtener cuenta activa con sus pedidos desde persistencia
 */
export async function getCuentaFromPersistencia(cuenta_id: string): Promise<any | null> {
  try {
    const res = await mqttRequest<any>('persistencia', 'cuentas_activas', {});

    if (res?.status === 200 && res?.data?.cuentas) {
      const cuenta = res.data.cuentas.find((c: any) => c.cuenta_id === cuenta_id);
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

export function initCuentasSubscriptions(): () => void {
  const cleanups: (() => void)[] = [];

  // cuenta.creada → recargar desde persistencia
  cleanups.push(
    mqttSubscribe('cuenta.creada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;

      // Recargar desde persistencia (fuente de verdad)
      loadCuentasFromPersistencia();
    })
  );

  // cuenta.actualizada → actualizar en store
  cleanups.push(
    mqttSubscribe('cuenta.actualizada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;

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

  // pedido.creado → recargar (actualiza total e items en persistencia)
  cleanups.push(
    mqttSubscribe('pedido.creado', () => {
      loadCuentasFromPersistencia();
    })
  );

  // cuenta.cerrada → recargar (elimina de persistencia)
  cleanups.push(
    mqttSubscribe('cuenta.cerrada', () => {
      loadCuentasFromPersistencia();
    })
  );

  // Carga inicial desde persistencia (fuente de verdad)
  loadCuentasFromPersistencia();

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
