/**
 * Cola Store — CUSTODIO de la cola de impresión 3D del taller (F7, prisma-universal).
 *
 * Fuente de la lógica (verificada en el repo):
 *   - modules/cola-impresion/index.js: contrato real de handlers/proyecciones.
 *   - modules/cola-impresion/cola-impresion.blueprint.json (F6½): ui.ops
 *     entrar/siguiente/reordenar/longitud/listar con roles (jefe / neutro).
 *   - modules/cola-impresion/module.json: ui_handlers (domain 'cola-impresion')
 *     que cablean el frontend a los handlers REALES del reflejo.
 *
 * CONTRATO REAL (index.js):
 *   - listar recibe { project_id } obligatorio (400 si falta) →
 *     { project_id, items[], total, pendientes, materialCargado } ordenado por
 *     posición. Cada item: { id, estado (pendiente|imprimiendo|hecho|retirada),
 *     orden, modelo_id, nombre, material, urgencia (1..5), tamano (mm³),
 *     creada_en, extraida_en }. Es la op que alimenta la CINTA de la cola.
 *   - entrar recibe { project_id, modelo_id, nombre } obligatorios (400 si
 *     faltan) + { material?, urgencia?, tamano? } → { status:201, data:{ item } }.
 *     Valida catalogo.obtener (RPC best-effort, 404 si el modelo no existe) y no
 *     duplicado pendiente por modelo_id (409 ALREADY_EXISTS). Es la ESCRITURA
 *     clave del jefe (rol JEFE).
 *   - siguiente recibe { project_id } → { item } o { vacia:true, item:null }.
 *     Extrae la pieza que toca según el motor _ordenar; ajusta materialCargado.
 *     Es la cara de decisión fría (disparador del jefe).
 *   - reordenar recibe { project_id, item_id, pos } (pos 1-based, clamp 1..len) →
 *     { item_id, pos, total_pendientes }. Solo piezas pendientes (409 CONFLICT_STATE
 *     si no); item inexistente 404. Gesto de CORRECCIÓN del jefe.
 *   - longitud recibe { project_id } → { pendientes, total }. Pulso del jefe;
 *     lectura pura, sin señal.
 *
 * Señales pareadas (publicadores reales de index.js):
 *   entrar → cola.entrada · fallo → cola.entrar.failed
 *   siguiente → cola.extraccion · vacía → cola.vacia
 *   reordenar → cola.reordenada
 *   — todas refrescan la cinta con debounce (R3, nunca recarga).
 *
 * Reglas de esquematización (F7):
 *   R2 — toda lectura/escritura va por mqttRequest y NUNCA asume estado local:
 *        el store solo escribe al recibir datos de la lectura RPC (listar).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): cola.entrada /
 *        cola.extraccion / cola.reordenada / cola.vacia re-leen la cinta.
 *   DUALIDAD — entrar + reordenar + siguiente son las escrituras/disparos del
 *        JEFE; longitud + listar son lecturas neutras que las alimentan.
 *        La cola NUNCA decide qué imprimir (invariante 6): solo ordena lo aprobado.
 *
 * Patrón del repo: molde exacto de modules/historial-impresiones/stores/historial.ts
 * (3ª iteración de la práctica F7) — mqttRequest + suscripción con debounce +
 * cleanup para destroy + describeError + multi-tenant por sessionProjectId.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — forma real devuelta por cola.listar / cola.siguiente
// =============================================================================

/** Estados reales del ciclo de la pieza (index.js ESTADOS). */
export type EstadoCola = 'pendiente' | 'imprimiendo' | 'hecho' | 'retirada';

/** Fila de la cinta — lo que proyecta cola.listar (columnas reales de _listar). */
export interface ItemCola {
  id: string;
  estado: EstadoCola;
  orden: number;
  modelo_id: string;
  nombre: string;
  /** Huecos como 'desconocido' (invariante 5), nunca inventados. */
  material: string;
  /** Prioridad declarada del dueño, 1..5 (clamp en el módulo). */
  urgencia: number;
  /** Tamaño estimado en mm³ (0 = desconocido). */
  tamano: number;
  creada_en?: string;
  extraida_en?: string | null;
}

/** Payload del alta de pieza (entrar). */
export interface ColaAlta {
  modelo_id: string;
  nombre: string;
  material?: string;
  urgencia?: number;
  tamano?: number;
}

/** Pieza extraída como siguiente (cola.siguiente → data.item o vacía). */
export interface SiguienteResult {
  vacia: boolean;
  item: ItemCola | null;
  materialCargado?: string | null;
}

// =============================================================================
// ESTADO — lectura-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

interface ColaState {
  items: ItemCola[];
  materialCargado: string | null;
  loading: boolean;
  error: string | null;
  mutacionesPendientes: number;
  /** Confirmación viva de la señal pareada (cola.entrada / cola.extraccion). */
  ultimaAccion: { tipo: string; nombre: string; materialCargado?: string | null; cuando: string } | null;
  /** Aviso de cola vacía (cola.vacia) → el dueño decide si entra más. */
  colaVacia: boolean;
}

const initialState: ColaState = {
  items: [],
  materialCargado: null,
  loading: false,
  error: null,
  mutacionesPendientes: 0,
  ultimaAccion: null,
  colaVacia: false
};

export const colaStore = writable<ColaState>(initialState);

// ---- Derivados (readonly para componentes) ----
export const itemsCola = derived(colaStore, ($s) => $s.items);
export const materialCargado = derived(colaStore, ($s) => $s.materialCargado);
export const colaLoading = derived(colaStore, ($s) => $s.loading);
export const colaError = derived(colaStore, ($s) => $s.error);
export const mutacionesPendientes = derived(colaStore, ($s) => $s.mutacionesPendientes);
export const ultimaAccion = derived(colaStore, ($s) => $s.ultimaAccion);
export const colaVacia = derived(colaStore, ($s) => $s.colaVacia);
/** Pendientes = los que esperan ser impresos (el trabajo del jefe). */
export const pendientesCola = derived(colaStore, ($s) =>
  $s.items.filter((i) => i.estado === 'pendiente')
);
/** Total de items vivos en la cola (todos los estados). */
export const totalCola = derived(colaStore, ($s) => $s.items.length);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — la única escritura (R2)
// =============================================================================

/**
 * Cinta de la cola (listar): todos los items del proyecto en su orden (pendientes
 * primero, luego imprimiendo/hecho/retirada), + materialCargado para el badge.
 * Lectura pura: la vista re-lee, nunca recarga.
 */
export async function loadCola(pid: string): Promise<void> {
  colaStore.update((s) => ({ ...s, loading: true, error: null, colaVacia: false }));
  try {
    const res = await mqttRequest<{
      items?: ItemCola[];
      total?: number;
      pendientes?: number;
      materialCargado?: string | null;
    }>('cola-impresion', 'listar', { project_id: pid });
    const data = res.data as unknown;
    const d = (data ?? {}) as {
      items?: ItemCola[];
      materialCargado?: string | null;
    };
    colaStore.update((s) => ({
      ...s,
      items: d.items ?? [],
      materialCargado: d.materialCargado ?? null,
      loading: false,
      colaVacia: (d.items?.length ?? 0) === 0 || (d.items?.every((i) => i.estado !== 'pendiente') ?? true)
    }));
  } catch (err) {
    colaStore.update((s) => ({ ...s, loading: false, error: describeError(err) }));
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCola(): void {
  colaStore.set(initialState);
}

// =============================================================================
// DECLARAR / DECIDIR (ROL JEFE)— entrar · reordenar · siguiente
// =============================================================================

/**
 * Entra una pieza aprobada en la cola (append + emite cola.entrada). Es la
 * escritura clave del custodio. Sin escritura local: la señal pareada re-lee la
 * cinta (R3). Devuelve el id del item o lanza.
 */
export async function entrarPieza(pid: string, datos: ColaAlta): Promise<{ id: string }> {
  colaStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes + 1, error: null }));
  try {
    const res = await mqttRequest<{ item?: ItemCola }>('cola-impresion', 'entrar', {
      project_id: pid,
      ...datos
    });
    const id = res.data?.item?.id;
    // Confirmación viva inmediata; la señal refrescará la cinta.
    colaStore.update((s) => ({
      ...s,
      ultimaAccion: { tipo: 'entrada', nombre: datos.nombre, cuando: new Date().toISOString() }
    }));
    if (!id) throw new Error('el servidor no devolvió el id del item');
    return { id };
  } catch (err) {
    colaStore.update((s) => ({ ...s, error: describeError(err) }));
    throw err;
  } finally {
    colaStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes - 1 }));
  }
}

/**
 * Extrae la siguiente pieza según el motor de ordenación (siguiente). Es la cara
 * de decisión fría del jefe: qué imprime ahora. Si la cola está vacía el módulo
 * emite cola.vacia → colaVacia para que el dueño decida si entra más.
 */
export async function siguientePieza(pid: string): Promise<SiguienteResult> {
  colaStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes + 1, error: null }));
  try {
    const res = await mqttRequest<SiguienteResult>(
      'cola-impresion',
      'siguiente',
      { project_id: pid }
    );
    const data = res.data ?? { vacia: true, item: null };
    // Confirmación viva; la señal re-lee la cinta.
    colaStore.update((s) => {
      const vacia = !!data.vacia;
      return {
        ...s,
        colaVacia: vacia,
        materialCargado: data.materialCargado ?? s.materialCargado ?? null,
        ultimaAccion: {
          tipo: vacia ? 'vacia' : 'extraccion',
          nombre: data.item?.nombre ?? '—',
          materialCargado: data.materialCargado ?? s.materialCargado ?? null,
          cuando: new Date().toISOString()
        }
      };
    });
    return data;
  } catch (err) {
    colaStore.update((s) => ({ ...s, error: describeError(err) }));
    throw err;
  } finally {
    colaStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes - 1 }));
  }
}

/**
 * Sube/baja una pieza pendiente a una posición (1-based). Es la mano del dueño
 * para corregir la prioridad que el motor propone. Solo pendientes (409 si no).
 * La señal cola.reordenada re-lee el orden propuesto (R3).
 */
export async function reordenarPieza(pid: string, item_id: string, pos: number): Promise<void> {
  colaStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes + 1, error: null }));
  try {
    await mqttRequest<Record<string, unknown>>('cola-impresion', 'reordenar', {
      project_id: pid,
      item_id,
      pos
    });
    // Confirmación viva; la señal cola.reordenada refrescará el orden.
    colaStore.update((s) => ({
      ...s,
      ultimaAccion: { tipo: 'reordenado', nombre: '', cuando: new Date().toISOString() }
    }));
  } catch (err) {
    colaStore.update((s) => ({ ...s, error: describeError(err) }));
    throw err;
  } finally {
    colaStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes - 1 }));
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura de la cinta
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como historial). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

// Toda mutación del custodio emite su señal → la vista re-lee (nunca recarga).
const SEÑALES_COLA = ['cola.entrada', 'cola.extraccion', 'cola.reordenada', 'cola.vacia'];

/**
 * Suscripción a las señales pareadas. El debounce absorbe tándems (entrada +
 * reordenada en un mismo ciclo del jefe). Solo re-lee la cinta: NUNCA recarga.
 */
export function initColaSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    const pid = get(sessionProjectId);
    if (!pid) return;
    if (recargaProgramada) return; // debounce: las señales pueden llegar en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(sessionProjectId);
      if (activo) void loadCola(activo);
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SEÑALES_COLA) {
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
