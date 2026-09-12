/**
 * Historial Store — CUSTODIO puro del proyecto 3D, memoria del taller (F7, prisma-universal).
 *
 * Fuente de la lógica (verificada en el repo):
 *   - modules/historial-impresiones/index.js: contrato real de handlers/proyecciones.
 *   - modules/historial-impresiones/historial-impresiones.blueprint.json (F6½): ui.ops
 *     listar (rol JEFE, LECTOR puro) / registrar (rol neutro, sistema).
 *
 * CONTRATO REAL (index.js):
 *   - listar recibe { project_id } obligatorio (400 si falta) →
 *     { project_id, registros[], total } más reciente primero. Si no hay store:
 *     { registros: [], total: 0 } (estado vacío sin error). Cada registro append-only:
 *     { id, project_id, modelo_id, modelo_nombre, material, filamento_usado, tiempo,
 *       resultado, fecha, registrado_en }. Huecos como 'desconocido' (invariante 5,
 *       dato ausente nombrado, nunca inventado). Lectura pura, sin señal propia.
 *   - registrar recibe { project_id, modelo_id } obligatorios + campos opcionales →
 *     { project_id, id, registrado }. Rol neutro/sistema: en el flujo normal lo invoca
 *     ciclo-impresion por RPC o entra por impresion.completada (onImpresionCompletada,
 *     fire-and-forget). NO es gesto del jefe → este panel NO lo expone (jefe LECTOR).
 *
 * Señal pareada (publicador real de index.js):
 *   registro → historial.impresion_registrada · fallo → historial.registrar.failed
 *   — la cinta re-lee al recibir la señal (R3, nunca recarga). El jefe se refresca SOLO
 *   por la señal de ESCRITURA del sistema historial.impresion_registrada.
 *
 * Reglas de esquematización (F7):
 *   R2 — toda lectura va por mqttRequest y NUNCA asume estado local: el store solo
 *        escribe al recibir datos de la lectura RPC (listar).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): al completarse una
 *        impresión, la señal historial.impresion_registrada re-lee la cinta y el nuevo
 *        registro aparece arriba del todo.
 *   DUALIDAD — el jefe es LECTOR: listar es su único gesto real. registrar es del
 *        sistema (ciclo-impresion / impresion.completada), NO del jefe → sin botón de
 *        alta en el panel, cinta cronológica pura.
 *
 * Patrón del repo: molde exacto de modules/catalogo-modelos/stores/catalogo.ts (2ª
 * iteración de la práctica F7) — mqttRequest + suscripción con debounce + cleanup para
 * destroy + describeError + multi-tenant por sessionProjectId.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — forma real devuelta por historial.listar
// =============================================================================

/** Registro del historial — lo que almacena el custodio (append-only, inmutable). */
export interface RegistroHistorial {
  id: string;
  project_id?: string;
  modelo_id: string;
  /** Huecos como 'desconocido' (invariante 5), nunca inventados. */
  modelo_nombre: string;
  material: string;
  filamento_usado: string;
  tiempo: string;
  resultado: string;
  /** Fecha transportada por la impresión (impresion.completada). */
  fecha?: string;
  /** Inmutable — lo fija el módulo al registrar. */
  registrado_en?: string;
}

// =============================================================================
// ESTADO — lectura-only (R2): solo la respuesta de listar escribe aquí
// =============================================================================

interface HistorialState {
  registros: RegistroHistorial[];
  loading: boolean;
  error: string | null;
  /** Confirmación viva de la señal pareada (impresion_registrada). */
  ultimoRegistrado: { modelo_id: string; modelo_nombre: string; resultado: string; cuando: string } | null;
}

const initialState: HistorialState = {
  registros: [],
  loading: false,
  error: null,
  ultimoRegistrado: null
};

export const historialStore = writable<HistorialState>(initialState);

// ---- Derivados (readonly para componentes) ----
export const registros = derived(historialStore, ($s) => $s.registros);
export const historialLoading = derived(historialStore, ($s) => $s.loading);
export const historialError = derived(historialStore, ($s) => $s.error);
export const totalRegistros = derived(historialStore, ($s) => $s.registros.length);
/** Confirmación viva de la señal pareada (historial.impresion_registrada). */
export const ultimoRegistrado = derived(historialStore, ($s) => $s.ultimoRegistrado);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — la única escritura (R2)
// =============================================================================

/**
 * Cinta cronológica del historial (listar): todos los registros del proyecto, más
 * reciente primero, + total. Lectura pura: la vista re-lee, nunca recarga.
 */
export async function loadHistorial(pid: string): Promise<void> {
  historialStore.update((s) => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest<{ registros?: RegistroHistorial[]; total?: number }>(
      'historial',
      'listar',
      { project_id: pid }
    );
    historialStore.update((s) => ({
      ...s,
      registros: res.data?.registros ?? [],
      loading: false
    }));
  } catch (err) {
    historialStore.update((s) => ({ ...s, loading: false, error: describeError(err) }));
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetHistorial(): void {
  historialStore.set(initialState);
}

// =============================================================================
// SEÑAL-REFRESH (R3) — la señal real del módulo → re-lectura de la cinta
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como catalogo). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

// El jefe se refresca SOLO por la señal de ESCRITURA del sistema. historial.registrar.failed
// solo importaría si el jefe tuviera registro manual [ABIERTO] (no es el caso) — se ignora.
const SEÑALES_HISTORIAL = ['historial.impresion_registrada'];

/**
 * Suscripción a la señal pareada. El jefe NO escribe: la cinta se refresca cuando una
 * impresión se completa y el sistema emite historial.impresion_registrada. Debounce
 * absorbe tándems. Solo re-lee la cinta: NUNCA recarga la vista.
 */
export function initHistorialSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    const pid = get(sessionProjectId);
    if (!pid) return;
    if (recargaProgramada) return; // debounce: las señales pueden llegar en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(sessionProjectId);
      if (activo) void loadHistorial(activo);
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    // Confirmación viva: el registro que acaba de entrar aparece arriba de la cinta.
    // El evento historial.impresion_registrada NO trae modelo_nombre (solo project_id, id,
    // modelo_id, resultado) → mostramos el modelo_id real, nunca 'desconocido' inventado.
    const e = envelope as { modelo_id?: string; modelo_nombre?: string; resultado?: string; id?: string };
    if (e?.id || e?.modelo_id) {
      historialStore.update((s) => ({
        ...s,
        ultimoRegistrado: {
          modelo_id: e.modelo_id ?? '—',
          modelo_nombre: e.modelo_nombre ?? e.modelo_id ?? '—',
          resultado: e.resultado ?? 'desconocido',
          cuando: new Date().toISOString()
        }
      }));
    }
    encolarRecarga();
  }

  for (const senal of SEÑALES_HISTORIAL) {
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
