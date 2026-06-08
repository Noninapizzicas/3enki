/**
 * Carta Scheduler Store — solo lectura (Postura B, principio 6 ui-frontend-blueprint).
 *
 * Lee reglas y pendientes via fs.read del path canonico del proyecto activo:
 *   /pizzepos/carta-scheduler/reglas.json
 *   /pizzepos/carta-scheduler/pendientes.json
 *
 * NUNCA invoca tools del blueprint (crear_regla, eliminar_regla, confirmar,
 * rechazar, detectar_conflictos, proximos_cambios). Esas mutaciones las pide el
 * usuario al chat via prefillChatInput desde el modulo — el blueprint es el runtime.
 *
 * conflictosDetectados se calcula LOCAL cruzando reglas activas (colision
 * canal+cron con cartas destino distintas). El calculo de proximos_cambios NO
 * se hace local (D7): requiere evaluar cron con fechas futuras, es del backend;
 * la UI solo muestra los pendientes ya calculados.
 *
 * Desviaciones del pseudocodigo del plan, fieles a la API real verificada en
 * disco (mismas que tarifas/marketing):
 *   - fs.read no devuelve { status: 404 }; lanza MqttRequestError con
 *     code === 'RESOURCE_NOT_FOUND' (el path no existe todavia) -> [].
 *   - el bus se suscribe via '$lib/ui-core/mqtt' (no existe '$lib/ui-core/bus').
 */

import { writable, derived } from 'svelte/store';
import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';

// =============================================================================
// TYPES — shape canonico del blueprint carta-scheduler
// =============================================================================

export interface Regla {
  id: string;
  canal: string;
  carta_id_destino: string;
  cron_expression: string;
  etiquetas?: string[];
  prioridad?: number;
  descripcion?: string;
  activa?: boolean;
  created_at?: string;
  updated_at?: string;
}

export interface Pendiente {
  id: string;
  regla_id: string;
  canal: string;
  carta_id_destino: string;
  carta_id_anterior?: string;
  fecha_objetivo?: string;
  estado?: string;
  motivo?: string;
  created_at?: string;
}

export interface Conflicto {
  regla_a: Regla;
  regla_b: Regla;
  motivo: string;
}

const REGLAS_PATH = '/pizzepos/carta-scheduler/reglas.json';
const PENDIENTES_PATH = '/pizzepos/carta-scheduler/pendientes.json';

// =============================================================================
// STORES
// =============================================================================

export const reglasStore = writable<Regla[]>([]);
export const pendientesStore = writable<Pendiente[]>([]);
export const reglasLoading = writable<boolean>(false);
export const pendientesLoading = writable<boolean>(false);
export const cartaSchedulerError = writable<string | null>(null);

// =============================================================================
// DERIVED
// =============================================================================

export const reglasActivas = derived(reglasStore, ($r) =>
  $r.filter((x) => x.activa !== false)
);

// Conflictos: colision canal + cron identico con carta destino distinta.
// Calculo local barato (cruce O(n^2) sobre reglas activas). No evalua cron con
// fechas — eso es proximos_cambios (backend, D7).
export const conflictosDetectados = derived(reglasActivas, ($activas): Conflicto[] => {
  const conflictos: Conflicto[] = [];
  for (let i = 0; i < $activas.length; i++) {
    for (let j = i + 1; j < $activas.length; j++) {
      const a = $activas[i];
      const b = $activas[j];
      if (
        a.canal === b.canal &&
        a.cron_expression === b.cron_expression &&
        a.carta_id_destino !== b.carta_id_destino
      ) {
        conflictos.push({
          regla_a: a,
          regla_b: b,
          motivo: 'mismo canal + cron, diferente carta destino'
        });
      }
    }
  }
  return conflictos;
});

// =============================================================================
// LECTURAS — fs.read del path canonico
// =============================================================================

export async function loadReglas(): Promise<void> {
  reglasLoading.set(true);
  cartaSchedulerError.set(null);
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: REGLAS_PATH });
    const content = res.data?.content;
    if (typeof content !== 'string') {
      reglasStore.set([]);
      return;
    }
    const parsed = JSON.parse(content);
    reglasStore.set(Array.isArray(parsed?.reglas) ? parsed.reglas : []);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      reglasStore.set([]);
      return;
    }
    cartaSchedulerError.set(getErrorMessage(err));
  } finally {
    reglasLoading.set(false);
  }
}

export async function loadPendientes(): Promise<void> {
  pendientesLoading.set(true);
  try {
    const res = await mqttRequest<{ content: string }>('fs', 'read', { path: PENDIENTES_PATH });
    const content = res.data?.content;
    if (typeof content !== 'string') {
      pendientesStore.set([]);
      return;
    }
    const parsed = JSON.parse(content);
    pendientesStore.set(Array.isArray(parsed?.pendientes) ? parsed.pendientes : []);
  } catch (err) {
    if (err instanceof MqttRequestError && err.code === 'RESOURCE_NOT_FOUND') {
      pendientesStore.set([]);
      return;
    }
    cartaSchedulerError.set(getErrorMessage(err));
  } finally {
    pendientesLoading.set(false);
  }
}

// =============================================================================
// SUSCRIPCIONES — recargan al ver eventos canonicos del bus (D5)
// =============================================================================

export function initCartaSchedulerSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  unsubs.push(mqttSubscribe('carta-scheduler.regla.creada', () => loadReglas()));
  unsubs.push(mqttSubscribe('carta-scheduler.regla.actualizada', () => loadReglas()));
  unsubs.push(mqttSubscribe('carta-scheduler.regla.eliminada', () => loadReglas()));
  unsubs.push(mqttSubscribe('carta-scheduler.cambio.aplicado', () => loadPendientes()));
  unsubs.push(mqttSubscribe('carta-scheduler.cambio.rechazado', () => loadPendientes()));
  return () => unsubs.forEach((u) => u());
}

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}
