/**
 * Llevadoo Store — Plataforma de delivery externo
 *
 * Carga carta con precios delivery (precio base + recargo).
 * Permite crear pedidos, enviarlos a cocina y trackear estado hasta recogida.
 * Los pedidos también aparecen en cocina general y comandero.
 */
import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core';

// ============================================================================
// Types
// ============================================================================

export type EstadoLlevadoo = 'recibido' | 'aceptado' | 'en_preparacion' | 'para_recoger' | 'listo' | 'entregado' | 'cancelado';

export interface ProductoDelivery {
  id: string;
  nombre: string;
  categoria_id: string;
  categoria?: string;
  precio: number;            // precio con recargo (lo que paga el cliente)
  precio_original: number;   // precio sin recargo
  recargo_delivery: number;  // recargo aplicado
  tiene_variaciones: boolean;
  ingredientes?: any[];
  ingredientes_base?: string[];
  imagen?: string;
}

export interface Categoria {
  id: string;
  nombre: string;
  orden: number;
  color?: string;
  icon?: string;
}

export interface ItemCarrito {
  producto_id: string;
  nombre: string;
  cantidad: number;
  precio_base: number;
  recargo: number;
  precio_delivery: number;
  variaciones?: any;
  notas?: string;
}

export interface PedidoLlevadoo {
  cuenta_id: string;
  numero_pedido: number;
  nombre_cliente: string;
  telefono_cliente: string;
  direccion: string;
  estado: EstadoLlevadoo;
  total: number;
  recargo_total: number;
  items: ItemCarrito[];
  hora_pedido: string;
  hora_recogida_estimada: string;
  hora_recogida_real?: string;
  hora_listo?: string;
  pedidos: string[];
  notas: string;
}

export interface ConfigRecargo {
  recargo_por_producto: number;
  recargos_especificos: Record<string, number>;
}

interface LlevadooState {
  project_id: string | null;

  // Carta delivery
  categorias: Categoria[];
  todosProductos: ProductoDelivery[];
  productos: ProductoDelivery[];   // filtrados por categoría activa
  ingredientes: any[];
  categoriaActiva: string | null;
  configRecargo: ConfigRecargo;

  // Carrito local (antes de enviar)
  carrito: ItemCarrito[];

  // Pedidos activos de Llevadoo
  pedidosActivos: PedidoLlevadoo[];

  // Pedido en curso (después de crear cuenta, antes de enviar a cocina)
  pedidoActual: PedidoLlevadoo | null;

  // UI state
  vista: 'carta' | 'pedidos' | 'config';
  loading: boolean;
  error: string | null;
}

const initialState: LlevadooState = {
  project_id: null,
  categorias: [],
  todosProductos: [],
  productos: [],
  ingredientes: [],
  categoriaActiva: null,
  configRecargo: { recargo_por_producto: 1.00, recargos_especificos: {} },
  carrito: [],
  pedidosActivos: [],
  pedidoActual: null,
  vista: 'carta',
  loading: false,
  error: null
};

// ============================================================================
// Store & Derived
// ============================================================================

export const llevadooStore = writable<LlevadooState>(initialState);

export const categorias = derived(llevadooStore, $s => $s.categorias);
export const productos = derived(llevadooStore, $s => $s.productos);
export const todosProductos = derived(llevadooStore, $s => $s.todosProductos);
export const categoriaActiva = derived(llevadooStore, $s => $s.categoriaActiva);
export const carrito = derived(llevadooStore, $s => $s.carrito);
export const carritoTotal = derived(llevadooStore, $s =>
  $s.carrito.reduce((sum, item) => sum + item.precio_delivery * item.cantidad, 0)
);
export const carritoCount = derived(llevadooStore, $s =>
  $s.carrito.reduce((sum, item) => sum + item.cantidad, 0)
);
export const carritoRecargoTotal = derived(llevadooStore, $s =>
  $s.carrito.reduce((sum, item) => sum + item.recargo * item.cantidad, 0)
);
export const pedidosActivos = derived(llevadooStore, $s => $s.pedidosActivos);
export const pedidoActual = derived(llevadooStore, $s => $s.pedidoActual);
export const vistaActiva = derived(llevadooStore, $s => $s.vista);
export const llevadooLoading = derived(llevadooStore, $s => $s.loading);
export const llevadooError = derived(llevadooStore, $s => $s.error);
export const configRecargo = derived(llevadooStore, $s => $s.configRecargo);

// ============================================================================
// Helpers
// ============================================================================

function enrichProducto(p: any): ProductoDelivery {
  const ingredientes = p.ingredientes || p.ingredientes_base || [];
  return {
    ...p,
    ingredientes,
    categoria_id: p.categoria_id || p.categoria,
    tiene_variaciones: p.tiene_variaciones ?? (ingredientes.length > 0)
  };
}

function filterByCategoria(productos: ProductoDelivery[], categoriaId: string): ProductoDelivery[] {
  return productos.filter(p =>
    p.categoria_id === categoriaId || p.categoria === categoriaId
  );
}

// ============================================================================
// Actions — Carta
// ============================================================================

/** Inicializa Llevadoo: carga carta con precios delivery + pedidos activos */
export async function initLlevadoo(project_id: string): Promise<void> {
  llevadooStore.update(s => ({ ...s, project_id, loading: true, error: null }));

  try {
    // Cargar carta con precios delivery
    const cartaRes = await mqttRequest('llevadoo', 'carta_delivery', { project_id });
    const cartaData = cartaRes?.data as any;

    const rawCategorias = cartaData?.categorias || [];
    const rawProductos = cartaData?.productos || [];
    const rawIngredientes = cartaData?.ingredientes || [];
    const rawConfig = cartaData?.config_recargo;

    const categs: Categoria[] = rawCategorias.map((c: any) => ({
      id: c.id,
      nombre: c.nombre,
      orden: c.orden ?? 0,
      color: c.color,
      icon: c.icon || c.emoji || ''
    }));

    const todos: ProductoDelivery[] = rawProductos.map(enrichProducto);

    let categoriaActiva: string | null = null;
    let productosFiltrados: ProductoDelivery[] = [];

    if (categs.length > 0) {
      categoriaActiva = categs[0].id;
      productosFiltrados = filterByCategoria(todos, categoriaActiva);
    } else {
      productosFiltrados = todos;
    }

    // Cargar pedidos activos
    const activosRes = await mqttRequest('llevadoo', 'activos', { project_id });
    const pedidosActivos = (activosRes?.data as any)?.pedidos || [];

    llevadooStore.update(s => ({
      ...s,
      project_id,
      categorias: categs,
      todosProductos: todos,
      productos: productosFiltrados,
      ingredientes: rawIngredientes,
      categoriaActiva,
      configRecargo: rawConfig || s.configRecargo,
      pedidosActivos,
      loading: false
    }));

    console.log('[Llevadoo] Inicializado:', {
      categorias: categs.length,
      productos: todos.length,
      pedidos_activos: pedidosActivos.length
    });

  } catch (err: any) {
    console.error('[Llevadoo] Error inicializando:', err);
    llevadooStore.update(s => ({
      ...s,
      loading: false,
      error: err?.message || 'Error al cargar Llevadoo'
    }));
  }
}

/** Cambia categoría activa */
export function selectCategoria(categoria_id: string): void {
  llevadooStore.update(s => ({
    ...s,
    categoriaActiva: categoria_id,
    productos: filterByCategoria(s.todosProductos, categoria_id)
  }));
}

/** Cambia vista activa */
export function setVista(vista: 'carta' | 'pedidos' | 'config'): void {
  llevadooStore.update(s => ({ ...s, vista }));
}

// ============================================================================
// Actions — Carrito local
// ============================================================================

/** Añade producto al carrito local */
export function addToCarrito(producto: ProductoDelivery, cantidad: number = 1): void {
  llevadooStore.update(s => {
    const existente = s.carrito.findIndex(i => i.producto_id === producto.id);

    if (existente >= 0) {
      const updated = [...s.carrito];
      updated[existente] = {
        ...updated[existente],
        cantidad: updated[existente].cantidad + cantidad
      };
      return { ...s, carrito: updated };
    }

    return {
      ...s,
      carrito: [...s.carrito, {
        producto_id: producto.id,
        nombre: producto.nombre,
        cantidad,
        precio_base: producto.precio_original,
        recargo: producto.recargo_delivery,
        precio_delivery: producto.precio,
        variaciones: undefined,
        notas: undefined
      }]
    };
  });
}

/** Elimina producto del carrito */
export function removeFromCarrito(producto_id: string): void {
  llevadooStore.update(s => ({
    ...s,
    carrito: s.carrito.filter(i => i.producto_id !== producto_id)
  }));
}

/** Actualiza cantidad en carrito */
export function updateCarritoCantidad(producto_id: string, cantidad: number): void {
  if (cantidad <= 0) {
    removeFromCarrito(producto_id);
    return;
  }
  llevadooStore.update(s => ({
    ...s,
    carrito: s.carrito.map(i =>
      i.producto_id === producto_id ? { ...i, cantidad } : i
    )
  }));
}

/** Vacía el carrito */
export function clearCarrito(): void {
  llevadooStore.update(s => ({ ...s, carrito: [] }));
}

// ============================================================================
// Actions — Pedidos
// ============================================================================

/** Crea un pedido Llevadoo y envía los items a cocina */
export async function enviarPedido(datos: {
  nombre_cliente?: string;
  telefono_cliente?: string;
  direccion?: string;
  notas?: string;
}): Promise<{ success: boolean; cuenta_id?: string; error?: string }> {
  const state = get(llevadooStore);
  if (state.carrito.length === 0) return { success: false, error: 'Carrito vacío' };

  try {
    // 1. Crear la cuenta Llevadoo
    const crearRes = await mqttRequest('llevadoo', 'crear_pedido', {
      project_id: state.project_id,
      nombre_cliente: datos.nombre_cliente || 'Llevadoo',
      telefono_cliente: datos.telefono_cliente || '',
      direccion: datos.direccion || '',
      notas: datos.notas || ''
    });

    const pedido = (crearRes?.data as any);
    if (!pedido?.cuenta_id) {
      return { success: false, error: 'Error creando pedido' };
    }

    const cuenta_id = pedido.cuenta_id;

    // 2. Añadir items al comandero (reusa la infraestructura existente)
    for (const item of state.carrito) {
      await mqttRequest('comandero', 'add-item', {
        project_id: state.project_id,
        cuenta_id,
        producto_id: item.producto_id,
        nombre: item.nombre,
        precio: item.precio_delivery,
        cantidad: item.cantidad,
        notas: item.notas || '',
        ...(item.variaciones && { variaciones: item.variaciones })
      });
    }

    // 3. Enviar a cocina directamente
    await mqttRequest('comandero', 'send-kitchen', {
      project_id: state.project_id,
      cuenta_id
    });

    // 4. Limpiar carrito y recargar pedidos activos
    llevadooStore.update(s => ({ ...s, carrito: [] }));
    await refreshPedidosActivos();

    console.log('[Llevadoo] Pedido enviado:', cuenta_id);
    return { success: true, cuenta_id };

  } catch (err: any) {
    console.error('[Llevadoo] Error enviando pedido:', err);
    return { success: false, error: err?.message || 'Error al enviar pedido' };
  }
}

/** Marca un pedido como recogido por el repartidor */
export async function marcarRecogido(cuenta_id: string): Promise<{ success: boolean; error?: string }> {
  const state = get(llevadooStore);
  try {
    await mqttRequest('llevadoo', 'marcar_recogido', {
      project_id: state.project_id,
      cuenta_id
    });

    await refreshPedidosActivos();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error marcando recogido' };
  }
}

/** Cancela un pedido */
export async function cancelarPedido(cuenta_id: string): Promise<{ success: boolean; error?: string }> {
  const state = get(llevadooStore);
  try {
    await mqttRequest('llevadoo', 'cancelar', {
      project_id: state.project_id,
      cuenta_id
    });

    await refreshPedidosActivos();
    return { success: true };
  } catch (err: any) {
    return { success: false, error: err?.message || 'Error cancelando pedido' };
  }
}

/** Recarga la lista de pedidos activos */
export async function refreshPedidosActivos(): Promise<void> {
  const state = get(llevadooStore);
  try {
    const res = await mqttRequest('llevadoo', 'activos', {
      project_id: state.project_id
    });
    const pedidos = (res?.data as any)?.pedidos || [];
    llevadooStore.update(s => ({ ...s, pedidosActivos: pedidos }));
  } catch (err) {
    console.warn('[Llevadoo] Error refrescando pedidos:', err);
  }
}

// ============================================================================
// Actions — Config
// ============================================================================

/** Actualiza configuración de recargos */
export async function setConfigRecargo(config: Partial<ConfigRecargo>): Promise<{ success: boolean }> {
  const state = get(llevadooStore);
  try {
    const res = await mqttRequest('llevadoo', 'set_config_recargo', {
      project_id: state.project_id,
      ...config
    });
    const newConfig = (res?.data as any);
    if (newConfig) {
      llevadooStore.update(s => ({ ...s, configRecargo: newConfig }));
    }
    return { success: true };
  } catch (err) {
    return { success: false };
  }
}

// ============================================================================
// Realtime Subscriptions
// ============================================================================

/** Suscripciones a eventos realtime de Llevadoo */
export function initLlevadooSubscriptions(projectId: string): () => void {
  const unsubs: (() => void)[] = [];

  // Pedido para recoger (items en horno) → actualizar estado
  unsubs.push(mqttSubscribe('llevadoo.para_recoger', (event: any) => {
    const data = event?.data || event?.payload || event;
    console.log('[Llevadoo] Para recoger:', data?.cuenta_id);
    refreshPedidosActivos();
  }));

  // Pedido listo en cocina → actualizar estado
  unsubs.push(mqttSubscribe('llevadoo.pedido_listo', (event: any) => {
    const data = event?.data || event?.payload || event;
    console.log('[Llevadoo] Pedido listo:', data?.cuenta_id);
    refreshPedidosActivos();
  }));

  // Pedido entregado (comandero entrega al repartidor) → actualizar lista
  unsubs.push(mqttSubscribe('llevadoo.pedido_entregado', (event: any) => {
    const data = event?.data || event?.payload || event;
    console.log('[Llevadoo] Pedido entregado:', data?.cuenta_id);
    refreshPedidosActivos();
  }));

  // Nuevo pedido recibido → actualizar lista
  unsubs.push(mqttSubscribe('llevadoo.pedido_recibido', (event: any) => {
    const data = event?.data || event?.payload || event;
    console.log('[Llevadoo] Nuevo pedido:', data?.cuenta_id);
    refreshPedidosActivos();
  }));

  // Cocina updates (para trackear estado)
  unsubs.push(mqttSubscribe('cocina.pedido_listo', (event: any) => {
    refreshPedidosActivos();
  }));

  return () => unsubs.forEach(fn => fn());
}

/** Reset completo */
export function resetLlevadoo(): void {
  llevadooStore.set(initialState);
}
