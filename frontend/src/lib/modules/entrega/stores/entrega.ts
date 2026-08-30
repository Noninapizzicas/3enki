/**
 * Entrega Store — la cara del JEFE sobre la política de entrega (F7,
 * composición según esquema-jefe/ de entrega): informe con origen + 2
 * editor-bloque (reparto, estimación) que declaran via reglas.actualizar.
 *
 * Fuente de la lógica (verificada en el repo, entrega reflejo-0.1.0):
 *   - modules/entrega/index.js (131 líneas, leídas enteras): contrato real.
 *   - modules/entrega/esquema-jefe/ (pasada-1, pasada-2, anatomía, esquema.md):
 *     composición 3 capas, formas UI, señales pareadas.
 *
 * CONTRATO REAL (index.js):
 *   - reglas.leer {} → { reglas: { esquema, reparto, estimacion }, fuente }
 *     donde fuente = 'persistida' | 'default'. SIN 404: la respuesta SIEMPRE
 *     llega — falta de política es estado nombrado (defaults con nulls), no
 *     error (INV2). La UI representa default = "sin política — usa los defaults".
 *   - reglas.actualizar { reparto: {...} } | { estimacion: {...} } →
 *     200 { reglas: nuevas } (el DICTAMEN en la propia respuesta, INV5).
 *     Merge profundo por bloque: los campos ausentes se preservan (INV3).
 *     Validadores: números >= 0 o null, activo boolean — política incompleta
 *     es estado legítimo, no error (INV4).
 *   - Moneda: reparto.coste en EUR (convención del dominio; el contrato
 *     valida número >= 0 — sin conversión a céntimos, INV6).
 *
 * Señal pareada (VERIFICADA en código — la premisa "módulo sin señal" la
 * corrige el propio ConfigCustodio):
 *   reglas.actualizar → ConfigCustodio publica `entrega.reglas.actualizadas`
 *   { project_id, reglas } al persistir (config-custodio.js L119); el eventBus
 *   del core la emite al topic MQTT core/STAR/events/entrega/reglas/actualizadas
 *   y el frontend suscribe en dot notation (mismo patrón que masa.reglas.actualizadas). Doble
 *   confirmación: dictamen RPC inmediato + señal que re-lee el informe.
 *
 * Reglas del esquema-jefe:
 *   R2 — toda mutación va por mqttRequest y NUNCA asume estado local: el
 *        store solo escribe con datos de la lectura reglas.leer.
 *   R3 — el refresco lo da la SEÑAL del bus (nunca recarga): tras declarar,
 *        la señal re-dispara la lectura; el dictamen inmediato lo da la
 *        respuesta de la mutación (éxito/fracaso), no el estado local.
 *
 * Patrón del repo: molde exacto de modules/pedidos/stores/pedidos.ts y
 * modules/ingredientes/stores/ingredientes.ts — mqttRequest + suscripción
 * dot notation + debounce + cleanup + describeError.
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — formas reales devueltas por entrega.reglas.leer (index.js + custodio)
// =============================================================================

/** Bloque reparto del contrato entrega-v1 ({@link DEFAULT_REGLAS} del módulo). */
export interface ReglasReparto {
  /** Palanca maestra: si false, no hay reparto propio (el resto no se mira). */
  activo?: boolean;
  /** km de radio (>= 0 o null = por declarar). */
  radio_km?: number | null;
  /** EUR por reparto (>= 0 o null = por declarar). */
  coste?: number | null;
  /** min/km para el estimador de tiempo (>= 0 o null = por declarar). */
  minutos_por_km?: number | null;
  [key: string]: unknown;
}

/** Bloque estimación del contrato entrega-v1. */
export interface ReglasEstimacion {
  /** Minutos de preparación base (>= 0 o null = por declarar). */
  minutos_preparacion_base?: number | null;
  /** Minutos por item del pedido (>= 0 o null = por declarar). */
  minutos_por_item?: number | null;
  [key: string]: unknown;
}

/** Reglas completas tal como las persiste el custodio (entrega-v1). */
export interface ReglasEntrega {
  esquema?: string;
  reparto?: ReglasReparto;
  estimacion?: ReglasEstimacion;
  [key: string]: unknown;
}

/** Respuesta de reglas.leer: la política + su ORIGEN (INV2/INV7). */
export interface LecturaReglas {
  reglas: ReglasEntrega;
  /** 'persistida' = declarada por el jefe · 'default' = sin política aún. */
  fuente: string;
  [key: string]: unknown;
}

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** Última lectura de las reglas (la ÚNICA fuente del panel). */
export const reglasStore = writable<LecturaReglas | null>(null);

export const lecturaLoading = writable<boolean>(false);
export const lecturaError = writable<string | null>(null);

/** Contador de mutaciones en vuelo — la vista muestra 'sincronizando…'. */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (globales; los por-editor los anota el panel). */
export const errorMutacion = writable<string | null>(null);

/**
 * Cinta de la política, derivada SOLO de la lectura (nunca asumida):
 * cuántas palancas faltan por declarar y si el reparto está vivo.
 */
export const cinta = derived(reglasStore, ($l) => {
  const rep = $l?.reglas?.reparto ?? {};
  const est = $l?.reglas?.estimacion ?? {};
  const porDeclarar = [rep.radio_km, rep.coste, rep.minutos_por_km, est.minutos_preparacion_base, est.minutos_por_item].filter(
    (v) => v == null
  ).length;
  return {
    /** La palanca maestra que decide si el sistema ve delivery. */
    repartoActivo: rep.activo === true,
    /** PLENAMENTE DECLARADA = la política tiene TODAS sus cifras. */
    completa: porDeclarar === 0 && (est.minutos_preparacion_base ?? null) !== null,
    /** Cifras aún 'por declarar' (los nulls del contrato). */
    porDeclarar,
    /** Origen de la lectura — transparencia (R4): default = sin política. */
    fuente: $l?.fuente ?? null,
    sinPolitica: $l == null || $l.fuente === 'default'
  };
});

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return err.message;
  return (err as Error)?.message || 'error desconocido';
}

/** Dinero/tiempos: EUR n | null → texto legible ('por declarar' si null). */
export function formatearCifra(v: number | null | undefined, unidad: string): string {
  if (v == null) return 'por declarar';
  return `${new Intl.NumberFormat('es-ES', { maximumFractionDigits: 2 }).format(v)} ${unidad}`;
}

/**
 * Texto → número >= 0 o null. Vacío = null (por declarar — el contrato admite
 * rever a null). Coma decimal tolerada. Devuelve null con marca si no parsea.
 */
export function parsearCifra(txt: string): { valor: number | null | undefined; error?: string } {
  const t = (txt ?? '').trim();
  if (t === '') return { valor: null }; // 'por declarar' explícito
  const n = Number(t.replace(',', '.'));
  if (!Number.isFinite(n)) return { valor: undefined, error: 'cifra no válida (ej. 5 o 2,5 · vacío = por declarar)' };
  if (n < 0) return { valor: undefined, error: 'debe ser número >= 0 o vacío (por declarar)' };
  return { valor: n };
}

// =============================================================================
// LECTURA (INFORMARSE) — la única escritura del store (R2)
// =============================================================================

/** Carga la política vigente con su origen. SIN 404: siempre hay respuesta
 *  ('persistida' o 'default' — INV2). El panel representa default como
 *  "sin política — usa los defaults" (estado, no fallo). */
export async function loadReglas(): Promise<void> {
  const pid = get(activeProjectId);
  if (!pid) return;
  lecturaLoading.set(true);
  lecturaError.set(null);
  try {
    const res = await mqttRequest<{ reglas?: ReglasEntrega; fuente?: string }>('entrega', 'reglas.leer', { project_id: pid });
    reglasStore.set({
      reglas: res.data?.reglas ?? {},
      fuente: res.data?.fuente ?? 'default'
    });
  } catch (err) {
    lecturaError.set(describeError(err));
  } finally {
    lecturaLoading.set(false);
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetEntrega(): void {
  reglasStore.set(null);
  lecturaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — LA DECLARACIÓN del jefe, por BLOQUE (INV3: el bloque
// ausente se preserva). El dictamen llega en la respuesta (INV5: 200 {
// reglas: nuevas }) y la señal re-lee la vista (R3) — el store NUNCA asume.
// =============================================================================
export type CambiosReparto = {
  activo?: boolean;
  radio_km?: number | null;
  coste?: number | null;
  minutos_por_km?: number | null;
};
export type CambiosEstimacion = {
  minutos_preparacion_base?: number | null;
  minutos_por_item?: number | null;
};

/** Dictamen legible para el editor: qué quedó persistido tras la llamada. */
export interface DictamenDeclaracion {
  bloque: 'reparto' | 'estimacion';
  reglas: ReglasEntrega;
}

async function actualizarReglas(
  bloque: 'reparto' | 'estimacion',
  cambios: CambiosReparto | CambiosEstimacion
): Promise<DictamenDeclaracion> {
  const pid = get(activeProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<{ reglas?: ReglasEntrega }>('entrega', 'reglas.actualizar', {
      project_id: pid,
      [bloque]: cambios
    });
    // DICTAMEN en la respuesta (INV5). El refresco COMPLETO lo da la señal
    // entrega.reglas.actualizadas (R3) — no se escribe el store aqui.
    return { bloque, reglas: res.data?.reglas ?? {} };
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

export function declararReparto(cambios: CambiosReparto): Promise<DictamenDeclaracion> {
  return actualizarReglas('reparto', cambios);
}

export function declararEstimacion(cambios: CambiosEstimacion): Promise<DictamenDeclaracion> {
  return actualizarReglas('estimacion', cambios);
}

// =============================================================================
// SEÑAL-REFRESH (R3) — entrega.reglas.actualizadas re-lee el informe
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENAL_ENTREGA = ['entrega.reglas.actualizadas'];

/**
 * Suscripción a la señal pareada (1 única para todo el módulo). El debounce
 * absorbe tandems improbables pero legítimos (v2 futuras, semillas externas):
 * si la señal no llegara (bus degradado), el dictamen del editor sigue
 * asignando el estado paso a paso — doble confirmación, nunca recarga.
 */
export function initEntregaSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (recargaProgramada) return;
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(activeProjectId);
      if (activo) void loadReglas();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENAL_ENTREGA) {
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