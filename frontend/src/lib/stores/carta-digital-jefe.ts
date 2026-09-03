/**
 * Carta Digital Jefe Store — la cara del JEFE del escaparate (F7, composición
 * según modules/pizzepos/carta-digital/esquema-jefe/ — ciclo v2 #9):
 *
 *   1. INFORMARSE   get_config (SIN 404: default nombrado, INV2) + get_diseno +
 *                   cinta de la proyección (get_carta_publica como DATO DE
 *                   FONDO) + PREVIEW dictamen visual (iframe srcdoc del HTML REAL).
 *   2. DECLARAR     editor-bloque CONFIG DEL CANAL → update_config { campos }
 *                   (merge profundo: solo lo enviado cambia, dictamen = 200
 *                   config COMPLETO — INV5).
 *   3. TRANSICIÓN   PUBLICAR con confirmador-nombrado (freno local: sin preview
 *                   válido o sin carta en el canal → bloquear) → dictamen de la
 *                   respuesta { alojada_url, aviso, ... } + señal cartadigital.publicado.
 *
 * CONTRATO REAL (verificado en modules/pizzepos/carta-digital/index.js, 589 líneas):
 *   - get_config {project_id} → 200 { _version, dominio_publico, opciones_visualizacion }
 *     SIEMPRE (default { _version:'1.0', dominio_publico:null, opciones_visualizacion:{} }
 *     si no hay fichero válido — INV2, L564-567 + _leerConfig L207-211).
 *   - update_config { campos } → 200 config COMPLETO (dictamen; L568-581: solo
 *     aplica dominio_publico + opciones_visualizacion, merge por bloques, el resto
 *     PRESERVA). Señal: cartadigital.config.actualizada (L579).
 *   - get_diseno {} → 200 { card_template, tema_css, detalle_template?, layout? }
 *     (L292-295; default nulls si no hay fichero). Señal: cartadigital.diseno.actualizada (L237).
 *   - preview {} → 200 { html, productos, extras_sin_precio, aviso_extras? } — el
 *     MISMO generateStaticHTML que ve el cliente (variante suelta, checkout
 *     WhatsApp, imágenes inlineadas data: URI), NO escribe nada (L497-538).
 *     Errores nombrados: 404 RESOURCE_NOT_FOUND sin carta asignada al canal ·
 *     503 fuentes caídas (INV4b).
 *   - publicar {} → 200 { alojada_url, bundle_dir, productos, imagenes_copiadas,
 *     extras_sin_precio, aviso_extras?, feature_www, aviso } (L443-454).
 *     Frenos: 412 PRECONDITION_FAILED si el objetivo no es el ÚLTIMO proyecto
 *     activado (L309-313) · 422 si el verificador mira y el render sale roto o
 *     overflow_movil (L398-408) · 404 sin carta (L317→L483). Señal:
 *     cartadigital.publicado { project_id, slug, productos, imagenes } (L437).
 *     TIMEOUT: publicar renderiza + verifica con Chromium → 30s.
 *   - get_carta_publica {} → proyección al vuelo (utilización-anotada: la PWA la
 *     consume; en el panel solo alimenta la cinta — nº productos, extras sin precio).
 *
 * LAS 4 SEÑALES REALES (verificadas en index.js — la premisa «sin publishes» del
 * module.json era hueco del manifest, el código publica 4):
 *   cartadigital.config.actualizada (L579) · cartadigital.publicado (L437) ·
 *   cartadigital.carta_publica.actualizada (L161-166, INDIRECTA del custodio:
 *   _reemitir re-emite carta.actualizada/carta.editada/carta.borrada/
 *   contenido.actualizado/marketing.perfil.actualizado → debounce 60ms) ·
 *   cartadigital.diseno.actualizada (L237).
 * Doble confirmación (patrón entrega/escandallo): dictamen EN LA RESPUESTA
 * (nunca estado optimista) + señal que re-lee con debounce.
 *
 * Mutaciones DIRECTAS por mqttRequest (los 6 ui_handlers del dominio
 * 'cartadigital' existen — verificados en module.json): NADA de canales
 * core/.../events ni reflejos de custodios aquí.
 *
 * Molde: modules/entrega/stores/entrega.ts y modules/pedidos/stores/pedidos.ts
 * (mqttRequest + mqttSubscribe dot + debounce + cleanup + extraerProjectId).
 */

import { writable, derived, get } from 'svelte/store';
import { mqttRequest, MqttRequestError, MqttTimeoutError } from '$lib/ui-core/mqtt-request';
import { subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por los ui_handler de carta-digital (index.js)
// =============================================================================

/** Opciones de visualización del canal (config.opciones_visualizacion). */
export interface OpcionesVisualizacion {
  /** Símbolo display que pinta la PWA (default '€' — INV6: símbolo, no cifra). */
  moneda?: string;
  /** Teléfono del checkout WhatsApp (normalizado por el módulo). */
  whatsapp_telefono?: string;
  /** Mensaje que precarga WhatsApp: «¡Hola! Quiero pedir:». */
  mensaje_pedido?: string;
  /** Soportado por config/template pero SIN pantalla hoy (hueco ABIERTO: requiere tienda-api). */
  pago_online?: boolean;
  pedido_endpoint?: string;
  [key: string]: unknown;
}

/** Config del canal — lo ÚNICO que el proyector posee. */
export interface ConfigCanal {
  _version?: string;
  /** URL propia o null = URL alojada /<ns>/<slug>. */
  dominio_publico?: string | null;
  opciones_visualizacion?: OpcionesVisualizacion;
  _updated_at?: string;
  [key: string]: unknown;
}

/** Diseño que compuso Enki (guardado vía cartadigital.guardar_diseno.request). */
export interface DisenoCanal {
  card_template?: string | null;
  tema_css?: string | null;
  detalle_template?: string | null;
  layout?: Record<string, unknown> | null;
  generado_at?: string;
  [key: string]: unknown;
}

/** Respuesta de preview (L532-533): dictamen visual del HTML REAL. */
export interface PreviewDictamen {
  html: string;
  productos: number;
  extras_sin_precio: number;
  aviso_extras?: string;
}

/** Respuesta de publicar (L443-454): dictamen de la transición. */
export interface DictamenPublicacion {
  alojada_url: string;
  bundle_dir: string;
  productos: number;
  imagenes_copiadas: number;
  extras_sin_precio: number;
  aviso_extras?: string;
  feature_www: boolean;
  aviso: string;
}

/** Proyección al vuelo que consume la PWA (dato de fondo de la cinta). */
export interface CartaPublicaProyeccion {
  categorias?: unknown[];
  productos?: Array<Record<string, unknown>>;
  alergenos_leyenda?: unknown;
  branding?: { nombre?: string; colores?: Record<string, string>; logo?: string | unknown };
  [key: string]: unknown;
}

/** Estado 'sin carta asignada al canal' — 404 NOMBRADO (INV4b), no error genérico. */
export interface ProyeccionFaltante {
  faltante: true;
  mensaje: string;
}

// =============================================================================
// STORES — lecturas-only (R2): solo las respuestas RPC escriben aquí
// =============================================================================

/** Config vigente del canal (la ÚNICA fuente del panel; null = aún sin leer). */
export const configStore = writable<ConfigCanal | null>(null);
/** Diseño aplicable (informe: lo compone Enki, no se edita aquí). */
export const disenoStore = writable<DisenoCanal | null>(null);
/** Carta proyectada (dato de fondo de la cinta) o estado 404 nombrado. */
export const proyeccionStore = writable<CartaPublicaProyeccion | ProyeccionFaltante | null>(null);
/** Extras de ingredientes sin precio (dato honesto: llega en el dictamen del preview). */
export const extrasSinPrecio = writable<number | null>(null);

export const lecturaLoading = writable<boolean>(false);
export const lecturaError = writable<string | null>(null);

/** Operaciones en vuelo (update_config/publicar/preview). */
export const mutacionesPendientes = writable<number>(0);
/** Último error de mutación (global; los de editor/publicar también lo anota la vista). */
export const errorMutacion = writable<string | null>(null);

/** Última publicación confirmada, dictamen completo (null = sin publicar aún en sesión). */
export const ultimaPublicacion = writable<DictamenPublicacion | null>(null);
/** HTML del último preview dictaminado (iframe srcdoc; null = pedirlo). */
export const previewHtml = writable<string | null>(null);

/** Proyecto del que se leyó lo actualmente en store (higiene multi-tenant). */
let projectDeLaLectura: string | null = null;

/**
 * Cinta del canal, derivada SOLO de las lecturas (nunca asumida):
 * estado del canal + nº productos de la proyección + extras sin precio.
 */
export const cinta = derived(
  [configStore, proyeccionStore, extrasSinPrecio],
  ([$cfg, $proy, $extras]) => {
    const esProyeccion = (x: CartaPublicaProyeccion | ProyeccionFaltante | null): x is CartaPublicaProyeccion =>
      !!x && !('faltante' in x && (x as ProyeccionFaltante).faltante);
    const proy = esProyeccion($proy) ? $proy : null;
    const productos = proy?.productos?.length ?? null;
    return {
      /** ¿El canal tiene carta asignada? false = 404 nombrado («revisa tarifas»). */
      proyectable: !!proy,
      mensajeFaltante: $proy && !esProyeccion($proy) ? ($proy as ProyeccionFaltante).mensaje : null,
      productos,
      /** extras de ingredientes con precio>0 no servidos (dato honesto del reflejo). */
      sinPrecio: $extras ?? null,
      /** null = URL alojada /<ns>/<slug> · string = dominio propio (INV2). */
      dominio: $cfg?.dominio_publico ?? null,
      configurado: !!$cfg && ($cfg.dominio_publico != null || Object.keys($cfg.opciones_visualizacion ?? {}).length > 0),
      actualizada: $cfg?._updated_at ?? null
    };
  }
);

export function describeError(err: unknown): string {
  if (err instanceof MqttTimeoutError) return 'sin respuesta del bus';
  if (err instanceof MqttRequestError) return `${err.code}: ${err.message}`;
  return (err as Error)?.message || 'error desconocido';
}

/** ¿El error es el 404 NOMBRADO de proyección sin carta (estado inicial legítimo)? */
export function es404Proyeccion(err: unknown): boolean {
  return err instanceof MqttRequestError && err.status === 404;
}

/** Mensaje del error RPC (typado — el code ya viene dentro de describeError). */
function mensajeError(err: unknown): string {
  return err instanceof MqttRequestError ? err.response?.error?.message || err.message : String((err as Error)?.message ?? err);
}

// =============================================================================
// LECTURAS (INFORMARSE) — la única escritura del store (R2)
// =============================================================================

/** Config vigente (SIN 404 — INV2: default nombrado si no hay fichero). */
export async function loadConfig(): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) return;
  try {
    const res = await mqttRequest<ConfigCanal>('cartadigital', 'get_config', { project_id: pid });
    projectDeLaLectura = pid;
    configStore.set(res.data ?? {});
  } catch (err) {
    lecturaError.set(describeError(err));
  }
}

/** Diseño de Enki (informe; nulls si aún no compuso — estado nombrado). */
export async function loadDiseno(): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) return;
  try {
    const res = await mqttRequest<DisenoCanal>('cartadigital', 'get_diseno', { project_id: pid });
    disenoStore.set(res.data ?? {});
  } catch {
    disenoStore.set({ card_template: null, tema_css: null }); // estado nombrado del reflejo
  }
}

/** Proyección al vuelo (dato de fondo de la cinta). 404 = ESTADO NOMBRADO, no error. */
export async function loadProyeccion(): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) return;
  try {
    const res = await mqttRequest<CartaPublicaProyeccion>('cartadigital', 'get_carta_publica', { project_id: pid });
    proyeccionStore.set({ ...(res.data ?? {}) });
  } catch (err) {
    if (es404Proyeccion(err)) {
      proyeccionStore.set({ faltante: true, mensaje: mensajeError(err) });
    }
    // 503 fuentes caídas u otro: la cinta mantiene lo último; no ensuciamos el informe.
  }
}

/** Carga completa del informe (montaje del panel / re-lectura tras señal). */
export async function loadInforme(): Promise<void> {
  const pid = get(sessionProjectId);
  if (!pid) return;
  lecturaLoading.set(true);
  lecturaError.set(null);
  await Promise.all([loadConfig(), loadDiseno(), loadProyeccion()]);
  lecturaLoading.set(false);
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCartaDigitalJefe(): void {
  configStore.set(null);
  disenoStore.set(null);
  proyeccionStore.set(null);
  extrasSinPrecio.set(null);
  previewHtml.set(null);
  ultimaPublicacion.set(null);
  lecturaError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (jefe) — update_config: LA DECLARACIÓN del canal. Dictamen en la
// respuesta (200 = config COMPLETO); la señal re-lee (doble confirmación).
// =============================================================================
export type CamposConfig = {
  dominio_publico?: string | null;
  opciones_visualizacion?: OpcionesVisualizacion;
};

/** Dictamen legible para el editor: qué quedó guardado tras la llamada. */
export interface DictamenConfig {
  config: ConfigCanal;
}

export async function declararConfig(
  campos: CamposConfig
): Promise<DictamenConfig> {
  const pid = get(sessionProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<ConfigCanal>('cartadigital', 'update_config', {
      project_id: pid,
      campos
    });
    // DICTAMEN en la respuesta (INV5): 200 = config COMPLETO ya persistido.
    const config = res.data ?? {};
    configStore.set(config);
    projectDeLaLectura = pid;
    return { config };
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// PREVIEW (dictamen visual) — el HTML REAL para el iframe srcdoc. NO asume:
// el jefe lo pide a demanda y tras cada señal si estaba abierto (R3).
// =============================================================================
export async function dictaminarPreview(): Promise<PreviewDictamen> {
  const pid = get(sessionProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<PreviewDictamen>('cartadigital', 'preview', { project_id: pid }, { timeout: 30000 });
    previewHtml.set(res.data?.html ?? null);
    // El preview se genera de las mismas fuentes que la proyección: los extras
    // sin precio del dictamen alimentan la cinta (dato honesto del reflejo).
    if (typeof res.data?.extras_sin_precio === 'number') {
      extrasSinPrecio.set(res.data.extras_sin_precio);
    }
    return res.data;
  } catch (err) {
    previewHtml.set(null);
    if (es404Proyeccion(err)) {
      proyeccionStore.set({ faltante: true, mensaje: mensajeError(err) });
    }
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// PUBLICAR (transición) — confirmador-nombrado en la vista; AQUÍ el RPC con
// dictamen completo. Freno del panel (se aplica en la vista antes de llamar):
// sin proyección (404) o con errores de diseño → no se dispara.
// =============================================================================
export async function publicarCarta(): Promise<DictamenPublicacion> {
  const pid = get(sessionProjectId);
  if (!pid) throw new Error('sin proyecto activo');
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    const res = await mqttRequest<DictamenPublicacion>('cartadigital', 'publicar', { project_id: pid }, { timeout: 30000 });
    ultimaPublicacion.set(res.data ?? null);
    // Dictamen en la respuesta + señal cartadigital.publicado re-confirmando.
    return res.data;
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

// =============================================================================
// SEÑAL-REFRESH (R3) — las 4 señales reales del proyector (index.js):
//   tarjeta propia:  config.actualizada L579 · publicado L437 ·
//                    diseno.actualizada L237
//   INDIRECTA:       carta_publica.actualizada L161-166 (_reemitir: la
//                    re-emisión de las 8 fuentes del custodio) → la cinta y el
//                    preview abierto se re-proyectan con debounce 60ms.
// =============================================================================

/** Extrae project_id del envelope tolerando los shapes del repo (como pedidos). */
function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

const SENALES = [
  'cartadigital.config.actualizada',
  'cartadigital.publicado',
  'cartadigital.diseno.actualizada',
  'cartadigital.carta_publica.actualizada'
];

/**
 * Suscripción a las 4 señales reales (1 función para todo el módulo). El
 * debounce absorbe tandas (una edición del custodio dispara re-emitir;
 * publicar dispara publicado + carta_publica de fuentes, etc.): 1 re-lectura.
 * Sin ninguna señal, el dictamen de la respuesta basta (refetch directo).
 */
export function initCartaDigitalJefeSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (recargaProgramada) return;
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      const activo = get(sessionProjectId);
      if (activo) void loadInforme();
    }, 60);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENALES) {
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