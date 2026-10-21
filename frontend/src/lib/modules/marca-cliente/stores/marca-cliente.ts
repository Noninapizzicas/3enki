/**
 * MarcaCliente Store — la cara del JEFE sobre la relación con el cliente (F7,
 * composición según esquema-jefe/ de marca-cliente): informe con las reglas
 * vigentes por bloques + editor-bloque (voz/presencia/fidelizacion) que
 * declaran via reglas.actualizar.
 *
 * Fuente de la lógica (verificada en el repo, marca-cliente reflejo-0.1.0):
 *   - modules/marca-cliente/index.js (165 líneas, leídas enteras):
 *     contrato real.
 *   - modules/marca-cliente/esquema-jefe/ (pasada-1, pasada-2-diseccion,
 *     esquema.md): composición 3 capas, formas UI, señales pareadas.
 *
 * CONTRATO REAL (index.js):
 *   - reglas.leer {} → 200 { reglas, fuente } (L159-162). SIN 404: devuelve
 *     SIEMPRE la estructura completa (persistida en /pizzepos/marca.json o el
 *     DEFAULT si no existe) con fuente 'persistida'|'default' (INV3). La falta
 *     de reglas es estado NOMBRADO (campos null/vacios), no error (INV5).
 *   - reglas.actualizar { cambios } → 200 { reglas } (L142 → ConfigCustodio,
 *     INV4: el DICTAMEN en la propia respuesta). Validación por campo del
 *     cambio (INV2): valida solo lo que viene; campos ausentes no se tocan.
 *     Se envía SOLO un bloque por llamada: { voz } | { presencia } |
 *     { fidelizacion }.
 *   - lectura parcial: voz.obtener → { voz }, presencia.obtener → { canales }
 *     (FORMULAS, neutras). El panel usa reglas.leer para el informe.
 *   - Moneda: SIN € — solo fidelizacion.puntos_por_euro (número > 0 o null).
 *
 * Señal pareada (VERIFICADA en código — index.js L132 _custodio.actualizar):
 *   reglas.actualizar → el ConfigCustodio publica `marca.reglas.actualizadas`
 *   { project_id, reglas } al persistir; el eventBus del core la emite al
 *   topic MQTT core/STAR/events/marca/reglas/actualizadas y el frontend
 *   suscribe en dot notation. Doble confirmación: dictamen RPC inmediato +
 *   señal que re-lee el informe. module.json.publishes la declara.
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el
 *        store solo escribe con datos de la lectura reglas.leer.
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): tras declarar,
 *        la señal re-dispara la lectura; el dictamen inmediato lo da la
 *        respuesta de la mutación (éxito/fracaso), no el estado local.
 *   INV6 — TODO RPC lleva project_id inyectado (lección bug escandallo).
 *
 * Patrón del repo: molde exacto de carta-marketing/stores/carta-marketing.ts —
 * mqttRequest + suscripción dot notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales del contrato marca-v1 (DEFAULT_REGLAS, index.js L9-27)
// =============================================================================

/** Bloque voz — cómo habla la marca (D1). */
export interface MarcaVoz {
  tono?: string | null;
  valores?: string[];
  tradicion_referencia?: string | null;
  [key: string]: unknown;
}

/** Bloque presencia — dónde está la marca (D2). */
export interface MarcaPresencia {
  canales?: string[];
  [key: string]: unknown;
}

/** Un cliente del bloque clientes — por contacto (D3). */
export interface MarcaCliente {
  contacto?: string;
  puntos?: number;
  [key: string]: unknown;
}

/** Bloque clientes — la lista de clientes (D3). */
export interface MarcaClientes {
  lista?: MarcaCliente[];
  [key: string]: unknown;
}

/** Bloque fidelización — el programa de puntos (D4). */
export interface MarcaFidelizacion {
  activa?: boolean;
  puntos_por_euro?: number | null;
  recompensas?: string[];
  [key: string]: unknown;
}

/** La relación con el cliente tal como la persiste el reflejo (/pizzepos/marca.json). */
export interface RelacionCliente {
  esquema?: string;
  voz?: MarcaVoz;
  presencia?: MarcaPresencia;
  clientes?: MarcaClientes;
  fidelizacion?: MarcaFidelizacion;
  [key: string]: unknown;
}

/** Respuesta de reglas.leer — el informe con su fuente de origen. */
export interface LecturaReglas {
  reglas?: RelacionCliente;
  fuente?: 'persistida' | 'default';
}

/** Dictamen de la respuesta de reglas.actualizar (INV4). */
export interface DictamenDeclaracion {
  bloque: string;
  reglas: RelacionCliente;
}

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** Última lectura de la relación (la ÚNICA fuente del panel). */
export const marcaStore = writable<RelacionCliente | null>(null);

export const lecturaLoading = writable<boolean>(false);
export const lecturaError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la vista muestra 'sincronizando…'. */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (globales; los por-editor los anota el panel). */
export const errorMutacion = writable<string | null>(null);

/**
 * Cinta de la relación, derivada SOLO de la lectura (nunca asumida):
 * cuántas palancas faltan por declarar y si hay algo declarado.
 */
export const cinta = derived(marcaStore, ($m) => {
  const voz = $m?.voz ?? {};
  const pres = $m?.presencia ?? {};
  const fidel = $m?.fidelizacion ?? {};
  const porDeclarar = [
    voz.tono,
    voz.valores && voz.valores.length ? voz.valores : null,
    voz.tradicion_referencia,
    pres.canales && pres.canales.length ? pres.canales : null,
    fidel.activa ? true : null,
    fidel.puntos_por_euro
  ].filter((v) => v == null || v === '').length;
  return {
    /** Hay algo declarado (voz o presencia o fidelización activa). */
    hayDeclaracion: !!voz.tono || (voz.valores?.length ?? 0) > 0 || (pres.canales?.length ?? 0) > 0 || !!fidel.activa,
    /** PLENAMENTE DECLARADA = las palancas clave de la relación están. */
    completa: porDeclarar === 0,
    /** Palancas aún 'por declarar' (campos null/vacíos del contrato). */
    porDeclarar,
    /** La lectura vino por defecto (marca inexistente) o fue persistida. */
    sinMarca: $m == null || !$m.esquema || (!$m.voz?.tono && !$m.presencia?.canales?.length && !$m.fidelizacion?.activa)
  };
});

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** Texto → array de strings (CSV). Vacío = []. */
export function arrayFromCsv(s: string): string[] {
  return (s ?? '')
    .split(',')
    .map((x) => x.trim())
    .filter((x) => x.length > 0);
}

/** array → texto CSV legible. */
export function csvFromArray(a: string[] | undefined): string {
  return Array.isArray(a) ? a.join(', ') : '';
}

// =============================================================================
// LECTURA (INFORMARSE) — la única escritura del store (R2)
// =============================================================================

/** Carga la relación vigente. SIN 404: siempre hay respuesta (estructura
 *  completa — INV3). El panel representa vacío como "por declarar". */
export async function loadMarca(): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) return;
  lecturaLoading.set(true);
  lecturaError.set(null);
  try {
    const res = await mqttRequest<LecturaReglas>('marca', 'reglas.leer', { project_id: pid });
    const reglas = (res.data?.reglas ?? {}) as RelacionCliente;
    marcaStore.set(reglas);
  } catch (err) {
    lecturaError.set(describeError(err));
  } finally {
    lecturaLoading.set(false);
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetMarcaCliente(): void {
  marcaStore.set(null);
  lecturaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — LA DECLARACIÓN del jefe, por BLOQUE (INV2: el resto se
// preserva). El dictamen llega en la respuesta (INV4: 200 { reglas }) y la
// señal re-lee la vista (R3) — el store NUNCA asume.
// =============================================================================

async function actualizarReglas(
  bloque: string,
  cambios: Record<string, unknown>
): Promise<DictamenDeclaracion> {
  const pid = get(sessionProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<RelacionCliente>('marca', 'reglas.actualizar', {
      project_id: pid,
      cambios
    });
    // DICTAMEN en la respuesta (INV4). El refresco COMPLETO lo da la señal
    // marca.reglas.actualizadas (R3) — no se escribe el store aqui.
    return { bloque, reglas: res.data ?? {} };
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

export function declararVoz(campos: Partial<MarcaVoz>): Promise<DictamenDeclaracion> {
  return actualizarReglas('voz', { voz: campos });
}

export function declararPresencia(campos: Partial<MarcaPresencia>): Promise<DictamenDeclaracion> {
  return actualizarReglas('presencia', { presencia: campos });
}

export function declararFidelizacion(campos: Partial<MarcaFidelizacion>): Promise<DictamenDeclaracion> {
  return actualizarReglas('fidelizacion', { fidelizacion: campos });
}

// =============================================================================
// SEÑAL-REFRESH (R3) — marca.reglas.actualizadas re-lee el informe
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENAL_MARCA = ['marca.reglas.actualizadas'];

/**
 * Suscripción a la señal pareada (1 única para todo el módulo). El debounce
 * absorbe tandems improbables pero legítimos (v2 futuras, semillas externas):
 * si la señal no llegara (bus degradado), el dictamen del editor sigue
 * asignando el estado paso a paso — doble confirmación, nunca recarga.
 */
export function initMarcaSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (recargaProgramada) return;
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(sessionProjectId);
      if (activo) void loadMarca();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENAL_MARCA) {
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
