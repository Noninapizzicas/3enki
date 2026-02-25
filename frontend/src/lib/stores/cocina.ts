/**
 * Cocina Store — Estado y operaciones MQTT para pantalla de cocina
 *
 * Backend: modules/pizzepos/cocina (uiHandler domain: 'cocina')
 *
 * Operaciones: list-active, get, history, prepare-item, mark-ready, metrics, health
 * Eventos RT: pedido.enviado_cocina, cocina.item_preparado, cocina.pedido_listo, pedido.cancelado
 *
 * Diseño: optimistic updates + sonido en nuevo pedido
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';
import { onReconnect } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export type EstadoItem = 'pendiente' | 'preparando' | 'listo';

export interface PizzaHalf {
  nombre: string;
  emoji?: string;
  precio?: number;
  ingredientes_base?: string[];
}

export interface IngredienteAlGusto {
  id?: string;
  nombre: string;
  emoji?: string;
  precio_extra?: number;
  tipo?: string;
}

export interface ItemCocina {
  item_id: string;
  producto_id: string;
  nombre: string;
  cantidad: number;
  variaciones?: any;
  notas?: string;
  estado: EstadoItem;
  tipo?: 'mitad_mitad' | 'al_gusto' | string;
  pizza_izquierda?: string | PizzaHalf;
  pizza_derecha?: string | PizzaHalf;
  ingredientes?: Array<string | IngredienteAlGusto>;
  ingredientes_base?: string[];
  preparando_at?: string;
  preparado_at?: string;
}

export interface PedidoCocina {
  pedido_id: string;
  cuenta_id: string;
  canal: string | null;
  items: ItemCocina[];
  estado: 'activo' | 'listo' | 'cancelado';
  notas_generales: string;
  recibido_at: string;
  listo_at?: string;
  tiempo_preparacion?: number;
}

export interface CocinaMetrics {
  pedidos_activos: number;
  items_pendientes: number;
  items_preparando: number;
  historial_count: number;
  tiempo_promedio_preparacion: number;
  clientes_sse: number;
}

export interface CocinaState {
  pedidos: PedidoCocina[];
  loading: boolean;
  error: string | null;
  metrics: CocinaMetrics | null;
}

// =============================================================================
// COLORS — Paleta cocina (dark, high contrast)
// =============================================================================

export const ESTADO_ITEM_COLORS: Record<EstadoItem, string> = {
  pendiente: '#94a3b8',  // slate-400
  preparando: '#eab308', // yellow-500
  listo: '#22c55e'       // green-500
};

export const CANAL_LABELS: Record<string, string> = {
  mesa: 'MESA',
  telefono: 'TEL',
  llevar: 'LLEVAR',
  glovo: 'GLOVO',
  whatsapp: 'WHATSAPP'
};

// =============================================================================
// STORE
// =============================================================================

export const cocinaStore = writable<CocinaState>({
  pedidos: [],
  loading: false,
  error: null,
  metrics: null
});

// Derivados
export const pedidosCocina = derived(cocinaStore, $s => $s.pedidos);
export const cocinaLoading = derived(cocinaStore, $s => $s.loading);
export const cocinaError = derived(cocinaStore, $s => $s.error);
export const cocinaMetrics = derived(cocinaStore, $s => $s.metrics);
export const pedidosCount = derived(cocinaStore, $s => $s.pedidos.length);

export const itemsPendientes = derived(cocinaStore, $s =>
  $s.pedidos.reduce((sum, p) => sum + p.items.filter(i => i.estado === 'pendiente').length, 0)
);

export const itemsPreparando = derived(cocinaStore, $s =>
  $s.pedidos.reduce((sum, p) => sum + p.items.filter(i => i.estado === 'preparando').length, 0)
);

// =============================================================================
// OPERATIONS
// =============================================================================

export async function loadPedidosActivos(): Promise<void> {
  cocinaStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const res = await mqttRequest<any>('cocina', 'list-active', {});
    const data = res?.data?.pedidos ? res.data : res?.data?.data;
    const pedidos = data?.pedidos || [];

    cocinaStore.update(s => ({
      ...s,
      pedidos,
      loading: false
    }));
  } catch (err: any) {
    cocinaStore.update(s => ({
      ...s,
      loading: false,
      error: err.message || 'Error al cargar pedidos'
    }));
  }
}

export async function loadMetrics(): Promise<void> {
  try {
    const res = await mqttRequest<any>('cocina', 'metrics', {});
    const metrics = res?.data?.pedidos_activos !== undefined ? res.data : res?.data?.data;

    if (metrics) {
      cocinaStore.update(s => ({ ...s, metrics }));
    }
  } catch {
    // Non-critical
  }
}

/**
 * Tap toggle: pendiente → preparando → listo
 * Optimistic update: UI cambia al instante, revierte si falla
 */
export async function prepararItem(itemId: string): Promise<boolean> {
  const state = get(cocinaStore);

  // Encontrar item para optimistic update
  let pedidoIdx = -1;
  let itemIdx = -1;
  let estadoAnterior: EstadoItem = 'pendiente';

  for (let pi = 0; pi < state.pedidos.length; pi++) {
    const ii = state.pedidos[pi].items.findIndex(i => i.item_id === itemId);
    if (ii !== -1) {
      pedidoIdx = pi;
      itemIdx = ii;
      estadoAnterior = state.pedidos[pi].items[ii].estado;
      break;
    }
  }

  if (pedidoIdx === -1 || estadoAnterior === 'listo') return false;

  // Optimistic: siguiente estado
  const nuevoEstado: EstadoItem = estadoAnterior === 'pendiente' ? 'preparando' : 'listo';

  cocinaStore.update(s => {
    const pedidos = [...s.pedidos];
    const pedido = { ...pedidos[pedidoIdx], items: [...pedidos[pedidoIdx].items] };
    pedido.items[itemIdx] = { ...pedido.items[itemIdx], estado: nuevoEstado };
    pedidos[pedidoIdx] = pedido;
    return { ...s, pedidos };
  });

  try {
    await mqttRequest<any>('cocina', 'prepare-item', { item_id: itemId });
    return true;
  } catch {
    // Revert optimistic update
    cocinaStore.update(s => {
      const pedidos = [...s.pedidos];
      if (pedidos[pedidoIdx]) {
        const pedido = { ...pedidos[pedidoIdx], items: [...pedidos[pedidoIdx].items] };
        pedido.items[itemIdx] = { ...pedido.items[itemIdx], estado: estadoAnterior };
        pedidos[pedidoIdx] = pedido;
      }
      return { ...s, pedidos };
    });
    return false;
  }
}

/**
 * Marca todos los items de un pedido como listo de golpe
 */
export async function marcarListo(pedidoId: string): Promise<boolean> {
  // Optimistic: marcar todos listo
  cocinaStore.update(s => ({
    ...s,
    pedidos: s.pedidos.map(p =>
      p.pedido_id === pedidoId
        ? { ...p, items: p.items.map(i => ({ ...i, estado: 'listo' as EstadoItem })) }
        : p
    )
  }));

  try {
    await mqttRequest<any>('cocina', 'mark-ready', { pedido_id: pedidoId });
    return true;
  } catch {
    // Recargar estado real
    await loadPedidosActivos();
    return false;
  }
}

// =============================================================================
// SOUND — Campana de cocina (triple ding ascendente, audible en ambiente ruidoso)
// =============================================================================

let audioCtx: AudioContext | null = null;

/**
 * Desbloquea AudioContext (requiere gesto de usuario en navegadores modernos).
 * Llamar una vez en el primer click/tap de la pantalla.
 */
export function resumeAudioContext() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();
  } catch {
    // Audio not available
  }
}

function bellTone(startTime: number, freq: number, vol: number, dur: number) {
  if (!audioCtx) return;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.connect(gain);
  gain.connect(audioCtx.destination);
  osc.frequency.value = freq;
  osc.type = 'triangle';
  gain.gain.setValueAtTime(vol, startTime);
  gain.gain.exponentialRampToValueAtTime(0.001, startTime + dur);
  osc.start(startTime);
  osc.stop(startTime + dur);
}

function playNewOrderSound() {
  try {
    if (!audioCtx) audioCtx = new AudioContext();
    if (audioCtx.state === 'suspended') audioCtx.resume();

    const t = audioCtx.currentTime;

    // Ding 1 — fundamental + overtone
    bellTone(t, 1200, 0.5, 0.35);
    bellTone(t, 2400, 0.2, 0.25);

    // Ding 2 — más alto (150ms después)
    bellTone(t + 0.15, 1500, 0.5, 0.35);
    bellTone(t + 0.15, 3000, 0.2, 0.25);

    // Ding 3 — aún más alto (300ms después)
    bellTone(t + 0.30, 1800, 0.45, 0.4);
    bellTone(t + 0.30, 3600, 0.15, 0.3);
  } catch {
    // Audio not available
  }
}

// =============================================================================
// HELPERS
// =============================================================================

/**
 * Extrae referencia legible del cuenta_id
 * mesa_5_20260225_001 → "MESA 5"
 * tel_20260225_001 → "TEL #1"
 */
export function extractRef(cuentaId: string): string {
  if (!cuentaId) return '???';
  if (cuentaId.startsWith('mesa_')) {
    const parts = cuentaId.split('_');
    return `MESA ${parts[1]}`;
  }
  if (cuentaId.startsWith('tel_')) {
    const parts = cuentaId.split('_');
    return `TEL #${parseInt(parts[2]) || parts[2]}`;
  }
  if (cuentaId.startsWith('llevar_')) {
    const parts = cuentaId.split('_');
    return `LLEVAR #${parseInt(parts[2]) || parts[2]}`;
  }
  if (cuentaId.startsWith('glovo_')) {
    const parts = cuentaId.split('_');
    return `GLOVO #${parseInt(parts[2]) || parts[2]}`;
  }
  if (cuentaId.startsWith('wa_')) {
    const parts = cuentaId.split('_');
    return `WA #${parseInt(parts[2]) || parts[2]}`;
  }
  // Fallback: UUID corto
  return cuentaId.substring(0, 8).toUpperCase();
}

/**
 * Calcula tiempo transcurrido en formato MM:SS
 */
export function elapsed(isoDate: string): string {
  const diff = Math.floor((Date.now() - new Date(isoDate).getTime()) / 1000);
  const mins = Math.floor(diff / 60);
  const secs = diff % 60;
  return `${String(mins).padStart(2, '0')}:${String(secs).padStart(2, '0')}`;
}

// =============================================================================
// REALTIME SUBSCRIPTIONS
// =============================================================================

export function initCocinaSubscriptions(): () => void {
  const cleanups: (() => void)[] = [];

  // pedido.enviado_cocina → nuevo pedido llega
  cleanups.push(
    mqttSubscribe('pedido.enviado_cocina', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.pedido_id) return;

      const pedidoCocina: PedidoCocina = {
        pedido_id: data.pedido_id,
        cuenta_id: data.cuenta_id,
        canal: data.canal || null,
        items: (data.items || []).map((item: any) => ({
          ...item,
          estado: 'pendiente' as EstadoItem
        })),
        estado: 'activo',
        notas_generales: data.notas_generales || '',
        recibido_at: data.recibido_at || new Date().toISOString()
      };

      cocinaStore.update(s => {
        // Evitar duplicados
        if (s.pedidos.some(p => p.pedido_id === data.pedido_id)) return s;
        return { ...s, pedidos: [...s.pedidos, pedidoCocina] };
      });

      playNewOrderSound();
    })
  );

  // cocina.item_preparado → item marcado listo (sync multi-pantalla)
  cleanups.push(
    mqttSubscribe('cocina.item_preparado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.item_id) return;

      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.map(p =>
          p.pedido_id === data.pedido_id
            ? {
              ...p,
              items: p.items.map(i =>
                i.item_id === data.item_id
                  ? { ...i, estado: 'listo' as EstadoItem, preparado_at: data.preparado_at }
                  : i
              )
            }
            : p
        )
      }));
    })
  );

  // cocina.pedido_listo → pedido completado, quitar de pantalla con delay
  cleanups.push(
    mqttSubscribe('cocina.pedido_listo', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.pedido_id) return;

      // Marcar como listo visualmente
      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.map(p =>
          p.pedido_id === data.pedido_id
            ? { ...p, estado: 'listo', listo_at: data.listo_at, tiempo_preparacion: data.tiempo_preparacion }
            : p
        )
      }));

      // Remover después de 3s (fade out en CSS)
      setTimeout(() => {
        cocinaStore.update(s => ({
          ...s,
          pedidos: s.pedidos.filter(p => p.pedido_id !== data.pedido_id)
        }));
      }, 3000);
    })
  );

  // pedido.cancelado → quitar inmediatamente
  cleanups.push(
    mqttSubscribe('pedido.cancelado', (event: any) => {
      const data = event?.data || event?.payload || event;
      if (!data?.pedido_id) return;

      cocinaStore.update(s => ({
        ...s,
        pedidos: s.pedidos.filter(p => p.pedido_id !== data.pedido_id)
      }));
    })
  );

  // Recargar datos completos cuando MQTT reconecta (tras pérdida de conexión)
  const unsubReconnect = onReconnect(() => {
    console.log('[Cocina] MQTT reconnected — reloading pedidos and metrics');
    loadPedidosActivos();
    loadMetrics();
  });
  cleanups.push(unsubReconnect);

  // Carga inicial
  loadPedidosActivos();
  loadMetrics();

  // Refrescar métricas cada 30s
  const metricsInterval = setInterval(loadMetrics, 30000);

  return () => {
    for (const cleanup of cleanups) cleanup();
    clearInterval(metricsInterval);
  };
}
