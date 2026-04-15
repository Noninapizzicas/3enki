/**
 * Carta Impresion Store — versiones imprimibles de cartas
 *
 * Consume: impresion.get, impresion.generar
 * Escucha: carta.impresion.lista para refrescar al terminar generación
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttTimeoutError, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { getActiveProject } from '$lib/stores/workspace';

// =============================================================================
// TYPES
// =============================================================================

export interface ImpresionMeta {
  carta_id: string;
  project_id: string;
  generado_at: string;
  layout?: any;
  brand_applied?: any;
}

export interface ImpresionItem {
  carta_id: string;
  html: string | null;
  metadata: ImpresionMeta | null;
  filePath?: string;
}

export interface ImpresionState {
  items: Map<string, ImpresionItem>;   // carta_id → item
  selectedCartaId: string | null;
  loading: boolean;
  generating: Set<string>;              // carta_ids actualmente generándose
  error: string | null;
}

// =============================================================================
// STORE
// =============================================================================

const initial: ImpresionState = {
  items: new Map(),
  selectedCartaId: null,
  loading: false,
  generating: new Set(),
  error: null
};

export const impresionStore = writable<ImpresionState>(initial);

// =============================================================================
// ACTIONS
// =============================================================================

export async function loadImpresion(cartaId: string): Promise<ImpresionItem | null> {
  impresionStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const project = getActiveProject();
    const res = await mqttRequest<any>('carta-impresion', 'get', {
      project_id: project?.id,
      carta_id: cartaId
    });
    const item: ImpresionItem = {
      carta_id: cartaId,
      html: res.data.html,
      metadata: res.data.metadata,
      filePath: res.data.filePath
    };
    impresionStore.update(s => {
      const items = new Map(s.items);
      items.set(cartaId, item);
      return { ...s, items, loading: false };
    });
    return item;
  } catch (error) {
    impresionStore.update(s => ({
      ...s, loading: false, error: getErrorMessage(error)
    }));
    return null;
  }
}

export async function generarImpresion(cartaId: string): Promise<boolean> {
  impresionStore.update(s => {
    const gen = new Set(s.generating);
    gen.add(cartaId);
    return { ...s, generating: gen, error: null };
  });

  try {
    const project = getActiveProject();
    await mqttRequest('carta-impresion', 'generar', {
      project_id: project?.id,
      carta_id: cartaId
    });
    // El evento carta.impresion.lista nos avisará cuando termine
    return true;
  } catch (error) {
    impresionStore.update(s => {
      const gen = new Set(s.generating);
      gen.delete(cartaId);
      return {
        ...s, generating: gen, error: getErrorMessage(error)
      };
    });
    return false;
  }
}

export function selectCarta(cartaId: string | null): void {
  impresionStore.update(s => ({ ...s, selectedCartaId: cartaId }));
}

export function clearError(): void {
  impresionStore.update(s => ({ ...s, error: null }));
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

export function initImpresionSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Cuando se genera un HTML imprimible
  cleanupFns.push(
    mqttSubscribe('carta.impresion.lista', (_topic, payload) => {
      const data = payload as { carta_id?: string; project_id?: string; metadata?: ImpresionMeta };
      if (data?.carta_id) {
        impresionStore.update(s => {
          const gen = new Set(s.generating);
          gen.delete(data.carta_id!);
          return { ...s, generating: gen };
        });
        // Recargar el HTML
        loadImpresion(data.carta_id);
      }
    })
  );

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// DERIVED
// =============================================================================

export const selectedImpresion = derived(impresionStore, $s => {
  if (!$s.selectedCartaId) return null;
  return $s.items.get($s.selectedCartaId) || null;
});

export const impresionLoading = derived(impresionStore, $s => $s.loading);
export const impresionError = derived(impresionStore, $s => $s.error);
export const generatingCartas = derived(impresionStore, $s => $s.generating);

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) return 'Timeout';
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}
