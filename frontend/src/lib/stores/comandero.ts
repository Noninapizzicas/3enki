/**
 * Comandero Store — Simplificado
 *
 * Carga la carta COMPLETA de un solo golpe con productos/carta_completa.
 * No necesita project_id correcto — el backend busca el primer proyecto con datos.
 * Filtra productos por categoría en el frontend (ya los tiene todos en memoria).
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
  tipo?: string;
  pizza_izquierda?: { id: string; nombre: string };
  pizza_derecha?: { id: string; nombre: string };
  ingredientes?: any[];
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
  categoria?: string;
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
  todosProductos: Producto[];  // ALL products from carta
  productos: Producto[];       // Filtered by active category
  ingredientes: any[];         // ALL ingredients from carta
  categoriaActiva: string | null;
  loading: boolean;
  error: string | null;
}

const initialState: ComanderoState = {
  project_id: null,
  cuenta_id: null,
  pedido: null,
  categorias: [],
  todosProductos: [],
  productos: [],
  ingredientes: [],
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
export const todosProductos = derived(comanderoStore, $s => $s.todosProductos);
export const ingredientes = derived(comanderoStore, $s => $s.ingredientes);
export const categoriaActiva = derived(comanderoStore, $s => $s.categoriaActiva);
export const comanderoLoading = derived(comanderoStore, $s => $s.loading);
export const comanderoError = derived(comanderoStore, $s => $s.error);

// ============================================================================
// Helpers
// ============================================================================

/** Normalize product data from backend */
function enrichProducto(p: any): Producto {
  const ingredientes = p.ingredientes || p.ingredientes_base || [];
  return {
    ...p,
    ingredientes,
    categoria_id: p.categoria_id || p.categoria,
    tiene_variaciones: p.tiene_variaciones ?? (ingredientes.length > 0)
  };
}

/** Filter products by category id or name */
function filterByCategoria(productos: Producto[], categoriaId: string): Producto[] {
  return productos.filter(p =>
    p.categoria_id === categoriaId || p.categoria === categoriaId
  );
}

// ============================================================================
// Actions
// ============================================================================

/** Inicializa el comandero — carga carta completa + pedido de la cuenta */
export async function initComandero(project_id: string, cuenta_id: string): Promise<void> {
  comanderoStore.update(s => ({ ...s, project_id, cuenta_id, loading: true, error: null }));

  try {
    let rawCategorias: any[] = [];
    let rawProductos: any[] = [];
    let rawIngredientes: any[] = [];

    // Intentar carta_completa (un solo call, óptimo)
    // Si falla (ej: backend sin reiniciar), fallback a calls individuales
    try {
      const cartaRes = await mqttRequest('productos', 'carta_completa', { project_id });
      const cartaData = cartaRes?.data as any;
      rawCategorias = cartaData?.categorias || [];
      rawProductos = cartaData?.productos || [];
      rawIngredientes = cartaData?.ingredientes || [];
      console.log('[Comandero] carta_completa OK');
    } catch {
      console.warn('[Comandero] carta_completa no disponible, usando calls individuales');
      // Fallback: categorias + productos por separado
      const [catRes, prodRes] = await Promise.all([
        mqttRequest('productos', 'categorias', { project_id }),
        mqttRequest('productos', 'list', { project_id })
      ]);
      rawCategorias = (catRes?.data as any)?.categorias || [];
      rawProductos = (prodRes?.data as any)?.productos || [];

      // Intentar ingredientes también
      try {
        const ingRes = await mqttRequest('productos', 'ingredientes', { project_id });
        rawIngredientes = (ingRes?.data as any)?.ingredientes || [];
      } catch { /* sin ingredientes, no pasa nada */ }
    }

    const categorias: Categoria[] = rawCategorias.map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      orden: c.orden ?? 0,
      color: c.color,
      icon: c.icon || c.emoji || ''
    }));

    const todosProductos: Producto[] = rawProductos.map(enrichProducto);

    // Pedido — si falla, pedido vacío (no explota)
    let pedido: Pedido = { cuenta_id, items: [], notas: '', total: 0, created_at: '', updated_at: '' };
    try {
      const pedidoRes = await mqttRequest('comandero', 'get', { project_id, cuenta_id });
      const pedidoData = pedidoRes?.data as any;
      pedido = pedidoData?.pedido || pedidoData?.data?.pedido || pedido;
    } catch {
      console.warn('[Comandero] Pedido no encontrado, usando vacío');
    }

    // Seleccionar primera categoría y filtrar localmente
    let categoriaActiva: string | null = null;
    let productos: Producto[] = [];

    if (categorias.length > 0) {
      categoriaActiva = categorias[0].id;
      productos = filterByCategoria(todosProductos, categoriaActiva);
    } else {
      productos = todosProductos;
    }

    comanderoStore.update(s => ({
      ...s,
      project_id,
      pedido,
      categorias,
      todosProductos,
      productos,
      ingredientes: rawIngredientes,
      categoriaActiva,
      loading: false
    }));

    console.log('[Comandero] Carta cargada:', {
      categorias: categorias.length,
      productos: todosProductos.length,
      ingredientes: rawIngredientes.length
    });
  } catch (err: any) {
    console.error('[Comandero] Error cargando carta:', err);
    comanderoStore.update(s => ({
      ...s,
      loading: false,
      error: err?.message || 'Error al cargar comandero'
    }));
  }
}

/** Cambia la categoría activa — filtra productos localmente (sin llamada MQTT) */
export function selectCategoria(categoria_id: string): void {
  comanderoStore.update(s => ({
    ...s,
    categoriaActiva: categoria_id,
    productos: filterByCategoria(s.todosProductos, categoria_id)
  }));
}

/** Añade un producto al pedido */
export async function addItem(
  producto_id: string,
  cantidad: number = 1,
  variaciones: any[] = [],
  metadata: string | Record<string, any> = ''
): Promise<{ success: boolean; error?: string }> {
  const state = get(comanderoStore);
  if (!state.cuenta_id) return { success: false, error: 'No hay cuenta activa' };

  const notas = typeof metadata === 'string' ? metadata : '';
  const extra = typeof metadata === 'object' ? metadata : {};

  // Resolver nombre/precio desde todosProductos (ya cargados en memoria)
  const producto = state.todosProductos.find(p => p.id === producto_id);

  try {
    const precioFinal = (extra.precio_override != null) ? extra.precio_override : producto?.precio;
    const nombreFinal = extra.nombre_override || producto?.nombre;
    const { precio_override: _p, nombre_override: _n, ...extraRest } = extra;

    const res = await mqttRequest('comandero', 'add-item', {
      project_id: state.project_id,
      cuenta_id: state.cuenta_id,
      producto_id,
      nombre: nombreFinal,
      precio: precioFinal,
      cantidad,
      variaciones,
      notas,
      ...extraRest
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
    const res = await mqttRequest('comandero', 'remove-item', {
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
    const res = await mqttRequest('comandero', 'update-item', {
      project_id: state.project_id,
      cuenta_id: state.cuenta_id,
      item_id,
      ...updates
    });

    const updateData = res?.data as any;
    const updatedPedido = updateData?.pedido || updateData?.data?.pedido;
    if (updatedPedido) {
      comanderoStore.update(s => ({ ...s, pedido: updatedPedido }));
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
    const res = await mqttRequest('comandero', 'send-kitchen', { project_id: state.project_id, cuenta_id: state.cuenta_id });

    const sendData = res?.data as any;
    const updatedPedido = sendData?.pedido || sendData?.data?.pedido;
    if (updatedPedido) {
      comanderoStore.update(s => ({ ...s, pedido: updatedPedido }));
    }

    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error al enviar a cocina' };
  }
}

/** Limpia el estado del comandero */
export function resetComandero(): void {
  comanderoStore.set(initialState);
}

/** Suscripciones realtime */
export function initComanderoSubscriptions(projectId: string): () => void {
  const unsubs: (() => void)[] = [];

  unsubs.push(mqttSubscribe('comandero.item_agregado', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.cuenta_id === currentState.cuenta_id && data?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: data.pedido }));
    }
  }));

  unsubs.push(mqttSubscribe('comandero.item_eliminado', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.cuenta_id === currentState.cuenta_id && data?.pedido) {
      comanderoStore.update(s => ({ ...s, pedido: data.pedido }));
    }
  }));

  unsubs.push(mqttSubscribe('pedido.enviado_cocina', (event: any) => {
    const data = event?.data || event?.payload || event;
    const currentState = get(comanderoStore);
    if (data?.cuenta_id === currentState.cuenta_id) {
      console.log('[Comandero] Pedido enviado a cocina', data);
    }
  }));

  return () => unsubs.forEach(fn => fn());
}
