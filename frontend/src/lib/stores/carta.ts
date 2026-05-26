/**
 * Carta Digital Store
 *
 * Carga la carta completa y gestiona el carrito del cliente.
 * Las lecturas de carta-digital van directo a /carta-digital.json del
 * proyecto via fs.read (patron lecturas-frontend-via-fs-read). Solo se
 * invocan handlers backend cuando la operacion es genuinamente backend
 * (productos.carta_completa para el fallback de carta no compuesta).
 */
import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';

const CARTA_DIGITAL_PATH = '/carta-digital.json';

interface CartaDigitalStore {
  _version?: string;
  _updated_at?: string;
  branding?: Record<string, unknown>;
  dominio_publico?: string;
  contacto?: { telefono?: string; email?: string; web?: string; redes?: unknown };
  opciones_visualizacion?: Record<string, unknown>;
  carta_compuesta?: {
    meta?: Record<string, unknown>;
    categorias?: unknown[];
    productos?: unknown[];
    ofertas?: unknown[];
    config?: Record<string, unknown>;
    generado_at?: string;
    generado_por?: string;
  } | null;
}

async function readCartaDigitalStore(): Promise<CartaDigitalStore | null> {
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: CARTA_DIGITAL_PATH });
    const content = res.data?.content;
    if (typeof content !== 'string') return null;
    return JSON.parse(content) as CartaDigitalStore;
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return null;
    throw err;
  }
}

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
    // create-session era fire-and-forget para analytics. Sin handler hoy y
    // sin consumer real — convertido a no-op. Si se reintroduce analytics,
    // sera fs.write a un log o un evento del bus, no este atajo.

    // Intentar cargar carta enriquecida directo del archivo /carta-digital.json
    let cats: Categoria[] = [];
    let prods: Producto[] = [];
    let ings: any[] = [];
    let loadedConfig: Partial<CartaConfig> = {};

    let cartaDigital: CartaDigitalStore | null = null;
    try {
      cartaDigital = await readCartaDigitalStore();
    } catch (readErr) {
      console.warn('[Carta] readCartaDigitalStore failed, falling back:', readErr);
    }

    const compuesta = cartaDigital?.carta_compuesta;
    const compuestaProductos = compuesta && Array.isArray(compuesta.productos) ? compuesta.productos as Producto[] : [];

    if (compuestaProductos.length > 0) {
      cats = (compuesta?.categorias as Categoria[]) || [];
      prods = compuestaProductos;
      ings = []; // enriched compuesta embebe ingredientes en cada producto

      const cfgEmbebido = compuesta?.config as Record<string, unknown> | undefined;
      if (cfgEmbebido) {
        loadedConfig = {
          whatsapp_telefono: cfgEmbebido.whatsapp_telefono as string,
          nombre_negocio:    cfgEmbebido.nombre_negocio as string,
          moneda:            cfgEmbebido.moneda as string,
          mensaje_header:    cfgEmbebido.mensaje_header as string,
          tema:              cfgEmbebido.tema as CartaTema | undefined
        };
      }

      console.log('[Carta] Loaded enriched carta:', prods.length, 'productos');
    } else {
      // Fallback: config del archivo (si existe) + productos.carta_completa
      const cartaRes = await mqttRequest('productos', 'carta_completa', { project_id });

      if (cartaDigital) {
        // Sintetizar config mapeable desde el shape del blueprint.
        // El blueprint persiste branding + contacto; el frontend espera
        // los campos planos de CartaConfig. Mapeo minimo viable.
        const b = (cartaDigital.branding || {}) as Record<string, unknown>;
        const c = (cartaDigital.contacto || {}) as Record<string, unknown>;
        loadedConfig = {
          whatsapp_telefono: (c.telefono as string) || '',
          nombre_negocio:    (b.nombre as string) || DEFAULT_CONFIG.nombre_negocio,
          moneda:            DEFAULT_CONFIG.moneda,
          mensaje_header:    DEFAULT_CONFIG.mensaje_header
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
