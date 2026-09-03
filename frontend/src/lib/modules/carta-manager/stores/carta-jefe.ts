/**
 * Carta-jefe Store — la cara del JEFE sobre el custodio de cartas (F7, según
 * esquema-jefe/ de carta-manager). Cinta de estados + ref-select + transiciones
 * nombradas + ALTA DE PRODUCTO + FREÑO validar antes de activar.
 *
 * CANAL (verificado en vivo contra el core real — NO es ui/request):
 *   Publicar a topic MQTT con ASTERISCO LITERAL:
 *     'core/' + '*' + '/events/carta/<op>/request'
 *   El EventBus del core solo re-emite a módulos locales los topics con '*'.
 *   ('ui/request/carta/<op>' de mqtt-request.ts = TIMEOUT: no hay handlers UI;
 *    topic plano 'carta.<op>.request' = nadie responde.)
 *   El publish() de $lib/ui-core/mqtt envuelve en EventEnvelope con
 *   source.core_id='ui-frontend'; el custodio responde por el topic pareado
 *   'core/{ASTERISCO}/events/carta/<op>/response' (equivalente dot-notation:
 *   'carta.<op>.response'). Respuesta top-level: {request_id, status, data|error}
 *   — NO anidada bajo result.
 *   Test real: carta.get de 'despacho-de-pan' → 200 {meta.nombre:'Despacho de Pan'}.
 *
 * Contrato de los 19 reflejos (carta-manager v2.8.0, via _atender en
 * modules/_shared/modulo-hibrido-reflejo.js):
 *   12 JEFE  — save→carta.actualizada · add_product/remove_product/update_product/
 *              update_products/add_category/update_prices/update_extras (7, via
 *              _mutar)→carta.editada+version++ · clonar→carta.actualizada ·
 *              restore→carta.actualizada · activar→carta.actualizada (degrada
 *              otras en_servicio, motivo 'activar') · delete→carta.borrada (soft:
 *              estado→archivada)
 *   6 CONSULTA (sin señal) — get, list, search, stats, versions, validar
 *              (validar es además el FRENO: {valid, errors[]} que bloquea activar)
 *   add_product: producto{nombre, precio:number>=0 EUROS, categoria_id}
 *              obligatorio; id determinista slug(cat)_slug(nombre); 409
 *              ALREADY_EXISTS · 412 PRECONDITION_FAILED categoría no existe.
 *
 * Reglas del esquema-jefe:
 *   R2 — las RPC son las únicas escrituras de estado; las mutaciones nunca asumen.
 *   R3 — el refresco lo da la SEÑAL (carta.actualizada/editada/borrada/creada →
 *        debounce 60ms → re-list). Nunca recarga.
 *   R4 — transiciones nombradas (el panel pone el confirmador; el store devuelve
 *        mensajes nombrados para alimentarlo).
 *   R5 — TODO en euros (number ≥ 0, 2 dec), sin conversión a céntimos.
 *
 * Patrón del repo: molde frontend/src/lib/modules/ingredientes/stores/ingredientes.ts.
 */

import { writable, derived, get } from 'svelte/store';
import { publish, subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — formas reales devueltas por carta.list / get (reflejo v2.8.0)
// =============================================================================

/** Carta normalizada: la carta en disco anida id/nombre bajo `meta`. */
export interface CartaJefe {
  id: string;
  nombre: string;
  estado?: string; // borrador | en_servicio | archivada (shape abierto multi-proyecto)
  version?: number;
  categorias?: Categoria[];
  productos?: Producto[];
  [key: string]: unknown;
}

export interface Categoria {
  id: string;
  nombre: string;
  [key: string]: unknown;
}

export interface Producto {
  id: string;
  nombre: string;
  /** EUROS float 2dec — se edita y envía €, SIN conversión a céntimos. */
  precio?: number;
  categoria_id?: string;
  ingredientes_base?: Array<{ id?: string; nombre?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Fila del historial (versions): {timestamp, filename}[] desc. */
export interface CartaVersionResumen {
  timestamp: string;
  filename: string;
  [key: string]: unknown;
}

/** Dictamen del FREÑO (validar): frena activar si !valid. */
export interface DictamenValidacion {
  valid: boolean;
  errors: string[];
  productos?: Array<{ id?: string; nombre?: string; [key: string]: unknown }>;
  [key: string]: unknown;
}

/** Error RPC con status HTTP-like para mapearlo a mensaje nombrado. */
export class CartaRpcError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(mensaje: string, status: number, code: string) {
    super(mensaje);
    this.name = 'CartaRpcError';
    this.status = status;
    this.code = code;
  }
}

// =============================================================================
// CARTARPC — el ÚNICO canal hacia el custodio (core/*/events, asterisco literal)
// =============================================================================

const RESPUESTA_TIMEOUT_MS = 8000;

function nuevoRequestId(): string {
  return `jefe_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 8)}`;
}

/**
 * Request/response por el canal verificado: publica a
 * 'core/{ASTERISCO}/events/carta/<op>/request' (LITERAL, ver const TOPIC abajo;
 * publish() ya envuelve en EventEnvelope con
 * source.core_id='ui-frontend') y espera la respuesta pareada filtrando request_id.
 * Respuesta top-level {request_id, status, data|error}.
 */
async function cartaRpc<T = unknown>(
  op: string,
  payload: Record<string, unknown>,
  { timeout_ms = RESPUESTA_TIMEOUT_MS }: { timeout_ms?: number } = {}
): Promise<T> {
  const project_id = get(sessionProjectId);
  if (!project_id) throw new CartaRpcError('no hay proyecto activo', 0, 'NO_PROJECT');

  const request_id = nuevoRequestId();
  // payload envelope-friendly: request_id + project_id en el cuerpo, el envelope lo pone mqtt.publish()
  const cuerpo = { request_id, project_id, ...payload };

  const respuesta = await new Promise<Record<string, unknown>>((resolve, reject) => {
    const unsubscribe = mqttSubscribe('carta.' + op + '.response', (envelope: unknown) => {
      const r = envelope as { request_id?: string };
      if (r?.request_id !== request_id) return; // respuesta de otro request
      unsubscribe();
      clearTimeout(timer);
      resolve((envelope ?? {}) as Record<string, unknown>);
    });

    const timer = setTimeout(() => {
      unsubscribe();
      reject(new CartaRpcError('sin respuesta del custodio', 0, 'TIMEOUT'));
    }, timeout_ms);

    // Topic con ASTERISCO LITERAL — el core solo re-emite a módulos locales los
    // topics con '*' (dot-notation NO cubre este caso: el cuerpo lleva request_id).
    publish(`core/*/events/carta/${op}/request`, cuerpo);
  });

  const status = typeof respuesta.status === 'number' ? respuesta.status : 0;
  if (status >= 400) {
    const error = respuesta.error as { code?: string; message?: string } | undefined;
    throw new CartaRpcError(
      error?.message || `carta.${op} falló (status ${status})`,
      status,
      error?.code || 'RPC_ERROR'
    );
  }
  return (respuesta.data ?? respuesta) as T;
}

// =============================================================================
// LOCALES del store — catalogo + cinta + detalle + versiones + dictamen
// =============================================================================

const cartasStore = writable<CartaJefe[]>([]);
const loading = writable<boolean>(false);
const errorLectura = writable<string | null>(null);
const mutacionesPendientes = writable<number>(0);
export const errorMutacion = writable<string | null>(null);

/** La carta elegida en el ref-select (detallada con get). */
export const cartaSeleccionada = writable<CartaJefe | null>(null);
/** Historial de versiones de la carta elegida (desc). */
export const versiones = writable<CartaVersionResumen[]>([]);
/** Último dictamen del FREÑO validar (null = aún sin validar). */
export const dictamen = writable<DictamenValidacion | null>(null);

export const cartasCargando = writable(false);
export const cartasError = writable<string | null>(null);

/** Catálogo ordenado: en_servicio primero, luego borrador, archivada al final. */
export const sortedCartas = derived(cartasStore, (lista) =>
  [...lista].sort((a, b) => {
    const peso = (c: CartaJefe): number =>
      c.estado === 'en_servicio' ? 0 : c.estado === 'borrador' ? 1 : 2;
    return peso(a) - peso(b) || a.nombre.localeCompare(b.nombre);
  })
);

/** Cinta-estado: valores derivados SOLO de lecturas (nunca asumidos). */
export const cinta = derived(cartasStore, (lista) => ({
  borrador: lista.filter((c) => (c.estado || 'borrador') === 'borrador').length,
  en_servicio: lista.filter((c) => c.estado === 'en_servicio').length,
  archivada: lista.filter((c) => c.estado === 'archivada').length,
  total: lista.length
}));

export function describeError(err: unknown): string {
  if (err instanceof CartaRpcError) {
    // Mensajes NOMBRADOS (R4): el error le dice al jefe qué pasó y qué hacer.
    if (err.status === 409 || err.code === 'ALREADY_EXISTS')
      return 'ya existe (id determinista)';
    if (err.status === 412 || err.code === 'PRECONDITION_FAILED')
      return 'crea antes la categoría';
    if (err.code === 'TIMEOUT') return 'sin respuesta del custodio';
    return err.message;
  }
  return (err as Error)?.message || 'error desconocido';
}

/** € (es-ES) — TODO se edita y persiste en EUROS (sin céntimos). */
export function formatearEuros(euros: number | string | null | undefined): string {
  const n = typeof euros === 'number' ? euros : Number(String(euros ?? '').replace(',', '.'));
  if (!Number.isFinite(n)) return '—';
  return new Intl.NumberFormat('es-ES', { style: 'currency', currency: 'EUR' }).format(n);
}

/** Parsea texto de input a € float 2dec (tolera coma decimal). null si no es cifra ≥0. */
export function parsearEuros(texto: string): number | null {
  const n = Number(String(texto).trim().replace(',', '.'));
  if (!Number.isFinite(n) || n < 0) return null;
  return Math.round(n * 100) / 100;
}

function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

/** Normaliza la Carta: levanta meta al top-level (id/nombre/estado/version). */
function normalizeCarta(carta: Record<string, unknown>): CartaJefe {
  const meta = (carta.meta as Record<string, unknown> | undefined) ?? {};
  return {
    ...carta,
    id: (meta.id as string) ?? (carta.id as string) ?? '',
    nombre: (meta.nombre as string) ?? (carta.nombre as string) ?? '',
    estado: (meta.estado as string) ?? (carta.estado as string) ?? 'borrador',
    version: (meta.version as number) ?? (carta.version as number) ?? undefined
  } as CartaJefe;
}

// =============================================================================
// LECTURAS (SELECCIONAR / INFORMARSE) — las únicas escrituras del estado (R2)
// =============================================================================

/** Catálogo entero (cinta + ref-select). Refresh por SEÑAL (R3), nunca recarga. */
export async function listarCartas(): Promise<void> {
  loading.set(true);
  cartasCargando.set(true);
  cartasError.set(null);
  errorLectura.set(null);
  try {
    const data = await cartaRpc<{ cartas?: CartaJefe[]; total?: number }>('list', {});
    cartasStore.set((data?.cartas ?? []).map(normalizeCarta));
  } catch (err) {
    cartasError.set(describeError(err));
    errorLectura.set(describeError(err));
  } finally {
    loading.set(false);
    cartasCargando.set(false);
  }
}

/** Detalle fresco de una carta (eco del ref-select / post-mutación). */
export async function obtenerCarta(cartaId: string): Promise<CartaJefe | null> {
  try {
    const data = await cartaRpc<Record<string, unknown>>('get', { carta_id: cartaId });
    const cruda = (data?.carta ?? data) as Record<string, unknown>;
    if (!cruda || Object.keys(cruda).length === 0) return null;
    const cartaN = normalizeCarta(cruda);
    cartaSeleccionada.set(cartaN);
    // El dictamen de validar caduca con cada contenido nuevo: se resetea.
    dictamen.set(null);
    return cartaN;
  } catch (err) {
    cartasError.set(describeError(err));
    return null;
  }
}

/** Historial de versiones (desc) de la carta elegida. */
export async function pedirVersiones(cartaId: string): Promise<CartaVersionResumen[]> {
  try {
    const data = await cartaRpc<{ versiones?: CartaVersionResumen[] } | CartaVersionResumen[]>(
      'versions',
      { carta_id: cartaId }
    );
    const lista = Array.isArray(data) ? data : (data?.versiones ?? []);
    versiones.set(lista ?? []);
    return lista ?? [];
  } catch (err) {
    cartasError.set(describeError(err));
    versiones.set([]);
    return [];
  }
}

/** FREÑO puro: dictamen {valid, errors[], productos}. No muta, no publica señal. */
export async function validarCarta(cartaId: string): Promise<DictamenValidacion | null> {
  try {
    const data = await cartaRpc<DictamenValidacion>('validar', { carta_id: cartaId });
    const d: DictamenValidacion = {
      valid: data?.valid === true,
      errors: Array.isArray(data?.errors) ? data.errors : [],
      productos: data?.productos
    };
    dictamen.set(d);
    return d;
  } catch (err) {
    cartasError.set(describeError(err));
    return null;
  }
}

/** Multi-tenant: vaciar todo al cambiar de proyecto (sin datos ajenos). */
export function resetCartasJefe(): void {
  cartasStore.set([]);
  cartaSeleccionada.set(null);
  versiones.set([]);
  dictamen.set(null);
  cartasError.set(null);
  errorMutacion.set(null);
}

// =============================================================================
// DECLARAR (capa 3) — transiciones nombradas + alta/edición de contenido
// =============================================================================

/** Envuelve una mutación: contador de vuelo + error global nombrado. */
async function mutar(op: string, payload: Record<string, unknown>): Promise<unknown> {
  mutacionesPendientes.update((n) => n + 1);
  errorMutacion.set(null);
  try {
    return await cartaRpc(op, payload);
  } catch (err) {
    errorMutacion.set(describeError(err));
    throw err;
  } finally {
    mutacionesPendientes.update((n) => n - 1);
  }
}

/** Save de carta completa (editor-bloque). Señal: carta.actualizada. */
export async function guardarCarta(carta: Record<string, unknown>): Promise<unknown> {
  return mutar('save', { carta });
}

/**
 * H-ALTA · alta de producto — add_product {carta_id, producto} (precio en €).
 * 409 → 'ya existe (id determinista)' · 412 → 'crea antes la categoría'
 * (mapeados en describeError). Señal: carta.editada + version++.
 */
export async function añadirProducto(
  cartaId: string,
  producto: { nombre: string; precio: number; categoria_id: string; ingredientes_base?: unknown }
): Promise<void> {
  await mutar('add_product', { carta_id: cartaId, producto });
}

/** Quitar producto (confirmador en el panel). Señal: carta.editada + version++. */
export async function quitarProducto(cartaId: string, productoId: string): Promise<void> {
  await mutar('remove_product', { carta_id: cartaId, producto_id: productoId });
}

/** Editar producto (campos sueltos). Señal: carta.editada + version++. */
export async function editarProducto(
  cartaId: string,
  productoId: string,
  cambios: Record<string, unknown>
): Promise<void> {
  await mutar('update_product', { carta_id: cartaId, producto_id: productoId, ...cambios });
}

/** Editar productos en lote. Señal: carta.editada + version++. */
export async function editarProductosLote(
  cartaId: string,
  productos: Record<string, unknown>[]
): Promise<void> {
  await mutar('update_products', { carta_id: cartaId, productos });
}

/** Añadir categoría. Señal: carta.editada + version++. */
export async function añadirCategoria(cartaId: string, nombre: string): Promise<void> {
  await mutar('add_category', { carta_id: cartaId, nombre });
}

/** Reta precios en lote (EUROS). Señal: carta.editada + version++. */
export async function actualizarPrecios(
  cartaId: string,
  precios: Record<string, unknown>[]
): Promise<void> {
  await mutar('update_prices', { carta_id: cartaId, precios });
}

/** Actualiza extras. Señal: carta.editada + version++. */
export async function actualizarExtras(
  cartaId: string,
  extras: Record<string, unknown>
): Promise<void> {
  await mutar('update_extras', { carta_id: cartaId, ...extras });
}

/** ACTIVAR: cambia el catálogo vivo entero (degrada las demás, motivo 'activar'). */
export async function activarCarta(cartaId: string): Promise<void> {
  await mutar('activar', { carta_id: cartaId });
}

/** Clonar (201, id carta_<slug>). Señal: carta.actualizada. */
export async function clonarCarta(cartaId: string, nombre?: string): Promise<void> {
  await mutar('clonar', nombre ? { carta_id: cartaId, nombre } : { carta_id: cartaId });
}

/** Restaurar versión del historial (acepta path; el custodio guarda basename). */
export async function restaurarVersion(cartaId: string, path: string): Promise<void> {
  await mutar('restore', { carta_id: cartaId, path });
}

/** Archivar (delete SOFT: estado→archivada). Señal: carta.borrada. */
export async function archivarCarta(cartaId: string): Promise<void> {
  await mutar('delete', { carta_id: cartaId });
}

// =============================================================================
// SEÑAL-REFRESH (R3) — señales reales del custodio → re-list con debounce 60ms
// =============================================================================

const SENALES_CARTA = [
  'carta.actualizada', // save · clonar · restore · activar
  'carta.editada', // add/remove/update_product(s) · add_category · update_prices · update_extras
  'carta.borrada', // delete (soft → archivada)
  'carta.creada' // alta externa (menu-generator)
];

const DEBOUNCE_MS = 60;

/**
 * Suscripción a las señales pareadas. El debounce absorbe tándems de señales;
 * solo re-lee lecturas RPC: NUNCA recarga la vista (R3). Devuelve cleanup.
 */
export function initCartaJefeSubscriptions(): () => void {
  const unsubs: Array<() => void> = [];
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function encolarRecarga(): void {
    if (!get(sessionProjectId)) return;
    if (recargaProgramada) return; // debounce: absorbs N señales en tándem
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      void listarCartas();
    }, DEBOUNCE_MS);
  }

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro proyecto
    encolarRecarga();
  }

  for (const senal of SENALES_CARTA) {
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