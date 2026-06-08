/**
 * Recetas Store — lecturas directas via fs.read del proyecto activo.
 *
 * Arquitectura "sin backend dedicado":
 *   - El modulo `filesystem` expone fs.read como tool[] (modules/filesystem/
 *     module.json). El loader (core/modules/loader.js v1.2) auto-registra
 *     esa tool en uiHandler con domain='fs', action='read', asi que el
 *     frontend la invoca via mqttRequest('fs', 'read', {path}). Filesystem
 *     resuelve el path relativo contra el storage del proyecto activo.
 *   - Este store lee /pizzepos/recetas.json una vez por operacion y transforma
 *     localmente: filter por estado, sort por updated_at, slice por limit,
 *     derivar ingredientes_count.
 *   - No hay modulo backend dedicado al dominio recetas — el blueprint del
 *     modulo recetas (modules/pizzepos/recetas/) sigue siendo runtime LLM
 *     para crear/editar/eliminar via chat, y este store sirve las lecturas
 *     del catalogo directamente sobre el archivo.
 *
 * Shape canonico: del blueprint del subsistema-recetario (estado_operativo,
 * dificultad, incompleta, campos_pendientes). Sin `categoria`, `coste_total`
 * ni `coste_porcion` — esos datos no viven en /pizzepos/recetas.json hoy (escandallo
 * es stateless on-demand). Si el usuario quiere coste, lo pide al chat.
 */

import { writable, derived, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { activeProjectId } from './projects';

// =============================================================================
// TYPES — shape canonico del blueprint recetas
// =============================================================================

export type EstadoOperativo = 'borrador' | 'en_servicio' | 'archivada';
export type Dificultad = 'baja' | 'media' | 'alta';

export interface RecetaIngrediente {
  nombre: string;
  cantidad: number;
  unidad?: string;
  ingrediente_id?: string;
  notas?: string;
}

export type FuentePrecio = 'mercadona' | 'estimado_llm' | 'no_disponible';

export interface IngredienteDetalle {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio_unitario: number | null;
  valor_calculado: number | null;
  fuente: FuentePrecio;
  precio_unidad?: number | null;
  precio_kg?: number | null;
  mercadona_producto_id?: string;
  mercadona_nombre?: string;
}

export interface Receta {
  id: string;
  nombre: string;
  porciones: number;
  dificultad: Dificultad;
  estado_operativo: EstadoOperativo;
  incompleta: boolean;
  campos_pendientes: string[];
  version: number;
  updated_at: string;
  ingredientes: RecetaIngrediente[];
  ingredientes_count: number;
  descripcion?: string;
  tags?: string[];
  elaboracion?: string[];
  notas?: string;
  // Campos escritos por escandallo (blueprint-2.0.0). Ausentes si nunca corrio.
  coste_total?: number;
  coste_porcion?: number;
  coste_actualizado_at?: string;
  postcode_usado?: string;
  fuentes_precios?: FuentePrecio[];
  ingredientes_detalle?: IngredienteDetalle[];
  ingredientes_sin_precio?: string[];
  // Snapshots de versiones anteriores (escritos por recetas.actualizar/revertir del blueprint).
  history?: RecetaVersionSnapshot[];
}

export interface RecetaResumen {
  id: string;
  nombre: string;
  porciones: number;
  dificultad: Dificultad;
  estado_operativo: EstadoOperativo;
  incompleta: boolean;
  campos_pendientes: string[];
  version: number;
  updated_at: string;
  ingredientes_count: number;
  // Surface del coste persistido (si escandallo ya corrio).
  coste_total?: number;
  coste_porcion?: number;
  coste_actualizado_at?: string;
  fuentes_precios?: FuentePrecio[];
  // Flag derivado: true si hay ingredientes_sin_precio. UI puede mostrar asterisco.
  coste_incompleto?: boolean;
}

export interface CatalogoIngrediente {
  nombre: string;
  unidad?: string;
  precio_mercado?: number;
  alergenos?: string[];
  proveedor?: string;
  updated_at?: string;
}

export interface RecetasStats {
  total_recetas: number;
  por_estado: { borrador: number; en_servicio: number; archivada: number };
  incompletas: number;
  ingredientes_catalogo: number;
  ingredientes_usados_unicos: number;
}

export interface RecetasState {
  recetas: RecetaResumen[];
  selectedReceta: Receta | null;
  selectedId: string | null;
  ingredientes: CatalogoIngrediente[];
  loading: boolean;
  error: string | null;
  activeTab: 'recetas' | 'detalle' | 'ingredientes';
  stats: RecetasStats | null;
}

// =============================================================================
// INTERNAL — shape de /pizzepos/recetas.json en disco
// =============================================================================

interface RecetasStore {
  _version?: string;
  _updated_at?: string;
  recetas?: Receta[];
  ingredientes_catalogo?: CatalogoIngrediente[];
}

const STORE_PATH = '/pizzepos/recetas.json';
const DEFAULT_LIST_LIMIT = 100;

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: RecetasState = {
  recetas: [],
  selectedReceta: null,
  selectedId: null,
  ingredientes: [],
  loading: false,
  error: null,
  activeTab: 'recetas',
  stats: null
};

export const recetasStore = writable<RecetasState>(initialState);

// =============================================================================
// HELPERS — fs.read directo + transformacion local
// =============================================================================

/**
 * Lee /pizzepos/recetas.json del proyecto activo via mqttRequest('fs', 'read').
 * Devuelve el objeto parseado o null si el archivo no existe (RESOURCE_NOT_FOUND).
 * Throws con error legible para otros errores.
 */
async function readRecetasStore(): Promise<RecetasStore | null> {
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: STORE_PATH });
    const content = res.data?.content;
    if (typeof content !== 'string') return null;
    try {
      return JSON.parse(content) as RecetasStore;
    } catch (parseErr) {
      throw new Error(`${STORE_PATH} no parseable: ${(parseErr as Error).message}`);
    }
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      return null;
    }
    throw err;
  }
}

function summarize(r: Receta): RecetaResumen {
  const sinPrecio = Array.isArray(r.ingredientes_sin_precio) ? r.ingredientes_sin_precio : [];
  return {
    id: r.id,
    nombre: r.nombre,
    porciones: r.porciones,
    dificultad: r.dificultad,
    estado_operativo: r.estado_operativo,
    incompleta: r.incompleta === true,
    campos_pendientes: Array.isArray(r.campos_pendientes) ? r.campos_pendientes : [],
    version: r.version,
    updated_at: r.updated_at,
    ingredientes_count: Array.isArray(r.ingredientes) ? r.ingredientes.length : 0,
    coste_total: typeof r.coste_total === 'number' ? r.coste_total : undefined,
    coste_porcion: typeof r.coste_porcion === 'number' ? r.coste_porcion : undefined,
    coste_actualizado_at: r.coste_actualizado_at,
    fuentes_precios: r.fuentes_precios,
    coste_incompleto: sinPrecio.length > 0
  };
}

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadRecetas(estado?: EstadoOperativo, limit: number = DEFAULT_LIST_LIMIT): Promise<void> {
  recetasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const pid = get(activeProjectId);
    if (!pid) throw new Error('No hay proyecto activo');

    const store = await readRecetasStore();
    if (!store) {
      recetasStore.update(s => ({ ...s, recetas: [], loading: false }));
      return;
    }

    let items = Array.isArray(store.recetas) ? store.recetas : [];
    if (estado) items = items.filter(r => r && r.estado_operativo === estado);
    const sorted = items
      .slice()
      .sort((a, b) => String(b?.updated_at || '').localeCompare(String(a?.updated_at || '')))
      .slice(0, limit)
      .map(summarize);

    recetasStore.update(s => ({
      ...s,
      recetas: sorted,
      loading: false
    }));

    console.log('[Recetas] Loaded:', items.length, 'recetas');
  } catch (error) {
    const msg = getErrorMessage(error);
    recetasStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[Recetas] Load failed:', msg);
  }
}

export async function getReceta(id: string): Promise<Receta | null> {
  recetasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const store = await readRecetasStore();
    if (!store) {
      recetasStore.update(s => ({ ...s, loading: false, error: 'No hay recetas todavia' }));
      return null;
    }

    const items = Array.isArray(store.recetas) ? store.recetas : [];
    const receta = items.find(r => r && r.id === id);
    if (!receta) {
      recetasStore.update(s => ({ ...s, loading: false, error: `Receta ${id} no encontrada` }));
      return null;
    }

    const enriched: Receta = {
      ...receta,
      ingredientes_count: Array.isArray(receta.ingredientes) ? receta.ingredientes.length : 0
    };

    recetasStore.update(s => ({
      ...s,
      selectedReceta: enriched,
      selectedId: id,
      loading: false,
      activeTab: 'detalle'
    }));

    return enriched;
  } catch (error) {
    const msg = getErrorMessage(error);
    recetasStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[Recetas] Get failed:', msg);
    return null;
  }
}

export async function loadIngredientes(): Promise<void> {
  recetasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const store = await readRecetasStore();
    const items = store && Array.isArray(store.ingredientes_catalogo) ? store.ingredientes_catalogo : [];
    const sorted = items.slice().sort((a, b) =>
      String(a?.nombre || '').localeCompare(String(b?.nombre || ''))
    );

    recetasStore.update(s => ({
      ...s,
      ingredientes: sorted,
      loading: false
    }));

    console.log('[Recetas] Ingredientes loaded:', items.length);
  } catch (error) {
    const msg = getErrorMessage(error);
    recetasStore.update(s => ({ ...s, loading: false, error: msg }));
  }
}

export async function loadStats(): Promise<void> {
  try {
    const store = await readRecetasStore();
    if (!store) {
      recetasStore.update(s => ({
        ...s,
        stats: {
          total_recetas: 0,
          por_estado: { borrador: 0, en_servicio: 0, archivada: 0 },
          incompletas: 0,
          ingredientes_catalogo: 0,
          ingredientes_usados_unicos: 0
        }
      }));
      return;
    }

    const recetas = Array.isArray(store.recetas) ? store.recetas : [];
    const por_estado = { borrador: 0, en_servicio: 0, archivada: 0 };
    let incompletas = 0;
    const usados = new Set<string>();
    for (const r of recetas) {
      if (!r) continue;
      if (r.estado_operativo && Object.prototype.hasOwnProperty.call(por_estado, r.estado_operativo)) {
        por_estado[r.estado_operativo]++;
      }
      if (r.incompleta) incompletas++;
      if (Array.isArray(r.ingredientes)) {
        for (const ing of r.ingredientes) {
          if (ing && typeof ing.nombre === 'string') usados.add(ing.nombre.toLowerCase());
        }
      }
    }

    recetasStore.update(s => ({
      ...s,
      stats: {
        total_recetas: recetas.length,
        por_estado,
        incompletas,
        ingredientes_catalogo: Array.isArray(store.ingredientes_catalogo) ? store.ingredientes_catalogo.length : 0,
        ingredientes_usados_unicos: usados.size
      }
    }));
  } catch (error) {
    console.error('[Recetas] Stats failed:', getErrorMessage(error));
  }
}

// =============================================================================
// HISTORIAL — versiones (lectura pura de r.history en /pizzepos/recetas.json)
// =============================================================================
//
// CERO invocaciones a tools del blueprint recetas: es blueprint-driven
// LLM-runtime, no tiene servicio JS escuchando el bus, solo corre cuando el
// LLM lo invoca via chat. El array history[] vive dentro de cada receta en
// /pizzepos/recetas.json y se lee igual que el resto del store (modules/filesystem es
// POC2 y responde fs.read.request directo). El shape de loadHistorial
// reproduce literal el de la operacion 'historial' del blueprint
// (modules/pizzepos/recetas/recetas.blueprint.json, verificado 2026-06-01).
// Si el blueprint cambia el shape, estas funciones se actualizan en paralelo.

export interface RecetaVersionSnapshot {
  version: number;
  _archived_at?: string;
  nombre?: string;
  porciones?: number | null;
  dificultad?: number | null;
  ingredientes?: RecetaIngrediente[];
  elaboracion?: string[];
  notas?: string;
  [key: string]: unknown;
}

export interface RecetaHistorialEntry {
  version: number;
  archived_at?: string;
  nombre?: string;
  porciones?: number | null;
  dificultad?: number | null;
  ingredientes_count: number;
}

export interface RecetaHistorialResult {
  receta_id: string;
  nombre: string;
  version_actual: number;
  versiones_anteriores: number;
  historial: RecetaHistorialEntry[];
}

/**
 * Resumen de versiones de una receta (para pintar la lista de HistorialView).
 * Lectura pura: lee /pizzepos/recetas.json, encuentra la receta y proyecta r.history[].
 * Throw upstream — el panel HistorialView captura en banner.
 */
export async function loadHistorial(recetaId: string): Promise<RecetaHistorialResult> {
  const store = await readRecetasStore();
  if (!store) throw new Error('No hay recetas todavia');
  const items = Array.isArray(store.recetas) ? store.recetas : [];
  const r = items.find(x => x && x.id === recetaId);
  if (!r) throw new Error(`Receta ${recetaId} no encontrada`);

  const historyRaw: RecetaVersionSnapshot[] = Array.isArray(r.history) ? r.history : [];
  const versiones: RecetaHistorialEntry[] = historyRaw.map(h => ({
    version: h.version,
    archived_at: h._archived_at,
    nombre: h.nombre,
    porciones: h.porciones,
    dificultad: h.dificultad,
    ingredientes_count: Array.isArray(h.ingredientes) ? h.ingredientes.length : 0
  }));

  return {
    receta_id: r.id,
    nombre: r.nombre,
    version_actual: r.version,
    versiones_anteriores: versiones.length,
    historial: versiones
  };
}

/**
 * Snapshot completo de UNA version anterior (para el diff campo-a-campo del
 * boton Revertir). Devuelve el snapshot crudo de r.history; el diff contra la
 * receta actual lo construye el componente RevertPreview en frontend.
 * Throw upstream.
 */
export async function loadVersionSnapshot(
  recetaId: string,
  versionId: number | string
): Promise<RecetaVersionSnapshot> {
  const store = await readRecetasStore();
  if (!store) throw new Error('No hay recetas todavia');
  const items = Array.isArray(store.recetas) ? store.recetas : [];
  const r = items.find(x => x && x.id === recetaId);
  if (!r) throw new Error(`Receta ${recetaId} no encontrada`);

  const historyRaw: RecetaVersionSnapshot[] = Array.isArray(r.history) ? r.history : [];
  const snapshot = historyRaw.find(h => h.version === versionId);
  if (!snapshot) throw new Error(`Version ${versionId} no encontrada en history`);
  return snapshot;
}

// =============================================================================
// UI ACTIONS
// =============================================================================

export function setActiveTab(tab: RecetasState['activeTab']): void {
  recetasStore.update(s => ({ ...s, activeTab: tab }));
}

export function selectReceta(id: string | null): void {
  recetasStore.update(s => ({
    ...s,
    selectedId: id,
    selectedReceta: id ? s.selectedReceta : null,
    activeTab: id ? 'detalle' : s.activeTab
  }));
}

export function clearError(): void {
  recetasStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================
//
// Los eventos receta.creada / receta.actualizada / receta.eliminada los publica
// el blueprint del modulo recetas tras ejecutar operaciones via LLM. Aqui solo
// recargamos del store (siempre fuente de verdad) tras el evento — no
// confiamos en el payload del evento para mantener consistencia.

let cleanupFns: (() => void)[] = [];

export function initRecetasSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  const refresh = () => {
    loadRecetas();
    loadStats();
  };

  cleanupFns.push(mqttSubscribe('receta.creada', () => {
    console.log('[Recetas] Receta creada → refresh');
    refresh();
  }));

  cleanupFns.push(mqttSubscribe('receta.actualizada', (_topic, payload) => {
    const data = payload as { id?: string };
    console.log('[Recetas] Receta actualizada → refresh');
    refresh();
    // Si la actualizada es la seleccionada, releer detalle.
    const state = get(recetasStore);
    if (data?.id && state.selectedId === data.id) {
      getReceta(data.id);
    }
  }));

  cleanupFns.push(mqttSubscribe('receta.eliminada', (_topic, payload) => {
    const data = payload as { receta_id?: string };
    console.log('[Recetas] Receta eliminada → refresh');
    refresh();
    // Si la eliminada era la seleccionada, limpiar.
    if (data?.receta_id) {
      const state = get(recetasStore);
      if (state.selectedId === data.receta_id) {
        recetasStore.update(s => ({
          ...s,
          selectedReceta: null,
          selectedId: null,
          activeTab: 'recetas'
        }));
      }
    }
  }));

  // Carga inicial
  refresh();

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) return 'Timeout - el servidor no respondió';
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}

// =============================================================================
// DERIVED STORES
// =============================================================================

export const sortedRecetas = derived(recetasStore, $s =>
  [...$s.recetas].sort((a, b) =>
    String(b.updated_at || '').localeCompare(String(a.updated_at || ''))
  )
);

export const selectedReceta = derived(recetasStore, $s => $s.selectedReceta);
export const recetasActiveTab = derived(recetasStore, $s => $s.activeTab);
export const recetasStats = derived(recetasStore, $s => $s.stats);
export const recetasLoading = derived(recetasStore, $s => $s.loading);
export const recetasError = derived(recetasStore, $s => $s.error);
export const recetasIngredientes = derived(recetasStore, $s => $s.ingredientes);
