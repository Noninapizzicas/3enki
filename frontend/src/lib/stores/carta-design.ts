/**
 * Carta Design Store
 *
 * Lecturas directas via fs (patron lecturas-frontend-via-fs-read), igual que
 * recetas/escandallo/carta-manager:
 *   - Carta a diseñar: fs.read `/pizzepos/cartas/<carta_id>.json` (carta-manager storage).
 *   - Gallery: fs.list `/carta-design/designs/` + fs.read cada meta .json.
 *
 * NO hay biblioteca de profiles/estilos. La identidad del diseño (colores, tipografias,
 * logo, voz) sale de la MARCA (carta-marketing) — el panel la refleja; el chat la bebe.
 *
 * La composicion del HTML print-ready la hace el LLM de PAGINA en el chat (sin agente);
 * lo guardado aparece en la galeria.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface DesignMeta {
  carta_id: string;
  nombre: string | null;
  filename: string;
  size_bytes: number;
  created_at?: string;
  generado_at?: string;
}

export interface CartaResumen {
  total_productos: number;
  total_categorias: number;
  precio_min: number;
  precio_max: number;
  categorias_stats: Array<{
    id: string;
    nombre: string;
    productos_count: number;
    precio_min: number;
    precio_max: number;
  }>;
}

export interface CartaDesignState {
  cartaId: string | null;
  cartaNombre: string | null;
  resumen: CartaResumen | null;
  cartaLoaded: boolean;
  designs: DesignMeta[];
  loading: boolean;
  error: string | null;
}

const DESIGNS_DIR = '/pizzepos/carta-design/designs';
const CARTAS_DIR = '/pizzepos/cartas';   // CUSTODIO: carta-manager. Path canonico.

// =============================================================================
// STORE
// =============================================================================

const initialState: CartaDesignState = {
  cartaId: null,
  cartaNombre: null,
  resumen: null,
  cartaLoaded: false,
  designs: [],
  loading: false,
  error: null
};

export const cartaDesignStore = writable<CartaDesignState>(initialState);

// =============================================================================
// HELPERS — fs directo
// =============================================================================

async function readJsonOrNull<T = any>(path: string): Promise<T | null> {
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path });
    const content = res.data?.content;
    if (typeof content !== 'string') return null;
    return JSON.parse(content) as T;
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return null;
    throw err;
  }
}

interface FsListItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
  extension: string | null;
}

async function listDirOrEmpty(path: string): Promise<FsListItem[]> {
  try {
    const res = await mqttRequest<{ items: FsListItem[] }>('fs', 'list', { path });
    return Array.isArray(res.data?.items) ? res.data.items : [];
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return [];
    throw err;
  }
}

// =============================================================================
// ACTIONS
// =============================================================================

// La carta en disco trae productos[]/categorias[], no un campo `resumen`. Lo derivamos
// para alimentar los hints de layout del panel (totales + rango de precios + por categoria).
function resumenFromCarta(carta: { productos?: unknown[]; categorias?: unknown[] }): CartaResumen | null {
  const productos = Array.isArray(carta.productos) ? (carta.productos as Array<Record<string, unknown>>) : [];
  const categorias = Array.isArray(carta.categorias) ? (carta.categorias as Array<Record<string, unknown>>) : [];
  if (productos.length === 0 && categorias.length === 0) return null;
  const precios = productos.map(p => Number(p.precio)).filter(n => Number.isFinite(n));
  const catStats = categorias.map(c => {
    const prods = productos.filter(p => p.categoria_id === c.id);
    const ps = prods.map(p => Number(p.precio)).filter(n => Number.isFinite(n));
    return {
      id: String(c.id ?? ''),
      nombre: String(c.nombre ?? c.id ?? ''),
      productos_count: prods.length,
      precio_min: ps.length ? Math.min(...ps) : 0,
      precio_max: ps.length ? Math.max(...ps) : 0
    };
  });
  return {
    total_productos: productos.length,
    total_categorias: categorias.length,
    precio_min: precios.length ? Math.min(...precios) : 0,
    precio_max: precios.length ? Math.max(...precios) : 0,
    categorias_stats: catStats
  };
}

export async function loadCartaForDesign(cartaId: string): Promise<boolean> {
  cartaDesignStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const carta = await readJsonOrNull<{ id?: string; nombre?: string; resumen?: CartaResumen; meta?: { id?: string; nombre?: string }; productos?: unknown[]; categorias?: unknown[] }>(`${CARTAS_DIR}/${cartaId}.json`);
    if (!carta) {
      cartaDesignStore.update(s => ({
        ...s, loading: false, error: `Carta ${cartaId} no encontrada en ${CARTAS_DIR}/`
      }));
      return false;
    }

    cartaDesignStore.update(s => ({
      ...s,
      cartaId: carta.meta?.id || carta.id || cartaId,
      cartaNombre: carta.meta?.nombre || carta.nombre || cartaId,
      resumen: carta.resumen || resumenFromCarta(carta),
      cartaLoaded: true,
      loading: false
    }));

    return true;
  } catch (error: any) {
    cartaDesignStore.update(s => ({
      ...s, loading: false, error: error?.message || 'Error al cargar carta'
    }));
    return false;
  }
}

export async function loadGallery(cartaId: string): Promise<void> {
  try {
    const items = await listDirOrEmpty(DESIGNS_DIR);
    const metaFiles = items.filter(i => i.type === 'file' && i.name.endsWith('.json'));

    const designs: DesignMeta[] = [];
    for (const f of metaFiles) {
      const meta = await readJsonOrNull<DesignMeta>(f.path);
      if (meta && meta.carta_id === cartaId) designs.push(meta);
    }

    designs.sort((a, b) =>
      String(b.generado_at || b.created_at || '').localeCompare(
        String(a.generado_at || a.created_at || '')
      )
    );

    cartaDesignStore.update(s => ({ ...s, designs }));
  } catch (err) {
    console.error('[CartaDesign] loadGallery failed:', err);
  }
}

export function clearDesignError(): void {
  cartaDesignStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

let cleanupFn: (() => void) | null = null;
let initialized = false;

export function initCartaDesignSubscriptions(): () => void {
  if (initialized && cleanupFn) return cleanupFn;
  initialized = true;

  const unsubscribe = mqttSubscribe('carta.generada', (_topic, payload: any) => {
    const cartaId = payload?.meta?.id || payload?.carta_id;
    cartaDesignStore.update(s => {
      if (s.cartaId === cartaId) return { ...s, cartaLoaded: false };
      return s;
    });
  });

  cleanupFn = () => {
    initialized = false;
    unsubscribe();
  };

  return cleanupFn;
}

// =============================================================================
// DERIVED
// =============================================================================

export const designGallery = derived(cartaDesignStore, $s => $s.designs);
export const designLoading = derived(cartaDesignStore, $s => $s.loading);
export const designError = derived(cartaDesignStore, $s => $s.error);
export const cartaLoaded = derived(cartaDesignStore, $s => $s.cartaLoaded);
export const cartaResumen = derived(cartaDesignStore, $s => $s.resumen);
