/**
 * Menu Generator Store - MQTT Request/Response + Real-time Events
 *
 * Generación de cartas desde texto usando IA:
 * - Generate via mqttRequest('menu', 'generate')
 * - List/Get via mqttRequest('menu', 'list'/'get')
 * - Real-time updates via carta.generada y menu.error
 */

import { writable, derived, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { updatePageStateBatch } from '$lib/stores/page-context';

// =============================================================================
// TYPES
// =============================================================================

export type CartaEstado = 'generando' | 'generada' | 'error';

export interface Ingrediente {
  nombre: string;
  emoji?: string;
}

export interface Producto {
  id: string;
  nombre: string;
  categoria: string;
  precio: number;
  ingredientes: Ingrediente[];
}

export interface Categoria {
  id: string;
  nombre: string;
  orden: number;
}

export interface CartaMeta {
  id: string;
  nombre: string;
  generado_desde: 'texto' | 'foto' | 'pdf';
  created_at: string;
}

export interface Carta {
  meta: CartaMeta;
  categorias: Categoria[];
  productos: Producto[];
}

export interface CartaResumen {
  id: string;
  nombre: string;
  estado: CartaEstado;
  productos?: number;
  categorias?: number;
  created_at: string;
  error?: string;
}

export interface MenuGeneratorState {
  cartas: CartaResumen[];
  selectedCarta: Carta | null;
  selectedId: string | null;
  generating: boolean;
  loading: boolean;
  error: string | null;
  activeTab: 'generar' | 'cartas' | 'detalle';
  health: {
    generando: number;
    generadas: number;
  };
}

interface GenerateResponse {
  carta_id: string;
  correlation_id: string;
  estado: string;
}

interface ListResponse {
  cartas: CartaResumen[];
  total: number;
}

// getCarta returns the carta object directly as response.data
type GetResponse = Carta;

interface HealthResponse {
  status: string;
  generando: number;
  generadas: number;
}

// =============================================================================
// INITIAL STATE
// =============================================================================

const initialState: MenuGeneratorState = {
  cartas: [],
  selectedCarta: null,
  selectedId: null,
  generating: false,
  loading: false,
  error: null,
  activeTab: 'generar',
  health: {
    generando: 0,
    generadas: 0
  }
};

// =============================================================================
// STORE
// =============================================================================

export const menuGeneratorStore = writable<MenuGeneratorState>(initialState);

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Genera una carta desde texto
 */
export async function generateMenu(texto: string, nombre?: string, provider?: string): Promise<boolean> {
  menuGeneratorStore.update(s => ({ ...s, generating: true, error: null }));

  try {
    const data: Record<string, string> = { texto };
    if (nombre) data.nombre = nombre;
    if (provider && provider !== 'auto') data.provider = provider;

    const response = await mqttRequest<GenerateResponse>('menu', 'generate', data, {
      timeout: 30000
    });

    // Agregar carta en estado "generando" a la lista local
    const nuevaCarta: CartaResumen = {
      id: response.data.carta_id,
      nombre: nombre || 'Carta sin nombre',
      estado: 'generando',
      created_at: new Date().toISOString()
    };

    menuGeneratorStore.update(s => ({
      ...s,
      generating: false,
      cartas: [nuevaCarta, ...s.cartas],
      activeTab: 'cartas'
    }));

    console.log('[MenuGenerator] Generando carta:', response.data.carta_id);
    return true;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    menuGeneratorStore.update(s => ({ ...s, generating: false, error: errorMessage }));
    console.error('[MenuGenerator] Generate failed:', errorMessage);
    return false;
  }
}

/**
 * Carga la lista de cartas generadas
 */
export async function loadCartas(): Promise<void> {
  menuGeneratorStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<ListResponse>('menu', 'list');

    menuGeneratorStore.update(s => ({
      ...s,
      cartas: response.data.cartas || [],
      loading: false,
      error: null
    }));

    console.log('[MenuGenerator] Loaded:', response.data.total, 'cartas');
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    menuGeneratorStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[MenuGenerator] Load failed:', errorMessage);
  }
}

/**
 * Obtiene una carta completa por ID
 */
export async function getCarta(id: string): Promise<Carta | null> {
  menuGeneratorStore.update(s => ({ ...s, loading: true, error: null }));

  try {
    const response = await mqttRequest<GetResponse>('menu', 'get', { id });

    // response.data IS the carta object (meta, categorias, productos)
    const carta = response.data as Carta;

    menuGeneratorStore.update(s => ({
      ...s,
      selectedCarta: carta,
      selectedId: id,
      loading: false,
      activeTab: 'detalle'
    }));

    return carta;
  } catch (error) {
    const errorMessage = getErrorMessage(error);
    menuGeneratorStore.update(s => ({ ...s, loading: false, error: errorMessage }));
    console.error('[MenuGenerator] Get failed:', errorMessage);
    return null;
  }
}

/**
 * Carga el estado de salud del módulo
 */
export async function loadHealth(): Promise<void> {
  try {
    const response = await mqttRequest<HealthResponse>('menu', 'health');

    menuGeneratorStore.update(s => ({
      ...s,
      health: {
        generando: response.data.generando || 0,
        generadas: response.data.generadas || 0
      }
    }));
  } catch (error) {
    console.error('[MenuGenerator] Health failed:', getErrorMessage(error));
  }
}

// =============================================================================
// UI ACTIONS
// =============================================================================

export function setActiveTab(tab: MenuGeneratorState['activeTab']): void {
  menuGeneratorStore.update(s => ({ ...s, activeTab: tab }));
}

export function selectCarta(id: string | null): void {
  menuGeneratorStore.update(s => ({
    ...s,
    selectedId: id,
    selectedCarta: id ? s.selectedCarta : null,
    activeTab: id ? 'detalle' : s.activeTab
  }));
}

export function clearError(): void {
  menuGeneratorStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

/**
 * Inicializa suscripciones a eventos en tiempo real
 */
export function initMenuGeneratorSubscriptions(): () => void {
  // Limpiar suscripciones anteriores
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Escuchar carta generada
  cleanupFns.push(
    mqttSubscribe('carta.generada', (_topic, payload) => {
      const data = payload as { meta?: CartaMeta; categorias?: Categoria[]; productos?: Producto[] };
      const cartaId = data?.meta?.id;

      if (cartaId) {
        console.log('[MenuGenerator] Carta generada:', cartaId);

        // Actualizar page context para que el chat sepa de la carta
        updatePageStateBatch({
          activeCarta: cartaId,
          activeCartaNombre: data.meta?.nombre || '',
          activeCartaProductos: data.productos?.length || 0,
          pipelineStep: 'carta_generada'
        });

        // Actualizar en la lista local
        menuGeneratorStore.update(s => ({
          ...s,
          cartas: s.cartas.map(c =>
            c.id === cartaId
              ? {
                  ...c,
                  estado: 'generada' as CartaEstado,
                  nombre: data.meta?.nombre || c.nombre,
                  productos: data.productos?.length || 0,
                  categorias: data.categorias?.length || 0
                }
              : c
          ),
          health: {
            ...s.health,
            generando: Math.max(0, s.health.generando - 1),
            generadas: s.health.generadas + 1
          }
        }));
      }
    })
  );

  // Escuchar errores de generación
  cleanupFns.push(
    mqttSubscribe('menu.error', (_topic, payload) => {
      const data = payload as { carta_id?: string; error?: string };

      if (data?.carta_id) {
        console.log('[MenuGenerator] Error en carta:', data.carta_id, data.error);

        menuGeneratorStore.update(s => ({
          ...s,
          cartas: s.cartas.map(c =>
            c.id === data.carta_id
              ? { ...c, estado: 'error' as CartaEstado, error: data.error }
              : c
          ),
          health: {
            ...s.health,
            generando: Math.max(0, s.health.generando - 1)
          }
        }));
      }
    })
  );

  // Cargar datos iniciales
  loadCartas();
  loadHealth();

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) {
    return 'Timeout - el servidor no respondio';
  }
  if (error instanceof MqttRequestError) {
    return error.message;
  }
  if (error instanceof Error) {
    return error.message;
  }
  return 'Error desconocido';
}

// =============================================================================
// DERIVED STORES
// =============================================================================

/** Cartas ordenadas por fecha (mas recientes primero) */
export const sortedCartas = derived(menuGeneratorStore, $s =>
  [...$s.cartas].sort((a, b) =>
    new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  )
);

/** Carta seleccionada completa */
export const selectedCarta = derived(menuGeneratorStore, $s => $s.selectedCarta);

/** Tab activa */
export const activeTab = derived(menuGeneratorStore, $s => $s.activeTab);

/** Health stats */
export const menuHealth = derived(menuGeneratorStore, $s => $s.health);

/** Loading state */
export const menuLoading = derived(menuGeneratorStore, $s => $s.loading);

/** Generating state */
export const menuGenerating = derived(menuGeneratorStore, $s => $s.generating);

/** Error */
export const menuError = derived(menuGeneratorStore, $s => $s.error);
