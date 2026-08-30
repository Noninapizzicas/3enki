/**
 * Escandallo Store — la cara del JEFE sobre el costeo (F7, composición según
 * esquema-jefe/ de escandallo, commit 1): cinta-estado + tabla-cálculo +
 * gestos de regeneración. Módulo ATÍPICO: el jefe NO escribe reglas del
 * dominio — LEE el dictamen del motor (INV1) y DISPARA costeos.
 *
 * Fuente de la lógica (verificada en el repo, escandallo reflejo-1.4.0):
 *   - modules/pizzepos/escandallo/index.js: contrato real de handlers y señales.
 *   - modules/pizzepos/escandallo/esquema-jefe/ (pasadas 1-3): composición,
 *     invariantes, señales pareadas.
 *
 * CONTRATO REAL (index.js + recetas/index.js — lecturas y gestos):
 *   - recetas.listar { incluir_lineas: true } → { recetas[]: {receta_id, nombre,
 *     tipo, rinde, lineas_count, lineas[], coste_unidad} } — con líneas y coste
 *     persistido, la materia prima de la cinta y de la tabla-cálculo.
 *   - recetas.obtener { receta_id } → la receta completa (spread directo en
 *     data, SIN envoltorio .receta) + coste_total/coste_unidad/lineas_detalle/
 *     lineas_sin_precio/fuentes_precios cuando la tiene.
 *   - escandallo.costear { receta_id, persistir? } → 200 {coste_total,
 *     coste_unidad, rinde, lineas_detalle[{ref,nombre,cantidad,unidad,
 *     precio_unitario,valor_calculado,fuente}], lineas_sin_precio[],
 *     fuentes_precios[]} + 1× señal (persiste por defecto con receta_id).
 *   - escandallo.recalcular_siguiente { solo_pendientes? } → 200 {terminado,
 *     faltan, costeada{receta_id,nombre,coste_unidad,lineas_sin_precio},
 *     siguiente} + 1× señal. Devuelve "vuelve a llamar" — el botón es un gesto
 *     repetible, no un spinner eterno.
 *   - escandallo.recalcular_lote { solo_pendientes? } → 200 {costeadas[],
 *     total_costeadas, sin_precio[], terminado} + N× señal (1 por receta,
 *     publicada EN el bucle).
 *   - escandallo.escalar {receta_id, diametro_origen=33, diametro_destino} →
 *     200 {factores, lineas_escaladas[], coste…} — NO persiste, única hoja SIN
 *     señal: la respuesta RPC ES la confirmación (INV5).
 *   - Moneda EUROS (INV2): coste_total 2dec · coste_unidad a 6 dec por
 *     sub-recetas. La UI muestra €, sin conversión a céntimos.
 *   - SIN margen: precios de venta y food cost objetivo NO existen ([ABIERTO])
 *     — el panel no los inventa.
 *
 * Señales pareadas (publicador real: _persistir de index.js):
 *   recalcular_siguiente · costear-con-receta → escandallo.coste.calculado 1× ·
 *   recalcular_lote → N× (una POR receta, dentro del bucle) ·
 *   costeo externo (otra ventana/agente) → misma señal — la cinta late igual.
 *
 * Reglas del esquema-jefe:
 *   R2 — el store solo escribe estado al recibir datos de una lectura RPC (la
 *        señal no muta estado: dispara RE-LECTURA; su único uso directo es el
 *        filtro de proyecto).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): N señales del
 *        lote se absorben con debounce (60ms) y una única re-lectura.
 *
 * Patrón del repo: molde exacto de modules/ingredientes/stores/ingredientes.ts —
 * mqttRequest + suscripción dot-notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas reales devueltas por recetas.listar/obtener + escandallo.*
// =============================================================================

/** Línea de receta tal como la devuelve recetas.listar {incluir_lineas} (schema receta). */
export interface LineaReceta {
  ref: string;
  nombre: string;
  cantidad: number;
  unidad: 'g' | 'ml' | 'ud';
  notas?: string;
  [key: string]: unknown;
}

/** Línea del desglose de costeo (escandallo._costear → lineas_detalle). */
export interface LineaDetalle {
  ref: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  /** € por unidad canónica (kg/l convertidos → precio/1000). */
  precio_unitario: number;
  /** cantidad × precio_unitario (6dec por sub-recetas). */
  valor_calculado: number;
  /** catalogo | sub_receta — procedencia del precio (INV6). */
  fuente: string;
  [key: string]: unknown;
}

/** Receta en el listado (con lineas y coste_unidad al pedir incluir_lineas). */
export interface RecetaResumen {
  receta_id: string;
  nombre: string;
  tipo?: string;
  rinde?: { cantidad: number; unidad: 'ud' | 'g' | 'ml' };
  lineas_count: number;
  incompleta?: boolean;
  estado_operativo: string;
  lineas?: LineaReceta[];
  /** € a 6dec (null si aún sin costear). */
  coste_unidad?: number | null;
  [key: string]: unknown;
}

/** Ficha completa desde recetas.obtener (spread directo + costeo persistido). */
export interface RecetaDetalle {
  id?: string;
  receta_id?: string;
  nombre: string;
  tipo?: string;
  rinde?: { cantidad: number; unidad: 'ud' | 'g' | 'ml' };
  lineas?: LineaReceta[];
  coste_total?: number | null;
  coste_unidad?: number | null;
  coste_actualizado_at?: string | null;
  lineas_detalle?: LineaDetalle[];
  lineas_sin_precio?: string[];
  fuentes_precios?: string[];
  [key: string]: unknown;
}

/** Resultado de costear (op costear, respuesta RPC). */
export interface CosteoReceta {
  coste_total: number;
  coste_unidad: number;
  rinde?: { cantidad: number; unidad: string };
  lineas_detalle: LineaDetalle[];
  lineas_sin_precio: string[];
  fuentes_precios: string[];
  [key: string]: unknown;
}

/** Resultado de recalcular_siguiente (1 receta costeada, restantes). */
export interface ResultadoSiguiente {
  costeada: { receta_id: string; nombre: string; coste_unidad: number; lineas_sin_precio: number } | null;
  faltan: number;
  terminado: boolean;
  siguiente: string;
  [key: string]: unknown;
}

/** Resultado de recalcular_lote (batch determinista, N persistencias). */
export interface ResultadoLote {
  costeadas: Array<{ receta_id: string; nombre: string; coste_unidad: number; lineas_sin_precio: number }>;
  total_costeadas: number;
  sin_precio: string[];
  terminado: boolean;
  [key: string]: unknown;
}

/** Derivación transitoria de escalar (NO persiste — INV5). */
export interface ResultadoEscalado {
  diametro_origen: number;
  diametro_destino: number;
  factor_masa: number;
  factor_area: number;
  rinde?: { cantidad: number; unidad: string };
  coste_total: number;
  coste_unidad: number;
  lineas_escaladas: Array<{ ref: string; nombre: string; cantidad: number; unidad: string; es_masa: boolean }>;
  lineas_sin_precio: string[];
  fuentes_precios: string[];
  [key: string]: unknown;
}

// =============================================================================
// LOCALES del store — cinta + recetas + receta activa + dictámenes transitorios
// =============================================================================

const recetasStore = writable<RecetaResumen[]>([]);
export const cintaLoading = writable<boolean>(false);
export const cintaError = writable<string | null>(null);

/** id de la receta abierta en la tabla-cálculo. */
export const recetaIdActiva = writable<string | null>(null);
/** Diccionario completo (recetas.obtener) de la receta activa. */
export const recetaDetalle = writable<RecetaDetalle | null>(null);
/** Dictamen transitorio de escalar (derivación, nunca guardada — INV5). */
export const escaladoActivo = writable<ResultadoEscalado | null>(null);
/** Último aviso de recalcular_siguiente (costeada X, faltan N). */
export const resultadoSiguiente = writable<ResultadoSiguiente | null>(null);

/** Contador de gestos en vuelo — la cinta muestra "costeando…". */
export const gestosPendientes = writable<number>(0);
/** Último error de gesto global. */
export const errorMutacion = writable<string | null>(null);

/** Lectura exportada del store crudo (el panel la re-ordena con ORDEN_TIPO). */
export const recetas = recetasStore;
export const cinta = derived(recetasStore, (recetas) => {
  const conRecetas = recetas.filter((r) => Array.isArray(r.lineas) && r.lineas.length > 0);
  const conCoste = recetas.filter((r) => typeof r.coste_unidad === 'number' && r.coste_unidad > 0);
  const suma = conCoste.reduce((acc, r) => acc + (r.coste_unidad ?? 0), 0);
  return {
    recetas: recetas.length,
    escandalizadas: conCoste.length,
    costeMedio: conCoste.length > 0 ? suma / conCoste.length : null
  };
});

/** Fila de la tabla-cálculo: ingrediente × cantidad = coste de línea (dictamen). */
export interface FilaEscandallo {
  ref: string;
  nombre: string;
  cantidad: number;
  unidad: string;
  precioUnitario: number | null;
  valor: number | null;
  fuente: string | null;
  /** % de presentación sobre coste_total (INV1: la única cuenta permitida en UI). */
  pesoPct: number | null;
  /** true si la línea aún no tiene precio resuelto en catálogo (INV7). */
  sinPrecio: boolean;
}

/**
 * Tabla-cálculo de la receta activa: cruza lineas (receta) con lineas_detalle
 * (dictamen del motor, por ref+nombre). La UI NUNCA calcula coste (INV1) —
 * valor y precio vienen del dictamen; solo deriva el % de presentación.
 */
export const tablaEscandallo = derived(recetaDetalle, (detalle): FilaEscandallo[] | null => {
  if (!detalle) return null;
  const detallePorRef = new Map<string, LineaDetalle>();
  for (const d of detalle.lineas_detalle ?? []) {
    if (d && d.ref) detallePorRef.set(d.ref, d);
  }
  const lineas = (detalle.lineas ?? []).every((l) => !detallePorRef.has(l.ref)) && (detalle.lineas_detalle ?? []).length > 0
    ? (detalle.lineas_detalle ?? []).map((d) => ({ ref: d.ref, nombre: d.nombre, cantidad: d.cantidad, unidad: d.unidad }))
    : detalle.lineas ?? [];
  const total = (detalle.coste_total ?? 0) || 0;
  return lineas.map((l) => {
    const det = detallePorRef.get(l.ref) ?? null;
    const valor = det && typeof det.valor_calculado === 'number' ? det.valor_calculado : null;
    return {
      ref: l.ref,
      nombre: l.nombre,
      cantidad: typeof l.cantidad === 'number' ? l.cantidad : 0,
      unidad: l.unidad ?? 'ud',
      precioUnitario: det?.precio_unitario ?? null,
      valor,
      fuente: det?.fuente ?? null,
      pesoPct: det && total > 0 && typeof valor === 'number' ? Math.round((valor / total) * 1000) / 10 : null,
      sinPrecio: !det
    } satisfies FilaEscandallo;
  });
});

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** € (es-ES) — coste_total 2dec; unidad admite más decimales (6dec sub-recetas). */
export function formatearEuros(euros: number | null | undefined, maxDecimales = 2): string {
  if (typeof euros !== 'number' || !Number.isFinite(euros)) return '—';
  return new Intl.NumberFormat('es-ES', {
    style: 'currency',
    currency: 'EUR',
    minimumFractionDigits: 2,
    maximumFractionDigits: Math.max(2, Math.min(6, maxDecimales))
  }).format(euros);
}

/** Precio unitario por unidad canónica (€/kg es el precio/1000 que trae el motor). */
export function formatearPrecioUnitario(precio: number | null | undefined, unidad: string | null): string {
  if (typeof precio !== 'number' || !Number.isFinite(precio)) return '—';
  const sufijo = unidad === 'g' || unidad === 'ml' ? ' €/' + unidad : ' €/ud';
  return precio.toFixed(precio > 0 && precio < 0.01 ? 6 : 2) + sufijo;
}

// =============================================================================
// LECTURAS (INFORMARSE) — las únicas escrituras del estado (R2)
// =============================================================================

/** Resumen de TODAS las recetas con líneas + coste vigente (la materia del costeo). */
export async function loadResumen(): Promise<void> {
  cintaLoading.set(true);
  cintaError.set(null);
  try {
    const res = await mqttRequest<{ recetas?: RecetaResumen[]; total?: number }>(
      'recetas',
      'listar',
      { incluir_lineas: true, limit: 1000 }
    );
    recetasStore.set(res.data?.recetas ?? []);
  } catch (err) {
    cintaError.set(describeError(err));
  } finally {
    cintaLoading.set(false);
  }
}

/** Ficha completa de la receta elegida (ref-select) con su dictamen persistido. */
export async function elegirReceta(recetaId: string | null): Promise<void> {
  recetaIdActiva.set(recetaId);
  escaladoActivo.set(null);
  resultadoSiguiente.set(null);
  if (!recetaId) {
    recetaDetalle.set(null);
    return;
  }
  try {
    const res = await mqttRequest<RecetaDetalle>('recetas', 'obtener', { receta_id: recetaId });
    recetaDetalle.set(res.data ?? null);
  } catch (err) {
    recetaDetalle.set(null);
    errorMutacion.set(describeError(err));
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetEscandallo(): void {
  recetasStore.set([]);
  recetaIdActiva.set(null);
  recetaDetalle.set(null);
  escaladoActivo.set(null);
  resultadoSiguiente.set(null);
  cintaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (D1 · disparos de costeo) — mqttRequest + señal pareada (R3)
// =============================================================================

function requerirProjectId(): string | null {
  return get(activeProjectId) ?? null;
}

/**
 * COSTEAR la receta activa — costear { receta_id } (persiste por defecto).
 * La señal pareada (1× escandallo.coste.calculado) re-lee (R3).
 */
export async function costearReceta(recetaId: string): Promise<void> {
  const projectId = requerirProjectId();
  gestosPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('escandallo', 'costear', { project_id: projectId, receta_id: recetaId });
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    gestosPendientes.update((n) => n - 1);
  }
}

/**
 * RECALCULAR SIGUIENTE — regenera el coste de la siguiente receta pendiente
 * (orden masa/salsa/base → pizza). La respuesta nombra a la costeada y cuántas
 * faltan; el gesto se puede repetir (el motor dice "vuelve a llamar").
 */
export async function recalcularSiguiente(): Promise<ResultadoSiguiente | null> {
  const projectId = requerirProjectId();
  gestosPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<ResultadoSiguiente>('escandallo', 'recalcular_siguiente', {
      project_id: projectId
    });
    const resultado = res.data ?? null;
    resultadoSiguiente.set(resultado);
    return resultado;
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  } finally {
    gestosPendientes.update((n) => n - 1);
  }
}

/**
 * RECALCULAR LOTE — costea TODAS las pendientes en una llamada. El motor
 * persiste cada receta EN el bucle → N señales pareadas que el debounce
 * absorbe en UNA re-lectura (R3).
 */
export async function recalcularLote(): Promise<ResultadoLote | null> {
  const projectId = requerirProjectId();
  gestosPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<ResultadoLote>('escandallo', 'recalcular_lote', {
      project_id: projectId
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
 * ESCALAR por superficie — derivación TRANSITORIA (no persiste, sin señal:
 * INV5). La respuesta RPC es su propia confirmación y solo vive en pantalla.
 */
export async function escalarReceta(
  recetaId: string,
  diametroOrigen: number,
  diametroDestino: number
): Promise<ResultadoEscalado | null> {
  if (!diametroDestino || diametroDestino <= 0) return null;
  const projectId = requerirProjectId();
  gestosPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<ResultadoEscalado>('escandallo', 'escalar', {
      project_id: projectId,
      receta_id: recetaId,
      diametro_origen: diametroOrigen > 0 ? diametroOrigen : 33,
      diametro_destino: diametroDestino
    });
    const resultado = res.data ?? null;
    escaladoActivo.set(resultado);
    return resultado;
  } catch (err) {
    errorMutacion.set(describeError(err));
    return null;
  } finally {
    gestosPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — escandallo.coste.calculado → re-lectura (nunca recarga)
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como ingredientes). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

/**
 * Suscripción a la señal pareada costear/siguiente (1×) / lote (N×). El
 * debounce absorbe el tándem N×1 del lote (UNA señal POR receta) en una única
 * re-lectura. La señal también llega de costeos externos (otra ventana u
 * agente): la cinta late igual aunque el jefe no toque nada.
 */
export function initEscandalloSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(pidSenal: string | undefined): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    if (pidSenal !== undefined && pidSenal !== activo) return; // señal de otro proyecto
    if (recargaProgramada) return; // debounce: el lote llega como N señales en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      void loadResumen();
      // si hay una ficha abierta, también se re-lee (es SOLO lectura: R2)
      const activa = get(recetaIdActiva);
      if (activa) {
        void mqttRequest<RecetaDetalle>('recetas', 'obtener', {
          project_id: activo, receta_id: activa
        })
          .then((res) => recetaDetalle.set(res.data ?? null))
          .catch(() => recetaDetalle.set(null));
      }
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const e = envelope as { project_id?: string; data?: { project_id?: string } } | null;
    const pid = e?.project_id ?? e?.data?.project_id;
    if (pid !== undefined && pid !== activo) return;
    encolarRecarga(pid);
  }

  unsubs.push(mqttSubscribe('escandallo.coste.calculado', onSenal));

  return () => {
    if (recargaProgramada) {
      clearTimeout(recargaProgramada);
      recargaProgramada = null;
    }
    unsubs.forEach((u) => u());
  };
}