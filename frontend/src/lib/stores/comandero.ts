/**
 * Comandero Store — Estado del pedido y operaciones MQTT
 * Backend: modules/pizzepos/comandero (uiHandler domain: 'pedido')
 *
 * IMPORTANTE: Todas las operaciones reciben project_id como primer parámetro
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
  project_id: string | null;
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
  project_id: null,
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
export async function initComandero(project_id: string, cuenta_id: string): Promise<void> {
  comanderoStore.update(s => ({ ...s, project_id, cuenta_id, loading: true, error: null }));

  try {
    // Cargar pedido, categorías y productos en paralelo
    const [pedidoRes, categoriasRes] = await Promise.all([
      mqttRequest('pedido', 'get', { project_id, cuenta_id }),
      mqttRequest('categorias', 'list', { project_id })
    ]);

    // res.data contains the actual payload from the backend
    const pedidoData = pedidoRes?.data;
    const categoriasData = categoriasRes?.data;
    const pedido = pedidoData?.pedido || pedidoData?.data?.pedido || { cuenta_id, items: [], notas: '', total: 0 };
    const categorias = categoriasData?.categorias || categoriasData?.data?.categorias || [];

    // Si hay categorías, cargar productos de la primera
    let productos: Producto[] = [];
    let categoriaActiva: string | null = null;

    if (categorias.length > 0) {
      categoriaActiva = categorias[0].id;
      const productosRes = await mqttRequest('productos', 'list', { project_id, categoria_id: categoriaActiva });
      const prodData = productosRes?.data as any;
      productos = prodData?.productos || prodData?.data?.productos || [];
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
  const state = get(comanderoStore);
  comanderoStore.update(s => ({ ...s, categoriaActiva: categoria_id, loading: true }));

  try {
    const res = await mqttRequest('productos', 'list', { project_id: state.project_id, categoria_id });
    const resData = res?.data as any;
    comanderoStore.update(s => ({
      ...s,
      productos: resData?.productos || resData?.data?.productos || [],
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
      project_id: state.project_id,
      cuenta_id: state.cuenta_id,
      producto_id,
      cantidad,
      variaciones,
      notas
    });

    const addData = res?.data as any;
    const updatedPedido = addData?.pedido || addData?.data?.pedido;
    if (updatedPedido) {
      comanderoStore.update(s => ({ ...s, pedido: updatedPedido }));
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
      project_id: state.project_id,
      cuenta_id: state.cuenta_id,
      item_id
    });

    const removeData = res?.data as any;
    const removedPedido = removeData?.pedido || removeData?.data?.pedido;
    if (removedPedido) {
      comanderoStore.update(s => ({ ...s, pedido: removedPedido }));
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
      project_id: state.project_id,
      cuenta_id: state.cuenta_id,
      item_id,
      ...updates
    });

    const updateData = res?.data as any;
    const updatedPedidoItem = updateData?.pedido || updateData?.data?.pedido;
    if (updatedPedidoItem) {
      comanderoStore.update(s => ({ ...s, pedido: updatedPedidoItem }));
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
    await mqttRequest('pedido', 'enviar_cocina', { project_id: state.project_id, cuenta_id: state.cuenta_id });
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
export function initComanderoSubscriptions(projectId: string): () => void {
  const unsubs: (() => void)[] = [];

  // pedido.item_agregado
  unsubs.push(mqttSubscribe('pedido.item_agregado', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    // Solo procesar si es del mismo proyecto y cuenta
    if (data?.project_id && data.project_id !== projectId) return;
    if (data?.cuenta_id === currentState.cuenta_id && data?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: data.pedido }));
    }
  }));

  // pedido.item_eliminado
  unsubs.push(mqttSubscribe('pedido.item_eliminado', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.project_id && data.project_id !== projectId) return;
    if (data?.cuenta_id === currentState.cuenta_id && data?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: data.pedido }));
    }
  }));

  // pedido.enviado_cocina
  unsubs.push(mqttSubscribe('pedido.enviado_cocina', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.project_id && data.project_id !== projectId) return;
    if (data?.cuenta_id === currentState.cuenta_id) {
      // Notificar que se envió (el pedido NO se borra, puede seguir añadiendo)
      console.log('[Comandero] Pedido enviado a cocina', data);
    }
  }));

  return () => unsubs.forEach(fn => fn());
}
