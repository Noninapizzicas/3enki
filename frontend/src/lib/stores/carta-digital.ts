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

import { writable, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { activeProjectId } from './projects';

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

export interface AlergenoLeyenda {
  id: string;
  nombre: string;
  emoji: string;
  orden?: number;
}

export interface CartaPublica {
  branding: BrandingProyectado | null;
  dominio_publico: string | null;
  opciones: Record<string, unknown>;
  categorias: any[];
  productos: any[];
  alergenos_leyenda?: AlergenoLeyenda[];
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
    const project_id = get(activeProjectId);
    const res = await mqttRequest<CartaPublica>('cartadigital', 'get_carta_publica', { project_id });
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
    const project_id = get(activeProjectId);
    const res = await mqttRequest<CartaDigitalConfig>('cartadigital', 'get_config', { project_id });
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
    const project_id = get(activeProjectId);
    await mqttRequest('cartadigital', 'update_config', { project_id, campos });
    await loadCartaDigitalConfig();
    return true;
  } catch (err) {
    cartaDigitalError.set(err instanceof Error ? err.message : 'No se pudo guardar el config');
    return false;
  }
}

/**
 * Publica/republica el bundle estático del PWA (cartadigital.publicar). Regenera el
 * /shop/<slug> con el config actual. Devuelve { ok, data?: { alojada_url, aviso, ... }, error? }.
 */
export async function publicarCartaDigital(): Promise<{ ok: boolean; data?: any; error?: string }> {
  try {
    const project_id = get(activeProjectId);
    // Publicar es pesado (copia N imágenes al bundle + verifica el render + escribe ficheros):
    // el default de 10s se queda corto y el botón daba "Request timeout". Le damos 60s.
    const res = await mqttRequest<any>('cartadigital', 'publicar', { project_id }, { timeout: 60000 });
    return { ok: true, data: res.data };
  } catch (err: any) {
    const msg = err?.response?.error?.message || (err instanceof Error ? err.message : 'No se pudo publicar');
    return { ok: false, error: msg };
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
