/**
 * Carta Design Store
 *
 * Lecturas/escrituras directas via fs (patron lecturas-frontend-via-fs-read).
 *   - Profiles built-in: inline en este archivo (lista cerrada de 5).
 *     Source en modules/pizzepos/carta-design/design-profiles/*.json; si
 *     se editan ahi, hay que sincronizar aqui. El blueprint los lee del
 *     directorio del modulo (path con magic project_id '__module__').
 *   - Profiles custom: fs.list `/carta-design/profiles/` + fs.read cada uno.
 *   - Gallery: fs.list `/carta-design/designs/` + fs.read cada meta .json.
 *   - Carta a diseñar: fs.read `/cartas/<carta_id>.json` (carta-manager
 *     storage). El "load-carta" original delegaba a carta.get; aqui leemos
 *     el archivo directo.
 *   - Save/delete custom profile: fs.write / fs.delete sobre el archivo.
 *
 * La generacion de HTML print-ready la hace el agente compositor en el
 * chat — no es operacion del frontend.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface DesignProfile {
  id: string;
  nombre: string;
  description: string;
  color_palette?: Record<string, string>;
  fonts?: Record<string, string>;
  layout_type?: string;
  style_notes?: string;
  decorations?: Record<string, string>;
  builtin?: boolean;
}

export interface DesignMeta {
  carta_id: string;
  nombre: string;
  profile_id: string | null;
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
  profiles: DesignProfile[];
  designs: DesignMeta[];
  loading: boolean;
  error: string | null;
}

const PROFILES_DIR = '/carta-design/profiles';
const DESIGNS_DIR = '/carta-design/designs';

// =============================================================================
// BUILT-IN PROFILES (5 — lista cerrada del subsistema-carta)
// =============================================================================

const BUILTIN_PROFILES: DesignProfile[] = [
  {
    id: 'elegant-minimal',
    nombre: 'Elegante Minimalista',
    description: 'Diseño limpio y sofisticado. Fondo blanco/crema, mucho espacio negativo, tipografía serif elegante. Precios sin símbolo €. Máxima percepción de calidad.',
    color_palette: { primary: '#1a1a1a', secondary: '#b45309', background: '#faf8f5', text: '#2d2d2d', accent: '#8b6914', muted: '#999' },
    fonts: { heading: 'Playfair Display', body: 'Source Sans 3', accent: 'Cormorant Garamond' },
    layout_type: 'single_column',
    style_notes: 'Máximo espacio negativo. Sin bordes, sin cajas. Solo tipografía y espacio.',
    builtin: true
  },
  {
    id: 'modern-bold',
    nombre: 'Moderno Bold',
    description: 'Alto contraste, tipografía sans-serif pesada, bloques de color. Headers de categoría con fondo sólido y texto blanco. Layout grid geométrico. Actual y urbano.',
    color_palette: { primary: '#111', secondary: '#f59e0b', background: '#fff', text: '#111', accent: '#ef4444', muted: '#888' },
    fonts: { heading: 'Montserrat', body: 'Inter', accent: 'Oswald' },
    layout_type: 'two_column',
    style_notes: 'Categorías como bloques de color sólido con texto blanco en mayúsculas.',
    builtin: true
  },
  {
    id: 'rock-bold',
    nombre: 'Rock Bold',
    description: 'Diseño dark con estética rock/música. Fondo negro, acentos ámbar/dorado, tipografía bold. Texturas de papel gastado. Ideal para marcas con personalidad fuerte o temática musical.',
    color_palette: { primary: '#b45309', secondary: '#dc2626', background: '#1a1a1a', text: '#e5e5e5', accent: '#f59e0b', muted: '#666' },
    fonts: { heading: 'Bebas Neue', body: 'Inter', accent: 'Rock Salt' },
    layout_type: 'multi_column',
    style_notes: 'Fondo oscuro con textura noise sutil. Categorías con fondo accent y texto blanco.',
    builtin: true
  },
  {
    id: 'rustic-italian',
    nombre: 'Rústico Italiano',
    description: 'Estética de trattoria italiana. Fondo textura papel/madera via CSS. Colores terracota y oliva. Tipografía serif cálida. Sensación artesanal y casera.',
    color_palette: { primary: '#8B4513', secondary: '#6B8E23', background: '#f5f0e8', text: '#3d2b1f', accent: '#c75000', muted: '#8b7355' },
    fonts: { heading: 'Crimson Text', body: 'Lato', accent: 'Caveat' },
    layout_type: 'two_column',
    style_notes: 'Textura de lino CSS como fondo. Borde decorativo doble en terracota.',
    builtin: true
  },
  {
    id: 'seasonal-fresh',
    nombre: 'Estacional Fresco',
    description: 'Diseño luminoso y fresco. Colores pastel que cambian por temporada. Esquinas redondeadas, badges de precio tipo etiqueta. Ideal para menús del día o cartas de temporada.',
    color_palette: { primary: '#059669', secondary: '#2563eb', background: '#f0fdf4', text: '#1a1a1a', accent: '#d97706', muted: '#6b7280' },
    fonts: { heading: 'Nunito', body: 'Open Sans', accent: 'Pacifico' },
    layout_type: 'two_column',
    style_notes: 'Fondo verde pastel muy sutil. Categorías con icono emoji grande.',
    builtin: true
  }
];

// =============================================================================
// STORE
// =============================================================================

const initialState: CartaDesignState = {
  cartaId: null,
  cartaNombre: null,
  resumen: null,
  cartaLoaded: false,
  profiles: BUILTIN_PROFILES.slice(),
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

export async function loadCartaForDesign(cartaId: string): Promise<boolean> {
  cartaDesignStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const carta = await readJsonOrNull<{ id?: string; nombre?: string; resumen?: CartaResumen; meta?: { id?: string; nombre?: string } }>(`/cartas/${cartaId}.json`);
    if (!carta) {
      cartaDesignStore.update(s => ({
        ...s, loading: false, error: `Carta ${cartaId} no encontrada en /cartas/`
      }));
      return false;
    }

    cartaDesignStore.update(s => ({
      ...s,
      cartaId: carta.meta?.id || carta.id || cartaId,
      cartaNombre: carta.meta?.nombre || carta.nombre || cartaId,
      resumen: carta.resumen || null,
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

export async function loadProfiles(): Promise<void> {
  try {
    const items = await listDirOrEmpty(PROFILES_DIR);
    const jsonFiles = items.filter(i => i.type === 'file' && i.extension === '.json');

    const customProfiles: DesignProfile[] = [];
    for (const f of jsonFiles) {
      const p = await readJsonOrNull<DesignProfile>(f.path);
      if (p && p.id) customProfiles.push({ ...p, builtin: false });
    }

    cartaDesignStore.update(s => ({
      ...s,
      profiles: [...BUILTIN_PROFILES, ...customProfiles]
    }));
  } catch (err) {
    console.error('[CartaDesign] loadProfiles failed:', err);
  }
}

export async function loadGallery(cartaId: string): Promise<void> {
  try {
    const items = await listDirOrEmpty(DESIGNS_DIR);
    const metaFiles = items.filter(i => i.type === 'file' && i.extension === '.json');

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

export async function saveProfile(profile: Partial<DesignProfile>): Promise<boolean> {
  if (!profile.id) {
    cartaDesignStore.update(s => ({ ...s, error: 'profile.id requerido para guardar' }));
    return false;
  }
  try {
    const path = `${PROFILES_DIR}/${profile.id}.json`;
    const current = (await readJsonOrNull<DesignProfile>(path)) || { id: profile.id, nombre: '', description: '' };
    const next: DesignProfile = { ...current, ...profile, builtin: false };
    await mqttRequest('fs', 'write', { path, content: JSON.stringify(next, null, 2) });
    await loadProfiles();
    return true;
  } catch (err) {
    cartaDesignStore.update(s => ({ ...s, error: (err as Error).message || 'Error guardando profile' }));
    return false;
  }
}

export async function deleteProfile(profileId: string): Promise<boolean> {
  // Built-ins no se borran (no existen como archivo del proyecto).
  if (BUILTIN_PROFILES.some(p => p.id === profileId)) {
    cartaDesignStore.update(s => ({ ...s, error: 'Los profiles built-in no se pueden borrar' }));
    return false;
  }
  try {
    await mqttRequest('fs', 'delete', { path: `${PROFILES_DIR}/${profileId}.json` });
    await loadProfiles();
    return true;
  } catch (err) {
    cartaDesignStore.update(s => ({ ...s, error: (err as Error).message || 'Error borrando profile' }));
    return false;
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

  // Cargar profiles al init
  loadProfiles();

  cleanupFn = () => {
    initialized = false;
    unsubscribe();
  };

  return cleanupFn;
}

// =============================================================================
// DERIVED
// =============================================================================

export const designProfiles = derived(cartaDesignStore, $s => $s.profiles);
export const designGallery = derived(cartaDesignStore, $s => $s.designs);
export const designLoading = derived(cartaDesignStore, $s => $s.loading);
export const designError = derived(cartaDesignStore, $s => $s.error);
export const cartaLoaded = derived(cartaDesignStore, $s => $s.cartaLoaded);
export const cartaResumen = derived(cartaDesignStore, $s => $s.resumen);
