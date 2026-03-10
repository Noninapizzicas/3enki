/**
 * Recetas Store - MQTT Request/Response + Real-time Events
 *
 * Gestión de recetas con ingredientes, cantidades y precios de mercado:
 * - List/Get/Create via mqttRequest('recetas', action)
 * - Real-time updates via receta.creada, receta.actualizada, receta.eliminada
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
// TYPES
// =============================================================================

export interface RecetaIngrediente {
  ingrediente_id: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  precio_mercado: number;
  precio_compra: number | null;
  notas?: string;
}

export interface Receta {
  id: string;
  nombre: string;
  descripcion: string;
  categoria: string;
  tags: string[];
  porciones: number;
  tiempo_preparacion: number | null;
  dificultad: 'baja' | 'media' | 'alta';
  ingredientes: RecetaIngrediente[];
  elaboracion: string[];
  notas: string;
  fuente: string;
  coste_total: number;
  coste_porcion: number;
  proyecto_id: string;
  created_at: string;
  updated_at: string;
}

export interface RecetaResumen {
  id: string;
  nombre: string;
  categoria: string;
  porciones: number;
  ingredientes_count: number;
  coste_total: number;
  coste_porcion: number;
  created_at: string;
}

export interface CatalogoIngrediente {
  id: string;
  nombre: string;
  categoria: string;
  unidad_base: string;
  precio_mercado_kg: number;
  precio_compra_kg: number | null;
  fuente_precio: string;
  alergenos: string[];
  proveedor: string | null;
  recetas_count: number;
  updated_at: string;
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

export interface RecetasStats {
  total_recetas: number;
  total_ingredientes: number;
  coste_porcion?: {
    medio: number;
    minimo: number;
    maximo: number;
  };
  por_categoria?: Record<string, { count: number; coste_medio: number }>;
  top_ingredientes?: { nombre: string; recetas: number }[];
}

interface ListResponse {
  recetas: RecetaResumen[];
  total: number;
  categorias: string[];
}

interface IngredientesResponse {
  ingredientes: CatalogoIngrediente[];
  total: number;
  categorias: string[];
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
// ACTIONS
// =============================================================================

export async function loadRecetas(categoria?: string): Promise<void> {
  recetasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const data: Record<string, string> = {};
    const pid = get(activeProjectId);
    if (pid) data.project_id = pid;
    if (categoria) data.categoria = categoria;

    const response = await mqttRequest<ListResponse>('recetas', 'list', data);

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
    const response = await mqttRequest<Receta>('recetas', 'get', { id, project_id: pid });
    const receta = response.data as Receta;

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

export async function loadIngredientes(categoria?: string): Promise<void> {
  recetasStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const data: Record<string, string> = {};
    const pid = get(activeProjectId);
    if (pid) data.project_id = pid;
    if (categoria) data.categoria = categoria;

    const response = await mqttRequest<IngredientesResponse>('recetas', 'ingredientes', data);

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
    const response = await mqttRequest<RecetasStats>('recetas', 'stats', { project_id: pid });

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

let cleanupFns: (() => void)[] = [];

export function initRecetasSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Receta creada
  cleanupFns.push(
    mqttSubscribe('receta.creada', (_topic, payload) => {
      const receta = payload as Receta;
      if (receta?.id) {
        console.log('[Recetas] Receta creada:', receta.nombre);
        recetasStore.update(s => ({
          ...s,
          recetas: [
            {
              id: receta.id,
              nombre: receta.nombre,
              categoria: receta.categoria,
              porciones: receta.porciones,
              ingredientes_count: receta.ingredientes?.length || 0,
              coste_total: receta.coste_total,
              coste_porcion: receta.coste_porcion,
              created_at: receta.created_at
            },
            ...s.recetas
          ]
        }));
      }
    })
  );

  // Receta actualizada
  cleanupFns.push(
    mqttSubscribe('receta.actualizada', (_topic, payload) => {
      const receta = payload as Receta;
      if (receta?.id) {
        console.log('[Recetas] Receta actualizada:', receta.nombre);
        recetasStore.update(s => ({
          ...s,
          recetas: s.recetas.map(r =>
            r.id === receta.id
              ? {
                  ...r,
                  nombre: receta.nombre,
                  categoria: receta.categoria,
                  coste_total: receta.coste_total,
                  coste_porcion: receta.coste_porcion,
                  ingredientes_count: receta.ingredientes?.length || r.ingredientes_count
                }
              : r
          ),
          selectedReceta: s.selectedId === receta.id ? receta : s.selectedReceta
        }));
      }
    })
  );

  // Receta eliminada
  cleanupFns.push(
    mqttSubscribe('receta.eliminada', (_topic, payload) => {
      const data = payload as { receta_id: string };
      if (data?.receta_id) {
        console.log('[Recetas] Receta eliminada:', data.receta_id);
        recetasStore.update(s => ({
          ...s,
          recetas: s.recetas.filter(r => r.id !== data.receta_id),
          selectedReceta: s.selectedId === data.receta_id ? null : s.selectedReceta,
          selectedId: s.selectedId === data.receta_id ? null : s.selectedId
        }));
      }
    })
  );

  // Load initial data
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
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
);

export const selectedReceta = derived(recetasStore, $s => $s.selectedReceta);
export const recetasActiveTab = derived(recetasStore, $s => $s.activeTab);
export const recetasLoading = derived(recetasStore, $s => $s.loading);
export const recetasError = derived(recetasStore, $s => $s.error);
export const recetasStats = derived(recetasStore, $s => $s.stats);
export const recetasIngredientes = derived(recetasStore, $s => $s.ingredientes);
