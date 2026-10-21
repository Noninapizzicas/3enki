/**
 * CartaMarketing Store — la cara del JEFE sobre la identidad de marca (F7,
 * composición según esquema-jefe/ de carta-marketing): informe con la marca
 * vigente por secciones + editor-bloque (esencia/voz/visual/publico) que
 * declaran via update_perfil.
 *
 * Fuente de la lógica (verificada en el repo, carta-marketing reflejo-2.1.0):
 *   - modules/pizzepos/carta-marketing/index.js (199 líneas, leídas enteras):
 *     contrato real.
 *   - modules/pizzepos/carta-marketing/esquema-jefe/ (pasada-1, pasada-2,
 *     anatomía, esquema.md): composición 3 capas, formas UI, señales pareadas.
 *
 * CONTRATO REAL (index.js):
 *   - get_perfil {} → la identidad completa por secciones (esencia/voz/publico/
 *     visual/negocio). SIN 404: devuelve SIEMPRE la estructura completa
 *     (secciones vacías si falta — index.js L77). La falta de marca es estado
 *     NOMBRADO (secciones vacías), no error (INV2). La UI representa vacío =
 *     "por declarar".
 *   - update_perfil { campos: { <seccion>: {...} } } → 200 { marca fusionada }
 *     (el DICTAMEN en la propia respuesta, INV4). Deep-merge por sección: los
 *     campos ausentes se preservan (INV3). EL FRENO: re-valida la marca
 *     resultante contra marca.schema.json ANTES de persistir — un parche que la
 *     rompe → 422, NO se guarda (INV3).
 *   - Moneda: SIN € — la identidad de marca no tiene cifras (INV6).
 *
 * Señal pareada (VERIFICADA en código — index.js L145 _emitirActualizado):
 *   update_perfil → el reflejo publica `marketing.perfil.actualizado`
 *   { project_id, campos_modificados, correlation_id, timestamp } al persistir;
 *   el eventBus del core la emite al topic MQTT core/STAR/events/marketing/
 *   perfil/actualizado y el frontend suscribe en dot notation (mismo patrón que
 *   entrega.reglas.actualizadas). Doble confirmación: dictamen RPC inmediato +
 *   señal que re-lee el informe.
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el
 *        store solo escribe con datos de la lectura get_perfil.
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): tras declarar,
 *        la señal re-dispara la lectura; el dictamen inmediato lo da la
 *        respuesta de la mutación (éxito/fracaso), no el estado local.
 *
 * Patrón del repo: molde exacto de modules/entrega/stores/entrega.ts —
 * mqttRequest + suscripción dot notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por carta-marketing.get_perfil (marca.schema.json)
// =============================================================================

/** Sección esencia — el ADN (mínimo para arrancar: nombre). */
export interface MarcaEsencia {
  nombre?: string;
  lema?: string;
  proposito?: string;
  valores?: string[];
  [key: string]: unknown;
}

/** Sección voz — cómo habla la marca. */
export interface MarcaVoz {
  tono?: string[];
  registro?: string;
  referencias?: string[];
  si?: string[];
  no?: string[];
  [key: string]: unknown;
}

/** Sección publico — a quién. */
export interface MarcaPublico {
  quien?: string;
  actitud?: string;
  [key: string]: unknown;
}

/** Sección visual — cómo se ve (dueño compartido con carta-design). */
export interface MarcaVisual {
  colores?: Record<string, string>;
  tipografias?: Record<string, string>;
  estilo?: string;
  logo?: string;
  [key: string]: unknown;
}

/** Sección negocio — contexto (fuera del panel-jefe, la rellena el onboarding). */
export interface MarcaNegocio {
  tipo_cocina?: string;
  local?: Record<string, unknown>;
  redes?: Record<string, string>;
  [key: string]: unknown;
}

/** La identidad completa tal como la persiste el reflejo (/pizzepos/marca.json). */
export interface Marca {
  _version?: string;
  _updated_at?: string;
  onboarding_completado?: boolean;
  esencia?: MarcaEsencia;
  voz?: MarcaVoz;
  publico?: MarcaPublico;
  visual?: MarcaVisual;
  negocio?: MarcaNegocio;
  [key: string]: unknown;
}

/** Parche parcial por secciones — lo que acepta update_perfil como `campos`. */
export interface MarcaCampos {
  onboarding_completado?: boolean;
  esencia?: Partial<MarcaEsencia>;
  voz?: Partial<MarcaVoz>;
  publico?: Partial<MarcaPublico>;
  visual?: Partial<MarcaVisual>;
  negocio?: Partial<MarcaNegocio>;
  [key: string]: unknown;
}

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** Última lectura de la identidad (la ÚNICA fuente del panel). */
export const marcaStore = writable<Marca | null>(null);

export const lecturaLoading = writable<boolean>(false);
export const lecturaError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la vista muestra 'sincronizando…'. */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (globales; los por-editor los anota el panel). */
export const errorMutacion = writable<string | null>(null);

/**
 * Cinta de la identidad, derivada SOLO de la lectura (nunca asumida):
 * cuántas secciones faltan por declarar y si la esencia (mínimo) está.
 */
export const cinta = derived(marcaStore, ($m) => {
  const es = $m?.esencia ?? {};
  const voz = $m?.voz ?? {};
  const pub = $m?.publico ?? {};
  const vis = $m?.visual ?? {};
  const porDeclarar = [
    es.nombre,
    es.lema,
    voz.tono && voz.tono.length ? voz.tono : null,
    voz.registro,
    pub.quien,
    pub.actitud,
    vis.estilo
  ].filter((v) => v == null || v === '').length;
  return {
    /** La esencia con nombre = el mínimo para arrancar (INV7). */
    esenciaDefinida: !!es.nombre,
    /** PLENAMENTE DECLARADA = la identidad tiene sus palancas clave. */
    completa: porDeclarar === 0,
    /** Palancas aún 'por declarar' (campos vacíos del contrato). */
    porDeclarar,
    /** Origen de la lectura — transparencia (R4): sin marca = secciones vacías. */
    sinMarca: $m == null || !es.nombre
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

/** Carga la identidad vigente. SIN 404: siempre hay respuesta (estructura
 *  completa — INV2). El panel representa vacío como "por declarar". */
export async function loadMarca(): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) return;
  lecturaLoading.set(true);
  lecturaError.set(null);
  try {
    const res = await mqttRequest<Marca>('carta-marketing', 'get_perfil', { project_id: pid });
    marcaStore.set(res.data ?? {});
  } catch (err) {
    lecturaError.set(describeError(err));
  } finally {
    lecturaLoading.set(false);
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCartaMarketing(): void {
  marcaStore.set(null);
  lecturaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — LA DECLARACIÓN del jefe, por SECCIÓN (INV3: el resto se
// preserva). El dictamen llega en la respuesta (INV4: 200 { marca fusionada })
// y la señal re-lee la vista (R3) — el store NUNCA asume.
// =============================================================================

/** Dictamen legible para el editor: qué sección quedó persistida. */
export interface DictamenDeclaracion {
  seccion: string;
  marca: Marca;
}

async function actualizarMarca(
  seccion: string,
  cambios: MarcaCampos
): Promise<DictamenDeclaracion> {
  const pid = get(sessionProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<Marca>('carta-marketing', 'update_perfil', {
      project_id: pid,
      campos: cambios
    });
    // DICTAMEN en la respuesta (INV4). El refresco COMPLETO lo da la señal
    // marketing.perfil.actualizado (R3) — no se escribe el store aqui.
    return { seccion, marca: res.data ?? {} };
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

export function declararEsencia(campos: Partial<MarcaEsencia>): Promise<DictamenDeclaracion> {
  return actualizarMarca('esencia', { esencia: campos });
}

export function declararVoz(campos: Partial<MarcaVoz>): Promise<DictamenDeclaracion> {
  return actualizarMarca('voz', { voz: campos });
}

export function declararVisual(campos: Partial<MarcaVisual>): Promise<DictamenDeclaracion> {
  return actualizarMarca('visual', { visual: campos });
}

export function declararPublico(campos: Partial<MarcaPublico>): Promise<DictamenDeclaracion> {
  return actualizarMarca('publico', { publico: campos });
}

// =============================================================================
// SEÑAL-REFRESH (R3) — marketing.perfil.actualizado re-lee el informe
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENAL_MARCA = ['marketing.perfil.actualizado'];

/**
 * Suscripción a la señal pareada (1 única para todo el módulo). El debounce
 * absorbe tandems improbables pero legítimos (v2 futuras, semillas externas):
 * si la señal no llegara (bus degradado), el dictamen del editor sigue
 * asignando el estado paso a paso — doble confirmación, nunca recarga.
 */
export function initCartaMarketingSubscriptions(): () => void {
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
