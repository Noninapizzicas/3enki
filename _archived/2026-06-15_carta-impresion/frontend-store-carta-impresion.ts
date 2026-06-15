/**
 * Carta Impresion Store — versiones imprimibles de cartas.
 *
 * Lecturas directas via fs.read sobre /pizzepos/carta-impresion/<carta_id>.html
 * y /pizzepos/carta-impresion/<carta_id>.meta.json (patron lecturas-frontend-via-
 * fs-read). La generacion de un imprimible la hace el agente impresor
 * (impresion-architect) — operacion compleja del blueprint, se pide al
 * chat. El frontend solo escucha carta.impresion.lista para refrescar
 * cuando llegue el aviso de que el archivo esta listo.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttTimeoutError, MqttRequestError } from '$lib/ui-core/mqtt-request';

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

async function readFileOrNull(path: string): Promise<string | null> {
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path });
    const content = res.data?.content;
    return typeof content === 'string' ? content : null;
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') return null;
    throw err;
  }
}

export async function loadImpresion(cartaId: string): Promise<ImpresionItem | null> {
  impresionStore.update(s => ({ ...s, loading: true, error: null }));
  try {
    const htmlPath = `/pizzepos/carta-impresion/${cartaId}.html`;
    const metaPath = `/pizzepos/carta-impresion/${cartaId}.meta.json`;

    const [html, metaRaw] = await Promise.all([
      readFileOrNull(htmlPath),
      readFileOrNull(metaPath)
    ]);

    let metadata: ImpresionMeta | null = null;
    if (metaRaw) {
      try { metadata = JSON.parse(metaRaw); } catch { metadata = null; }
    }

    const item: ImpresionItem = {
      carta_id: cartaId,
      html,
      metadata,
      filePath: html ? htmlPath : undefined
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

/**
 * Generar un imprimible no se puede hacer desde el frontend — requiere
 * orquestar el agente impresor (impresion-architect) que compone el HTML
 * print-ready leyendo la carta + aplicando branding. Es una operacion
 * del blueprint que el LLM ejecuta cuando se le pide en el chat.
 *
 * El frontend marca el cartaId como 'generating' como hint visual; el
 * usuario debe abrir el chat y pedir "genera el imprimible de la carta
 * X". Cuando llegue el evento carta.impresion.lista, el listener
 * deshace el flag y recarga.
 */
export async function generarImpresion(cartaId: string): Promise<boolean> {
  impresionStore.update(s => {
    const gen = new Set(s.generating);
    gen.add(cartaId);
    return {
      ...s,
      generating: gen,
      error: `Pídeselo al chat: "genera el imprimible de la carta ${cartaId}". El agente impresor lo compone y al terminar dispara carta.impresion.lista — el panel se refresca solo.`
    };
  });
  // Devolvemos false porque NO completamos la generacion aqui — solo dejamos
  // hint y marcamos generating. El listener carta.impresion.lista hara el
  // refresh real cuando el agente termine.
  return false;
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
