/**
 * Interfaz Store — superficie de dominio del dueño del radar (spec interfaz-interfaz.md).
 * Proyección pura vía RPC del módulo 'interfaz' (patrón ui-store-mqtt, ver channels.ts):
 *   - RPCs: listar / ver / confirmar_veredicto / anadir_manual / corregir_ficha
 *   - Suscripciones de refresco: interfaz.veredicto_confirmado · interfaz.candidato_manual_anadido
 *   - Par de fallo: interfaz.confirmar_veredicto.failed → error visible
 * El panel no persiste: el estado vive en los custodios (banco/evaluador) — esto es proyección.
 */

import { writable, derived, get } from 'svelte/store';
import {
  mqttRequest,
  MqttTimeoutError,
  MqttRequestError
} from '$lib/ui-core/mqtt-request';
import { subscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TYPES (contrato real del módulo — modules/interfaz/index.js)
// =============================================================================

export interface Candidato {
  id: string;
  titulo: string;
  fuente: string;
  sector?: string;
  estado: string;
  veredicto?: string;
  [k: string]: unknown;
}

export interface DetalleCriterio {
  criterio: string;
  puntuacion?: number;
  evidencia: string;
}

export interface Ficha extends Candidato {
  detallePorCriterio: DetalleCriterio[];
  criterios_faltantes: string[];
}

export type Vista = 'lista' | 'ficha';

// =============================================================================
// STORE (writables + derivados)
// =============================================================================

export const candidatos = writable<Candidato[]>([]);
export const total = writable<number>(0);
export const ficha = writable<Ficha | null>(null);
export const vista = writable<Vista>('lista');
export const busy = writable<string | null>(null);
export const error = writable<string | null>(null);
export const filtroEstado = writable<string>('todos');

export const estadosPresentes = derived(candidatos, ($c) =>
  [...new Set($c.map((x) => x.estado).filter(Boolean))]
);

export const listaFiltrada = derived(
  [candidatos, filtroEstado],
  ([$c, $f]) => ($f === 'todos' ? $c : $c.filter((x) => x.estado === $f))
);

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(e: unknown): string {
  if (e instanceof MqttTimeoutError) return 'Timeout: el módulo interfaz no respondió';
  if (e instanceof MqttRequestError) return e.message || 'Error del módulo interfaz';
  if (e instanceof Error) return e.message;
  return String(e);
}

function projectIdObligatorio(): string | null {
  const pid = get(sessionProjectId);
  if (!pid) {
    error.set('Selecciona un proyecto para usar el radar.');
    return null;
  }
  return pid;
}

// =============================================================================
// ACCIONES (RPC del módulo interfaz)
// =============================================================================

export async function loadListar(): Promise<void> {
  const project_id = projectIdObligatorio();
  if (!project_id) return;
  error.set(null);
  try {
    const res = await mqttRequest<{ candidatos: Candidato[]; total: number }>('interfaz', 'listar', { project_id });
    const lista = res.data?.candidatos || [];
    candidatos.set(lista);
    total.set(res.data?.total ?? lista.length);
  } catch (e) {
    error.set(getErrorMessage(e));
  }
}

export async function verCandidato(candidatoId: string): Promise<void> {
  const project_id = projectIdObligatorio();
  if (!project_id) return;
  busy.set(candidatoId);
  error.set(null);
  try {
    const res = await mqttRequest<{ candidato: Candidato; detallePorCriterio: DetalleCriterio[] }>(
      'interfaz', 'ver', { project_id, candidatoId }
    );
    const c = res.data?.candidato;
    if (!c) throw new Error('El evaluador no devolvió ficha para este candidato.');
    ficha.set({
      ...c,
      detallePorCriterio: res.data?.detallePorCriterio || [],
      criterios_faltantes: (c.criterios_faltantes as string[]) || []
    });
    vista.set('ficha');
  } catch (e) {
    error.set(getErrorMessage(e));
  } finally {
    busy.set(null);
  }
}

export async function confirmarVeredicto(candidatoId: string, confirmacion: 'PASA' | 'NO_PASA'): Promise<boolean> {
  const project_id = projectIdObligatorio();
  if (!project_id) return false;
  busy.set(candidatoId);
  error.set(null);
  try {
    await mqttRequest('interfaz', 'confirmar_veredicto', { project_id, candidatoId, confirmacion });
    // El banco aplica la transición al recibir interfaz.veredicto_confirmado (async);
    // refrescamos la lista ya para que el dueño vea el nuevo estado sin esperar al evento.
    await loadListar();
    return true;
  } catch (e) {
    error.set(getErrorMessage(e));
    return false;
  } finally {
    busy.set(null);
  }
}

export async function anadirManual(datos: { titulo: string; url?: string; sector?: string }): Promise<boolean> {
  const project_id = projectIdObligatorio();
  if (!project_id) return false;
  busy.set('__nuevo__');
  error.set(null);
  try {
    await mqttRequest('interfaz', 'anadir_manual', {
      project_id,
      titulo: datos.titulo,
      url: datos.url || undefined,
      sector: datos.sector || undefined
    });
    await loadListar();
    return true;
  } catch (e) {
    error.set(getErrorMessage(e));
    return false;
  } finally {
    busy.set(null);
  }
}

export async function corregirFicha(candidatoId: string, campo: string, valor: string): Promise<boolean> {
  const project_id = projectIdObligatorio();
  if (!project_id) return false;
  busy.set(candidatoId);
  error.set(null);
  try {
    await mqttRequest('interfaz', 'corregir_ficha', {
      project_id,
      candidatoId,
      ficha: { [campo]: valor }
    });
    // La corrección encadena re-evaluación inmediata → recargamos la ficha fresca.
    await verCandidato(candidatoId);
    return true;
  } catch (e) {
    error.set(getErrorMessage(e));
    return false;
  } finally {
    busy.set(null);
  }
}

// =============================================================================
// SUSCRIPCIONES (refresco + par de fallo) — initInterfazSubscriptions
// =============================================================================

export function initInterfazSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  // El custodio (banco) aplicó el veredicto del dueño → tablero fresco.
  unsubs.push(subscribe('interfaz.veredicto_confirmado', (payload: any) => {
    loadListar();
    if (payload?.candidatoId && get(ficha)?.id === payload.candidatoId) {
      verCandidato(payload.candidatoId);
    }
  }));

  // Un candidato manual entró al banco → tablero fresco.
  unsubs.push(subscribe('interfaz.candidato_manual_anadido', () => {
    loadListar();
  }));

  // Par de fallo canónico del flujo confirmar → error visible para el dueño.
  unsubs.push(subscribe('interfaz.confirmar_veredicto.failed', (payload: any) => {
    error.set(payload?.message ? `Confirmación rechazada: ${payload.message}` : 'Confirmación rechazada');
  }));

  return () => unsubs.forEach((u) => u());
}
