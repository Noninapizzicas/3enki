/**
 * Ingredientes Store — la cara del JEFE sobre el catálogo de ingredientes (F7,
 * composición según esquema-jefe/ de ingredientes): cinta-estado + tarjetas-ficha
 * con precio inline + editor de LOTE (update_precios).
 *
 * Fuente de la lógica (verificada en el repo, ingredientes v5.0.0):
 *   - modules/pizzepos/ingredientes/index.js: contrato real de handlers y señales.
 *   - modules/pizzepos/ingredientes/esquema-jefe/ (pasadas 1-3): composición
 *     3 capas (SELECCIONAR → INFORMARSE → DECLARAR), formas UI, señales pareadas.
 *
 * CONTRATO REAL (index.js — columnas del módulo, no del blueprint genérico):
 *   - list { grupo?, tipo?, alergeno? } → { ingredientes[], total } — cada ítem
 *     trae la FICHA COMPLETA (precio_extra, es_alergeno, alergenos[], grupos[],
 *     tipo, disponible). No hace falta get por tarjeta. Sort servidor: tipo, nombre.
 *   - get { id } → ingrediente | 404 · get_precio { ingrediente_id } →
 *     { ingrediente_id, precio_extra, disponible } (NO trae "consumido por N productos").
 *   - search { q, grupo? } → { resultados[], total, query }.
 *   - alergenos {} → { alergenos[], total, por_tipo{tipo:[{id,nombre,emoji}]} }.
 *   - update { id, ...updates } → 200 { ingrediente } + 1× ingrediente.actualizado
 *     con cambios{campo:{anterior,nuevo}}.
 *   - update_precios { id|tipo|grupo? , precio_extra|porcentaje } →
 *     200 { actualizados[]{id,nombre,anterior,nuevo}, total } + N×
 *     ingrediente.actualizado (publica DENTRO del for, L480). NO acepta
 *     [{id,precio}...]: el lote es "una cifra (o %) para el alcance".
 *   - Moneda: precio_extra se persiste en EUROS float redondeado a 2 decimales
 *     (L472 Math.round(x*100)/100) — la UI edita y envía €, SIN conversión céntimos.
 *   - porcentaje es COMPUESTO sobre el precio vigente de CADA ingrediente.
 *   - grupos es multi-pertenencia (array): un ingrediente puede vivir en varios
 *     grupos sin ser duplicado.
 *
 * Señales pareadas (publicadores reales de index.js):
 *   update → ingrediente.actualizado (1×) · update_precios → N× (1 por fila) ·
 *   sync externa (carta.actualizada / producto.creado) → ingrediente.creado —
 *   la cinta late igual aunque el jefe no toque nada.
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC (list).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): N señales del lote
 *        se absorben con debounce (60ms) y una única re-lectura.
 *
 * Patrón del repo: molde exacto de modules/pedidos/stores/pedidos.ts —
 * mqttRequest + suscripción dot-notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas reales devueltas por ingredientes.list / get (index.js)
// =============================================================================

/** Ingrediente tal como lo devuelve ingredientes.list (ficha completa en ítem). */
export interface Ingrediente {
  id: string;
  nombre: string;
  emoji?: string | null;
  tipo?: string | null;
  familia?: string | null;
  es_alergeno?: boolean;
  alergenos?: string[];
  /** EUROS float 2dec — fuente única que consume el motor de extras del POS. */
  precio_extra?: number;
  /** Multi-pertenencia: puede figurar en varios grupos sin ser duplicado. */
  grupos?: string[];
  disponible?: boolean;
  created_at?: string;
  updated_at?: string;
  [key: string]: unknown;
}

/** Fila del dictamen de update_precios (respuesta RPC). */
export interface PrecioLoteFila {
  id: string;
  nombre: string;
  anterior: number;
  nuevo: number;
  [key: string]: unknown;
}

/** Pulso de alérgenos del catálogo (op neutra que alimenta la ficha). */
export interface AlergenosPulso {
  alergenos: Ingrediente[];
  total: number;
  por_tipo: Record<string, Array<{ id: string; nombre: string; emoji?: string }>>;
  [key: string]: unknown;
}

// =============================================================================
// LOCALES del store — cinta + catálogo + estado de lote
// =============================================================================

const catalogoStore = writable<Ingrediente[]>([]);
const cintaLoading = writable<boolean>(false);
const cintaError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación global (los por-tarjeta los anota el panel). */
export const errorMutacion = writable<string | null>(null);

/** Vista derivada: catálogo ordenado tipo→nombre (mismo criterio del servidor). */
export const ingredientes = derived(catalogoStore, (lista) =>
  [...lista].sort((a, b) => {
    const t = (a.tipo || '').localeCompare(b.tipo || '');
    return t !== 0 ? t : a.nombre.localeCompare(b.nombre);
  })
);

/** Grupos derivados de la lista (unión de grupos[] de cada ingrediente). */
export const grupos = derived(catalogoStore, (lista) => {
  const set = new Set<string>();
  for (const ing of lista) for (const g of ing.grupos || []) set.add(g);
  return Array.from(set).sort((a, b) => a.localeCompare(b));
});

/** Cinta-estado: valores derivados SOLO de lecturas (nunca asumidos). */
export const cinta = derived(catalogoStore, (lista) => {
  const conPrecio = lista.filter((i) => typeof i.precio_extra === 'number' && i.precio_extra > 0);
  return {
    total: lista.length,
    grupos: (() => {
      const s = new Set<string>();
      for (const i of lista) for (const g of i.grupos || []) s.add(g);
      return s.size;
    })(),
    conPrecio: conPrecio.length,
    alergenos: lista.filter((i) => i.es_alergeno === true).length,
    conPrecioPct: lista.length > 0 ? Math.round((conPrecio.length / lista.length) * 100) : 0
  };
});

/** Pulso de alérgenos (op alergenos): tipos → ingredientes que los llevan. */
export const pulsoAlergenos = writable<AlergenosPulso | null>(null);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** € (es-ES) — precio_extra se edita y persiste en EUROS (sin céntimos). */
export function formatearEuros(euros: number | string | null | undefined): string {
  const n = typeof euros === 'number' ? euros : Number(String(euros ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Parsea texto de input a € float 2dec (tolera coma decimal). null si no es cifra ≥0. */
export function parsearEuros(texto: string): number | null {
  const n = Number(String(texto).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las únicas escrituras del estado (R2)
// =============================================================================

/** Carga el catálogo completo (la ficha viene EN list: cero get por tarjeta). */
export async function loadCatalogo(): Promise<void> {
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const res = await mqttRequest<{ ingredientes?: Ingrediente[]; total?: number }>('ingredientes', 'list', {});
    catalogoStore.set(res.data?.ingredientes ?? []);
  } catch (err) {
    cintaError.set(describeError(err));
  } finally {
    cintaLoading.set(false);
  }
}

/** Lectura dirigida por grupo (ref-select). Repuebla el mismo catálogo local. */
export async function loadCatalogoDeGrupo(grupo: string): Promise<void> {
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const res = await mqttRequest<{ ingredientes?: Ingrediente[]; total?: number }>('ingredientes', 'list', { grupo });
    catalogoStore.set(res.data?.ingredientes ?? []);
  } catch (err) {
    cintaError.set(describeError(err));
  } finally {
    cintaLoading.set(false);
  }
}

/** Pulso de alérgenos (cinta secundaria + chips sugeridos del editor de ficha). */
export async function cargarAlergenos(): Promise<void> {
  try {
    const res = await mqttRequest<AlergenosPulso>('ingredientes', 'alergenos', {});
    pulsoAlergenos.set(res.data ?? null);
  } catch {
    pulsoAlergenos.set(null); // el pulso es informativo: su fallo no rompe la vista
  }
}

/** Ficha fresca de un ingrediente (eco post-edición, opcional). */
export async function pedirIngrediente(id: string): Promise<Ingrediente | null> {
  try {
    const res = await mqttRequest<Ingrediente>('ingredientes', 'get', { id });
    return res.data ?? null;
  } catch {
    return null;
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetIngredientes(): void {
  catalogoStore.set([]);
  pulsoAlergenos.set(null);
  cintaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — las ÚNICAS escrituras que crean/editan reglas del dominio
// =============================================================================

/**
 * H1 · precio inline de UN ingrediente — update { id, precio_extra } (euros).
 * La señal pareada (1× ingrediente.actualizado) re-lee la lista (R3).
 */
export async function actualizarPrecio(id: string, precioEuros: number): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('ingredientes', 'update', { id, precio_extra: precioEuros });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/**
 * H2 · editor-bloque de FICHA — update { id, nombre?, familia?, es_alergeno?, alergenos? }.
 * Solo envía los campos cambiados (el handler hace diff contra el vigente).
 */
export async function actualizarFicha(
  id: string,
  cambios: { nombre?: string; familia?: string; es_alergeno?: boolean; alergenos?: string[] }
): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('ingredientes', 'update', { id, ...cambios });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/**
 * H3 · editor de LOTE — `una llamada` desde el alcance de la vista:
 *   { grupo, precio_extra } para lote de grupo · { precio_extra } para
 *   catálogo completo · { grupo?, porcentaje } para alza compuesta.
 * El dictamen (actualizados[]{nombre,anterior,nuevo}) vuelve en la respuesta;
 * las N señales pareadas re-leen la lista (R3, con debounce en initSenal).
 */
export async function actualizarPreciosLote(params: {
  grupo?: string;
  precio_extra?: number;
  porcentaje?: number;
}): Promise<PrecioLoteFila[]> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<{ actualizados?: PrecioLoteFila[]; total?: number }>(
      'ingredientes',
      'update_precios',
      params
    );
    return res.data?.actualizados ?? [];
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura del catálogo
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES_INGREDIENTE = [
  'ingrediente.actualizado', // 1× por update · N× por lote (absorbe el debounce)
  'ingrediente.creado', // sync externa: carta.actualizada / producto.creado
  'carta.actualizada' // externa: re-puebla el catálogo entero (re-siembra)
];

/**
 * Suscripción a las señales pareadas. El debounce absorbe el tándem N×1 del
 * lote (update_precios publica UNA señal POR fila) y la siembra de la carta.
 * Solo re-lee lecturas RPC: NUNCA recarga la vista.
 */
export function initIngredientesSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (!get(activeProjectId)) return;
    if (recargaProgramada) return; // debounce: el lote llega como N señales en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      void loadCatalogo();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENALES_INGREDIENTE) {
    unsubs.push(mqttSubscribe(senal, onSenal));
  }

  return () => {
    if (recargaProgramada) {
      clearTimeout(recargaProgramada);
      recargaProgramada = null;
    }
    unsubs.forEach((u) => u());
  };
}