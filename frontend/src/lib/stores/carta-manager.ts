/**
 * Carta-manager Store — lecturas directas + suscripciones al bus (Postura B, solo lectura).
 *
 * Arquitectura "sin backend dedicado en frontend":
 *   - El modulo `filesystem` expone fs.read / fs.list como tools (auto-registradas
 *     por el loader en uiHandler con domain='fs'), asi que el frontend las invoca
 *     via mqttRequest('fs', 'read'|'list', {path}). Filesystem resuelve el path
 *     relativo contra el storage del proyecto activo.
 *   - Este store SOLO LEE el catalogo de cartas (/storage/pizzepos/cartas/,
 *     propiedad de carta-manager, path canonico v1.3.0 por D1) + sus snapshots de
 *     version (.versions/<id>/<ts>.json). NO invoca las tools del blueprint
 *     carta-manager (save/delete/add_product/...) --esas son LLM-runtime, no
 *     responden al bus directamente (D6; mismo bug cazado en PR #264). Las
 *     mutaciones las dispara el chat via prefillChatInput (Postura B, D2).
 *
 * Reactividad: se suscribe a carta.actualizada/editada/borrada (publicados por el
 * blueprint backend en cada mutacion exitosa) y recarga el catalogo. Patron
 * canonico del repo: suscripcion directa al bus, sin cache materializado
 * (paradigma-no-cabe entry cache_materializado_del_estado_de_un_dominio).
 *
 * Shape ABIERTO (D3): la carta solo garantiza id + nombre. El resto de campos
 * (estado, version, categorias, productos, y los que traiga cada vertical) se
 * renderizan si estan presentes. Sin validacion contra schema, sin banners legacy.
 * Las cartas en disco anidan id/nombre bajo `meta`; normalizeCarta() levanta meta
 * al top-level para que la UI lea carta.nombre/estado/version directamente, y
 * conserva categorias/productos y cualquier campo extra intacto.
 *
 * Plan ejecutable: arquitectura/decisiones/propuestas/cierre-ui-carta-manager.json (v1.3.0)
 * Contrato canonico: arquitectura/decisiones/_contratos/ui-frontend-blueprint.contract.json
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';

// =============================================================================
// CONSTANTES — paths canonicos v1.3.0 (subsistema-carta v1.0.0 D1)
// =============================================================================

const CARTAS_DIR = '/storage/pizzepos/cartas/';
const VERSIONS_DIR = '/storage/pizzepos/cartas/.versions/';

function cartaPath(id: string): string {
  return CARTAS_DIR + id + '.json';
}

function versionsDirOf(cartaId: string): string {
  return VERSIONS_DIR + cartaId + '/';
}

// =============================================================================
// TIPOS — shape ABIERTO (D3): solo id + nombre garantizados
// =============================================================================

export interface Carta {
  id: string;
  nombre: string;
  [key: string]: unknown;
}

export interface CartaResumen {
  id: string;
  nombre: string;
  estado?: string;
  productos_count?: number;
  categorias_count?: number;
  version?: number;
  updated_at?: string;
}

export interface CartaVersionResumen {
  archived_at: string;
  version?: number;
  nombre?: string;
  productos_count?: number;
  categorias_count?: number;
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

export const cartasStore = writable<Carta[]>([]);
export const cartaSeleccionada = writable<Carta | null>(null);
export const cartasLoading = writable<boolean>(false);
export const cartasError = writable<string | null>(null);

/** Estadisticas derivadas del catalogo (total + agrupacion por estado si existe). */
export const cartasStats = derived(cartasStore, ($cartas) => {
  const por_estado: Record<string, number> = {};
  for (const c of $cartas) {
    const estado = typeof c.estado === 'string' ? c.estado : 'sin_estado';
    por_estado[estado] = (por_estado[estado] || 0) + 1;
  }
  return { total: $cartas.length, por_estado };
});

/** Catalogo ordenado alfabeticamente por nombre. */
export const sortedCartas = derived(cartasStore, ($cartas) =>
  [...$cartas].sort((a, b) => (a.nombre || '').localeCompare(b.nombre || ''))
);

// =============================================================================
// HELPERS — fs directo + normalizacion de shape abierto
// =============================================================================

/**
 * Normaliza una carta cruda del disco a shape abierto con id/nombre garantizados.
 * Las cartas anidan los metadatos bajo `meta` ({ meta:{id,nombre,estado,version,...},
 * categorias, productos }). Levantamos meta al top-level para que la UI lea
 * carta.nombre/estado/version directamente, conservando categorias/productos y
 * cualquier campo extra. Devuelve null si no hay id+nombre (minimos de D3).
 */
function normalizeCarta(raw: unknown): Carta | null {
  if (!raw || typeof raw !== 'object') return null;
  const obj = raw as Record<string, unknown>;
  const meta = obj.meta && typeof obj.meta === 'object' ? (obj.meta as Record<string, unknown>) : {};
  const id = (meta.id ?? obj.id) as unknown;
  const nombre = (meta.nombre ?? obj.nombre) as unknown;
  if (typeof id !== 'string' || typeof nombre !== 'string') return null;
  // Spread del raw (trae categorias/productos y extras) + meta levantado al top-level.
  return { ...obj, ...meta, id, nombre } as Carta;
}

function summarize(c: Carta): CartaResumen {
  return {
    id: c.id,
    nombre: c.nombre,
    estado: typeof c.estado === 'string' ? (c.estado as string) : undefined,
    productos_count: Array.isArray(c.productos) ? (c.productos as unknown[]).length : undefined,
    categorias_count: Array.isArray(c.categorias) ? (c.categorias as unknown[]).length : undefined,
    version: typeof c.version === 'number' ? (c.version as number) : undefined,
    updated_at: typeof c.updated_at === 'string' ? (c.updated_at as string) : undefined
  };
}

/** Lista los archivos *.json (no ocultos, no la subcarpeta .versions) de un dir. */
async function listJsonFiles(dir: string): Promise<FsListItem[]> {
  const listRes = await mqttRequest<{ items: FsListItem[] }>('fs', 'list', { path: dir });
  const items = Array.isArray(listRes.data?.items) ? listRes.data.items : [];
  return items.filter(
    (it) => it.type === 'file' && it.extension === 'json' && !it.name.startsWith('.')
  );
}

async function readJson(path: string): Promise<unknown | null> {
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path });
    const content = res.data?.content;
    if (typeof content !== 'string') return null;
    return JSON.parse(content);
  } catch {
    return null;
  }
}

// =============================================================================
// ACTIONS (solo lectura — D6)
// =============================================================================

/**
 * Carga el catalogo de cartas: fs.list de CARTAS_DIR + fs.read por archivo, en
 * paralelo. Directorio inexistente (proyecto sin cartas) -> lista vacia, no error.
 */
export async function loadCartas(): Promise<void> {
  cartasLoading.set(true);
  cartasError.set(null);
  try {
    const archivos = await listJsonFiles(CARTAS_DIR);
    const lecturas = await Promise.all(archivos.map((it) => readJson(CARTAS_DIR + it.name)));
    const cartas = lecturas.map(normalizeCarta).filter((c): c is Carta => c !== null);
    cartasStore.set(cartas);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      cartasStore.set([]);
      return;
    }
    cartasError.set((err as Error)?.message || 'Error al cargar cartas');
  } finally {
    cartasLoading.set(false);
  }
}

/** Carga una carta completa por id y la deja en cartaSeleccionada. */
export async function getCarta(cartaId: string): Promise<Carta | null> {
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: cartaPath(cartaId) });
    const content = res.data?.content;
    if (typeof content !== 'string') return null;
    const carta = normalizeCarta(JSON.parse(content));
    if (!carta) return null;
    cartaSeleccionada.set(carta);
    return carta;
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      cartasError.set(`Carta ${cartaId} no encontrada`);
      return null;
    }
    cartasError.set((err as Error)?.message || 'Error al cargar carta');
    return null;
  }
}

/**
 * Lista las versiones (snapshots) de una carta desde .versions/<cartaId>/.
 * El nombre de archivo es el timestamp (archived_at) que loadVersionSnapshot
 * usa para releer el snapshot completo. Sin versiones -> lista vacia (no error).
 */
export async function loadHistorial(cartaId: string): Promise<CartaVersionResumen[]> {
  try {
    const archivos = await listJsonFiles(versionsDirOf(cartaId));
    const lecturas = await Promise.all(
      archivos.map(async (it) => {
        const archivedAt = it.name.replace(/\.json$/, '');
        const snap = (await readJson(versionsDirOf(cartaId) + it.name)) as Record<string, unknown> | null;
        const meta =
          snap && snap.meta && typeof snap.meta === 'object' ? (snap.meta as Record<string, unknown>) : {};
        return {
          archived_at: archivedAt,
          version: typeof meta.version === 'number' ? (meta.version as number) : (snap?.version as number | undefined),
          nombre: (meta.nombre ?? snap?.nombre) as string | undefined,
          productos_count: Array.isArray(snap?.productos) ? (snap!.productos as unknown[]).length : undefined,
          categorias_count: Array.isArray(snap?.categorias) ? (snap!.categorias as unknown[]).length : undefined
        } as CartaVersionResumen;
      })
    );
    return lecturas.sort((a, b) => String(b.archived_at).localeCompare(String(a.archived_at)));
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      return [];
    }
    return [];
  }
}

/** Lee el snapshot completo de una version (para diff). */
export async function loadVersionSnapshot(cartaId: string, archivedAt: string): Promise<Carta | null> {
  const snap = await readJson(versionsDirOf(cartaId) + archivedAt + '.json');
  return normalizeCarta(snap);
}

/**
 * Suscribe a los eventos canonicos del bus (D7): carta.actualizada/editada/borrada.
 * Cada uno recarga el catalogo; actualizada refresca tambien la carta seleccionada
 * si es la afectada; borrada limpia la seleccion. Devuelve un cleanup que desuscribe.
 */
export function initCartaManagerSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  unsubs.push(
    mqttSubscribe('carta.actualizada', (envelope: any) => {
      loadCartas();
      const seleccionada = get(cartaSeleccionada);
      if (seleccionada && envelope?.data?.carta_id === seleccionada.id) {
        getCarta(seleccionada.id);
      }
    })
  );
  unsubs.push(mqttSubscribe('carta.editada', () => loadCartas()));
  unsubs.push(
    mqttSubscribe('carta.borrada', () => {
      loadCartas();
      cartaSeleccionada.set(null);
    })
  );
  return () => unsubs.forEach((u) => u());
}

// Solo lecturas (D6). Carta + CartaResumen ya exportados en su declaracion (interface),
// disponibles para impresion-cartas (D12).
