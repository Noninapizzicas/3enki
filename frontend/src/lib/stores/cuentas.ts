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

export type TipoCuenta = 'local' | 'delivery' | 'llevar' | 'glovo';
export type EstadoCuenta = 'pendiente' | 'con_pedido' | 'en_preparacion' | 'listo' | 'entregado' | 'para_cobrar' | 'cobrado';
export type EstadoCocinaItem = 'en_cocina' | 'preparando' | 'listo';

export interface ItemDetalle {
  item_id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio: number;
  estado_cocina: EstadoCocinaItem;
  listo_at?: string;
}

export interface Cuenta {
  id: string;
  tipo: TipoCuenta;
  nombre: string;
  estado: EstadoCuenta;
  hora: string;
  items: number;
  total: number;
  alerta: boolean;
  pagado: boolean;
  servido: boolean;
  created_at: string;
  updated_at: string;
  itemsDetalle?: ItemDetalle[];
  /** Hora estimada de recogida (ISO string o HH:MM) */
  hora_recogida?: string;
  /** Tiempo estimado en minutos para preparación */
  tiempo_estimado?: number;
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
  llevar: '#22c55e',
  glovo: '#FF6B00'
};

export const TIPO_ICONS: Record<TipoCuenta, string> = {
  local: '\uD83C\uDFE0',
  delivery: '\uD83D\uDEF5',
  llevar: '\uD83D\uDCE6',
  glovo: '\uD83D\uDEF5'
};

export const TIPO_LABELS: Record<TipoCuenta, string> = {
  local: 'Local',
  delivery: 'Delivery',
  llevar: 'Llevar',
  glovo: 'Glovo'
};

// Mapeo de tipos de persistencia a tipos del store
const TIPO_MAP: Record<string, TipoCuenta> = {
  mesa: 'local',
  local: 'local',
  telefono: 'delivery',
  delivery: 'delivery',
  llevar: 'llevar',
  recoger: 'llevar',
  glovo: 'glovo'
};

// Orden de progresión de estados (índice mayor = más avanzado)
const ESTADO_ORDER: EstadoCuenta[] = ['pendiente', 'con_pedido', 'en_preparacion', 'listo', 'entregado', 'para_cobrar', 'cobrado'];

// Mapeo de estado de persistencia a EstadoCuenta
function mapEstadoPersistencia(cuenta: any): EstadoCuenta {
  if (cuenta.estado === 'abierta') {
    if (!cuenta.pedidos || cuenta.pedidos.length === 0) return 'pendiente';
    // Glovo con pedidos = en preparación en cocina
    if (cuenta.tipo === 'glovo') return 'en_preparacion';
    // Si tiene pedidos, verificar si están enviados a cocina
    return 'con_pedido';
  }
  return 'pendiente';
}

/** Preservar el estado más avanzado entre persistencia y store actual */
function mergeEstado(fromPersistencia: EstadoCuenta, fromStore: EstadoCuenta | undefined): EstadoCuenta {
  if (!fromStore) return fromPersistencia;
  const iPers = ESTADO_ORDER.indexOf(fromPersistencia);
  const iStore = ESTADO_ORDER.indexOf(fromStore);
  return iStore > iPers ? fromStore : fromPersistencia;
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

export async function marcarEntregado(projectId: string, id: string): Promise<boolean> {
  try {
    await mqttRequest<any>('cuenta', 'marcar_entregado', { project_id: projectId, id });
    return true;
  } catch (err: any) {
    cuentasStore.update(s => ({ ...s, error: err.message || 'Error al marcar entregado' }));
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

/**
 * Renombra una mesa activa
 * Nombre libre: "Mesa de Manolo", "Terraza 3", lo que sea
 */
export async function renameMesa(projectId: string, cuenta_id: string, nombre: string): Promise<boolean> {
  try {
    const res = await mqttRequest<any>('mesa', 'renombrar', {
      project_id: projectId,
      cuenta_id,
      nombre
    });
    return res?.status === 200;
  } catch (err: any) {
    console.error('[Cuentas] renameMesa error:', err);
    return false;
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

      // Snapshot del store actual para preservar estados de cocina durante reload
      const currentState = get(cuentasStore);
      const currentCuentasMap = new Map<string, Cuenta>();
      for (const c of currentState.cuentas) {
        currentCuentasMap.set(c.id, c);
      }

      // Convertir formato persistencia → formato store
      const cuentas: Cuenta[] = cuentasPersistencia.map((cp: any) => {
        const mappedTipo = TIPO_MAP[cp.tipo] || 'local';

        // Nombre: para Glovo, extraer número secuencial del cuenta_id (glovo_20260226_003 → "Glovo #3")
        let nombre = cp.datos_especificos?.nombre
          || cp.datos_especificos?.cliente_nombre
          || cp.datos_especificos?.numero_ticket
          || TIPO_LABELS[mappedTipo]
          || cp.tipo;
        if (cp.tipo === 'glovo') {
          const seqMatch = cp.cuenta_id?.match(/_(\d+)$/);
          const num = seqMatch ? parseInt(seqMatch[1], 10) : 0;
          if (num > 0) nombre = `Glovo #${num}`;
        }

        // Preservar estados de cocina del store actual (evita que reload borre preparando/listo)
        const existingCuenta = currentCuentasMap.get(cp.cuenta_id);
        const existingItemsMap = new Map<string, ItemDetalle>();
        if (existingCuenta?.itemsDetalle) {
          for (const item of existingCuenta.itemsDetalle) {
            existingItemsMap.set(item.item_id, item);
          }
        }

        // Extraer items detallados de pedidos (para tarjeta mesa)
        const itemsDetalle: ItemDetalle[] = [];
        if (cp.pedidos && Array.isArray(cp.pedidos)) {
          for (const pedido of cp.pedidos) {
            if (pedido.items && Array.isArray(pedido.items)) {
              for (const item of pedido.items) {
                const itemId = item.item_id || item.id || '';
                const existing = existingItemsMap.get(itemId);
                itemsDetalle.push({
                  item_id: itemId,
                  producto_id: item.producto_id || '',
                  nombre: item.nombre || '',
                  cantidad: item.cantidad || 1,
                  precio: item.precio || item.precio_unitario || item.subtotal || 0,
                  estado_cocina: existing?.estado_cocina || 'en_cocina',
                  ...(existing?.listo_at && { listo_at: existing.listo_at })
                });
              }
            }
          }
        }

        return {
          id: cp.cuenta_id,
          tipo: mappedTipo,
          nombre,
          estado: mergeEstado(mapEstadoPersistencia(cp), existingCuenta?.estado),
          hora: formatHora(cp.created_at),
          items: countItems(cp.pedidos),
          total: cp.total || 0,
          alerta: existingCuenta?.alerta || checkAlerta(cp),
          pagado: cp.pagado || existingCuenta?.pagado || false,
          servido: cp.servido || existingCuenta?.servido || existingCuenta?.estado === 'entregado' || false,
          created_at: cp.created_at,
          updated_at: cp.updated_at,
          itemsDetalle: itemsDetalle.length > 0 ? itemsDetalle : undefined,
          hora_recogida: cp.datos_especificos?.hora_recogida || existingCuenta?.hora_recogida,
          tiempo_estimado: cp.datos_especificos?.tiempo_estimado || existingCuenta?.tiempo_estimado
        };
      });

      cuentasStore.update(s => ({
        ...s,
        cuentas,
        loading: false
      }));

      console.log('[Cuentas] Loaded from persistencia:', cuentas.length, 'project:', projectId);

      // Merge buffer totals: el buffer del comandero tiene items no enviados
      // que no están en persistencia aún. Usamos el máximo entre buffer y persistencia.
      try {
        const bufRes = await mqttRequest<any>('comandero', 'buffers', {});
        const bufData = bufRes?.data?.buffers || bufRes?.data?.data?.buffers || [];
        if (bufData.length > 0) {
          const bufferMap = new Map<string, { total: number; items_count: number }>();
          for (const b of bufData) {
            bufferMap.set(b.cuenta_id, { total: b.total, items_count: b.items_count });
          }

          cuentasStore.update(s => ({
            ...s,
            cuentas: s.cuentas.map(c => {
              const buf = bufferMap.get(c.id);
              if (!buf) return c;
              // Buffer total incluye items enviados + no enviados = total real
              // Persistencia total solo tiene pedidos formales (enviados)
              // Usamos el mayor de los dos como total real
              return {
                ...c,
                total: Math.max(c.total, buf.total),
                items: Math.max(c.items, buf.items_count),
                estado: (buf.items_count > 0 && c.estado === 'pendiente' ? 'con_pedido' : c.estado) as EstadoCuenta
              };
            })
          }));
          console.log('[Cuentas] Buffer totals merged for', bufData.length, 'cuentas');
        }
      } catch (bufErr) {
        // No pasa nada si falla — persistencia sola es suficiente
        console.warn('[Cuentas] Could not merge buffer totals:', bufErr);
      }
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
            ? {
                ...c,
                ...data.cambios,
                pagado: data.cambios?.pagado ?? c.pagado,
                servido: data.cambios?.servido ?? c.servido,
                updated_at: data.updated_at || c.updated_at
              }
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

  // cuenta.estado_cambiado → actualizar estado (backend publica estado_nuevo)
  cleanups.push(
    mqttSubscribe('cuenta.estado_cambiado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      if (data.project_id && data.project_id !== projectId) return;

      const nuevoEstado = data.estado_nuevo || data.estado;
      if (!nuevoEstado) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? {
                ...c,
                estado: nuevoEstado as EstadoCuenta,
                alerta: false,
                servido: nuevoEstado === 'entregado' || c.servido,
                updated_at: data.changed_at || new Date().toISOString()
              }
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

  // mesa.renombrada → actualizar nombre en store
  cleanups.push(
    mqttSubscribe('mesa.renombrada', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? { ...c, nombre: data.nombre, updated_at: new Date().toISOString() }
            : c
        )
      }));
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

  // cobro.procesado → recargar tras breve delay (belt-and-suspenders con cuenta.cerrada)
  cleanups.push(
    mqttSubscribe('cobro.procesado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      // Dar tiempo a que persistencia procese cuenta.cerrada
      setTimeout(() => loadCuentasFromPersistencia(projectId), 2000);
    })
  );

  // comandero.item_agregado → actualizar card en vivo (antes de enviar cocina)
  cleanups.push(
    mqttSubscribe('comandero.item_agregado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? { ...c, total: data.pedido_total ?? c.total, items: data.pedido_items ?? c.items, estado: (data.pedido_items > 0 ? 'con_pedido' : c.estado) as EstadoCuenta }
            : c
        )
      }));
    })
  );

  // comandero.item_eliminado → actualizar card en vivo
  cleanups.push(
    mqttSubscribe('comandero.item_eliminado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;
      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? { ...c, total: data.pedido_total ?? c.total, items: data.pedido_items ?? c.items, estado: ((data.pedido_items ?? c.items) > 0 ? 'con_pedido' : 'pendiente') as EstadoCuenta }
            : c
        )
      }));
    })
  );

  // cocina.item_preparando → cocinero empieza a preparar item, actualizar itemsDetalle
  cleanups.push(
    mqttSubscribe('cocina.item_preparando', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id || !data?.item_id) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c => {
          if (c.id !== data.cuenta_id || !c.itemsDetalle) return c;
          return {
            ...c,
            itemsDetalle: c.itemsDetalle.map(item =>
              item.item_id === data.item_id
                ? { ...item, estado_cocina: 'preparando' as EstadoCocinaItem }
                : item
            )
          };
        })
      }));
    })
  );

  // cocina.item_preparado → item individual listo en cocina, actualizar itemsDetalle
  cleanups.push(
    mqttSubscribe('cocina.item_preparado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id || !data?.item_id) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c => {
          if (c.id !== data.cuenta_id || !c.itemsDetalle) return c;
          return {
            ...c,
            itemsDetalle: c.itemsDetalle.map(item =>
              item.item_id === data.item_id
                ? { ...item, estado_cocina: 'listo' as EstadoCocinaItem, listo_at: data.preparado_at || new Date().toISOString() }
                : item
            )
          };
        })
      }));
    })
  );

  // cocina.pedido_listo → pedido terminado en cocina, marcar cuenta como 'listo'
  cleanups.push(
    mqttSubscribe('cocina.pedido_listo', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? { ...c, estado: 'listo' as EstadoCuenta, alerta: true, updated_at: data.listo_at || new Date().toISOString() }
            : c
        )
      }));
    })
  );

  // glovo.pedido_listo → Glovo listo para rider (belt + suspenders con cocina.pedido_listo)
  cleanups.push(
    mqttSubscribe('glovo.pedido_listo', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.cuenta_id) return;

      cuentasStore.update(s => ({
        ...s,
        cuentas: s.cuentas.map(c =>
          c.id === data.cuenta_id
            ? { ...c, estado: 'listo' as EstadoCuenta, alerta: true, updated_at: data.hora_listo || new Date().toISOString() }
            : c
        )
      }));
    })
  );

  // Carga inicial desde persistencia (fuente de verdad)
  loadCuentasFromPersistencia(projectId);

  return () => {
    for (const cleanup of cleanups) cleanup();
  };
}
