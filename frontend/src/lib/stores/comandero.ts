/**
 * Comandero Store — Estado del pedido y operaciones MQTT
 * Backend: modules/pizzepos/comandero (uiHandler domain: 'pedido')
 */
import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';

// Types
export interface PedidoItem {
  id: string;
  producto_id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  variaciones: any[];
  notas: string;
  subtotal: number;
  created_at: string;
}

export interface Pedido {
  cuenta_id: string;
  items: PedidoItem[];
  notas: string;
  total: number;
  created_at: string;
  updated_at: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  orden: number;
  color?: string;
  icon?: string;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria_id: string;
  precio: number;
  tiene_variaciones: boolean;
  variaciones?: any[];
  ingredientes?: any[];
  imagen?: string;
}

interface ComanderoState {
  cuenta_id: string | null;
  pedido: Pedido | null;
  categorias: Categoria[];
  productos: Producto[];
  categoriaActiva: string | null;
  loading: boolean;
  error: string | null;
}

// Initial state
const initialState: ComanderoState = {
  cuenta_id: null,
  pedido: null,
  categorias: [],
  productos: [],
  categoriaActiva: null,
  loading: false,
  error: null
};

// Store
export const comanderoStore = writable<ComanderoState>(initialState);

// Derived stores
export const pedido = derived(comanderoStore, $s => $s.pedido);
export const pedidoItems = derived(comanderoStore, $s => $s.pedido?.items || []);
export const pedidoTotal = derived(comanderoStore, $s => $s.pedido?.total || 0);
export const pedidoCount = derived(comanderoStore, $s => $s.pedido?.items?.length || 0);
export const categorias = derived(comanderoStore, $s => $s.categorias);
export const productos = derived(comanderoStore, $s => $s.productos);
export const categoriaActiva = derived(comanderoStore, $s => $s.categoriaActiva);
export const comanderoLoading = derived(comanderoStore, $s => $s.loading);
export const comanderoError = derived(comanderoStore, $s => $s.error);

// Actions

/** Inicializa el comandero para una cuenta */
export async function initComandero(cuenta_id: string): Promise<void> {
  comanderoStore.update(s => ({ ...s, cuenta_id, loading: true, error: null }));

  try {
    // Cargar pedido, categorías y productos en paralelo
    const [pedidoRes, categoriasRes] = await Promise.all([
      mqttRequest('pedido', 'get', { cuenta_id }),
      mqttRequest('categorias', 'list', {})
    ]);

    const pedido = pedidoRes?.pedido || { cuenta_id, items: [], notas: '', total: 0 };
    const categorias = categoriasRes?.categorias || [];

    // Si hay categorías, cargar productos de la primera
    let productos: Producto[] = [];
    let categoriaActiva: string | null = null;

    if (categorias.length > 0) {
      categoriaActiva = categorias[0].id;
      const productosRes = await mqttRequest('productos', 'list', { categoria_id: categoriaActiva });
      productos = productosRes?.productos || [];
    }

    comanderoStore.update(s => ({
      ...s,
      pedido,
      categorias,
      productos,
      categoriaActiva,
      loading: false
    }));
  } catch (err: any) {
    comanderoStore.update(s => ({
      ...s,
      loading: false,
      error: err?.message || 'Error al cargar comandero'
    }));
  }
}

/** Cambia la categoría activa y carga sus productos */
export async function selectCategoria(categoria_id: string): Promise<void> {
  comanderoStore.update(s => ({ ...s, categoriaActiva: categoria_id, loading: true }));

  try {
    const res = await mqttRequest('productos', 'list', { categoria_id });
    comanderoStore.update(s => ({
      ...s,
      productos: res?.productos || [],
      loading: false
    }));
  } catch (err: any) {
    comanderoStore.update(s => ({
      ...s,
      loading: false,
      error: err?.message || 'Error al cargar productos'
    }));
  }
}

/** Añade un producto al pedido */
export async function addItem(
  producto_id: string,
  cantidad: number = 1,
  variaciones: any[] = [],
  notas: string = ''
): Promise<{ success: boolean; error?: string }> {
  const state = get(comanderoStore);
  if (!state.cuenta_id) return { success: false, error: 'No hay cuenta activa' };

  try {
    const res = await mqttRequest('pedido', 'add_item', {
      cuenta_id: state.cuenta_id,
      producto_id,
      cantidad,
      variaciones,
      notas
    });

    if (res?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: res.pedido }));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al añadir item' };
  }
}

/** Elimina un item del pedido */
export async function removeItem(item_id: string): Promise<{ success: boolean; error?: string }> {
  const state = get(comanderoStore);
  if (!state.cuenta_id) return { success: false, error: 'No hay cuenta activa' };

  try {
    const res = await mqttRequest('pedido', 'remove_item', {
      cuenta_id: state.cuenta_id,
      item_id
    });

    if (res?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: res.pedido }));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al eliminar item' };
  }
}

/** Actualiza cantidad o notas de un item */
export async function updateItem(
  item_id: string,
  updates: { cantidad?: number; notas?: string }
): Promise<{ success: boolean; error?: string }> {
  const state = get(comanderoStore);
  if (!state.cuenta_id) return { success: false, error: 'No hay cuenta activa' };

  try {
    const res = await mqttRequest('pedido', 'update_item', {
      cuenta_id: state.cuenta_id,
      item_id,
      ...updates
    });

    if (res?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: res.pedido }));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al actualizar item' };
  }
}

/** Envía el pedido a cocina */
export async function enviarCocina(): Promise<{ success: boolean; error?: string }> {
  const state = get(comanderoStore);
  if (!state.cuenta_id) return { success: false, error: 'No hay cuenta activa' };
  if (!state.pedido?.items?.length) return { success: false, error: 'No hay items en el pedido' };

  try {
    await mqttRequest('pedido', 'enviar_cocina', { cuenta_id: state.cuenta_id });
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al enviar a cocina' };
  }
}

/** Limpia el estado del comandero */
export function resetComandero(): void {
  comanderoStore.set(initialState);
}

/** Inicializa suscripciones MQTT para actualizar el pedido en tiempo real */
export function initComanderoSubscriptions(): () => void {
  const state = get(comanderoStore);
  const unsubs: (() => void)[] = [];

  // pedido.item_agregado
  unsubs.push(mqttSubscribe('pedido.item_agregado', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.cuenta_id === currentState.cuenta_id && data?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: data.pedido }));
    }
  }));

  // pedido.item_eliminado
  unsubs.push(mqttSubscribe('pedido.item_eliminado', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.cuenta_id === currentState.cuenta_id && data?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: data.pedido }));
    }
  }));

  // pedido.enviado_cocina
  unsubs.push(mqttSubscribe('pedido.enviado_cocina', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.cuenta_id === currentState.cuenta_id) {
      // Notificar que se envió (el pedido NO se borra, puede seguir añadiendo)
      console.log('[Comandero] Pedido enviado a cocina', data);
    }
  }));

  return () => unsubs.forEach(fn => fn());
}
