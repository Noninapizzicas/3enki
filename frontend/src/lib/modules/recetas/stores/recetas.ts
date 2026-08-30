/**
 * Recetas Store — la cara del JEFE sobre el RECETARIO (F7, composición según
 * esquema-jefe/ de recetas): cinta-estado + ref-select de receta + TABLA de
 * líneas (ingrediente×cantidad) + crear (editor-bloque) + validar (freno AJV).
 *
 * Fuente de la lógica (verificada en el repo, recetas v2.2.0 / reflejo-1.3.0):
 *   - modules/pizzepos/recetas/index.js: contrato real de handlers y señales.
 *   - modules/pizzepos/recetas/esquema-jefe/ (pasadas 1-3 + esquema.md):
 *     composición 3 capas (SELECCIONAR → INFORMARSE → DECLARAR), formas UI,
 *     señales pareadas.
 *
 * CONTRATO REAL (index.js — columnas del módulo, no del blueprint genérico):
 *   - listar { project_id, estado?, solo_incompletas?, solo_sin_coste?,
 *     incluir_lineas?, limit? } → { total, recetas[]{ receta_id, nombre, tipo,
 *     rinde, lineas_count, incompleta, campos_pendientes, estado_operativo,
 *     version, updated_at, lineas[], coste_unidad } }. EXIGE project_id (L38:
 *     if (!input.project_id) return this._invalid('project_id')) — el bug del
 *     escandallo lo demostró (cinta fallaba con 'project_id requerido').
 *   - obtener { project_id, receta_id|nombre } → ficha completa (spread
 *     directo, sin history) + versiones_anteriores. 404 si no existe.
 *   - ingredientes { project_id, categoria? } → { total, ingredientes[]{
 *     id, nombre, compra_unidad, precio, fuente } } — catálogo para resolver
 *     el ref de las líneas.
 *   - crear { project_id, nombre, tipo?, rinde?, lineas[], notas? } → 201
 *     { receta_id, nombre, tipo, estado_operativo, incompleta,
 *     campos_pendientes, lineas_count } · 409 ALREADY_EXISTS (existing_id) ·
 *     503 UPSTREAM_UNREACHABLE (fs falló / no aterrizó). Persist VERIFICADO:
 *     solo emite receta.creada tras confirmar que la receta está en el archivo.
 *   - validar { receta } → SIEMPRE 200 { valid, errors[]{path, keyword,
 *     message} } (AJV contra receta.schema.json, función pura, sin señal).
 *
 * Señales pareadas (publicadores reales de index.js):
 *   crear → receta.creada (1×, L271, SOLO tras verificar aterrizaje) ·
 *   coste de escandallo → receta.actualizada (L306, onCosteCalculado, origen
 *   'escandallo.coste.calculado', 1 por coste aplicado) · validar → dictamen
 *   en la respuesta (función pura, sin señal).
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC (listar/obtener).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): receta.creada /
 *        receta.actualizada se absorben con debounce (60ms) y una re-lectura.
 *   INVARIANTE — el coste NO se edita aquí: lo escribe escandallo, se muestra.
 *        El recetario deja las lineas COSTEABLES (ref resoluble + cantidad>0 +
 *        unidad canónica g|ml|ud).
 *
 * Patrón del repo: molde exacto de modules/ingredientes/stores/ingredientes.ts
 * y modules/pedidos/stores/pedidos.ts — mqttRequest + suscripción dot-notation
 * + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas reales devueltas por recetas.listar/obtener/ingredientes
// =============================================================================

export type EstadoOperativo = 'borrador' | 'en_servicio' | 'archivada';
export type Unidad = 'g' | 'ml' | 'ud';

export interface Rinde {
  cantidad: number;
  unidad: Unidad;
}

/** Línea de una receta: ingrediente × cantidad exacta con unidad canónica. */
export interface RecetaLinea {
  ref?: string | null;
  nombre: string;
  cantidad: number;
  unidad: Unidad;
  notas?: string;
}

/** Receta tal como la devuelve recetas.listar { incluir_lineas:true }. */
export interface RecetaResumen {
  receta_id: string;
  nombre: string;
  tipo: string;
  rinde: Rinde | null;
  lineas_count: number;
  incompleta: boolean;
  campos_pendientes: string[];
  estado_operativo: EstadoOperativo;
  version: number;
  updated_at: string;
  lineas?: RecetaLinea[];
  /** Escrito por escandallo (coste). Ausente si nunca corrió. */
  coste_unidad?: number;
  [key: string]: unknown;
}

/** Ficha completa de una receta (recetas.obtener — spread directo). */
export interface Receta extends RecetaResumen {
  descripcion?: string;
  instrucciones?: string[];
  categorias?: string[];
  etiquetas?: string[];
  fuente?: string;
  notas?: string;
  coste_total?: number;
  coste_actualizado_at?: string;
  fuentes_precios?: string[];
  lineas_detalle?: Array<{ ref?: string; nombre: string; cantidad: number; unidad: string; precio_unitario: number | null; valor_calculado: number | null; fuente: string }>;
  lineas_sin_precio?: string[];
  versiones_anteriores?: number;
  [key: string]: unknown;
}

/** Ingrediente del catálogo (recetas.ingredientes) para resolver el ref. */
export interface CatalogoIngrediente {
  id?: string;
  nombre: string;
  compra_unidad?: string;
  precio?: number;
  categoria?: string;
  fuente?: string;
  [key: string]: unknown;
}

/** Dictamen del freno validar (recetas.validar — función pura). */
export interface ValidarDictamen {
  valid: boolean;
  errors: Array<{ path: string; keyword: string; message: string }>;
}

// =============================================================================
// LOCALES del store — recetario + selección + cinta + estado de creación
// =============================================================================

const recetarioStore = writable<RecetaResumen[]>([]);
const cintaLoading = writable<boolean>(false);
const cintaError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación global (los por-tarjeta los anota el panel). */
export const errorMutacion = writable<string | null>(null);

/** Receta seleccionada (ref-select) — alimenta la TABLA de líneas. */
export const recetaSeleccionada = writable<Receta | null>(null);

/** Catálogo de ingredientes (recetas.ingredientes) para el ref-select de líneas. */
export const catalogoIngredientes = writable<CatalogoIngrediente[]>([]);

/** Vista derivada: recetario ordenado por updated_at desc (mismo criterio del servidor). */
export const recetario = derived(recetarioStore, (lista) =>
  [...lista].sort((a, b) => String(b.updated_at || '').localeCompare(String(a.updated_at || '')))
);

/** Cinta-estado: valores derivados SOLO de lecturas (nunca asumidos). */
export const cinta = derived(recetarioStore, (lista) => {
  const conCoste = lista.filter((r) => typeof r.coste_unidad === 'number' && r.coste_unidad > 0);
  const incompletas = lista.filter((r) => r.incompleta === true);
  return {
    total: lista.length,
    conCoste: conCoste.length,
    incompletas: incompletas.length,
    conCostePct: lista.length > 0 ? Math.round((conCoste.length / lista.length) * 100) : 0
  };
});

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** € (es-ES) — coste_unidad se persiste en EUROS float 2dec (escandallo). */
export function formatearEuros(euros: number | string | null | undefined): string {
  const n = typeof euros === 'number' ? euros : Number(String(euros ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las únicas escrituras del estado (R2)
// =============================================================================

/**
 * Carga el recetario completo con líneas (la ficha de coste viene EN listar
 * con incluir_lineas:true). EXIGE project_id (lección del bug del escandallo).
 */
export async function loadRecetario(): Promise<void> {
  const projectId = get(activeProjectId);
  if (!projectId) {
    cintaError.set('project_id requerido');
    return;
  }
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const res = await mqttRequest<{ recetas?: RecetaResumen[]; total?: number }>(
      'recetas',
      'listar',
      { project_id: projectId, incluir_lineas: true, limit: 1000 }
    );
    recetarioStore.set(res.data?.recetas ?? []);
  } catch (err) {
    cintaError.set(describeError(err));
  } finally {
    cintaLoading.set(false);
  }
}

/** Ficha completa de una receta (recetas.obtener — spread directo). */
export async function cargarReceta(recetaId: string): Promise<Receta | null> {
  const projectId = get(activeProjectId);
  if (!projectId) return null;
  try {
    const res = await mqttRequest<Receta>('recetas', 'obtener', { project_id: projectId, receta_id: recetaId });
    recetaSeleccionada.set(res.data ?? null);
    return res.data ?? null;
  } catch (err) {
    cintaError.set(describeError(err));
    return null;
  }
}

/** Catálogo de ingredientes (recetas.ingredientes) para el ref-select de líneas. */
export async function cargarCatalogoIngredientes(): Promise<void> {
  const projectId = get(activeProjectId);
  if (!projectId) return;
  try {
    const res = await mqttRequest<{ ingredientes?: CatalogoIngrediente[]; total?: number }>(
      'recetas',
      'ingredientes',
      { project_id: projectId }
    );
    catalogoIngredientes.set(res.data?.ingredientes ?? []);
  } catch {
    catalogoIngredientes.set([]); // el catálogo es informativo: su fallo no rompe la vista
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetRecetas(): void {
  recetarioStore.set([]);
  recetaSeleccionada.set(null);
  catalogoIngredientes.set([]);
  cintaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — las ÚNICAS escrituras que crean reglas del dominio
// =============================================================================

/**
 * H1 · CREAR receta — editor-bloque { nombre, tipo?, rinde?, lineas[], notas? }.
 * El reflejo persiste VERIFICADO: 201 solo si aterrizó, 409 si ya existe,
 * 503 si no se confirmó en disco. La señal pareada (1× receta.creada) re-lee
 * el recetario (R3).
 */
export async function crearReceta(params: {
  nombre: string;
  tipo?: string;
  rinde?: Rinde;
  lineas?: RecetaLinea[];
  notas?: string;
}): Promise<{ receta_id: string; nombre: string; estado_operativo: string; incompleta: boolean; campos_pendientes: string[] }> {
  const projectId = get(activeProjectId);
  if (!projectId) throw new Error('project_id requerido');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<{
      receta_id: string;
      nombre: string;
      estado_operativo: string;
      incompleta: boolean;
      campos_pendientes: string[];
    }>('recetas', 'crear', { project_id: projectId, ...params });
    return res.data;
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/**
 * H2 · VALIDAR la forma (EL FRENO) — recetas.validar { receta }.
 * Función pura: SIEMPRE 200 { valid, errors[]{path, keyword, message} }.
 * Sin señal — el dictamen es la respuesta. Se llama en vivo mientras el jefe
 * escribe el editor-bloque.
 */
export async function validarReceta(receta: unknown): Promise<ValidarDictamen> {
  try {
    const res = await mqttRequest<ValidarDictamen>('recetas', 'validar', { receta });
    return res.data ?? { valid: false, errors: [] };
  } catch (err) {
    return { valid: false, errors: [{ path: '/', keyword: 'rpc', message: describeError(err) }] };
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura del recetario
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES_RECETAS = [
  'receta.creada', // 1× por crear (tras verificar aterrizaje)
  'receta.actualizada' // 1× por coste aplicado por escandallo
];

/**
 * Suscripción a las señales pareadas. El debounce absorbe el tándem de
 * receta.actualizada (escandallo aplica costes) y la alta de receta.creada.
 * Solo re-lee lecturas RPC: NUNCA recarga la vista.
 */
export function initRecetasSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (!get(activeProjectId)) return;
    if (recargaProgramada) return; // debounce: señales en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      void loadRecetario();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENALES_RECETAS) {
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
