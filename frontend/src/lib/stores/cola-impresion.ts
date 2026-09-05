/**
 * Store Cola de Impresión 3D — Estado central del vertical impresion-3d.
 *
 * Compone datos de 5 módulos backend:
 *   - cola_modelos          → cripta: agregar, listar, actualizar_estado
 *   - motor_propuesta       → proponer_siguiente (prioridad)
 *   - orquestador_cola      → encadenar el ciclo
 *   - disenador_parametrico → generar SCAD (puente OpenSCAD)
 *   - buscador_www          → buscar modelos en fuentes web
 */

import { writable, derived } from 'svelte/store';
import { mqttRequest } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe, onReconnect } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES
// =============================================================================

export type EstadoModelo = 'PENDIENTE' | 'IMPRIMIENDO' | 'IMPRESO';

export interface ModeloCola {
  id: string;
  nombre: string;
  prioridad: number;
  tiempo_estimado: number;
  estado: EstadoModelo;
  creado_en?: string;
  imprimiendo_en?: string;
  impreso_en?: string;
  historial?: { estado: EstadoModelo; en: string }[];
}

export interface Propuesta {
  modelo: ModeloCola | null;
  causa: 'ok' | 'cola_vacia' | string;
}

export interface ResultadoBusqueda {
  url: string;
  titulo: string;
  fuente: string;
}

export interface BusquedaRespuesta {
  query: string;
  resultados: ResultadoBusqueda[];
  total: number;
  por_fuente: Record<string, { ok: boolean; total: number }>;
}

export interface ArchivoExportado {
  archivo: string;
  formato: string;
  bytes: number;
}

export interface ColaImpresionState {
  // UI
  loading: boolean;
  error: string | null;

  // Cola (cola_modelos)
  cola: ModeloCola[];
  propuesta: Propuesta | null;

  // Búsqueda (buscador_www)
  busqueda: BusquedaRespuesta | null;
  buscando: boolean;

  // Diseño (disenador_parametrico)
  archivo: ArchivoExportado | null;
}

// =============================================================================
// STORE
// =============================================================================

const initialState: ColaImpresionState = {
  loading: false,
  error: null,
  cola: [],
  propuesta: null,
  busqueda: null,
  buscando: false,
  archivo: null
};

export const colaImpresionStore = writable<ColaImpresionState>(initialState);

// =============================================================================
// DERIVED STORES
// =============================================================================

export const cola = derived(colaImpresionStore, $s => $s.cola);
export const pendientes = derived(colaImpresionStore, $s =>
  $s.cola.filter(m => m.estado === 'PENDIENTE')
);
export const imprimiendo = derived(colaImpresionStore, $s =>
  $s.cola.filter(m => m.estado === 'IMPRIMIENDO')
);
export const propuesta = derived(colaImpresionStore, $s => $s.propuesta);

// =============================================================================
// COLA (cola_modelos)
// =============================================================================

export async function cargarCola(): Promise<void> {
  try {
    const res = await mqttRequest<any>('cola_modelos', 'listar', {});
    colaImpresionStore.update(s => ({ ...s, cola: res.data?.modelos || [], error: null }));
  } catch (err: any) {
    console.warn('[ColaImpresion] cargarCola failed:', err.message || err);
    colaImpresionStore.update(s => ({ ...s, cola: [], error: `Cola: ${err.message || 'sin respuesta'}` }));
  }
}

export async function agregarModelo(data: {
  nombre: string;
  prioridad: number;
  tiempo_estimado: number;
}): Promise<boolean> {
  try {
    await mqttRequest<any>('cola_modelos', 'agregar', data);
    await cargarCola();
    return true;
  } catch (err: any) {
    colaImpresionStore.update(s => ({ ...s, error: `Agregar: ${err.message || 'falló'}` }));
    return false;
  }
}

export async function actualizarEstado(id: string, estado: EstadoModelo): Promise<boolean> {
  try {
    await mqttRequest<any>('cola_modelos', 'actualizar_estado', { id, estado });
    await cargarCola();
    return true;
  } catch (err: any) {
    colaImpresionStore.update(s => ({ ...s, error: `Estado: ${err.message || 'falló'}` }));
    return false;
  }
}

// =============================================================================
// MOTOR DE PROPUESTA (motor_propuesta)
// =============================================================================

export async function proponerSiguiente(): Promise<void> {
  try {
    const res = await mqttRequest<any>('motor_propuesta', 'proponer_siguiente', {});
    colaImpresionStore.update(s => ({ ...s, propuesta: res.data || null }));
  } catch (err: any) {
    colaImpresionStore.update(s => ({ ...s, error: `Propuesta: ${err.message || 'falló'}` }));
  }
}

// =============================================================================
// ORQUESTADOR (orquestador_cola)
// =============================================================================

export async function encadenar(): Promise<void> {
  try {
    await mqttRequest<any>('orquestador_cola', 'al_liberarse', {});
    await cargarCola();
    await proponerSiguiente();
  } catch (err: any) {
    colaImpresionStore.update(s => ({ ...s, error: `Orquestador: ${err.message || 'falló'}` }));
  }
}

// =============================================================================
// BÚSQUEDA (buscador_www)
// =============================================================================

export async function buscarModelos(query: string): Promise<void> {
  if (!query.trim()) return;
  colaImpresionStore.update(s => ({ ...s, buscando: true, busqueda: null }));
  try {
    const res = await mqttRequest<any>('buscador_www', 'buscar', { query });
    colaImpresionStore.update(s => ({ ...s, busqueda: res.data || null, buscando: false }));
  } catch (err: any) {
    colaImpresionStore.update(s => ({ ...s, buscando: false, error: `Búsqueda: ${err.message || 'falló'}` }));
  }
}

// =============================================================================
// DISEÑO (disenador_parametrico)
// =============================================================================

export async function generarScad(params: Record<string, unknown>): Promise<void> {
  try {
    const res = await mqttRequest<any>('disenador_parametrico', 'generar_stl', { parametros: params });
    colaImpresionStore.update(s => ({ ...s, archivo: res.data || null }));
  } catch (err: any) {
    colaImpresionStore.update(s => ({ ...s, error: `Diseño: ${err.message || 'falló'}` }));
  }
}

// =============================================================================
// INIT / SUBSCRIPTIONS
// =============================================================================

export async function initColaImpresion(): Promise<void> {
  colaImpresionStore.update(s => ({ ...s, loading: true }));
  await Promise.all([cargarCola(), proponerSiguiente()]);
  colaImpresionStore.update(s => ({ ...s, loading: false }));
}

export function initColaImpresionSubscriptions(): () => void {
  const cleanups: (() => void)[] = [];

  cleanups.push(
    mqttSubscribe('cola_modelos.modelo_agregado', () => { cargarCola(); proponerSiguiente(); }),
    mqttSubscribe('cola_modelos.estado_actualizado', () => { cargarCola(); proponerSiguiente(); })
  );

  cleanups.push(onReconnect(() => { initColaImpresion(); }));

  return () => cleanups.forEach(c => c());
}
