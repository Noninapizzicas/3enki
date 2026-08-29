/**
 * Productos Store — la cara del JEFE sobre el catálogo (proyector SIN estado).
 *
 * Reglas del esquema-jefe (modules/pizzepos/productos/esquema-jefe/):
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC (list/stats/categorias).
 *   R3 — el refresco lo da la SEÑAL del bus (carta.editada + catalogo.actualizado,
 *        pareada por hoja de declaración); nunca recarga completa: el store re-lee.
 *   R4 — disponible (toggle del jefe) ≠ activo (estructura de la carta): este store
 *        solo toca `disponible` y campos de ficha; `activo` no se captura aquí.
 *   R6 — el precio edita la CARTA: productos.update delega a carta.update_product
 *        (custodio). La UI muestra euros; el backend persiste.
 *
 * Patrón del repo: suscripción directa al bus sin cache materializado
 * (stores/carta-manager.ts), cleanup devuelto para el destroy del panel.
 */

import { writable, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — shape proyectado por productos (modules/pizzepos/productos/index.js)
// =============================================================================

export interface Producto {
  id: string;
  nombre: string;
  precio: number;
  categoria?: string | null;
  categoria_id?: string | null;
  descripcion?: string;
  imagen?: string;
  alergenos?: string[];
  etiquetas?: string[];
  /** Toggle del JEFE. `undefined` se trata como disponible (backend solo lo trae si está definido). */
  disponible?: boolean;
  /** Estructura de la carta — NO se captura desde el panel (R4). */
  activo?: boolean;
  [key: string]: unknown;
}

export interface Categoria {
  id: string;
  nombre: string;
  orden?: number;
  productos_count?: number;
  [key: string]: unknown;
}

export interface CatalogoStats {
  total_productos?: number;
  productos_activos?: number;
  total_categorias?: number;
  productos_con_alergenos?: number;
  [key: string]: unknown;
}

// =============================================================================
// STORES
// =============================================================================

export const productosStore = writable<Producto[]>([]);
export const categoriasStore = writable<Categoria[]>([]);
export const statsStore = writable<CatalogoStats | null>(null);

export const productosLoading = writable<boolean>(false);
export const productosError = writable<string | null>(null);
export const statsError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (feedback nombrado de nivel store; el local va en tarjeta/modal). */
export const errorMutacion = writable<string | null>(null);

// =============================================================================
// HELPERS
// =============================================================================

/** Euro con coma decimal (es-ES); tolera precio que llegue como string. */
export function formatearPrecio(valor: number | string | null | undefined): string {
  const n = typeof valor === 'number' ? valor : Number(String(valor ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return String(valor ?? '—');
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LECTURAS (INFORMARSE) — el store solo escribe aquí (R2)
// =============================================================================

export async function loadProductos(projectId: string): Promise<void> {
  productosLoading.set(true);
  productosError.set(null);
  try {
    const res = await mqttRequest<{ productos?: Producto[] }>('productos', 'list', {
      project_id: projectId
    });
    productosStore.set(res.data?.productos ?? []);
  } catch (err) {
    // Mantener la lista previa en pantalla: el error es nombrado, no borra la vista.
    productosError.set(describeError(err));
  } finally {
    productosLoading.set(false);
  }
}

/** Cinta-estado (stats) + select de categorías, en un solo golpe paralelo. */
export async function loadCinta(projectId: string): Promise<void> {
  statsError.set(null);
  try {
    const [statsRes, catsRes] = await Promise.all([
      mqttRequest<CatalogoStats>('productos', 'stats', { project_id: projectId }),
      mqttRequest<{ categorias?: Categoria[] }>('productos', 'categorias', { project_id: projectId })
    ]);
    statsStore.set(statsRes.data ?? {});
    categoriasStore.set(catsRes.data?.categorias ?? []);
  } catch (err) {
    statsError.set(describeError(err));
  }
}

/** Project desactivado / cambio de contexto: vaciar la vista, sin dejar datos ajenos. */
export function resetProductos(): void {
  productosStore.set([]);
  categoriasStore.set([]);
  statsStore.set(null);
  productosError.set(null);
  statsError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARACIONES (update / delete) — siempre vía custodio, nunca estado local (R2/R6)
// =============================================================================

/** Gesto rey: precio inline en la tarjeta. Delega a carta.update_product (R6). */
export async function setPrecio(projectId: string, id: string, precio: number): Promise<void> {
  await declarar('update', projectId, id, { precio });
}

/** Toggle de un toque del JEFE: disponible (NO activo) (R4). */
export async function setDisponible(
  projectId: string,
  id: string,
  disponible: boolean
): Promise<void> {
  await declarar('update', projectId, id, { disponible });
}

/** Editor-bloque: ficha completa (nombre/descripcion/etiquetas/alergenos/categoria_id), un submit. */
export async function guardarFicha(
  projectId: string,
  id: string,
  campos: Partial<Producto>
): Promise<void> {
  await declarar('update', projectId, id, campos);
}

/** Retirada: borrar es la opción peligrosa del confirmador-nombrado. */
export async function eliminarProducto(projectId: string, id: string): Promise<void> {
  await declarar('delete', projectId, id, {});
}

async function declarar(
  action: 'update' | 'delete',
  projectId: string,
  id: string,
  campos: Record<string, unknown>
): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('productos', action, { project_id: projectId, id, ...campos });
    // R2/R3: nada de estado local asumido — la señal pareada (carta.editada +
    // catalogo.actualizado) dispara la relectura; la vista ES el feedback.
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err; // la forma que capturó (tarjeta/modal) nombra su error local
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — carta.editada + catalogo.actualizado → re-lectura, sin recarga
// =============================================================================

/**
 * Extrae project_id de un envelope/evento tolerando los shapes vistos en el repo
 * ({ data:{project_id} } del envelope canónico, payload plano, doble anidamiento).
 */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as { project_id?: string; data?: { project_id?: string; data?: { project_id?: string } } } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

/**
 * Suscripción a las señales pareadas. El handler re-lee lecturas del proyecto
 * activo (debounce corto: ambas señales suelen llegar en tándem). Si el payload
 * trae project_id ajeno al activo, se ignora.
 */
export function initProductosSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    if (recargaProgramada) return; // debounce: la señal llega pareja (2 en tándem)
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const pid = get(activeProjectId);
      if (pid) {
        void loadProductos(pid);
        void loadCinta(pid);
      }
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  unsubs.push(mqttSubscribe('carta.editada', onSenal));
  unsubs.push(mqttSubscribe('catalogo.actualizado', onSenal));

  return () => {
    if (recargaProgramada) {
      clearTimeout(recargaProgramada);
      recargaProgramada = null;
    }
    unsubs.forEach((u) => u());
  };
}