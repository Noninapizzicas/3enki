/**
 * Calendario Store — la cara del JEFE sobre la base del TIEMPO de producción/
 * distribución (F7, composición según esquema-jefe/ de calendario): cinta-estado
 * de la agenda del día + ref-select de producto + editor-bloque (producto.actualizar).
 *
 * Fuente de la lógica (verificada en el repo, calendario v0.1.0):
 *   - modules/calendario/index.js: contrato real de handlers y señales.
 *   - modules/calendario/esquema-jefe/ (pasadas 1-2): composición 3 capas
 *     (SELECCIONAR → INFORMARSE → DECLARAR), formas UI, señales pareadas.
 *
 * CONTRATO REAL (index.js — columnas del módulo):
 *   - productos.leer (sin args) → { calendarios: { producto_id: {dias_salida,
 *     margen_antelacion_h} } } — TODO el calendario del proyecto en una llamada.
 *   - producto.leer { producto_id } → { producto_id, calendario } | 404.
 *   - margen.leer { producto_id } → { producto_id, margen_antelacion_h (null si
 *     sin calendario), dias_salida ([] si sin calendario) } — dictamen de antelación.
 *   - validar { producto_id, fecha_deseada } → { producto_id, fecha_deseada,
 *     dia_semana, valido, motivo, propuesta?: {fecha, dia} } — confirma si una
 *     fecha de encargo cuadra y propone el día válido más cercano.
 *   - producto.actualizar { producto_id, cambios: { dias_salida?, margen_antelacion_h? } }
 *     → 200 { calendario } + 1× calendario.producto.actualizado (ConfigCustodio
 *     L119, { project_id, calendario }). Es la ÚNICA escritura del módulo.
 *   - Días ISO 1..7 (1=Lun..7=Dom), validador real (VALID_DIAS = [1..7]). La UI
 *     NO usa 0-based.
 *
 * Señal pareada (publicador real):
 *   producto.actualizar → calendario.producto.actualizado (1×) — la cinta re-lee.
 *   Las lecturas (producto.leer / productos.leer / validar / margen.leer) NO
 *   emiten señal propia (alimentadoras).
 *
 * REF-SELECT del jefe: los productos candidatos los trae el proyector de la carta
 * (productos.carta_completa — otro módulo). Si un producto con calendario ya no
 * está en la carta, se conserva en la agenda.
 *
 * LECCIÓN escandallo (bug): TODOS los RPC llevan project_id inyectado
 * (ConfigCustodio de calendario lee config por proyecto — sin project_id no hay
 * aislamiento multi-tenant). Nunca se llama sin project_id.
 *
 * Patrón del repo: molde exacto de modules/ingredientes/stores/ingredientes.ts —
 * mqttRequest + suscripción dot-notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por calendario.productos.leer / margen.leer /
// validar (index.js)
// =============================================================================

/** Calendario de un producto tal como lo devuelve productos.leer / producto.leer. */
export interface Calendario {
  dias_salida?: number[]; // ISO 1..7 (1=Lun..7=Dom)
  margen_antelacion_h?: number | null; // horas ≥ 0 · null = política por declarar
  [key: string]: unknown;
}

/** Calendarios del proyecto (key = producto_id). */
export type Calendarios = Record<string, Calendario>;

/** Dictamen de validar: ¿cuadra una fecha de encargo con la agenda? */
export interface DictamenValidar {
  producto_id: string;
  fecha_deseada: string;
  dia_semana: string;
  valido: boolean;
  motivo: string | null;
  propuesta?: { fecha: string | null; dia: string | null };
  [key: string]: unknown;
}

/** Dictamen de margen.leer: antelación mínima de un producto. */
export interface DictamenMargen {
  producto_id: string;
  margen_antelacion_h: number | null;
  dias_salida: number[];
  [key: string]: unknown;
}

/** Producto candidato (proyector de la carta — ref-select del jefe). */
export interface ProductoRef {
  id: string;
  nombre: string;
  [key: string]: unknown;
}

// =============================================================================
// LOCALES del store — agenda + selección + estado de carga
// =============================================================================

const agendaStore = writable<Calendarios>({});
const cintaLoading = writable<boolean>(false);
const cintaError = writable<string | null>(null);
const catalogoProductosStore = writable<ProductoRef[]>([]);

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación global (los por-editor los anota el panel). */
export const errorMutacion = writable<string | null>(null);

/** Los calendarios del proyecto (la agenda declarada por el jefe). */
export const calendarios = derived(agendaStore, (map) => map);

/** Nombres de día ISO 1..7 para mostrar la agenda en claro. */
export const DIAS_ISO: Array<{ n: number; corto: string; largo: string }> = [
  { n: 1, corto: 'L', largo: 'lunes' },
  { n: 2, corto: 'M', largo: 'martes' },
  { n: 3, corto: 'X', largo: 'miércoles' },
  { n: 4, corto: 'J', largo: 'jueves' },
  { n: 5, corto: 'V', largo: 'viernes' },
  { n: 6, corto: 'S', largo: 'sábado' },
  { n: 7, corto: 'D', largo: 'domingo' }
];

/** El día de la semana ISO (1=Lun..7=Dom) de HOY (local). */
function diaISOHoy(): number {
  const iso = new Date().getDay(); // 0=Dom..6=Sáb
  return iso === 0 ? 7 : iso;
}

/** Nombre ISO 1..7 → etiqueta larga, con fallback. */
export function nombreDia(n: number): string {
  return DIAS_ISO.find((d) => d.n === n)?.largo ?? `${n}`;
}

/** Cinta-estado: valores derivados SOLO de lecturas (nunca asumidos). */
export const cinta = derived(agendaStore, (map) => {
  const ids = Object.keys(map);
  const hoy = diaISOHoy();
  const salenHoy = ids.filter(
    (id) => Array.isArray(map[id]?.dias_salida) && (map[id].dias_salida as number[]).includes(hoy)
  );
  const conMargen = ids.filter(
    (id) => typeof map[id]?.margen_antelacion_h === 'number' && map[id].margen_antelacion_h! >= 0
  );
  return {
    total: ids.length,
    salen_hoy: salenHoy.length,
    con_margen: conMargen.length,
    dia_hoy: nombreDia(hoy)
  };
});

/** Productos candidatos del ref-select (proyector de la carta). */
export const catalogoProductos = derived(catalogoProductosStore, (lista) => lista);

/** Unión para el ref-select: primero los de la carta (orden natural), luego los
 * que solo tienen calendario (se conservan aunque ya no estén en la carta). */
export const productosAgenda = derived(
  [catalogoProductosStore, agendaStore],
  ([catalogo, agenda]) => {
    const vistos = new Set<string>();
    const unidos: ProductoRef[] = [];
    for (const p of catalogo) {
      if (!vistos.has(p.id)) {
        vistos.add(p.id);
        unidos.push(p);
      }
    }
    for (const id of Object.keys(agenda)) {
      if (!vistos.has(id)) {
        vistos.add(id);
        unidos.push({ id, nombre: id });
      }
    }
    return unidos;
  }
);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las únicas escrituras del estado
// =============================================================================

/** project_id del proyecto activo (siempre inyectado en los RPC — lección escandallo). */
function pidActivo(): string {
  const pid = get(sessionProjectId);
  if (typeof pid !== 'string' || !pid) throw new Error('no hay proyecto activo');
  return pid;
}

/**
 * Carga la AGENDA del proyecto (productos.leer → {calendarios}). Es la base de
 * la cinta y de la edición. TODOS los RPC con project_id.
 */
export async function loadCalendarios(): Promise<void> {
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const pid = pidActivo();
    const res = await mqttRequest<{ calendarios?: Calendarios }>(
      'calendario',
      'productos.leer',
      { project_id: pid }
    );
    agendaStore.set(res.data?.calendarios ?? {});
  } catch (err) {
    cintaError.set(describeError(err));
  } finally {
    cintaLoading.set(false);
  }
}

/**
 * Carga el catálogo de productos candidatos del ref-select (proyector de la
 * carta — productos.carta_completa, otro módulo). Best-effort: si no hay carta,
 * el ref-select se llena con los que ya tienen calendario.
 */
export async function loadCatalogoProductos(): Promise<void> {
  try {
    const pid = pidActivo();
    const carta = await mqttRequest<{ productos?: ProductoRef[] }>(
      'productos',
      'carta_completa',
      { project_id: pid }
    );
    catalogoProductosStore.set((carta.data?.productos || []).map((p) => ({ id: p.id, nombre: p.nombre })));
  } catch {
    catalogoProductosStore.set([]); // sin carta: el ref-select conserva los agendados
  }
}

/** Dictamen de si una fecha de encargo cuadra con la agenda (validar). */
export async function validarFecha(producto_id: string, fecha_deseada: string): Promise<DictamenValidar | null> {
  try {
    const pid = pidActivo();
    const res = await mqttRequest<DictamenValidar>(
      'calendario',
      'validar',
      { project_id: pid, producto_id, fecha_deseada }
    );
    return res.data ?? null;
  } catch {
    return null; // dictamen informativo: su fallo no rompe la vista
  }
}

/** Pulso de antelación del producto seleccionado (margen.leer). */
export async function leerMargen(producto_id: string): Promise<DictamenMargen | null> {
  try {
    const pid = pidActivo();
    const res = await mqttRequest<DictamenMargen>(
      'calendario',
      'margen.leer',
      { project_id: pid, producto_id }
    );
    return res.data ?? null;
  } catch {
    return null;
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCalendario(): void {
  agendaStore.set({});
  catalogoProductosStore.set([]);
  cintaError.set(null);
  errorMutacion.set(null);
  mutacionesPendientes.set(0);
}

// =============================================================================
// DECLARAR (capa 3) — LA ÚNICA escritura del módulo (producto.actualizar)
// =============================================================================

/**
 * H3 · AGENDAR la producción de un producto — producto.actualizar
 * { producto_id, cambios: { dias_salida?, margen_antelacion_h? } }.
 * Días ISO 1..7 (1=Lun..7=Dom), margen ≥ 0. El handler valida los campos
 * presentes (esquema calendario-v1), hace merge en productos.<id> y persiste.
 * La señal pareada (1× calendario.producto.actualizado) re-lee la agenda (R3).
 */
export async function agendarProduccion(
  producto_id: string,
  cambios: { dias_salida?: number[]; margen_antelacion_h?: number | null }
): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const pid = pidActivo();
    await mqttRequest('calendario', 'producto.actualizar', {
      project_id: pid,
      producto_id,
      cambios
    });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura de la agenda
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES_CALENDARIO = [
  'calendario.producto.actualizado' // 1× por producto agendado (ConfigCustodio L119)
];

/**
 * Suscripción a la señal pareada. El debounce absorbe ráfagas de ediciones.
 * Solo re-lee lecturas RPC: NUNCA recarga la vista a ciegas. También re-carga el
 * catálogo candidato por si cambió la carta (best-effort).
 */
export function initCalendarioSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (!get(sessionProjectId)) return;
    if (recargaProgramada) return; // debounce: varias ediciones en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      void loadCalendarios();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENALES_CALENDARIO) {
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
