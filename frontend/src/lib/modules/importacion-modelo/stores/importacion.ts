/**
 * importacion-modelo — Store MQTT del panel del jefe que IMPORTA modelos 3D
 * al taller (F7, prisma-universal, 5ª iteración de la práctica).
 *
 * Fuente de la lógica (verificada en el repo):
 *   - modules/importacion-modelo/index.js: contrato real del handler.
 *   - modules/importacion-modelo/importacion-modelo.blueprint.json (F6½):
 *     ui.ops.importar (jefe, args url/origen/categoria/nombre), ui.estados
 *     en_progreso/importada/fallida, transporte.rpc solo importar.
 *   - modules/importacion-modelo/esquema-jefe/esquema-jefe.md (F6): fuente de
 *     verdad del rol jefe.
 *
 * CONTRATO REAL (index.js — módulo PUENTE stateless, sin store ni persistencia):
 *   - importar es la ÚNICA RPC real (handler onImportarRequest → _importar,
 *     pareada a importacion.importar.response). Recibe { project_id, url }
 *     obligatorios + { origen?, categoria?, nombre? }.
 *     · sin url → 400 INVALID_INPUT (url_requerida)
 *     · sin project_id → 400 INVALID_INPUT (project_id_requerido)
 *     · sin descargador cableado → 503 DESCARGADOR_NO_CONFIGURADO
 *     · descarga lanza → 502 DESCARGA_FALLIDA · archivo vacío → 502 ARCHIVO_VACIO
 *     · origen .stl (no .3mf) → 422 FALTA_3MF (invariante 5: NO se convierte)
 *     · registro rechazado por catalogo-modelos → 502 REGISTRO_FALLIDO
 *     · éxito → 201 + { modelo, importada:true }
 *   - _buscar (delegación interna a busqueda-repositorios) NO es handler RPC
 *     expuesto de este módulo (no existe onBuscarRequest; module.json subscribes
 *     SOLO tiene importacion.importar.request). Por LEY DE CERO SUPUESTOS este
 *     store NO inventa onBuscar ni una llamada de búsqueda del módulo: la
 *     búsqueda previa del dueño delega a busqueda-repositorios (RPC propio que
 *     vive allí); aquí solo se ofrece "pegar la URL", que es lo real.
 *
 * Señales pareadas (publicadores reales de index.js → transporte.salida del blueprint):
 *   - importacion.importada  → estado=importada, guarda el modelo importado.
 *   - importacion.importar.failed → estado=fallida, guarda el motivo tipado.
 *   La vista re-lee la señal, NUNCA recarga (R3).
 *
 * Reglas de esquematización (F7):
 *   R2 — la escritura (importar) va por mqttRequest y NUNCA asume estado local:
 *        el estado "importada" solo se escribe al recibir la señal pareada.
 *   R3 — el feedback lo da la SEÑAL del bus (nunca recarga): al disparar
 *        importar se marca en_progreso; la señal importacion.importada (o su
 *        par de fallo) resuelve el estado terminal.
 *   DUALIDAD — importar es la ÚNICA operación y es ROL JEFE. No hay lecturas
 *        propias del puente (sin store): los modelos importados viven en
 *        catalogo-modelos. No hay lista de "mis importaciones".
 *
 * Patrón del repo: molde de modules/catalogo-modelos/stores/catalogo.ts y
 * cola-impresion/stores/cola.ts — mqttRequest + suscripción a señales con
 * filtro multi-tenant + cleanup + describeError + resetStore.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por importacion.importar / las señales
// =============================================================================

/** Origen declarado por el jefe (blueprint ui.ops.importar.args.origen). */
export type OrigenModelo =
  | 'printables'
  | 'makerworld'
  | 'cults3d'
  | 'thingiverse'
  | 'diseno propio'
  | 'desconocido';

/** Payload de la importación (importacion.importar.request). */
export interface ImportarPayload {
  project_id: string;
  url: string;
  origen?: string;
  categoria?: string;
  nombre?: string;
}

/** Modelo importado — lo que confirma la señal importacion.importada. */
export interface ModeloImportado {
  modelo_id: string;
  nombre: string;
  origen?: string;
  archivo3mf?: string | null;
}

/** Motivos de fallo tipados en index.js (par importacion.importar.failed). */
export type MotivoFallo =
  | 'url_requerida'
  | 'project_id_requerido'
  | 'descargador_no_configurado'
  | 'descarga_fallida'
  | 'archivo_vacio'
  | 'falta_3mf'
  | 'registro_fallido';

/** Estados del blueprint (F6½ ui.estados). */
export type EstadoImportacion = 'idle' | 'en_progreso' | 'importada' | 'fallida';

// =============================================================================
// ESTADO — la escritura llega de las SEÑALES (R2/R3), no de cálculo local
// =============================================================================

interface ImportacionState {
  importando: boolean;
  resultado: ModeloImportado | null;
  error: string | null;
  estado: EstadoImportacion;
  ultimaSenal: string | null;
  motivoFallo: MotivoFallo | null;
}

const initialState: ImportacionState = {
  importando: false,
  resultado: null,
  error: null,
  estado: 'idle',
  ultimaSenal: null,
  motivoFallo: null
};

export const importacionStore = writable<ImportacionState>(initialState);

// ---- Derivados (readonly para componentes) ----
export const importando = derived(importacionStore, ($s) => $s.importando);
export const resultadoImportacion = derived(importacionStore, ($s) => $s.resultado);
export const importacionError = derived(importacionStore, ($s) => $s.error);
export const estadoImportacion = derived(importacionStore, ($s) => $s.estado);
export const ultimaSenal = derived(importacionStore, ($s) => $s.ultimaSenal);
export const motivoFallo = derived(importacionStore, ($s) => $s.motivoFallo);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus al importar';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** Mapa legible de cada motivo tipado del fallo a su mensaje honesto (index.js). */
export const MOTIVO_MENSAJE: Record<MotivoFallo, string> = {
  url_requerida: 'falta la URL del modelo', // 400 INVALID_INPUT
  project_id_requerido: 'falta el proyecto del taller', // 400 INVALID_INPUT
  descargador_no_configurado: 'no hay descargador cableado (puente thin del PC del dueño)', // 503
  descarga_fallida: 'no se pudo descargar el modelo', // 502
  archivo_vacio: 'la descarga no devolvió archivo', // 502
  falta_3mf: 'el origen es .stl y el slicer necesita .3mf — NO se convierte (invariante 5)', // 422
  registro_fallido: 'el catálogo rechazó el registro del modelo' // 502
};

// =============================================================================
// DECLARAR (ROL JEFE) — importar: la ÚNICA RPC real del módulo
// =============================================================================

/**
 * Dispara la importación de un modelo 3D al taller (importacion.importar.request).
 * La UI marca en_progreso; el resultado lo confirma la señal pareada
 * importacion.importada (R3). No hay escritura local del estado terminal: se
 * escribe al recibir la señal (R2). Devuelve true si la RPC no rechazó en el
 * envío; el feedback real (importada/fallida) llega por el bus.
 */
export async function importarModelo(
  pid: string,
  args: { url: string; origen?: string; categoria?: string; nombre?: string }
): Promise<boolean> {
  importacionStore.update((s) => ({
    ...s,
    importando: true,
    estado: 'en_progreso',
    error: null,
    resultado: null,
    motivoFallo: null,
    ultimaSenal: null
  }));
  try {
    const payload: ImportarPayload = {
      project_id: pid,
      url: args.url.trim(),
      origen: args.origen || undefined,
      categoria: args.categoria || undefined,
      nombre: args.nombre?.trim() || undefined
    };
    await mqttRequest<Record<string, unknown>>('importacion-modelo', 'importar', payload);
    return true;
  } catch (err) {
    // El RPC rechazó en el envío (validación en el módulo). El par de fallo
    // por el bus también puede llegar como señal; aquí reflejamos el error.
    importacionStore.update((s) => ({
      ...s,
      importando: false,
      estado: 'fallida',
      error: describeError(err),
      ultimaSenal: 'importacion.importar.failed'
    }));
    return false;
  }
}

/** Multi-tenant / cleanup: vaciar todo (sin datos ajenos al cambiar de proyecto). */
export function resetImportacion(): void {
  importacionStore.set(initialState);
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → la vista re-lee (nunca recarga)
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

/** Extrae el motivo de fallo tipado (importacion.importar.failed → motivo). */
function extraerMotivo(envelope: unknown): MotivoFallo | null {
  const e = envelope as { motivo?: MotivoFallo; data?: { motivo?: MotivoFallo } } | null;
  return e?.motivo ?? e?.data?.motivo ?? null;
}

const SEÑALES_IMPORTACION = ['importacion.importada', 'importacion.importar.failed'];

/**
 * Suscripción a las señales pareadas. No hay lista que refrescar (puente
 * stateless): la señal importacion.importada ES la confirmación del resultado,
 * y el par importacion.importar.failed el aviso tipado. Devuelve cleanup.
 */
export function initImportacionSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  function onImportada(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    const e = envelope as {
      modelo_id?: string;
      nombre?: string;
      origen?: string;
      archivo3mf?: string | null;
      data?: { modelo_id?: string; nombre?: string; origen?: string; archivo3mf?: string | null };
    } | null;
    const d = e?.data ?? e;
    importacionStore.update((s) => ({
      ...s,
      importando: false,
      estado: 'importada',
      resultado: {
        modelo_id: d?.modelo_id ?? 'desconocido',
        nombre: d?.nombre ?? 'desconocido',
        origen: d?.origen ?? 'desconocido',
        archivo3mf: d?.archivo3mf ?? null
      },
      error: null,
      motivoFallo: null,
      ultimaSenal: 'importacion.importada'
    }));
  }

  function onFailed(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    const motiv = extraerMotivo(envelope);
    importacionStore.update((s) => ({
      ...s,
      importando: false,
      estado: 'fallida',
      resultado: null,
      error: motiv ? MOTIVO_MENSAJE[motiv] : describeError(envelope),
      motivoFallo: motiv,
      ultimaSenal: 'importacion.importar.failed'
    }));
  }

  unsubs.push(mqttSubscribe('importacion.importada', onImportada));
  unsubs.push(mqttSubscribe('importacion.importar.failed', onFailed));

  return () => unsubs.forEach((u) => u());
}
