/**
 * Recetas Store — MQTT Request/Response + Real-time Events
 *
 * Las lecturas (listar / obtener / ingredientes / estadisticas) van al modulo
 * backend `recetas-api` (bridge lecto-puro de /recetas.json). Las operaciones
 * complejas (crear / editar / eliminar) las hace el blueprint del modulo
 * `recetas` ejecutado por el LLM via el chat — no se exponen desde esta pagina.
 *
 * Shape canonico: el del blueprint del subsistema-recetario (estado_operativo,
 * dificultad, incompleta, campos_pendientes). NO contiene `categoria`,
 * `coste_total` ni `coste_porcion` — esos datos NO viven en /recetas.json
 * (escandallo es stateless on-demand). Si el usuario quiere coste, lo pide
 * al chat — esa es la decision arquitectonica vigente.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { activeProjectId } from './projects';
import { get } from 'svelte/store';

// =============================================================================
// TYPES — shape canonico del blueprint recetas
// =============================================================================

export type EstadoOperativo = 'borrador' | 'en_servicio' | 'archivada';
export type Dificultad = 'baja' | 'media' | 'alta';

export interface RecetaIngrediente {
  nombre: string;
  cantidad: number;
  unidad?: string;
  // Campos opcionales — el blueprint puede no rellenarlos todos.
  ingrediente_id?: string;
  notas?: string;
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
  // Campos extra que el blueprint pueda añadir en el futuro:
  descripcion?: string;
  tags?: string[];
  elaboracion?: string[];
  notas?: string;
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
}

export interface CatalogoIngrediente {
  nombre: string;
  unidad?: string;
  precio_mercado?: number;
  // Campos opcionales que el blueprint pueda rellenar:
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

interface ListResponse {
  total: number;
  recetas: RecetaResumen[];
}

interface IngredientesResponse {
  total: number;
  ingredientes: CatalogoIngrediente[];
}

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

// =============================================================================
// STORE
// =============================================================================

export const recetasStore = writable<RecetasState>(initialState);

// =============================================================================
// ACTIONS (vía mqttRequest → bridge recetas-api)
// =============================================================================

export async function loadRecetas(estado?: EstadoOperativo): Promise<void> {
  recetasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const pid = get(activeProjectId);
    if (!pid) throw new Error('No hay proyecto activo');

    const args: Record<string, unknown> = { project_id: pid };
    if (estado) args.estado_operativo = estado;

    const response = await mqttRequest<ListResponse>('recetas', 'listar', args);

    recetasStore.update(s => ({
      ...s,
      recetas: response.data.recetas || [],
      loading: false
    }));

    console.log('[Recetas] Loaded:', response.data.total, 'recetas');
  } catch (error) {
    const msg = getErrorMessage(error);
    recetasStore.update(s => ({ ...s, loading: false, error: msg }));
    console.error('[Recetas] Load failed:', msg);
  }
}

export async function getReceta(id: string): Promise<Receta | null> {
  recetasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const pid = get(activeProjectId);
    if (!pid) throw new Error('No hay proyecto activo');

    const response = await mqttRequest<Receta>('recetas', 'obtener', { id, project_id: pid });
    const receta = response.data;

    recetasStore.update(s => ({
      ...s,
      selectedReceta: receta,
      selectedId: id,
      loading: false,
      activeTab: 'detalle'
    }));

    return receta;
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
    const pid = get(activeProjectId);
    if (!pid) throw new Error('No hay proyecto activo');

    const response = await mqttRequest<IngredientesResponse>('recetas', 'ingredientes', { project_id: pid });

    recetasStore.update(s => ({
      ...s,
      ingredientes: response.data.ingredientes || [],
      loading: false
    }));

    console.log('[Recetas] Ingredientes loaded:', response.data.total);
  } catch (error) {
    const msg = getErrorMessage(error);
    recetasStore.update(s => ({ ...s, loading: false, error: msg }));
  }
}

export async function loadStats(): Promise<void> {
  try {
    const pid = get(activeProjectId);
    if (!pid) return;

    const response = await mqttRequest<RecetasStats>('recetas', 'estadisticas', { project_id: pid });

    recetasStore.update(s => ({
      ...s,
      stats: response.data
    }));
  } catch (error) {
    console.error('[Recetas] Stats failed:', getErrorMessage(error));
  }
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
// el blueprint del modulo recetas tras ejecutar las operaciones via LLM. El
// payload es la receta canonica (shape Receta). Aqui solo actualizamos el
// estado local — la fuente de verdad sigue siendo /recetas.json (lectura via
// recetas-api).

let cleanupFns: (() => void)[] = [];

function recetaToResumen(r: Receta): RecetaResumen {
  return {
    id: r.id,
    nombre: r.nombre,
    porciones: r.porciones,
    dificultad: r.dificultad,
    estado_operativo: r.estado_operativo,
    incompleta: r.incompleta,
    campos_pendientes: r.campos_pendientes || [],
    version: r.version,
    updated_at: r.updated_at,
    ingredientes_count: Array.isArray(r.ingredientes) ? r.ingredientes.length : 0
  };
}

export function initRecetasSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  cleanupFns.push(
    mqttSubscribe('receta.creada', (_topic, payload) => {
      const receta = payload as Receta;
      if (!receta?.id) return;
      console.log('[Recetas] Receta creada:', receta.nombre);
      recetasStore.update(s => ({
        ...s,
        recetas: [recetaToResumen(receta), ...s.recetas]
      }));
    })
  );

  cleanupFns.push(
    mqttSubscribe('receta.actualizada', (_topic, payload) => {
      const receta = payload as Receta;
      if (!receta?.id) return;
      console.log('[Recetas] Receta actualizada:', receta.nombre);
      recetasStore.update(s => ({
        ...s,
        recetas: s.recetas.map(r => r.id === receta.id ? recetaToResumen(receta) : r),
        selectedReceta: s.selectedId === receta.id ? receta : s.selectedReceta
      }));
    })
  );

  cleanupFns.push(
    mqttSubscribe('receta.eliminada', (_topic, payload) => {
      const data = payload as { receta_id: string };
      if (!data?.receta_id) return;
      console.log('[Recetas] Receta eliminada:', data.receta_id);
      recetasStore.update(s => ({
        ...s,
        recetas: s.recetas.filter(r => r.id !== data.receta_id),
        selectedReceta: s.selectedId === data.receta_id ? null : s.selectedReceta,
        selectedId: s.selectedId === data.receta_id ? null : s.selectedId
      }));
    })
  );

  // Carga inicial
  loadRecetas();
  loadStats();

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
export const recetasStats = derived(recetasStore, $s => $s.stats);
export const recetasLoading = derived(recetasStore, $s => $s.loading);
export const recetasError = derived(recetasStore, $s => $s.error);
export const recetasIngredientes = derived(recetasStore, $s => $s.ingredientes);
