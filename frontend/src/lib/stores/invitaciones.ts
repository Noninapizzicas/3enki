/**
 * Invitaciones Store — MQTT Request/Response + eventos en tiempo real.
 *
 * La cadena de delegación de capacidades desde el panel:
 *   - emitir  → invitaciones.emitir (el admin crea una invitación de proyecto firmada por la CA)
 *   - listar  → invitaciones.listar (con estado activa/revocada/agotada/caducada)
 *   - revocar → invitaciones.revocar
 * La redención la hace el navegador del invitado (enki-identity), no este panel.
 */

import { writable, derived, get } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest } from '$lib/ui-core/mqtt-request';

// =============================================================================
// TYPES
// =============================================================================

export type AccionInvitacion = 'crear-proyecto' | 'unirse-proyecto';
export type EstadoInvitacion = 'activa' | 'revocada' | 'agotada' | 'caducada';

export interface Invitacion {
  id: string;
  otorga: { accion: AccionInvitacion; project: string | null; role: string };
  limites: { expira_at: string | null; usos_max: number; usos: number };
  estado: EstadoInvitacion;
}

export interface InvitacionesState {
  invitaciones: Invitacion[];
  ultimoCodigo: string | null;   // el código de la última emisión, para copiar
  loading: boolean;
  error: string | null;
}

// =============================================================================
// STORE
// =============================================================================

const initial: InvitacionesState = { invitaciones: [], ultimoCodigo: null, loading: false, error: null };
export const invStore = writable<InvitacionesState>(initial);

export const invitaciones = derived(invStore, (s) => s.invitaciones);
export const invLoading = derived(invStore, (s) => s.loading);
export const invError = derived(invStore, (s) => s.error);
export const ultimoCodigo = derived(invStore, (s) => s.ultimoCodigo);

function errMsg(e: unknown): string {
  if (e && typeof e === 'object' && 'message' in e) return String((e as { message: unknown }).message);
  return String(e);
}

// =============================================================================
// ACTIONS
// =============================================================================

/** Lista las invitaciones emitidas (con su estado). */
export async function loadInvitaciones(filtro: { estado?: EstadoInvitacion; project?: string } = {}): Promise<void> {
  invStore.update((s) => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest<{ invitaciones: Invitacion[] }>('invitaciones', 'listar', filtro);
    const items = res?.data?.invitaciones ?? [];
    invStore.update((s) => ({ ...s, invitaciones: items, loading: false }));
  } catch (e) {
    invStore.update((s) => ({ ...s, loading: false, error: errMsg(e) }));
  }
}

/**
 * Emite una invitación de proyecto (el admin del sistema).
 * Devuelve el código copiable, o null si falla.
 */
export async function emitirInvitacion(opts: {
  accion: AccionInvitacion;
  project?: string | null;
  role?: string;
  dias?: number;
  usos_max?: number;
}): Promise<string | null> {
  invStore.update((s) => ({ ...s, loading: true, error: null }));
  try {
    const res = await mqttRequest<{ codigo: string }>('invitaciones', 'emitir', opts);
    const codigo = res?.data?.codigo ?? null;
    invStore.update((s) => ({ ...s, loading: false, ultimoCodigo: codigo }));
    await loadInvitaciones();
    return codigo;
  } catch (e) {
    invStore.update((s) => ({ ...s, loading: false, error: errMsg(e) }));
    return null;
  }
}

/** Revoca una invitación antes de que se redima. */
export async function revocarInvitacion(id: string): Promise<boolean> {
  invStore.update((s) => ({ ...s, loading: true, error: null }));
  try {
    await mqttRequest('invitaciones', 'revocar', { id });
    await loadInvitaciones();
    invStore.update((s) => ({ ...s, loading: false }));
    return true;
  } catch (e) {
    invStore.update((s) => ({ ...s, loading: false, error: errMsg(e) }));
    return false;
  }
}

export function clearInvError(): void {
  invStore.update((s) => ({ ...s, error: null }));
}

/** Suscribe a los eventos en tiempo real para refrescar la lista. */
export function initInvitacionesSubscriptions(): () => void {
  const unsubs = ['invitacion.emitida', 'invitacion.revocada', 'invitacion.redimida'].map((ev) =>
    mqttSubscribe(ev, () => { loadInvitaciones(); })
  );
  return () => unsubs.forEach((u) => u && u());
}
