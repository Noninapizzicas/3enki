/**
 * MiseEnPlace Store — la cara del JEFE de la planificacion previa al servicio
 * (F7, composicion segun esquema-jefe/ de mise-en-place, commit 1): el jefe
 * ESCALA las recetas al volumen del dia, PUBLICA el plan de produccion y
 * CONSOLIDA la lista de compra. Editor-escalado (escalado.calcular) +
 * confirmador-nombrado (plan.publicar) + dictamen (compra.calcular).
 *
 * Fuente de la logica (verificada en el repo, mise-en-place 1.0.0):
 *   - modules/mise-en-place/index.js (1175 lineas, leidas enteras):
 *     contrato real de handlers y senales (_publicarEvento L587-611).
 *   - modules/mise-en-place/esquema-jefe/ (pasada-1, pasada-2-diseccion,
 *     esquema.md): composicion 3 capas, formas UI, senales pareadas.
 *
 * CONTRATO REAL (index.js + recetas -- ref-select de receta):
 *   - escalado.calcular { project_id, receta_id, porciones_origen,
 *     porciones_destino, ingredientes } -> 201 { escalado_id, receta_id,
 *     factor, ingredientes_escalados } — INV1: el caller pasa los ingredientes
 *     de la receta (los trae el panel por recetas.obtener). INV2: NO modifica
 *     la receta canonica (derivacion transitoria, persiste escalados[]).
 *   - plan.publicar { project_id, horizonte_desde, horizonte_hasta, lineas:
 *     [{ receta_id, porciones, franja }] } -> 201 { plan_id, total_lineas }.
 *     El plan nace 'propuesto' (INV3) — maquina cerrada.
 *   - compra.calcular { project_id, horizonte, recetas: [{ receta_id,
 *     porciones, ingredientes }] } -> 201 { compra_id, items_total, items[] }.
 *     Agrega por (ingrediente, unidad) con cantidad_neta + merma_pct (INV5:
 *     consolida el dictamen, NO compra).
 *   - planes.listar { project_id } -> 200 { planes[], total } (neutro).
 *   - recetas.listar { incluir_lineas, limit } / recetas.obtener { receta_id }
 *     (neutro, modulo recetas) — el ref-select del escalado.
 *
 * Senales pareadas (VERIFICADAS en index.js — _publicarEvento L587-611):
 *   escalado.calcular -> produccion.escalado.calculado ·
 *   plan.publicar -> produccion.plan.publicado ·
 *   compra.calcular -> produccion.compra.calculada ·
 *   plan.aprobar/ejecutar/cerrar -> produccion.plan.estado.avanzado.
 *   El eventBus las emite a MQTT (topic core/STAR/events) y el frontend suscribe en
 *   dot notation. Doble confirmacion: dictamen RPC inmediato (201 con datos
 *   calculados) + senal que re-lee planes.listar (debounce 60ms).
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutacion va por mqttRequest y NUNCA asume estado local: el
 *        store solo escribe con datos de una lectura RPC (el dictamen del
 *        escalado/compra/plan viene en la propia respuesta).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): tras declarar,
 *        la senal re-dispara la lectura de planes.listar (informe) + recetario.
 *   INV6 — TODO RPC lleva project_id inyectado (leccion bug escandallo).
 *
 * Patron del repo: molde exacto de escandallo/stores/escandallo.ts —
 * mqttRequest + suscripcion dot notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas reales del contrato produccion-v1 (module.json tools)
// =============================================================================

/** Ingrediente de la receta original (lo que pide escalado.calcular). */
export interface IngredienteReceta {
  nombre: string;
  cantidad: number;
  unidad: string;
}

/** Dictamen del escalado (viene EN LA RESPUESTA de escalado.calcular). */
export interface EscaladoDictamen {
  escalado_id: string;
  receta_id: string;
  factor: number;
  ingredientes_escalados: Array<{
    nombre: string;
    cantidad: number;
    unidad: string;
  }>;
  [key: string]: unknown;
}

/** Linea de receta (recetas.listar { incluir_lineas } / recetas.obtener). */
export interface LineaReceta {
  ref?: string | null;
  nombre: string;
  cantidad: number;
  unidad: string;
  [key: string]: unknown;
}

/** Receta en el listado (recetas.listar) para el ref-select. */
export interface RecetaResumen {
  receta_id: string;
  nombre: string;
  tipo?: string;
  rinde?: { cantidad: number; unidad?: string } | null;
  lineas?: LineaReceta[];
  [key: string]: unknown;
}

/** Item de la lista de compra consolidada (compra.calcular). */
export interface ItemCompra {
  ingrediente: string;
  unidad: string;
  cantidad_neta: number;
  merma_pct?: number;
  [key: string]: unknown;
}

/** Dictamen de la lista de compra (viene EN LA RESPUESTA de compra.calcular). */
export interface CompraDictamen {
  compra_id: string;
  items_total: number;
  items: ItemCompra[];
  [key: string]: unknown;
}

/** Resumen de plan desde planes.listar (informe). */
export interface PlanResumen {
  id: string;
  horizonte_desde?: string;
  horizonte_hasta?: string;
  total_lineas: number;
  estado?: string;
  created_at?: string;
  [key: string]: unknown;
}

/** Resultado de plan.publicar (viene EN LA RESPUESTA). */
export interface PlanPublicado {
  plan_id: string;
  total_lineas: number;
  [key: string]: unknown;
}

// =============================================================================
// STORES — lecturas-only (R2): solo las lecturas RPC escriben aquí
// =============================================================================

const recetasStore = writable<RecetaResumen[]>([]);
const recetarioLoading = writable<boolean>(false);
const recetarioError = writable<string | null>(null);

/** Escalado activo (dictamen transitorio — INV2, nunca guarda la receta). */
export const escaladoActivo = writable<EscaladoDictamen | null>(null);
/** Dictamen de la lista de compra (INV5: consolida, no compra). */
export const compraActiva = writable<CompraDictamen | null>(null);

/** Planes publicados del proyecto (informe, neutro planes.listar). */
const planesStore = writable<PlanResumen[]>([]);
export const planesLoading = writable<boolean>(false);
export const planesError = writable<string | null>(null);

/** Contador de gestos en vuelo — la cinta muestra 'sincronizando…'. */
export const gestosPendientes = writable<number>(0);
/** Ultimo error de gesto global. */
export const errorMutacion = writable<string | null>(null);

/** Recetario exportado (el panel lo usa para el ref-select). */
export const recetario = derived(recetasStore, (lista) =>
  [...lista].sort((a, b) => String(a.nombre).localeCompare(String(b.nombre)))
);
/** Planes exportados (informe de la cinta). */
export const planes = derived(planesStore, (lista) =>
  [...lista].sort((a, b) => String(b.created_at || '').localeCompare(String(a.created_at || '')))
);

/** Cinta-estado: resumen de la planificacion (solo de lecturas, R2). */
export const cinta = derived(
  [recetasStore, escaladoActivo, compraActiva],
  ([$recetas, $escalado, $compra]) => ({
    recetas: $recetas.length,
    escaladoActivo: !!$escalado,
    compraActiva: !!$compra && ($compra.items?.length ?? 0) > 0,
    itemsCompra: $compra?.items?.length ?? 0
  })
);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** Formatea una cantidad cortando decimales sobrantes (cantidades, no moneda). */
export function formatearCantidad(n: number | null | undefined): string {
  if (typeof n !== 'number' || !Number.isFinite(n)) return '—';
  return Number.isInteger(n) ? String(n) : n.toFixed(2).replace(/\.?0+$/, '');
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las unicas escrituras del estado (R2)
// =============================================================================

/** Carga el recetario completo ({ incluir_lineas: true }) para el ref-select. */
export async function loadRecetario(): Promise<void> {
  const projectId = get(activeProjectId);
  if (!projectId) {
    recetarioError.set('project_id requerido');
    return;
  }
  recetarioLoading.set(true);
  recetarioError.set(null);
  try {
    const res = await mqttRequest<{ recetas?: RecetaResumen[]; total?: number }>('recetas', 'listar', {
      project_id: projectId,
      incluir_lineas: true,
      limit: 1000
    });
    recetasStore.set(res.data?.recetas ?? []);
  } catch (err) {
    recetarioError.set(describeError(err));
  } finally {
    recetarioLoading.set(false);
  }
}

/** Carga la lista de planes del proyecto (informe de la cinta — neutro). */
export async function loadPlanes(): Promise<void> {
  const projectId = get(activeProjectId);
  if (!projectId) {
    planesError.set('project_id requerido');
    return;
  }
  planesLoading.set(true);
  planesError.set(null);
  try {
    const res = await mqttRequest<{ planes?: PlanResumen[]; total?: number }>('mise-en-place', 'planes.listar', {
      project_id: projectId
    });
    planesStore.set(res.data?.planes ?? []);
  } catch (err) {
    planesError.set(describeError(err));
  } finally {
    planesLoading.set(false);
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetMiseEnPlace(): void {
  recetasStore.set([]);
  planesStore.set([]);
  escaladoActivo.set(null);
  compraActiva.set(null);
  recetarioError.set(null);
  planesError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (D · la triada) — mqttRequest + senal pareada (R3)
// =============================================================================

function requerirProjectId(): string {
  const pid = get(activeProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  return pid;
}

/** Pasa los `ingredientes` de la receta (para las porciones_origen) por INV1. */
function lineasComoIngredientes(receta: RecetaResumen): IngredienteReceta[] {
  return (receta.lineas ?? []).map((l) => ({
    nombre: l.nombre,
    cantidad: typeof l.cantidad === 'number' ? l.cantidad : 0,
    unidad: l.unidad ?? 'ud'
  }));
}

/**
 * ESCALAR la receta al volumen objetivo — escalado.calcular { receta_id,
 * porciones_origen, porciones_destino, ingredientes }. INV2: derivacion
 * transitoria, NO toca la receta canonica. El dictamen (factor +
 * ingredientes_escalados) viene EN LA RESPUESTA.
 */
export async function calcularEscalado(
  receta: RecetaResumen,
  porcionesOrigen: number,
  porcionesDestino: number
): Promise<EscaladoDictamen | null> {
  let projectId: string;
  try {
    projectId = requerirProjectId();
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  }
  const ingredientes = lineasComoIngredientes(receta);
  if (ingredientes.length === 0) {
    errorMutacion.set('la receta elegida no expone lineas/ingredientes');
    return null;
  }
  if (!porcionesDestino || porcionesDestino <= 0) {
    errorMutacion.set('porciones_destino debe ser un número > 0');
    return null;
  }
  gestosPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<EscaladoDictamen>('mise-en-place', 'escalado.calcular', {
      project_id: projectId,
      receta_id: receta.receta_id,
      porciones_origen: porcionesOrigen,
      porciones_destino: porcionesDestino,
      ingredientes
    });
    const dictamen = res.data ?? null;
    escaladoActivo.set(dictamen);
    return dictamen;
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  } finally {
    gestosPendientes.update((n) => n - 1);
  }
}

/**
 * PUBLICAR el plan de produccion — plan.publicar { horizonte_desde,
 * horizonte_hasta, lineas:[{ receta_id, porciones, franja }] }. El plan nace
 * 'propuesto' (INV3). Confirmador-nombrado: el panel nombra que se publica.
 */
export async function publicarPlan(
  horizonteDesde: string,
  horizonteHasta: string,
  lineas: Array<{ receta_id: string; porciones: number; franja: string; dia?: string }>
): Promise<PlanPublicado | null> {
  let projectId: string;
  try {
    projectId = requerirProjectId();
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  }
  gestosPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<PlanPublicado>('mise-en-place', 'plan.publicar', {
      project_id: projectId,
      horizonte_desde: horizonteDesde,
      horizonte_hasta: horizonteHasta,
      lineas
    });
    return res.data ?? null;
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  } finally {
    gestosPendientes.update((n) => n - 1);
  }
}

/**
 * CONSOLIDAR la lista de compra — compra.calcular { horizonte, recetas }.
 * Agrega los `ingredientes` ya escalados por (ingrediente, unidad) con
 * cantidad_neta (+ merma). INV5: consolida el dictamen, NO compra.
 */
export async function calcularCompra(
  horizonte: { tipo: string; desde?: string; hasta?: string; etiqueta?: string },
  recetas: Array<{ receta_id: string; porciones: number; ingredientes: Array<{ nombre: string; cantidad: number; unidad: string }> }>
): Promise<CompraDictamen | null> {
  let projectId: string;
  try {
    projectId = requerirProjectId();
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  }
  if (!recetas.length) {
    errorMutacion.set('no hay escalados que consolidar en la compra');
    return null;
  }
  gestosPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<CompraDictamen>('mise-en-place', 'compra.calcular', {
      project_id: projectId,
      horizonte,
      recetas
    });
    const dictamen = res.data ?? null;
    compraActiva.set(dictamen);
    return dictamen;
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  } finally {
    gestosPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — produccion.*.calculado/publicado/calculada re-leen
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo. */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES_MISE = [
  'produccion.escalado.calculado',
  'produccion.plan.publicado',
  'produccion.compra.calculada',
  'produccion.plan.estado.avanzado'
];

/**
 * Suscripcion a las senales pareadas de la triada. Tras declarar, la senal
 * re-dispara la lectura de planes.listar (informe) + recetario (R3, nunca
 * recarga). El debounce absorbe tandems legitimos (publicar + estado.avanzado
 * encadenados). SI la senal no llega (bus degradado), el dictamen RPC sigue
 * asignando el estado paso a paso — doble confirmacion.
 */
export function initMiseEnPlaceSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(pidSenal: string | undefined): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    if (pidSenal !== undefined && pidSenal !== activo) return; // senal de otro proyecto
    if (recargaProgramada) return; // debounce
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      if (get(activeProjectId)) {
        void loadPlanes();
        void loadRecetario();
      }
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    encolarRecarga(extraerProjectId(envelope));
  }

  for (const senal of SENALES_MISE) {
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
