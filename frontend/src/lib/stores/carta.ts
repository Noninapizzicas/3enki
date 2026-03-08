/**
 * Carta Digital Store
 *
 * Carga la carta completa y gestiona el carrito del cliente.
 * Mismo patrón que comandero: carta_completa + filtrado local.
 * El pedido se envía por WhatsApp con mensaje pre-formateado.
 */
import { writable, derived, get } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';

// Types

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
  descripcion?: string;
  tiene_variaciones: boolean;
  ingredientes?: { nombre: string; emoji?: string; tipo?: string; precio_extra?: number }[];
  ingredientes_base?: { id: string; nombre: string; emoji?: string }[];
  tags?: string[];
  metadata?: {
    vegano?: boolean;
    vegetariano?: boolean;
    popularidad?: number;
    tiempo_preparacion?: number;
  };
  emoji?: string;
  imagen?: string;
}

export interface CarritoItem {
  id: string;               // unique ID for this cart entry
  producto_id: string;
  nombre: string;
  precio: number;
  cantidad: number;
  notas?: string;
  variaciones?: {
    ingredientes_quitar?: string[];
    ingredientes_anadir?: { nombre: string; cantidad?: number; precio_extra?: number }[];
  };
  ingredientes_base?: string[];
  precio_unitario: number;   // precio base + extras
}

interface CartaState {
  project_id: string | null;
  categorias: Categoria[];
  todosProductos: Producto[];
  productos: Producto[];          // filtered by active category
  ingredientes: any[];
  categoriaActiva: string | null;
  carrito: CarritoItem[];
  productoDetalle: Producto | null;
  loading: boolean;
  error: string | null;
  config: CartaConfig;
}

export interface CartaTema {
  color_primario: string;
  color_fondo: string;
  color_texto: string;
  logo_emoji: string;
}

export interface CartaConfig {
  whatsapp_telefono: string;
  nombre_negocio: string;
  moneda: string;
  mensaje_header: string;
  tema?: CartaTema;
}

const DEFAULT_CONFIG: CartaConfig = {
  whatsapp_telefono: '',
  nombre_negocio: 'Pizzicas',
  moneda: '\u20ac',
  mensaje_header: 'Hola! Quiero pedir:'
};

const initialState: CartaState = {
  project_id: null,
  categorias: [],
  todosProductos: [],
  productos: [],
  ingredientes: [],
  categoriaActiva: null,
  carrito: [],
  productoDetalle: null,
  loading: false,
  error: null,
  config: { ...DEFAULT_CONFIG }
};

// Store
export const cartaStore = writable<CartaState>(initialState);

// Derived stores
export const categorias = derived(cartaStore, $s => $s.categorias);
export const productos = derived(cartaStore, $s => $s.productos);
export const todosProductos = derived(cartaStore, $s => $s.todosProductos);
export const ingredientes = derived(cartaStore, $s => $s.ingredientes);
export const categoriaActiva = derived(cartaStore, $s => $s.categoriaActiva);
export const carrito = derived(cartaStore, $s => $s.carrito);
export const carritoCount = derived(cartaStore, $s =>
  $s.carrito.reduce((sum, item) => sum + item.cantidad, 0)
);
export const carritoTotal = derived(cartaStore, $s =>
  $s.carrito.reduce((sum, item) => sum + item.precio_unitario * item.cantidad, 0)
);
export const productoDetalle = derived(cartaStore, $s => $s.productoDetalle);
export const cartaLoading = derived(cartaStore, $s => $s.loading);
export const cartaError = derived(cartaStore, $s => $s.error);

// Actions

let cartItemCounter = 0;

export async function initCarta(project_id: string) {
  cartaStore.update(s => ({ ...s, project_id, loading: true, error: null }));

  try {
    // Crear sesión de analytics (fire-and-forget)
    mqttRequest('carta-digital', 'create-session', {
      project_id,
      user_agent: typeof navigator !== 'undefined' ? navigator.userAgent : '',
      referrer: typeof document !== 'undefined' ? document.referrer : ''
    }).catch(() => {});

    // Intentar cargar carta enriquecida desde carta-digital (incluye config + descripciones + imágenes)
    let cats: Categoria[] = [];
    let prods: Producto[] = [];
    let ings: any[] = [];
    let loadedConfig: Partial<CartaConfig> = {};

    const enrichedRes = await mqttRequest('carta-digital', 'carta-completa', { project_id }).catch(() => null);

    if (enrichedRes?.data?.productos?.length) {
      const data = enrichedRes.data;
      cats = data.categorias || [];
      prods = data.productos || [];
      ings = []; // enriched endpoint embeds ingredients in each product

      if (data.config) {
        loadedConfig = {
          whatsapp_telefono: data.config.whatsapp_telefono,
          nombre_negocio: data.config.nombre_negocio,
          moneda: data.config.moneda,
          mensaje_header: data.config.mensaje_header,
          tema: data.config.tema
        };
      }

      console.log('[Carta] Loaded enriched carta:', prods.length, 'productos');
    } else {
      // Fallback: cargar desde productos.carta_completa + config separada
      const [configRes, cartaRes] = await Promise.all([
        mqttRequest('carta-digital', 'config', { project_id }).catch(() => null),
        mqttRequest('productos', 'carta_completa', { project_id })
      ]);

      if (configRes?.data) {
        const cd = configRes.data;
        loadedConfig = {
          whatsapp_telefono: cd.whatsapp_telefono,
          nombre_negocio: cd.nombre_negocio,
          moneda: cd.moneda,
          mensaje_header: cd.mensaje_header
        };
      }

      const data = cartaRes?.data || cartaRes;
      cats = data.categorias || [];
      prods = data.productos || [];
      ings = data.ingredientes || [];

      console.log('[Carta] Loaded from productos:', prods.length, 'productos');
    }

    const firstCat = cats.length > 0 ? cats[0].id : null;
    const filtered = firstCat
      ? prods.filter(p => p.categoria === firstCat || p.categoria_id === firstCat)
      : prods;

    cartaStore.update(s => ({
      ...s,
      config: { ...s.config, ...loadedConfig },
      categorias: cats,
      todosProductos: prods,
      productos: filtered,
      ingredientes: ings,
      categoriaActiva: firstCat,
      loading: false
    }));

    console.log('[Carta] Ready:', prods.length, 'productos,', cats.length, 'categorias');
  } catch (err: any) {
    console.error('[Carta] Load error:', err);
    cartaStore.update(s => ({
      ...s,
      loading: false,
      error: err?.message || 'Error al cargar la carta'
    }));
  }
}

export function selectCategoria(categoriaId: string) {
  cartaStore.update(s => {
    const filtered = s.todosProductos.filter(
      p => p.categoria === categoriaId || p.categoria_id === categoriaId
    );
    return { ...s, categoriaActiva: categoriaId, productos: filtered };
  });
}

export function showAllProducts() {
  cartaStore.update(s => ({
    ...s,
    categoriaActiva: null,
    productos: s.todosProductos
  }));
}

// Detalle modal

export function openDetalle(producto: Producto) {
  cartaStore.update(s => ({ ...s, productoDetalle: producto }));
}

export function closeDetalle() {
  cartaStore.update(s => ({ ...s, productoDetalle: null }));
}

// Carrito

export function addToCart(
  producto: Producto,
  cantidad: number = 1,
  variaciones?: CarritoItem['variaciones'],
  ingredientes_base?: string[],
  precio_override?: number
) {
  const precio_unitario = precio_override ?? producto.precio;
  const item: CarritoItem = {
    id: `cart_${++cartItemCounter}_${Date.now().toString(36)}`,
    producto_id: producto.id,
    nombre: producto.nombre,
    precio: producto.precio,
    cantidad,
    variaciones,
    ingredientes_base,
    precio_unitario
  };

  cartaStore.update(s => ({
    ...s,
    carrito: [...s.carrito, item]
  }));
}

export function removeFromCart(itemId: string) {
  cartaStore.update(s => ({
    ...s,
    carrito: s.carrito.filter(i => i.id !== itemId)
  }));
}

export function updateCartQuantity(itemId: string, cantidad: number) {
  if (cantidad <= 0) {
    removeFromCart(itemId);
    return;
  }
  cartaStore.update(s => ({
    ...s,
    carrito: s.carrito.map(i => i.id === itemId ? { ...i, cantidad } : i)
  }));
}

export function clearCart() {
  cartaStore.update(s => ({ ...s, carrito: [] }));
}

// WhatsApp

export function formatPedidoWhatsApp(): string {
  const state = get(cartaStore);
  const { carrito: items, config } = state;

  if (items.length === 0) return '';

  let msg = `${config.mensaje_header}\n\n`;

  for (const item of items) {
    const subtotal = item.precio_unitario * item.cantidad;
    msg += `${item.cantidad}x ${item.nombre} (${subtotal.toFixed(2)}${config.moneda})\n`;

    if (item.variaciones?.ingredientes_quitar?.length) {
      msg += `  Sin: ${item.variaciones.ingredientes_quitar.join(', ')}\n`;
    }
    if (item.variaciones?.ingredientes_anadir?.length) {
      const extras = item.variaciones.ingredientes_anadir.map(e => e.nombre).join(', ');
      msg += `  Extra: ${extras}\n`;
    }
    if (item.notas) {
      msg += `  Nota: ${item.notas}\n`;
    }
  }

  const total = items.reduce((sum, i) => sum + i.precio_unitario * i.cantidad, 0);
  msg += `\nTotal: ${total.toFixed(2)}${config.moneda}`;

  return msg;
}

export function getWhatsAppUrl(): string {
  const state = get(cartaStore);
  const msg = formatPedidoWhatsApp();
  if (!msg || !state.config.whatsapp_telefono) return '';
  return `https://wa.me/${state.config.whatsapp_telefono}?text=${encodeURIComponent(msg)}`;
}

export function updateConfig(config: Partial<CartaConfig>) {
  cartaStore.update(s => ({
    ...s,
    config: { ...s.config, ...config }
  }));
}

export function resetCarta() {
  cartaStore.set({ ...initialState });
}
