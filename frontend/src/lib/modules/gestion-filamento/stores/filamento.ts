/**
 * Filamento Store — CUSTODIO del stock de filamento del taller 3D (F7, prisma-universal).
 *
 * Fuente de la lógica (verificada en el repo):
 *   - modules/gestion-filamento/index.js: contrato real de handlers/proyecciones.
 *   - modules/gestion-filamento/gestion-filamento.blueprint.json (F6½): ui.ops
 *     listar/registrar/decrementar con roles (trabajador / jefe / sistema).
 *   - modules/gestion-filamento/module.json: ui_handlers (domain 'gestion-filamento')
 *     que cablean el frontend a los handlers REALES del reflejo.
 *
 * CONTRATO REAL (index.js):
 *   - listar recibe { project_id } (opcional) → { filamentos[], total }, cada
 *     rollo con { id, tipo, color, longitud_inicial, longitud_restante, activo,
 *     bajo (derivado <= umbralBajo 5000mm) }. Es la op que alimenta la CINTA del
 *     stock del taller — la cara LECTORA del TRABAJADOR/operador y la vista viva
 *     del JEFE.
 *   - registrar recibe { project_id, tipo } obligatorios (400 si faltan) +
 *     { color?, longitud_inicial?, activo? } → { status:201, data:{ filamento } }.
 *     `activo: input.activo === true` (toggle del alta del JEFE). Es la ÚNICA
 *     escritura del custodio (append + emite filamento.registrado).
 *   - decrementar recibe { rollo_id, project_id, filament_used } → 404
 *     RESOURCE_NOT_FOUND si el rollo no existe; 409 LONGITUD_DESCONOCIDA
 *     (Invariante 9). NO es una cara de UI: lo dispara la IMPRESORA por evento
 *     filamento.usado contra el rollo activo. El panel solo se REFRESCA con su
 *     señal pareada.
 *
 * Señales pareadas (publicadores reales de index.js):
 *   registrar  → filamento.registrado · fallo → filamento.registrar.failed
 *   decrementar → filamento.decrementado · bajo → filamento.bajo
 *   — todas refrescan la cinta con debounce (R3, nunca recarga).
 *
 * Reglas de esquematización (F7):
 *   R2 — toda lectura/escritura va por mqttRequest y NUNCA asume estado local:
 *        el store solo escribe al recibir datos de la lectura RPC (listar).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): filamento.registrado
 *        / filamento.decrementado / filamento.bajo re-leen la cinta.
 *   DUALIDAD — listar es la lectura que alimenta TANTO la cara del TRABAJADOR
 *        (LECTOR del stock para operar la impresora) COMO la del JEFE (decidir si
 *        repone); registrar es la escritura exclusiva del JEFE (toggle activo).
 *        decrementar vive en el SISTEMA (impresora por evento). 'activar rollo'
 *        (marcar activo) es [ABIERTO]: hoy solo se fija como toggle de registrar,
 *        sin RPC dedicado onMarcarActivo — NO se inventa.
 *
 * Patrón del repo: molde exacto de modules/cola-impresion/stores/cola.ts
 * (3ª iteración de la práctica F7) — mqttRequest + suscripción con debounce +
 * cleanup para destroy + describeError + multi-tenant por sessionProjectId.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — forma real devuelta por filamento.listar / filamento.registrar
// =============================================================================

/**
 * Fila de la cinta del stock — lo que proyecta filamento.listar (columnas reales
 * de _listar en index.js).
 */
export interface RolloFilamento {
  id: string;
  /** Tipo de filamento (p.ej. PETG). Obligatorio al registrar (400 si falta). */
  tipo: string;
  /** Color del rollo (default 'desconocido'). */
  color: string;
  /** Longitud inicial declarada en mm, o null si el rollo nace de longitud desconocida. */
  longitud_inicial: number | null;
  /** Longitud restante en mm, o null si desconocida (nunca decrementable, Invariante 9). */
  longitud_restante: number | null;
  /** Cargado en la impresora (el que el sistema decrementa por filamento.usado). */
  activo: boolean;
  /** Derivado del módulo: longitud_restante <= umbralBajo (5000mm). */
  bajo: boolean;
  created_at?: string;
}

/** Payload del alta de rollo (registrar, ROL JEFE). */
export interface RolloAlta {
  tipo: string;
  color?: string;
  longitud_inicial?: number;
  activo?: boolean;
}

// =============================================================================
// ESTADO — lectura-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

interface FilamentoState {
  rollos: RolloFilamento[];
  loading: boolean;
  error: string | null;
  /** Confirmación viva de la señal pareada filamento.registrado (alta del jefe). */
  ultimaAccion: { tipo: string; rollo: string; cuando: string } | null;
}

const initialState: FilamentoState = {
  rollos: [],
  loading: false,
  error: null,
  ultimaAccion: null
};

export const filamentoStore = writable<FilamentoState>(initialState);

// ---- Derivados (readonly para componentes) ----
export const rollosFilamento = derived(filamentoStore, ($s) => $s.rollos);
export const filamentoLoading = derived(filamentoStore, ($s) => $s.loading);
export const filamentoError = derived(filamentoStore, ($s) => $s.error);
export const ultimaAccion = derived(filamentoStore, ($s) => $s.ultimaAccion);
/** Total de rollos en el stock del taller. */
export const totalRollos = derived(filamentoStore, ($s) => $s.rollos.length);
/** Rollos por debajo del umbral (bajo:true) — 'ten repuesto a mano'. */
export const rollosBajos = derived(filamentoStore, ($s) => $s.rollos.filter((r) => r.bajo).length);
/** Rollo activo (cargado en la impresora) o null. */
export const rolloActivo = derived(filamentoStore, ($s) => $s.rollos.find((r) => r.activo) ?? null);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — la única escritura (R2)
// =============================================================================

/**
 * Cinta del stock (listar): todos los rollos del proyecto con tipo/color/longitud
 * restante/activo/bajo. Lectura pura: la vista re-lee, nunca recarga. La consumen
 * TANTO el TRABAJADOR (LECTOR para operar la impresora) COMO el JEFE (decidir si
 * repone).
 */
export async function listarRollos(pid: string): Promise<void> {
  filamentoStore.update((s) => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest<{
      filamentos?: RolloFilamento[];
      total?: number;
    }>('gestion-filamento', 'listar', { project_id: pid });
    const data = res.data as unknown;
    const d = (data ?? {}) as { filamentos?: RolloFilamento[] };
    filamentoStore.update((s) => ({
      ...s,
      rollos: d.filamentos ?? [],
      loading: false
    }));
  } catch (err) {
    filamentoStore.update((s) => ({ ...s, loading: false, error: describeError(err) }));
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetFilamento(): void {
  filamentoStore.set(initialState);
}

// =============================================================================
// DECLARAR (ROL JEFE) — registrar rollo
// =============================================================================

/**
 * Da de alta un rollo de filamento en el store (append + emite filamento.registrado).
 * Es la escritura CLAVE del custodio, exclusiva del JEFE (el trabajador NO da de
 * alta rollos). Incluye el toggle 'activo' (si el rollo está cargado en la impresora).
 * Sin escritura local: la señal pareada re-lee la cinta (R3). Devuelve el id o lanza.
 */
export async function registrarRollo(pid: string, datos: RolloAlta): Promise<{ id: string }> {
  filamentoStore.update((s) => ({ ...s, error: null }));
  try {
    const res = await mqttRequest<{ filamento?: RolloFilamento }>('gestion-filamento', 'registrar', {
      project_id: pid,
      tipo: datos.tipo,
      color: datos.color || undefined,
      longitud_inicial: datos.longitud_inicial,
      activo: datos.activo ?? false
    });
    const id = res.data?.filamento?.id;
    // Confirmación viva inmediata; la señal filamento.registrado refrescará la cinta.
    filamentoStore.update((s) => ({
      ...s,
      ultimaAccion: { tipo: 'registrado', rollo: `${datos.tipo}${datos.color ? ` ${datos.color}` : ''}`, cuando: new Date().toISOString() }
    }));
    if (!id) throw new Error('el servidor no devolvió el id del rollo');
    return { id };
  } catch (err) {
    filamentoStore.update((s) => ({ ...s, error: describeError(err) }));
    throw err;
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura de la cinta
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como cola/historial). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

// Toda mutación del custodio/impresora emite su señal → la vista re-lee (nunca recarga).
const SEÑALES_FILAMENTO = ['filamento.registrado', 'filamento.decrementado', 'filamento.bajo'];

/**
 * Suscripción a las señales pareadas. El debounce absorbe tándems (registrado +
 * bajo en un mismo ciclo). Solo re-lee la cinta: NUNCA recarga.
 */
export function initFilamentoSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    const pid = get(sessionProjectId);
    if (!pid) return;
    if (recargaProgramada) return; // debounce: las señales pueden llegar en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(sessionProjectId);
      if (activo) void listarRollos(activo);
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SEÑALES_FILAMENTO) {
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
