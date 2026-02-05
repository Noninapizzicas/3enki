/**
 * Cuentas Store — Estado y operaciones MQTT
 *
 * Backend: modules/pizzepos/cuentas (uiHandler domain: 'cuenta')
 * Operaciones: create, list, get, delete, stats, health
 * Eventos RT: cuenta.creada, cuenta.actualizada, cuenta.eliminada, cuenta.estado_cambiado
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
    const res = await mqttRequest<{ status: number; data: Cuenta }>('cuenta', 'create', {
      tipo,
      nombre: nombre || undefined
    });
    return res.data || null;
  } catch (err: any) {
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
// REALTIME SUBSCRIPTIONS
// =============================================================================

export function initCuentasSubscriptions(): () => void {
  const cleanups: (() => void)[] = [];

  // cuenta.creada → añadir al store
  cleanups.push(
    mqttSubscribe('cuenta.creada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;

      // Recargar lista para obtener objeto completo
      listCuentas();
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

  // Carga inicial
  listCuentas();

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
