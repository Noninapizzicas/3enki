/**
 * CartaDesign Store — la cara del JEFE del COMPOSITOR del diseño impreso de la
 * carta (F7, composición según esquema-jefe/ de carta-design, ciclo v2):
 *
 *   SELECCIONAR  la carta a diseñar (ref-select desde carta.list).
 *   COMPONER     (LA DECISIÓN) 1 llamada design.contexto_diseno {carta_id}
 *                → dictamen visual {carta, marca, alergenos_catalogo}.
 *   VALIDAR      (FRENO) design.validar {carta_id, html} → {valid, errors}.
 *   GUARDAR      design.save {carta_id, html} → 201 meta + señal generada.
 *   VER          la galería (cinta-estado design.gallery).
 *
 * CANAL RPC (verificado — molde importador.ts / carta-jefe.ts): publish a topic
 * con ASTERISCO LITERAL core/{ASTERISCO}/events/design/<op>/request (en el
 * comentario se escribe con marcador: el 'asterisco + barra' LITERAL CERRARÍA
 * este bloque); respuesta pareada suscrita dot-notation 'design.<op>.response',
 * top-level {request_id, status, data|error} — NO anidada bajo result. El
 * publish() de $lib/ui-core/mqtt envuelve en EventEnvelope; request_id propio +
 * project_id en el cuerpo.
 *
 * CONTRATO REAL (index.js reflejo-2.1.0, 230 líneas leídas enteras):
 *   - contexto_diseno { project_id, carta_id } → 200 {carta, marca,
 *     alergenos_catalogo} (L78-99). Marca best-effort: null si carta-marketing
 *     no responde. Alérgenos = los 14 del Anexo II (1169/2011).
 *   - validar { project_id, carta_id, html } → 200 {valid, errors[{code,
 *     message, faltan?}], productos_total, productos_faltan} (L161-169).
 *     EL FRENO: compara contra la carta REAL (carta.get), no contra lo que el
 *     LLM afirme.
 *   - save { project_id, carta_id, html, nombre?, formato? } → 201 meta
 *     {carta_id, nombre, formato, generado_at, generado_por, filename,
 *     size_bytes} (L172-210). RE-VALIDA como gate inquebrantable (422 si no
 *     representa la carta) + 2º freno de render real (best-effort). Emite
 *     carta.html.generada.
 *   - gallery { project_id, carta_id? } → metas (orden fecha desc, L213-227).
 *   - carta.list { project_id } → [{id, nombre, estado, version,
 *     productos_count, categorias_count}] (carta-manager L190-201, ref-select).
 *
 * SEÑAL pareada (VERIFICADA en código — index.js L205): el reflejo publica
 * `carta.html.generada` { project_id, carta_id, filename, correlation_id,
 * timestamp } al guardar; el eventBus del core la emite al topic MQTT
 * core/STAR/events/carta/html/generada y el frontend suscribe en dot notation.
 * Doble confirmación: dictamen RPC inmediato + señal que re-lee la galería
 * (debounce 60ms) — nunca recarga, nunca estado optimista.
 *
 * Moneda: SIN € — el diseño de la carta no tiene cifras (es look impreso).
 *
 * TODO RPC inyecta project_id (lección bug escandallo): mqtt-request NO lo
 * inyecta; el store lee get(activeProjectId) y lo pasa en CADA llamada, con
 * guard si no hay proyecto activo.
 *
 * Molde: frontend/src/lib/modules/menu-generator/stores/importador.ts.
 */

import { writable, derived, get } from 'svelte/store';
import { publish, subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { activeProjectId } from '$lib/stores/projects';

// =============================================================================
// TIPOS — shapes reales del reflejo (index.js) y de carta-manager (carta.list)
// =============================================================================

/** Una carta del listado (carta-manager _list L196) — el ref-select. */
export interface CartaRef {
  id: string;
  nombre: string;
  descripcion?: string;
  version?: number;
  estado?: string;
  tags?: string[];
  productos_count?: number;
  categorias_count?: number;
  updated_at?: string;
  [key: string]: unknown;
}

/** La carta completa a diseñar (carta.get → data). */
export interface CartaDiseno {
  meta?: { id?: string; nombre?: string; version?: number; estado?: string; [k: string]: unknown };
  productos?: Array<{ id?: string; nombre?: string; precio?: number; alergenos?: string[]; [k: string]: unknown }>;
  categorias?: Array<{ id?: string; nombre?: string; [k: string]: unknown }>;
  [key: string]: unknown;
}

/** La identidad de marca (carta-marketing.get_perfil → data). Best-effort. */
export interface MarcaDiseno {
  esencia?: { nombre?: string; lema?: string; [k: string]: unknown };
  voz?: { tono?: string[]; registro?: string; [k: string]: unknown };
  publico?: { quien?: string; actitud?: string; [k: string]: unknown };
  visual?: { colores?: Record<string, string>; tipografias?: Record<string, string>; estilo?: string; logo?: string; [k: string]: unknown };
  negocio?: { local?: Record<string, unknown>; [k: string]: unknown };
  [key: string]: unknown;
}

/** Un alérgeno del Anexo II (1169/2011). */
export interface Alergeno {
  id: string;
  nombre: string;
  emoji?: string;
  [key: string]: unknown;
}

/** Dictamen 200 de contexto_diseno (L94-98) — el material del diseño. */
export interface DictamenContexto {
  carta: CartaDiseno;
  marca: MarcaDiseno | null;
  alergenos_catalogo: Alergeno[];
  [key: string]: unknown;
}

/** Un error del freno (validar/save). */
export interface ErrorDiseno {
  code: string;
  message: string;
  faltan?: string[];
  [key: string]: unknown;
}

/** Dictamen 200 de validar (L168) — el veredicto del freno. */
export interface DictamenValidar {
  valid: boolean;
  errors: ErrorDiseno[];
  productos_total: number;
  productos_faltan: number;
  [key: string]: unknown;
}

/** Meta de un diseño guardado (L196-201) — la galería. */
export interface MetaDiseno {
  carta_id: string;
  nombre: string | null;
  formato: string | null;
  generado_at: string;
  generado_por: string;
  filename: string;
  size_bytes: number;
  [key: string]: unknown;
}

/** Error RPC con status HTTP-like para mapearlo a mensaje nombrado. */
export class DesignRpcError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(mensaje: string, status: number, code: string) {
    super(mensaje);
    this.name = 'DesignRpcError';
    this.status = status;
    this.code = code;
  }
}

// =============================================================================
// RPC — ÚNICO canal hacia el reflejo (core/*/events, asterisco literal)
// =============================================================================

/** ≥ 20s: contexto_diseno anida carta.get (8s) + carta-marketing.get_perfil (6s). */
const RESPUESTA_TIMEOUT_MS = 20000;

function nuevoRequestId(prefix: string): string {
  return `${prefix}_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

interface OpcionesRpc {
  timeout_ms?: number;
  /** Sufijo del topic de respuesta (dot-notation); default el propio canal. */
  response_suffix?: string;
}

/**
 * Request/response por el canal verificado: publica a
 * `core/{ASTERISCO}/events/<dominio>/<op>/request` (LITERAL — el EventBus del
 * core solo re-emite a módulos locales los topics con '*'; dot-notation NO
 * cubre este caso) y espera la respuesta pareada filtrando request_id.
 * Respuesta top-level {request_id, status, data|error}.
 */
async function rpcEvento<T = unknown>(
  dominio: string,
  op: string,
  payload: Record<string, unknown>,
  { timeout_ms = RESPUESTA_TIMEOUT_MS, response_suffix }: OpcionesRpc = {}
): Promise<T> {
  const request_id = nuevoRequestId(dominio.replace(/[^a-z]/gi, '') || 'rpc');

  const respuesta = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const unsubscribe = mqttSubscribe(response_suffix ?? `${dominio}.${op}.response`, (envelope: unknown) => {
      const r = envelope as { request_id?: string };
      if (r?.request_id !== request_id) return; // respuesta de otro request
      unsubscribe();
      clearTimeout(timer);
      resolve((envelope ?? {}) as Record<string, unknown>);
    });

    const timer = setTimeout(() => {
      unsubscribe();
      reject(new DesignRpcError('sin respuesta del módulo', 0, 'TIMEOUT'));
    }, timeout_ms);

    // Topic con ASTERISCO LITERAL — el cuerpo lleva request_id + project_id.
    publish(`core/*/events/${dominio}/${op}/request`, { request_id, ...payload });
  });

  const status = typeof respuesta.status === 'number' ? respuesta.status : 0;
  if (status >= 400) {
    const error = respuesta.error as { code?: string; message?: string } | undefined;
    throw new DesignRpcError(
      error?.message || `${dominio}.${op} falló (status ${status})`,
      status,
      error?.code || 'RPC_ERROR'
    );
  }
  return (respuesta.data ?? respuesta) as T;
}

// =============================================================================
// LOCALES del store — estado de las transiciones del panel
// =============================================================================

/** La lista de cartas (ref-select) — lectura neutra. */
export const cartasStore = writable<CartaRef[]>([]);
export const cartasLoading = writable<boolean>(false);
export const cartasError = writable<string | null>(null);

/** El dictamen visual de contexto_diseno (null = aún sin componer). */
export const dictamenContexto = writable<DictamenContexto | null>(null);
export const componiendo = writable<boolean>(false);

/** El dictamen del freno validar (null = aún sin validar). */
export const dictamenValidar = writable<DictamenValidar | null>(null);
export const validando = writable<boolean>(false);

/** El dictamen de save (201 meta) — null = aún sin guardar. */
export const dictamenSave = writable<MetaDiseno | null>(null);
export const guardando = writable<boolean>(false);

/** La galería de diseños guardados (cinta-estado). */
export const galeriaStore = writable<MetaDiseno[]>([]);
export const galeriaLoading = writable<boolean>(false);

/** Error global de la última transición, YA NOMBRADO o null. */
export const errorDesign = writable<string | null>(null);

/** Cinta derivada: ¿hay dictamen visual? ¿cuántos diseños guardados? */
export const cinta = derived(
  [dictamenContexto, galeriaStore],
  ([$ctx, $gal]) => ({
    compuesto: $ctx != null,
    cartaNombre: $ctx?.carta?.meta?.nombre ?? $ctx?.carta?.nombre ?? null,
    marcaPresente: $ctx?.marca != null,
    disenosGuardados: $gal.length
  })
);

/** Mensajes NOMBRADOS por error (el jefe sabe qué pasó y qué hacer). */
export function describeError(err: unknown): string {
  if (err instanceof DesignRpcError) {
    if (err.code === 'TIMEOUT') return 'sin respuesta del módulo (espera 20s — el reflejo hidrata carta+marca)';
    if (err.status === 400 || err.code === 'INVALID_INPUT') return 'INPUT rechazado: falta carta_id o el HTML';
    if (err.status === 404 || err.code === 'RESOURCE_NOT_FOUND') return 'carta no encontrada: revisa que exista en carta-manager';
    if (err.status === 422 || err.code === 'UPSTREAM_INVALID_RESPONSE') return 'el diseño NO representa la carta (faltan productos o alérgenos, o renderiza roto) — NO guardado';
    if (err.status === 503 || err.code === 'UPSTREAM_UNREACHABLE') return 'carta-manager/carta-marketing no responden (custodio caído — reintenta)';
    if (err.status >= 500) return `el reflejo falló (status ${err.status}) — revisa carta-design`;
    return err.message;
  }
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LECTURAS (INFORMARSE) — ref-select + galería
// =============================================================================

/** Carga la lista de cartas del proyecto (ref-select). */
export async function cargarCartas(): Promise<void> {
  const pid = get(activeProjectId);
  if (!pid) return;
  cartasLoading.set(true);
  cartasError.set(null);
  try {
    const data = await rpcEvento<CartaRef[]>('carta', 'list', { project_id: pid });
    cartasStore.set(Array.isArray(data) ? data : []);
  } catch (err) {
    cartasError.set(describeError(err));
  } finally {
    cartasLoading.set(false);
  }
}

/** Carga la galería de diseños guardados (cinta-estado). */
export async function cargarGaleria(carta_id?: string): Promise<void> {
  const pid = get(activeProjectId);
  if (!pid) return;
  galeriaLoading.set(true);
  try {
    const data = await rpcEvento<MetaDiseno[]>('design', 'gallery', {
      project_id: pid,
      ...(carta_id ? { carta_id } : {})
    });
    galeriaStore.set(Array.isArray(data) ? data : []);
  } catch (err) {
    errorDesign.set(describeError(err));
  } finally {
    galeriaLoading.set(false);
  }
}

// =============================================================================
// LA DECISIÓN — COMPONER (contexto_diseno)
// =============================================================================

/**
 * COMPONER el look impreso: 1 llamada design.contexto_diseno {carta_id} →
 * dictamen visual {carta, marca, alergenos_catalogo} en la respuesta. La señal
 * carta.html.generada re-confirma (debounce 60ms). Botón muerto en vuelo.
 */
export async function componerDiseno(carta_id: string): Promise<DictamenContexto> {
  const pid = get(activeProjectId);
  if (!pid) throw new DesignRpcError('no hay proyecto activo', 0, 'NO_PROJECT');
  if (!carta_id) throw new DesignRpcError('falta la carta a diseñar', 400, 'INVALID_INPUT');

  componiendo.set(true);
  errorDesign.set(null);
  dictamenContexto.set(null);
  try {
    const data = await rpcEvento<DictamenContexto>('design', 'contexto_diseno', {
      project_id: pid,
      carta_id
    });
    const dictamen: DictamenContexto = {
      carta: (data?.carta ?? {}) as CartaDiseno,
      marca: (data?.marca ?? null) as MarcaDiseno | null,
      alergenos_catalogo: Array.isArray(data?.alergenos_catalogo) ? data.alergenos_catalogo : [],
      ...(data as object)
    };
    dictamenContexto.set(dictamen);
    return dictamen;
  } catch (err) {
    errorDesign.set(describeError(err));
    throw err;
  } finally {
    componiendo.set(false);
  }
}

// =============================================================================
// EL FRENO — VALIDAR (funcion pura, no escribe)
// =============================================================================

/**
 * VALIDAR el diseño: design.validar {carta_id, html} → {valid, errors,
 * productos_total, productos_faltan}. El freno compara contra la carta REAL.
 */
export async function validarDiseno(carta_id: string, html: string): Promise<DictamenValidar> {
  const pid = get(activeProjectId);
  if (!pid) throw new DesignRpcError('no hay proyecto activo', 0, 'NO_PROJECT');
  if (!carta_id) throw new DesignRpcError('falta la carta a validar', 400, 'INVALID_INPUT');
  if (!html.trim()) throw new DesignRpcError('falta el HTML del diseño', 400, 'INVALID_INPUT');

  validando.set(true);
  errorDesign.set(null);
  dictamenValidar.set(null);
  try {
    const data = await rpcEvento<DictamenValidar>('design', 'validar', {
      project_id: pid,
      carta_id,
      html
    });
    const dictamen: DictamenValidar = {
      valid: data?.valid === true,
      errors: Array.isArray(data?.errors) ? data.errors : [],
      productos_total: Number(data?.productos_total ?? 0),
      productos_faltan: Number(data?.productos_faltan ?? 0),
      ...(data as object)
    };
    dictamenValidar.set(dictamen);
    return dictamen;
  } catch (err) {
    errorDesign.set(describeError(err));
    throw err;
  } finally {
    validando.set(false);
  }
}

// =============================================================================
// GUARDAR (persiste) — RE-VALIDA como gate inquebrantable
// =============================================================================

/**
 * GUARDAR el diseño: design.save {carta_id, html, nombre?, formato?} → 201 meta.
 * El reflejo RE-VALIDA (422 si no representa la carta) + 2º freno de render.
 * Emite carta.html.generada (la señal re-lee la galería).
 */
export async function guardarDiseno(
  carta_id: string,
  html: string,
  nombre?: string,
  formato?: string
): Promise<MetaDiseno> {
  const pid = get(activeProjectId);
  if (!pid) throw new DesignRpcError('no hay proyecto activo', 0, 'NO_PROJECT');
  if (!carta_id) throw new DesignRpcError('falta la carta a guardar', 400, 'INVALID_INPUT');
  if (!html.trim()) throw new DesignRpcError('falta el HTML del diseño', 400, 'INVALID_INPUT');

  guardando.set(true);
  errorDesign.set(null);
  dictamenSave.set(null);
  try {
    const data = await rpcEvento<MetaDiseno>('design', 'save', {
      project_id: pid,
      carta_id,
      html,
      ...(nombre ? { nombre } : {}),
      ...(formato ? { formato } : {})
    });
    const meta: MetaDiseno = {
      carta_id: String(data?.carta_id ?? carta_id),
      nombre: data?.nombre ?? null,
      formato: data?.formato ?? null,
      generado_at: String(data?.generado_at ?? ''),
      generado_por: String(data?.generado_por ?? ''),
      filename: String(data?.filename ?? ''),
      size_bytes: Number(data?.size_bytes ?? 0),
      ...(data as object)
    };
    dictamenSave.set(meta);
    return meta;
  } catch (err) {
    errorDesign.set(describeError(err));
    throw err;
  } finally {
    guardando.set(false);
  }
}

// =============================================================================
// SEÑAL-REFRESH — carta.html.generada re-lee la galería (debounce 60ms)
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENAL_DISENO = ['carta.html.generada'];

/**
 * Suscripción a la señal pareada (1 única para todo el módulo). El debounce
 * absorbe tándems improbables pero legítimos: si la señal no llegara (bus
 * degradado), el dictamen del save sigue asignando el estado paso a paso —
 * doble confirmación, nunca recarga.
 */
export function initCartaDesignSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (recargaProgramada) return;
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(activeProjectId);
      if (activo) void cargarGaleria();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(activeProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENAL_DISENO) {
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

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCartaDesign(): void {
  cartasStore.set([]);
  cartasError.set(null);
  dictamenContexto.set(null);
  dictamenValidar.set(null);
  dictamenSave.set(null);
  galeriaStore.set([]);
  errorDesign.set(null);
  componiendo.set(false);
  validando.set(false);
  guardando.set(false);
}
