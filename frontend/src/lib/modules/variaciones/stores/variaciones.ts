/**
 * Variaciones Store — la cara del JEFE sobre las reglas de variación de un producto.
 *
 * Fuente de la lógica (verificado en el repo):
 *   - modules/pizzepos/variaciones/index.js: contrato get / configurar / evaluar.
 *   - modules/pizzepos/variaciones/esquema/pasada-4-consolidacion-formas-ui.md:
 *     composición 3 capas (SELECCIONAR → INFORMARSE → DECLARAR), señales pareadas,
 *     transparencia declarado/derivado (H3), lote [ABIERTO H1] sin implementar.
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el store
 *        solo escribe al recibir datos de una lectura RPC (get / carta_completa).
 *   R3 — el refresco lo da la SEÑAL del bus (carta.editada + catalogo.actualizado);
 *        nunca recarga completa: el store re-lee el get del producto actual.
 *   R4 — el motor ES el juez: el dictamen del simulador es lo que responde
 *        `evaluar` (motor-opciones en el servidor); la UI jamás calcula precio.
 *   R6 — el motor trabaja en CÉNTIMOS (delta_precio_centimos, precio_base_centimos)
 *        pero el precio_extra que escribe el JEFE via configurar es EUROS
 *        (carta-manager lo persiste tal cual; derivarOpciones lo convierte a céntimos).
 *
 * Transparencia (H3): `get` mezcla reglas DECLARADAS y DERIVADAS sin distinguirlas.
 * El origen lo deduce la UI de la existencia de `producto.variaciones` en la carta
 * (productos.carta_completa proyecta el campo solo si el custodio lo tiene) + se
 * muestra con chips en el panel. El store lo expone como `reglasDeclaradas`.
 *
 * Patrón del repo: molde exacto de modules/productos/stores/productos.ts —
 * mqttRequest + suscripción con debounce + cleanup para destroy + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas proyectadas por variaciones.get y productos.carta_completa
// =============================================================================

/** Valor de una opción derivada/bancaria (motor-opciones, dinero en CÉNTIMOS). */
export interface ValorOpcion {
  id: string;
  etiqueta: string;
  emoji?: string;
  /** CÉNTIMOS (R6). Para ELEGIR_VARIOS es delta sobre la base; QUITAR siempre 0. */
  delta_precio_centimos?: number;
  disponible?: boolean;
  ref?: string;
  [key: string]: unknown;
}

/** Opción del subsistema Opciones: modo universal + valores. */
export interface Opcion {
  id: string;
  etiqueta?: string;
  modo: 'QUITAR' | 'ELEGIR_VARIOS' | 'ELEGIR_UNO';
  requerido?: boolean;
  min?: number;
  max?: number;
  valores: ValorOpcion[];
  [key: string]: unknown;
}

/** Las 4 palancas + derivados, tal como responde `variaciones.get` (200). */
export interface VariacionesConfig {
  producto_id: string;
  grupo?: string;
  permite_quitar: string[];
  permite_anadir: boolean;
  extras_sugeridos: ExtraSugerido[];
  max_ingredientes_extra: number;
  precio_base_centimos?: number;
  opciones: Opcion[];
}

/** Ingrediente base del producto (carta_completa → checkbox del editor). */
export interface IngredienteBase {
  id: string;
  nombre?: string;
  emoji?: string;
  familia?: string;
  tipo?: string;
  /** EUROS (R6) — precio estándar del catálogo. */
  precio_extra?: number;
  disponible?: boolean;
  [key: string]: unknown;
}

/** Fila de extras_sugeridos: precio_extra EUROS opcional (vacío = precio catálogo). */
export interface ExtraSugerido {
  ingrediente_id: string;
  precio_extra?: number;
}

/** Producto proyectado por productos.carta_completa (ref-select + informe). */
export interface ProductoCarta {
  id: string;
  nombre: string;
  precio?: number;
  categoria_id?: string | null;
  categoria?: string | null;
  /** Presente SOLO si el jefe declaró reglas → chip verde-jefe (transparencia H3). */
  variaciones?: Record<string, unknown>;
  ingredientes_base?: IngredienteBase[];
  tiene_variaciones?: boolean;
  disponible?: boolean;
  [key: string]: unknown;
}

/** Dictamen del MOTOR sobre una selección de prueba (R4: la UI no calcula). */
export interface DictamenMotor {
  producto_id: string;
  valida: boolean;
  errores: string[];
  precio_final_centimos: number;
  [key: string]: unknown;
}

// =============================================================================
// STORES
// =============================================================================

/** Catálogo completo (una sola llamada carta_completa: ref-select + informes). */
export const productosCartaStore = writable<ProductoCarta[]>([]);

/** Informe vigente del producto seleccionado (lo escribe SOLO la lectura get). */
export const reglasStore = writable<VariacionesConfig | null>(null);

/** ¿El producto elegido traía `variaciones` declaradas en la carta? (H3). */
export const reglasDeclaradas = writable<boolean>(false);

/** Snapshot del producto elegido (para el editor: ingredientes_base, precio €). */
export const productoElegidoStore = writable<ProductoCarta | null>(null);

export const catalogoLoading = writable<boolean>(false);
export const catalogoError = writable<string | null>(null);

export const informeLoading = writable<boolean>(false);
/** Mensaje mantenido cuando get responde 404 "aún sin reglas". */
export const informeError = writable<string | null>(null);

/** Dictamen del motor del simulador (null = sin dictamen). */
export const dictamenStore = writable<DictamenMotor | null>(null);
export const dictamenLoading = writable<boolean>(false);

/** Contador de mutaciones en vuelo — la cinta muestra "sincronizando…". */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (el editor-bloque lo nombra y permanece abierto). */
export const errorMutacion = writable<string | null>(null);

// Derivados readonly para el componente.
export const reglasVigentes = derived(reglasStore, ($r) => $r);
export const opcionQuitar = derived(reglasStore, ($r) => $r?.opciones?.find((o) => o.modo === 'QUITAR') ?? null);
export const opcionAnadir = derived(
  reglasStore,
  ($r) => $r?.opciones?.find((o) => o.modo === 'ELEGIR_VARIOS') ?? null
);

// =============================================================================
// HELPERS — céntimos ⇄ euros (R6)
// =============================================================================

/** CÉNTIMOS → texto € (es-ES). Tolerancia: céntimos pueden llegar como string. */
export function formatearCentimos(centimos: number | string | null | undefined): string {
  const c = typeof centimos === 'number' ? centimos : Number(String(centimos ?? '').replace(',', '.'));
  if (!Number.isFinite(c)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(c / 100);
}

/** € (número) → texto € (es-ES). Para precios_extra DECLARADOS, que son euros (R6). */
export function formatearEuros(euros: number | null | undefined): string {
  const n = Number(euros);
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** € → CÉNTIMOS enteros. Acepta texto con coma; descarta no válidos. */
export function eurosACentimos(euros: string | number): number {
  const n = typeof euros === 'number' ? euros : Number(String(euros ?? '').replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 100);
}

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/**
 * get NO distingue declarado/derivado; producto.variaciones en la carta SÍ dice
 * si el custodio guarda reglas declaradas (proyección solo trae el campo si existe).
 */
function esDeclarado(p: ProductoCarta | null | undefined): boolean {
  return !!p?.variaciones && typeof p.variaciones === 'object';
}

// =============================================================================
// LECTURAS (INFORMARSE) — las únicas escrituras de las stores (R2)
// =============================================================================

/** Ref-select (capa 1): un solo golpe con la carta activa completa. */
export async function loadProductos(projectId: string): Promise<void> {
  catalogoLoading.set(true);
  catalogoError.set(null);
  try {
    const res = await mqttRequest<{ productos?: ProductoCarta[] }>('productos', 'carta_completa', {
      project_id: projectId
    });
    productosCartaStore.set(res.data?.productos ?? []);
  } catch (err) {
    // Mantener la lista previa: error nombrado, no borra la vista.
    catalogoError.set(describeError(err));
  } finally {
    catalogoLoading.set(false);
  }
}

/**
 * Informe (capa 2): re-lee SIEMPRE el get del producto actual (las señales
 * disparan esto — nunca recarga completa). 404 "aún sin reglas" es estado
 * legítimo: reglas nulas + mensaje derivado por defecto.
 */
export async function loadReglas(productoId: string): Promise<void> {
  if (!productoId) {
    reglasStore.set(null);
    productoElegidoStore.set(null);
    reglasDeclaradas.set(false);
    informeError.set(null);
    dictamenStore.set(null);
    return;
  }
  const p = get(productosCartaStore).find((x) => x.id === productoId) ?? null;

  informeLoading.set(true);
  informeError.set(null);
  try {
    const res = await mqttRequest<VariacionesConfig>('variaciones', 'get', { producto_id: productoId });
    reglasStore.set(res.data ?? null);
    dictamenStore.set(null); // producto cambiado/reglas re-leídas: dictamen anterior caducó
  } catch (err) {
    reglasStore.set(null);
    dictamenStore.set(null);
    const msg = describeError(err);
    const esSinReglas = err instanceof MqttRequestError && err.status === 404;
    informeError.set(esSinReglas ? 'aún sin reglas' : msg);
  } finally {
    informeLoading.set(false);
    productoElegidoStore.set(p);
    reglasDeclaradas.set(esDeclarado(p));
  }
}

/**
 * Simulador (capa consultiva, NEUTRO): selección de prueba sobre opciones[];
 * el DICTAMEN lo pone el motor (R4). Selección { [opcion_id]: valor_id[] } —
 * el panel envía un valor por modo.
 */
export async function evaluar(
  productoId: string,
  selecciones: Record<string, string[]>
): Promise<DictamenMotor | null> {
  dictamenLoading.set(true);
  try {
    const res = await mqttRequest<DictamenMotor>('variaciones', 'evaluar', {
      producto_id: productoId,
      selecciones
    });
    dictamenStore.set(res.data ?? null);
    return res.data ?? null;
  } catch (err) {
    const msg = describeError(err);
    const r: DictamenMotor = {
      producto_id: productoId,
      valida: false,
      errores: [msg],
      precio_final_centimos: 0
    };
    dictamenStore.set(r);
    return r;
  } finally {
    dictamenLoading.set(false);
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetVariaciones(): void {
  productosCartaStore.set([]);
  reglasStore.set(null);
  reglasDeclaradas.set(false);
  productoElegidoStore.set(null);
  catalogoError.set(null);
  informeError.set(null);
  dictamenStore.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — variaciones.configurar vía custodio carta.update_product
// =============================================================================

/** Palancas que captura el editor-bloque (un submit → configurar). */
export interface Palancas {
  permite_quitar: string[];
  permite_anadir: boolean;
  max_ingredientes_extra: number;
  /** precio_extra en EUROS; undefined = precio estándar del catálogo. */
  extras_sugeridos: { ingrediente_id: string; precio_extra?: number }[];
}

/**
 * Declarar (capa 3, ROL JEFE): las 4 palancas → variaciones.configurar →
 * custodio carta.update_product. 200 honesto + la señal (carta.editada)
 * reconfigura el módulo y dispara la re-lectura — nada de estado local (R2/R3).
 */
export async function configurar(
  projectId: string,
  productoId: string,
  palancas: Palancas
): Promise<void> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    await mqttRequest('variaciones', 'configurar', {
      project_id: projectId,
      producto_id: productoId,
      variaciones: {
        permite_quitar: palancas.permite_quitar,
        permite_anadir: palancas.permite_anadir,
        max_ingredientes_extra: palancas.max_ingredientes_extra,
        extras_sugeridos: palancas.extras_sugeridos
      }
    });
    // Sin escritura local: la vista ES el feedback — la señal pareada re-lee el get.
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err; // el editor-bloque nombra su error local y permanece abierto
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — carta.editada + catalogo.actualizado → re-lectura
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como productos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

/**
 * Suscripción a las señales pareadas (misma forma que productos). El debounce
 * absorbe el tándem carta.editada + catalogo.actualizado. Solo re-lee: el
 * catálogo (para chips/refs) y el get del producto actualmente elegido.
 */
export function initVariacionesSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];

  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    const pid = get(activeProjectId);
    if (!pid) return;
    if (recargaProgramada) return; // debounce: las señales llegan en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(activeProjectId);
      if (!activo) return;
      // Re-lecturas, NUNCA recarga: carta (refs) + informe del producto actual.
      void loadProductos(activo).then(() => {
        const elegido = get(productoElegidoStore)?.id ?? null;
        if (elegido) void loadReglas(elegido);
      });
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