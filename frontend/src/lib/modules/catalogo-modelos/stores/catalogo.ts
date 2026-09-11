/**
 * Catalogo Store — CUSTODIO del catálogo de modelos 3D (F7, prisma-universal).
 *
 * Fuente de la lógica (verificada en el repo):
 *   - modules/catalogo-modelos/index.js: contrato real de handlers/proyecciones.
 *   - modules/catalogo-modelos/catalogo-modelos.blueprint.json (F6½): ui.ops
 *     registrar/listar/obtener/categorias con formas concretas.
 *
 * CONTRATO REAL (index.js — columnas del módulo, no del blueprint genérico):
 *   - registrar recibe { nombre, project_id } obligatorios + { categoria?,
 *     archivo3mf?, origen?, metadatos? } → { status:201, data:{ modelo } },
 *     emite catalogo.modelo_registrado (modelo_id, nombre, categoria,
 *     project_id). Duplicado por id → 409 ALREADY_EXISTS.
 *   - listar recibe { project_id? } → { data:{ modelos[], total } }. Columnas
 *     proyectadas: id, nombre, categoria, archivo3mf, origen.
 *   - obtener recibe { id } → { data:{ modelo } } (404 si no existe). Detalle
 *     con metadatos (material/dimensiones/tiempo_estimado/peso_estimado, huecos
 *     'desconocido'), origen, archivo3mf, created_at.
 *   - categorias recibe { project_id? } → { data:{ categorias[], total } }
 *     (distintas de listar, ordenadas). Alimenta el select del formulario.
 *
 * Señales pareadas (publicadores reales de index.js):
 *   registrar → catalogo.modelo_registrado · fallo → catalogo.registrar.failed
 *   — la cinta re-lee al recibir la señal (R3, nunca recarga).
 *
 * Reglas de esquematización (F7):
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC (listar/obtener).
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): al dar de alta,
 *        la señal catalogo.modelo_registrado re-lee la cinta.
 *   DUALIDAD — registrar es la ÚNICA escritura (ROL JEFE); listar/obtener/
 *        categorias son lecturas neutras que alimentan esa decisión.
 *
 * Patrón del repo: molde exacto de modules/pedidos/stores/pedidos.ts —
 * mqttRequest + suscripción con debounce + cleanup para destroy +
 * describeError + multi-tenant por sessionProjectId.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por catalogo.listar / catalogo.obtener
// =============================================================================

/** Fila de la cinta — lo que proyecta catalogo.listar (columnas fijas). */
export interface ModeloFila {
  id: string;
  nombre: string;
  categoria: string;
  archivo3mf?: string | null;
  origen: string;
}

/** Metadatos del modelo (pieza 1.3) — huecos como 'desconocido', nunca inventados. */
export interface ModeloMetadatos {
  material: string;
  dimensiones: string;
  tiempo_estimado: string;
  peso_estimado: string;
}

/** Modelo completo — lo que devuelve catalogo.obtener ({ modelo }). */
export interface Modelo extends ModeloFila {
  project_id?: string;
  metadatos: ModeloMetadatos;
  created_at?: string;
}

/** Payload del formulario de alta (registrar). */
export interface ModeloAlta {
  nombre: string;
  categoria?: string;
  archivo3mf?: string;
  origen?: string;
  metadatos?: Partial<ModeloMetadatos>;
}

// =============================================================================
// ESTADO — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

interface CatalogoState {
  modelos: ModeloFila[];
  categorias: string[];
  detalle: Modelo | null;
  loading: boolean;
  detalleLoading: boolean;
  error: string | null;
  mutacionesPendientes: number;
  /** Confirmación viva de la señal pareada (modelo_registrado). */
  ultimoRegistrado: { modelo_id: string; nombre: string; cuando: string } | null;
}

const initialState: CatalogoState = {
  modelos: [],
  categorias: [],
  detalle: null,
  loading: false,
  detalleLoading: false,
  error: null,
  mutacionesPendientes: 0,
  ultimoRegistrado: null
};

export const catalogoStore = writable<CatalogoState>(initialState);

// ---- Derivados (readonly para componentes) ----
export const modelos = derived(catalogoStore, ($s) => $s.modelos);
export const categorias = derived(catalogoStore, ($s) => $s.categorias);
export const detalle = derived(catalogoStore, ($s) => $s.detalle);
export const catalogoLoading = derived(catalogoStore, ($s) => $s.loading);
export const detalleLoading = derived(catalogoStore, ($s) => $s.detalleLoading);
export const catalogoError = derived(catalogoStore, ($s) => $s.error);
export const mutacionesPendientes = derived(catalogoStore, ($s) => $s.mutacionesPendientes);
export const totalModelos = derived(catalogoStore, ($s) => $s.modelos.length);
/** Confirmación viva de la señal pareada (catalogo.modelo_registrado). */
export const ultimoRegistrado = derived(catalogoStore, ($s) => $s.ultimoRegistrado);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las únicas escrituras (R2)
// =============================================================================

/** Cinta del catálogo (listar) + select de categorías (categorias). Dos lecturas, un golpe. */
export async function loadCatalogo(pid: string): Promise<void> {
  catalogoStore.update((s) => ({ ...s, loading: true, error: null }));
  try {
    const [lista, cats] = await Promise.all([
      mqttRequest<{ modelos?: ModeloFila[]; total?: number }>('catalogo', 'listar', {
        project_id: pid
      }).catch(() => null),
      mqttRequest<{ categorias?: string[]; total?: number }>('catalogo', 'categorias', {
        project_id: pid
      }).catch(() => null)
    ]);

    catalogoStore.update((s) => ({
      ...s,
      modelos: lista?.data?.modelos ?? [],
      categorias: cats?.data?.categorias ?? [],
      loading: false
    }));
  } catch (err) {
    catalogoStore.update((s) => ({ ...s, loading: false, error: describeError(err) }));
  }
}

/** Detalle de un modelo (obtener) — alimenta la vista de detalle. */
export async function obtenerModelo(pid: string, id: string): Promise<void> {
  catalogoStore.update((s) => ({ ...s, detalleLoading: true, error: null }));
  try {
    const res = await mqttRequest<{ modelo?: Modelo }>('catalogo', 'obtener', {
      project_id: pid,
      id
    });
    catalogoStore.update((s) => ({ ...s, detalle: res.data?.modelo ?? null, detalleLoading: false }));
  } catch (err) {
    catalogoStore.update((s) => ({ ...s, detalleLoading: false, error: describeError(err) }));
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCatalogo(): void {
  catalogoStore.set(initialState);
}

// =============================================================================
// DECLARAR (ROL JEFE) — registrar es la ÚNICA escritura del custodio
// =============================================================================

/**
 * Registra un modelo 3D (append al store). Sin escritura local: la señal
 * pareada catalogo.modelo_registrado re-lee la cinta (R3). Devuelve id o lanza.
 */
export async function registrarModelo(pid: string, datos: ModeloAlta): Promise<{ id: string }> {
  catalogoStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes + 1, error: null }));
  try {
    const res = await mqttRequest<{ modelo?: Modelo }>('catalogo', 'registrar', {
      project_id: pid,
      ...datos
    });
    const id = res.data?.modelo?.id;
    if (!id) throw new Error('el servidor no devolvió el id del modelo');
    // Confirmación viva inmediata; la señal refrescará la cinta.
    catalogoStore.update((s) => ({
      ...s,
      ultimoRegistrado: { modelo_id: id, nombre: datos.nombre, cuando: new Date().toISOString() }
    }));
    return { id };
  } catch (err) {
    catalogoStore.update((s) => ({ ...s, error: describeError(err) }));
    throw err;
  } finally {
    catalogoStore.update((s) => ({ ...s, mutacionesPendientes: s.mutacionesPendientes - 1 }));
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las señales reales del módulo → re-lectura de la cinta
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SEÑALES_CATALOGO = ['catalogo.modelo_registrado', 'catalogo.registrar.failed'];

/**
 * Suscripción a las señales pareadas. El debounce absorbe el tándem
 * (registro + fallo). Solo re-lee la cinta: NUNCA recarga la vista.
 */
export function initCatalogoSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    const pid = get(sessionProjectId);
    if (!pid) return;
    if (recargaProgramada) return; // debounce: las señales llegan en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(sessionProjectId);
      if (activo) void loadCatalogo(activo);
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SEÑALES_CATALOGO) {
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
