/**
 * Menu Generator Store — Solo generación
 *
 * Responsabilidad: disparar generación y mostrar progreso/resultado.
 * NO gestiona cartas (eso es carta-manager).
 */

import { writable, derived } from 'svelte/store';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { mqttRequest, MqttTimeoutError, MqttRequestError } from '$lib/ui-core/mqtt-request';
import { getActiveProject } from '$lib/stores/workspace';

// =============================================================================
// TYPES
// =============================================================================

export type GenerationStep = 'idle' | 'extracting' | 'structuring' | 'done' | 'error';

export interface GenerationState {
  step: GenerationStep;
  nombre: string | null;
  message: string | null;
  error: string | null;
  result: GenerationResult | null;
}

export interface GenerationResult {
  carta_id: string;
  nombre: string;
  productos: number;
  categorias: number;
}

// =============================================================================
// STORE
// =============================================================================

const initial: GenerationState = {
  step: 'idle',
  nombre: null,
  message: null,
  error: null,
  result: null
};

export const generationStore = writable<GenerationState>(initial);

// =============================================================================
// ACTIONS
// =============================================================================

/**
 * Genera carta desde texto.
 * El nombre es OBLIGATORIO — el UI debe pedirlo antes de llamar.
 */
export async function generateFromText(nombre: string, texto: string): Promise<boolean> {
  generationStore.set({
    step: 'structuring', nombre,
    message: 'Estructurando carta con IA...', error: null, result: null
  });

  try {
    const project = getActiveProject();
    await mqttRequest('menu', 'generate', {
      nombre, texto, project_id: project?.id
    }, { timeout: 30000 });
    return true;
  } catch (error) {
    generationStore.update(s => ({
      ...s, step: 'error', error: getErrorMessage(error)
    }));
    return false;
  }
}

/**
 * Genera carta desde archivo (PDF/imagen).
 * Primero extrae texto (OCR), luego estructura.
 */
export async function generateFromFile(nombre: string, filePath: string): Promise<boolean> {
  generationStore.set({
    step: 'extracting', nombre,
    message: 'Extrayendo texto del documento...', error: null, result: null
  });

  try {
    const project = getActiveProject();
    await mqttRequest('menu', 'generate', {
      nombre, filePath, project_id: project?.id
    }, { timeout: 120000 });
    return true;
  } catch (error) {
    generationStore.update(s => ({
      ...s, step: 'error', error: getErrorMessage(error)
    }));
    return false;
  }
}

export function resetGeneration(): void {
  generationStore.set(initial);
}

// =============================================================================
// REAL-TIME SUBSCRIPTIONS
// =============================================================================

let cleanupFns: (() => void)[] = [];

export function initGenerationSubscriptions(): () => void {
  cleanupFns.forEach(fn => fn());
  cleanupFns = [];

  // Progreso del pipeline
  cleanupFns.push(
    mqttSubscribe('menu.generation.progress', (_topic, payload) => {
      const data = payload as { step?: string; message?: string; nombre?: string };
      if (data?.step) {
        generationStore.update(s => ({
          ...s,
          step: data.step as GenerationStep,
          message: data.message || s.message,
          nombre: data.nombre || s.nombre
        }));
      }
    })
  );

  // Error en pipeline
  cleanupFns.push(
    mqttSubscribe('menu.generation.failed', (_topic, payload) => {
      const data = payload as { error?: string; nombre?: string };
      generationStore.update(s => ({
        ...s, step: 'error',
        error: data?.error || 'Error desconocido en la generación'
      }));
    })
  );

  // Carta generada (emitido por carta-manager cuando el structurer guarda)
  cleanupFns.push(
    mqttSubscribe('carta.generada', (_topic, payload) => {
      const data = payload as { meta?: { id: string; nombre: string }; productos?: any[]; categorias?: any[] };
      if (data?.meta?.id) {
        generationStore.update(s => {
          // Solo actualizar si estábamos generando
          if (s.step === 'structuring' || s.step === 'extracting') {
            return {
              ...s,
              step: 'done',
              message: null,
              result: {
                carta_id: data.meta!.id,
                nombre: data.meta!.nombre || s.nombre || '',
                productos: data.productos?.length || 0,
                categorias: data.categorias?.length || 0
              }
            };
          }
          return s;
        });
      }
    })
  );

  return () => {
    cleanupFns.forEach(fn => fn());
    cleanupFns = [];
  };
}

// =============================================================================
// DERIVED
// =============================================================================

export const generationStep = derived(generationStore, $s => $s.step);
export const generationError = derived(generationStore, $s => $s.error);
export const generationResult = derived(generationStore, $s => $s.result);
export const isGenerating = derived(generationStore, $s =>
  $s.step === 'extracting' || $s.step === 'structuring'
);

// =============================================================================
// HELPERS
// =============================================================================

function getErrorMessage(error: unknown): string {
  if (error instanceof MqttTimeoutError) return 'Timeout — el servidor no respondió';
  if (error instanceof MqttRequestError) return error.message;
  if (error instanceof Error) return error.message;
  return 'Error desconocido';
}
