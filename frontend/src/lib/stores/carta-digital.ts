/**
 * Carta Digital Store — lecturas directas via fs.read sobre el config persistido.
 *
 * Postura B (solo lectura): el store lee /storage/pizzepos/carta-digital/config.json
 * via mqttRequest('fs', 'read') y se suscribe a eventos del bus para refrescarse.
 * NUNCA invoca tools del blueprint LLM-runtime (cartadigital.*) --principio 6 del
 * contrato ui-frontend-blueprint + leccion bug PR #264. Las mutaciones las hace el
 * LLM a peticion del chat (prefillChatInput desde las zonas).
 *
 * Modelo no-reactivo PRESERVADO (A1 del contrato subsistema-carta): el badge
 * 'desfasada' es solo informativo (comparador de timestamps), NO dispara recompose.
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';

const CONFIG_PATH = '/storage/pizzepos/carta-digital/config.json';

// =============================================================================
// TYPES
// =============================================================================

export interface BrandingConfig {
  nombre?: string;
  lema?: string;
  colores?: unknown;
  logo_url?: string;
  fuente?: string;
  [key: string]: unknown;
}

export interface ContactoConfig {
  telefono?: string;
  email?: string;
  web?: string;
  redes?: unknown;
  [key: string]: unknown;
}

export interface CartaCompuesta {
  meta?: unknown;
  categorias?: any[];
  productos?: any[];
  ofertas?: any[];
  generado_at?: string;
  generado_por?: string;
  [key: string]: unknown;
}

export interface CartaDigitalConfig {
  _version?: string;
  _updated_at?: string | null;
  branding?: BrandingConfig;
  dominio_publico?: string;
  contacto?: ContactoConfig;
  opciones_visualizacion?: { [key: string]: unknown };
  carta_compuesta?: CartaCompuesta | null;
}

// =============================================================================
// STORES
// =============================================================================

export const cartaDigitalConfig = writable<CartaDigitalConfig | null>(null);
export const ultimaActualizacionCartaUpstream = writable<string | null>(null);
export const cartaDigitalLoading = writable<boolean>(false);
export const cartaDigitalError = writable<string | null>(null);

/**
 * Derived: la carta_compuesta esta desfasada si la ultima carta upstream conocida
 * (carta.actualizada / carta.editada) es posterior a carta_compuesta.generado_at.
 * Comparacion lexicografica de ISO 8601 (valida para timestamps del mismo formato).
 * Solo informativo --NO dispara recompose (A1 preservado).
 */
export const estaCartaCompuestaDesfasada = derived(
  [cartaDigitalConfig, ultimaActualizacionCartaUpstream],
  ([$config, $upstream]) => {
    const generadoAt = $config?.carta_compuesta?.generado_at;
    if (!generadoAt || !$upstream) return false;
    return $upstream > generadoAt;
  }
);

// =============================================================================
// ACTIONS (solo lectura)
// =============================================================================

/**
 * Carga el config persistido del proyecto activo via fs.read.
 * Si el archivo no existe (RESOURCE_NOT_FOUND) devuelve estado vacio limpio.
 */
export async function loadCartaDigitalConfig(): Promise<void> {
  cartaDigitalLoading.set(true);
  cartaDigitalError.set(null);
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: CONFIG_PATH });
    const content = res.data?.content;
    if (typeof content !== 'string') {
      throw new Error('fs.read devolvio content vacio');
    }
    cartaDigitalConfig.set(JSON.parse(content) as CartaDigitalConfig);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      // Sin config todavia --estado vacio limpio (no es error).
      cartaDigitalConfig.set({
        _version: '1.0',
        _updated_at: null,
        branding: {},
        contacto: {},
        opciones_visualizacion: {},
        carta_compuesta: null
      });
    } else {
      cartaDigitalError.set(err instanceof Error ? err.message : 'Error al cargar carta digital');
    }
  } finally {
    cartaDigitalLoading.set(false);
  }
}

/**
 * Suscribe a eventos del bus. Devuelve una funcion de cleanup.
 *  - cartadigital.config.actualizada / cartadigital.carta_publica.actualizada
 *    --> recargar el config completo.
 *  - carta.actualizada / carta.editada (upstream de carta-manager)
 *    --> cachear el timestamp para calcular si carta_compuesta esta desfasada.
 */
export function initCartaDigitalSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  unsubs.push(mqttSubscribe('cartadigital.config.actualizada', () => loadCartaDigitalConfig()));
  unsubs.push(mqttSubscribe('cartadigital.carta_publica.actualizada', () => loadCartaDigitalConfig()));

  const cacheUpstreamTs = (_topic: string, payload: unknown): void => {
    const p = payload as { timestamp?: string; metadata?: { timestamp?: string }; data?: { timestamp?: string } };
    const ts = p?.timestamp || p?.metadata?.timestamp || p?.data?.timestamp;
    if (ts) ultimaActualizacionCartaUpstream.set(ts);
  };
  unsubs.push(mqttSubscribe('carta.actualizada', cacheUpstreamTs));
  unsubs.push(mqttSubscribe('carta.editada', cacheUpstreamTs));

  return () => unsubs.forEach((u) => u());
}
