/**
 * Carta Digital Store — la CARTA PÚBLICA proyectada + el config del canal.
 *
 * carta-digital es ahora un PROYECTOR (v2.0.0): la carta pública se proyecta AL VUELO
 * bebiendo tarifas+carta-manager+marca+contenido. El store la pide por get_carta_publica
 * (handler JS determinista, ms — NO un turno LLM) y el config del canal por get_config.
 * Ya NO hay snapshot de record → no hay "desfasada".
 *
 * El branding viene de la MARCA (se edita en carta-marketing, no aquí). Lo único que se
 * edita aquí es el config del canal: dominio_publico + opciones de PWA (update_config).
 */

import { writable } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export interface BrandingProyectado {
  nombre?: string | null;
  lema?: string | null;
  colores?: Record<string, unknown>;
  tipografias?: Record<string, unknown>;
  logo?: string | null;
  voz?: Record<string, unknown>;
  negocio?: Record<string, unknown>;
}

export interface CartaPublica {
  branding: BrandingProyectado | null;
  dominio_publico: string | null;
  opciones: Record<string, unknown>;
  categorias: any[];
  productos: any[];
  generado_at?: string;
}

export interface CartaDigitalConfig {
  _version?: string;
  _updated_at?: string | null;
  dominio_publico?: string | null;
  opciones_visualizacion?: Record<string, unknown>;
}

// =============================================================================
// STORES
// =============================================================================

export const cartaPublica = writable<CartaPublica | null>(null);
export const cartaDigitalConfig = writable<CartaDigitalConfig | null>(null);
export const cartaDigitalLoading = writable<boolean>(false);
export const cartaDigitalError = writable<string | null>(null);

// =============================================================================
// ACTIONS
// =============================================================================

/** Proyección viva de la carta pública (branding de marca + carta + contenido). */
export async function loadCartaPublica(): Promise<void> {
  cartaDigitalLoading.set(true);
  cartaDigitalError.set(null);
  try {
    const res = await mqttRequest<CartaPublica>('cartadigital', 'get_carta_publica');
    cartaPublica.set((res.data as CartaPublica) ?? null);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      cartaPublica.set(null);   // el canal digital no tiene carta (revisar tarifas)
    } else {
      cartaDigitalError.set(err instanceof Error ? err.message : 'Error al proyectar la carta pública');
    }
  } finally {
    cartaDigitalLoading.set(false);
  }
}

/** Config del canal (dominio + opciones de PWA) — lo único que se edita aquí. */
export async function loadCartaDigitalConfig(): Promise<void> {
  try {
    const res = await mqttRequest<CartaDigitalConfig>('cartadigital', 'get_config');
    cartaDigitalConfig.set((res.data as CartaDigitalConfig) ?? { _version: '1.0', opciones_visualizacion: {} });
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      cartaDigitalConfig.set({ _version: '1.0', _updated_at: null, dominio_publico: null, opciones_visualizacion: {} });
    } else {
      cartaDigitalError.set(err instanceof Error ? err.message : 'Error al cargar el config del canal');
    }
  }
}

/** Actualiza el config del canal (solo dominio/opciones; el branding se edita en marketing). */
export async function updateCartaDigitalConfig(campos: Partial<CartaDigitalConfig>): Promise<boolean> {
  try {
    await mqttRequest('cartadigital', 'update_config', { campos });
    await loadCartaDigitalConfig();
    return true;
  } catch (err) {
    cartaDigitalError.set(err instanceof Error ? err.message : 'No se pudo guardar el config');
    return false;
  }
}

// =============================================================================
// SUBSCRIPTIONS
// =============================================================================

export function initCartaDigitalSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  // cualquier fuente que cambie (carta/marca/contenido/tarifas) dispara esto → re-proyectar.
  unsubs.push(mqttSubscribe('cartadigital.carta_publica.actualizada', () => loadCartaPublica()));
  unsubs.push(mqttSubscribe('cartadigital.config.actualizada', () => loadCartaDigitalConfig()));
  return () => unsubs.forEach((u) => u());
}
