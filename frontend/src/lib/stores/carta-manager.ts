/**
 * Carta Manager Store — CRUD de cartas
 *
 * Gestión de cartas: listar, ver detalle, editar productos/precios/categorías.
 * Escucha carta.actualizada para actualizaciones en tiempo real.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttTimeoutError, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { getActiveProject } from '$lib/stores/workspace';

// =============================================================================
// TYPES
// =============================================================================

export interface Ingrediente {
  nombre: string;
  emoji?: string;
  tipo?: string;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  ingredientes: Ingrediente[];
  descripcion?: string;
  emoji?: string;
  tags?: string[];
}

export interface Categoria {
  id: string;
  nombre: string;
  orden: number;
}

export interface CartaMeta {
  id: string;
  nombre: string;
  source?: string;
  created_at: string;
  updated_at?: string;
}

export interface Carta {
  meta: CartaMeta;
  categorias: Categoria[];
  productos: Producto[];
}

export interface CartaResumen {
  id: string;
  nombre: string;
  productos: number;
  categorias: number;
  created_at: string;
  updated_at?: string;
}

export interface CartaManagerState {
  cartas: CartaResumen[];
  selectedCarta: Carta | null;
  selectedId: string | null;
  loading: boolean;
  error: string | null;
}

// =============================================================================
// STORE
// =============================================================================

const initial: CartaManagerState = {
  cartas: [],
  selectedCarta: null,
  selectedId: null,
  loading: false,
  error: null
};

export const cartaManagerStore = writable<CartaManagerState>(initial);

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadCartas(): Promise<void> {
  cartaManagerStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const project = getActiveProject();
    const res = await mqttRequest<{ cartas: CartaResumen[]; total: number }>(
      'carta-manager', 'list', { project_id: project?.id }
    );
    cartaManagerStore.update(s => ({
      ...s, cartas: res.data.cartas || [], loading: false
    }));
  } catch (error) {
    cartaManagerStore.update(s => ({
      ...s, loading: false, error: getErrorMessage(error)
    }));
  }
}

export async function getCarta(id: string): Promise<Carta | null> {
  cartaManagerStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const project = getActiveProject();
    const res = await mqttRequest<Carta>(
      'carta-manager', 'get', { carta_id: id, project_id: project?.id }
    );
    const carta = res.data as Carta;
    cartaManagerStore.update(s => ({
      ...s, selectedCarta: carta, selectedId: id, loading: false
    }));
    return carta;
  } catch (error) {
    cartaManagerStore.update(s => ({
      ...s, loading: false, error: getErrorMessage(error)
    }));
    return null;
  }
}

export function selectCarta(id: string | null): void {
  cartaManagerStore.update(s => ({
    ...s, selectedId: id, selectedCarta: id ? s.selectedCarta : null
  }));
}

export function clearError(): void {
  cartaManagerStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

export function initCartaManagerSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Carta creada o actualizada
  cleanupFns.push(
    mqttSubscribe('carta.actualizada', (_topic, payload) => {
      const data = payload as Carta & { project_id?: string };
      if (data?.meta?.id) {
        cartaManagerStore.update(s => {
          const existing = s.cartas.findIndex(c => c.id === data.meta.id);
          const resumen: CartaResumen = {
            id: data.meta.id,
            nombre: data.meta.nombre,
            productos: data.productos?.length || 0,
            categorias: data.categorias?.length || 0,
            created_at: data.meta.created_at,
            updated_at: data.meta.updated_at
          };

          const cartas = [...s.cartas];
          if (existing >= 0) {
            cartas[existing] = resumen;
          } else {
            cartas.unshift(resumen);
          }

          // Si estamos viendo esta carta, actualizar detalle
          const selectedCarta = s.selectedId === data.meta.id
            ? { meta: data.meta, categorias: data.categorias || [], productos: data.productos || [] }
            : s.selectedCarta;

          return { ...s, cartas, selectedCarta };
        });
      }
    })
  );

  // Carga inicial
  loadCartas();

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// DERIVED
// =============================================================================

export const sortedCartas = derived(cartaManagerStore, $s =>
  [...$s.cartas].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
);

export const selectedCarta = derived(cartaManagerStore, $s => $s.selectedCarta);
export const cartaLoading = derived(cartaManagerStore, $s => $s.loading);
export const cartaError = derived(cartaManagerStore, $s => $s.error);
export const cartaCount = derived(cartaManagerStore, $s => $s.cartas.length);

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) return 'Timeout — el servidor no respondio';
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}
