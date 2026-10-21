/**
 * Confirmaciones Store — ventana emergente de confirmación por UI.
 *
 * Escucha `portal.confirmation.pendiente` (publicado por el portal cuando una
 * tool con `confirmation:true` devuelve 409 NEEDS_CONFIRMATION) y expone la
 * petición al dueño como una ventana emergente "¿Ejecutar X? [Sí] [No]".
 *
 * Al pulsar Sí → reenvía `portal.call {tool, args, project_id, confirmado:true}`.
 * Al pulsar No → descarta (el llamador recibió el 409 y queda sin efecto).
 */
import { writable, get } from 'svelte/store';
import { subscribe, mqttRequest } from '$lib/ui-core';
import { sessionProjectId } from '$lib/stores/sessionProject';

export interface PendingConfirmation {
  tool: string;
  description: string;
  project_id: string | null;
  args: Record<string, unknown>;
  timestamp: number;
  /** id interno para la UI (único por petición) */
  ui_id: string;
}

/** La confirmación actualmente en la ventana (null = sin ventana). */
export const pendingConfirmation = writable<PendingConfirmation | null>(null);
/** true mientras el portal procesa el confirmado. */
export const confirming = writable(false);

function makeUiId(tool: string, ts: number) {
  return `${tool}-${ts}-${Math.random().toString(36).slice(2, 8)}`;
}

/** Escucha el evento del bus y lo convierte en ventana. Retorna unsubscribe. */
export function setupConfirmations() {
  return subscribe('portal.confirmation.pendiente', (payload: any) => {
    const p = (payload && payload.data ? payload.data : payload) ?? {};
    if (!p.tool) return;
    const desc = p.description || `${p.tool} requiere confirmación`;
    pendingConfirmation.set({
      tool: p.tool,
      description: desc,
      project_id: p.project_id || null,
      args: p.args || {},
      timestamp: p.timestamp || Date.now(),
      ui_id: makeUiId(p.tool, p.timestamp || Date.now())
    });
  });
}

/** Confirma y ejecuta la tool (Sí). */
export async function confirmPending(): Promise<boolean> {
  const pend = get(pendingConfirmation);
  if (!pend) return false;
  confirming.set(true);
  try {
    await mqttRequest('portal', 'call', {
      tool: pend.tool,
      args: pend.args,
      project_id: pend.project_id || get(sessionProjectId) || null,
      confirmado: true
    });
    pendingConfirmation.set(null);
    return true;
  } catch (err) {
    console.error('[confirmaciones] fallo al confirmar', err);
    return false;
  } finally {
    confirming.set(false);
  }
}

/** Rechaza (No) — simplemente cierra la ventana. */
export function rejectPending(): void {
  pendingConfirmation.set(null);
}
