/**
 * Tarifas Store — lecturas directas + suscripciones al bus (Postura B, solo lectura).
 *
 * Arquitectura "sin backend dedicado en frontend":
 *   - El modulo `filesystem` expone fs.read / fs.list como tools (auto-registradas
 *     por el loader en uiHandler con domain='fs'), asi que el frontend las invoca
 *     via mqttRequest('fs', 'read'|'list', {path}). Filesystem resuelve el path
 *     relativo contra el storage del proyecto activo.
 *   - Este store SOLO LEE: la config de tarifas (/storage/config/tarifas.json,
 *     que escribe el backend modules/pizzepos/tarifas) y la lista de cartas del
 *     proyecto (/storage/pizzepos/cartas/, propiedad de carta-manager) para
 *     resolver los selectores. NO invoca tools de mutacion del backend tarifas
 *     (set_general, assign, register_variant). Esas acciones las dispara el chat
 *     via prefillChatInput (Postura B, decision D2/D6 del plan cierre-ui-tarifas).
 *
 * Reactividad: se suscribe a tarifas.config.actualizada (recarga config) y a
 * carta.actualizada/editada/borrada (recarga la lista de cartas, cuyos nombres
 * pueden haber cambiado). Patron canonico del repo: suscripcion directa al bus,
 * sin cache materializado intermediario (paradigma-no-cabe entry
 * cache_materializado_del_estado_de_un_dominio).
 *
 * Shape ESTABLE de tarifas.config (decision D3): general carta_id|null + canales
 * con los 6 fijos + variantes array. NO es shape abierto como las cartas.
 *
 * Plan ejecutable: arquitectura/decisiones/propuestas/cierre-ui-tarifas.json
 * Contrato canonico: arquitectura/decisiones/_contratos/subsistema-carta.contract.json (D6)
 */

import { writable, derived } from 'svelte/store';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';

// =============================================================================
// CONSTANTES
// =============================================================================

const TARIFAS_PATH = '/storage/config/tarifas.json';
const CARTAS_DIR = '/storage/pizzepos/cartas/';

/** Enum cerrado de canales (decision D4). Orden de render canonico. */
export const CANALES_CANONICOS = ['mesa', 'telefono', 'llevar', 'glovo', 'whatsapp', 'llevadoo'] as const;

type Canal = (typeof CANALES_CANONICOS)[number];

// =============================================================================
// TIPOS
// =============================================================================

export interface TarifasVariante {
  carta_id: string;
  base_carta_id: string;
  nombre: string;
  canales: string[];
  reglas: unknown;
}

export interface TarifasConfig {
  general: string | null;
  canales: Record<Canal, string | null>;
  variantes: TarifasVariante[];
}

export interface CartaResumen {
  id: string;
  nombre: string;
  estado?: string;
}

interface FsListItem {
  name: string;
  type: 'file' | 'directory';
  path: string;
  extension: string | null;
}

// =============================================================================
// STORES
// =============================================================================

export const tarifasConfig = writable<TarifasConfig | null>(null);
export const cartasDisponibles = writable<CartaResumen[]>([]);
export const tarifasLoading = writable<boolean>(false);
export const tarifasError = writable<string | null>(null);

/** Carta general resuelta a su resumen (nombre legible) o null si no hay. */
export const cartaGeneralResuelta = derived(
  [tarifasConfig, cartasDisponibles],
  ([config, cartas]) => {
    if (!config || !config.general) return null;
    return (
      cartas.find((c) => c.id === config.general) || {
        id: config.general,
        nombre: '(carta no encontrada)'
      }
    );
  }
);

// =============================================================================
// HELPERS
// =============================================================================

const canalesVacios = (): Record<Canal, string | null> => ({
  mesa: null,
  telefono: null,
  llevar: null,
  glovo: null,
  whatsapp: null,
  llevadoo: null
});

// =============================================================================
// ACTIONS (solo lectura — decision D6)
// =============================================================================

/**
 * Carga /storage/config/tarifas.json del proyecto activo. Si el archivo no
 * existe todavia (proyecto recien montado), deja un estado vacio coherente en
 * vez de crashear. No-encontrado se senyaliza via MqttRequestError con code
 * RESOURCE_NOT_FOUND (patron canonico, mismo que recetas/carta-design — el bug
 * de res.status quedo cerrado en PR #264, ver D5 del plan).
 */
export async function loadTarifasConfig(): Promise<void> {
  tarifasLoading.set(true);
  tarifasError.set(null);
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: TARIFAS_PATH });
    const content = res.data?.content;
    if (typeof content !== 'string') {
      tarifasConfig.set({ general: null, canales: canalesVacios(), variantes: [] });
      return;
    }
    const config = JSON.parse(content);
    // Sanitizar shape minimo: garantizar los 6 canales presentes con null si faltan.
    const sanitized: TarifasConfig = {
      general: config.general || null,
      canales: {
        mesa: config.canales?.mesa || null,
        telefono: config.canales?.telefono || null,
        llevar: config.canales?.llevar || null,
        glovo: config.canales?.glovo || null,
        whatsapp: config.canales?.whatsapp || null,
        llevadoo: config.canales?.llevadoo || null
      },
      variantes: Array.isArray(config.variantes) ? config.variantes : []
    };
    tarifasConfig.set(sanitized);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      // Proyecto sin tarifas aun — estado vacio, no es error.
      tarifasConfig.set({ general: null, canales: canalesVacios(), variantes: [] });
      return;
    }
    tarifasError.set((err as Error)?.message || 'Error al cargar tarifas');
  } finally {
    tarifasLoading.set(false);
  }
}

/**
 * Lista las cartas del proyecto (para los selectores). Lee /storage/pizzepos/cartas/
 * (propiedad de carta-manager, path canonico v1.3.0 por D1) via fs.list + fs.read
 * por archivo. NO invoca tool carta-manager.list del blueprint LLM-runtime (D5).
 * Fallback a lista vacia si el directorio no existe.
 */
export async function loadCartasDisponibles(): Promise<void> {
  try {
    const listRes = await mqttRequest<{ items: FsListItem[] }>('fs', 'list', { path: CARTAS_DIR });
    const items = Array.isArray(listRes.data?.items) ? listRes.data.items : [];
    const archivos = items.filter(
      (it) => it.type === 'file' && it.extension === 'json' && !it.name.startsWith('.')
    );
    const lecturas = await Promise.all(
      archivos.map(async (it) => {
        try {
          const res = await mqttRequest<{ content: string }>('fs', 'read', {
            path: CARTAS_DIR + it.name
          });
          const carta = JSON.parse(res.data?.content || '');
          const id = carta?.meta?.id || carta?.id;
          const nombre = carta?.meta?.nombre || carta?.nombre;
          if (id && nombre) {
            return { id, nombre, estado: carta?.meta?.estado || carta?.estado } as CartaResumen;
          }
          return null;
        } catch {
          return null;
        }
      })
    );
    const cartas = lecturas.filter((c): c is CartaResumen => c !== null);
    cartas.sort((a, b) => a.nombre.localeCompare(b.nombre));
    cartasDisponibles.set(cartas);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      cartasDisponibles.set([]);
      return;
    }
    // Fallback silencioso: los selectores muestran "sin cartas disponibles".
    cartasDisponibles.set([]);
  }
}

/**
 * Suscribe a los eventos canonicos del bus (decision D7):
 *   - tarifas.config.actualizada -> recarga la config.
 *   - carta.actualizada/editada/borrada -> recarga la lista de cartas (los
 *     nombres pueden haber cambiado, los selectores se refrescan).
 * Devuelve un cleanup que desuscribe todo.
 */
export function initTarifasSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  unsubs.push(mqttSubscribe('tarifas.config.actualizada', () => loadTarifasConfig()));
  unsubs.push(mqttSubscribe('carta.actualizada', () => loadCartasDisponibles()));
  unsubs.push(mqttSubscribe('carta.editada', () => loadCartasDisponibles()));
  unsubs.push(mqttSubscribe('carta.borrada', () => loadCartasDisponibles()));
  return () => unsubs.forEach((u) => u());
}
