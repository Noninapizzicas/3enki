/**
 * Escandallo Store - MQTT Request/Response + Real-time Events
 *
 * Análisis de costes y escandallo de recetas.
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

export interface EscandalloDesglose {
  nombre: string;
  cantidad: number;
  unidad: string;
  precio: number;
  tipo_precio: 'mercado' | 'compra';
  porcentaje: number;
}

export interface EscandalloReceta {
  receta_id: string;
  nombre: string;
  categoria: string;
  porciones: number;
  coste_total: number;
  coste_porcion: number;
  desglose: EscandalloDesglose[];
  precio_venta?: number;
  margen_euro?: number;
  margen_porcentaje?: number;
  food_cost_porcentaje?: number;
  multiplicador?: number;
  insights?: string[];
}

export interface EscandalloGlobal {
  total_recetas: number;
  total_ingredientes_catalogo: number;
  coste_porcion_medio: number;
  coste_porcion_min: number;
  coste_porcion_max: number;
  ranking_por_coste: any[];
  por_categoria: Record<string, any>;
  top_ingredientes_por_coste: any[];
  recetas: any[];
}

export interface EscandalloState {
  escandalloReceta: EscandalloReceta | null;
  escandalloGlobal: EscandalloGlobal | null;
  loading: boolean;
  error: string | null;
  activeView: 'receta' | 'global' | 'comparativa';
}

// =============================================================================
// STORE
// =============================================================================

const initialState: EscandalloState = {
  escandalloReceta: null,
  escandalloGlobal: null,
  loading: false,
  error: null,
  activeView: 'global'
};

export const escandalloStore = writable<EscandalloState>(initialState);

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadEscandalloReceta(recetaId: string, precioVenta?: number): Promise<void> {
  escandalloStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const data: Record<string, any> = { receta_id: recetaId };
    const pid = get(activeProjectId);
    if (pid) data.project_id = pid;
    if (precioVenta) data.precio_venta = precioVenta;
    const response = await mqttRequest<EscandalloReceta>('escandallo', 'receta', data);
    escandalloStore.update(s => ({
      ...s,
      escandalloReceta: response.data,
      loading: false,
      activeView: 'receta'
    }));
  } catch (error) {
    escandalloStore.update(s => ({ ...s, loading: false, error: getErrorMessage(error) }));
  }
}

export async function loadEscandalloGlobal(): Promise<void> {
  escandalloStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const pid = get(activeProjectId);
    const response = await mqttRequest<EscandalloGlobal>('escandallo', 'global', { project_id: pid });
    escandalloStore.update(s => ({
      ...s,
      escandalloGlobal: response.data,
      loading: false
    }));
  } catch (error) {
    escandalloStore.update(s => ({ ...s, loading: false, error: getErrorMessage(error) }));
  }
}

export function setActiveView(view: EscandalloState['activeView']): void {
  escandalloStore.update(s => ({ ...s, activeView: view }));
}

export function clearError(): void {
  escandalloStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

export function initEscandalloSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  cleanupFns.push(
    mqttSubscribe('escandallo.calculado', (_topic, payload) => {
      console.log('[Escandallo] Calculado:', (payload as any)?.nombre);
    })
  );

  loadEscandalloGlobal();

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
// DERIVED
// =============================================================================

export const escandalloReceta = derived(escandalloStore, $s => $s.escandalloReceta);
export const escandalloGlobal = derived(escandalloStore, $s => $s.escandalloGlobal);
export const escandalloLoading = derived(escandalloStore, $s => $s.loading);
export const escandalloError = derived(escandalloStore, $s => $s.error);
