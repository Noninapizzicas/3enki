/**
 * Importador Store — la cara del JEFE del IMPORTADOR de catálogos (F7, según
 * esquema-jefe/ de menu-generator, ciclo v2 #10).
 *
 *   INFORMARSE   el JSON de la fuente en el editor (pegado o drag-file) +
 *                validación mínima local (parse + categorias[]/productos[]).
 *   TRANSICIÓN   IMPORTAR: puente fs.write (el reflejo NO acepta JSON inline)
 *                → menu.import.request { project_id, nombre, material_ref }
 *                → dictamen 200 { carta_id, nombre, categorias, productos }.
 *   SEÑAL        INDIRECTA del custodio: carta.actualizada (+ carta.editada
 *                opcional) correlando project_id — menu-generator NO publica
 *                señal propia (invariante del módulo, INV3).
 *
 * CANAL RPC (verificado — molde carta-jefe.ts): publish a topic con ASTERISCO
 * LITERAL core/{ASTERISCO}/events/menu/import/request (en el comentario se
 * escribe con marcador: el 'asterisco + barra' LITERAL CERRARIA este bloque);
 * respuesta pareada suscrita dot-notation 'menu.import.response', top-level
 * {request_id, status, data|error} — NO anidada bajo result. El publish() de $lib/ui-core/mqtt
 * envuelve en EventEnvelope; request_id propio + project_id en el cuerpo.
 *
 * PUENTE fs.write (filesystem L306-309 onWriteRequest): el JSON del editor viaja
 * TAL CUAL a {project, '/pizzepos/imports/<slug>.json'} → 201 {path, hash} →
 * menu.import {material_ref: path}. El JSON NO viaja inline (INV2 — el reflejo
 * solo acepta material_path/material_ref/attachments[], _rutasFuente L108-120).
 * Drag-file: FileReader.readAsText en el PANEL → el texto cae en el editor →
 * el mismo puente.
 *
 * TIEMPO: espera ≥ 20s — menu.import anida 1 carta.save.request interno con
 * timeout 15s (index.js L89); 20s es el mínimo honesto del panel.
 *
 * ERRORES (nombrados, index.js _import):
 *   400 INVALID_INPUT (falta project_id/nombre/fuente) · 404 RESOURCE_NOT_FOUND
 *   (JSON ilegible en la ruta) · 422 UPSTREAM_INVALID_RESPONSE (sin
 *   productos/categorías detectables) · 503 UPSTREAM_UNREACHABLE (carta-manager
 *   no responde) · 502 (status >= 400 del custodio) · TIMEOUT local.
 *
 * FIDELIDAD (R2/R3 del esquema): la UI no compone nada — el JSON viaja
 * VERBATIM; dictamen en la respuesta + señal del custodio que re-confirma
 * (nunca recarga, nunca estado optimista).
 *
 * Molde: frontend/src/lib/modules/carta-manager/stores/carta-jefe.ts.
 */

import { writable, get } from 'svelte/store';
import { publish, subscribe as mqttSubscribe } from '$lib/ui-core/mqtt';
import { sessionProjectId } from '$lib/stores/sessionProject';

// =============================================================================
// TIPOS — shapes reales del reflejo (index.js _import L58-105)
// =============================================================================

/** Dictamen 200 del import (L98-105): las cifras del gesto. */
export interface DictamenImport {
  carta_id: string;
  nombre: string;
  categorias: number;
  productos: number;
  [key: string]: unknown;
}

/** Resultado de la validación mínima local (no sustituye al dictamen). */
export interface ValidacionLocal {
  ok: boolean;
  categorias: number;
  productos: number;
  problemas: string[];
}

/** Error RPC con status HTTP-like para mapearlo a mensaje nombrado. */
export class ImportRpcError extends Error {
  readonly status: number;
  readonly code: string;
  constructor(mensaje: string, status: number, code: string) {
    super(mensaje);
    this.name = 'ImportRpcError';
    this.status = status;
    this.code = code;
  }
}

// =============================================================================
// RPC — ÚNICO canal hacia el reflejo (core/*/events, asterisco literal)
// =============================================================================

/** ≥ 20s: menu.import anida carta.save.request (timeout interno 15s, L89). */
const RESPUESTA_TIMEOUT_MS = 20000;
/** El puente fs.write es una escritura simple: 10s sobran. */
const ESCRITURA_TIMEOUT_MS = 10000;

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
      reject(new ImportRpcError('sin respuesta del módulo', 0, 'TIMEOUT'));
    }, timeout_ms);

    // Topic con ASTERISCO LITERAL — el cuerpo lleva request_id + project_id.
    publish(`core/*/events/${dominio}/${op}/request`, { request_id, ...payload });
  });

  const status = typeof respuesta.status === 'number' ? respuesta.status : 0;
  if (status >= 400) {
    const error = respuesta.error as { code?: string; message?: string } | undefined;
    throw new ImportRpcError(
      error?.message || `${dominio}.${op} falló (status ${status})`,
      status,
      error?.code || 'RPC_ERROR'
    );
  }
  return (respuesta.data ?? respuesta) as T;
}

// =============================================================================
// PUENTE fs.write — el JSON inline del editor llega a fichero (INV2)
// =============================================================================

/** 'Carta de Verano!' → 'carta-de-verano' (slug del fichero de imports). */
export function slugifyNombre(nombre: string): string {
  return (
    String(nombre)
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || 'carta-importada'
  );
}

/**
 * Escribe el JSON TAL CUAL al storage del proyecto vía fs.write.request
 * (filesystem onWriteRequest L306-309: {path, content} → 201 {path, hash};
 * paths relativos a la raíz del proyecto). Devuelve la ref para menu.import.
 */
export async function escribirMaterial(
  project_id: string,
  nombre: string,
  contenido: string
): Promise<string> {
  const path = `/pizzepos/imports/${slugifyNombre(nombre)}.json`;
  const data = await rpcEvento<{ path?: string }>(
    'fs',
    'write',
    { project_id, path, content: contenido },
    { timeout_ms: ESCRITURA_TIMEOUT_MS }
  );
  return data?.path ?? path;
}

// =============================================================================
// VALIDACIÓN MÍNIMA LOCAL — frena el gesto obvio, no sustituye al dictamen
// =============================================================================

/**
 * Validación mínima del editor: ¿JSON parsea? ¿trae categorias[] con
 * productos[]? NO juzga estructura fina (eso lo hará el reflejo: 400/404/422).
 */
export function validarJsonLocal(texto: string): ValidacionLocal {
  const problemas: string[] = [];
  let categorias = 0;
  let productos = 0;

  let data: unknown;
  try {
    data = JSON.parse(texto);
  } catch (e) {
    return { ok: false, categorias: 0, productos: 0, problemas: [(e as Error)?.message || 'JSON inválido'] };
  }

  const obj = (Array.isArray(data) ? data[0] : data) as Record<string, unknown> | undefined;
  if (!obj || typeof obj !== 'object') {
    return { ok: false, categorias: 0, productos: 0, problemas: ['el JSON no es un objeto de carta'] };
  }

  const cats = obj.categorias;
  if (Array.isArray(cats) && cats.length > 0) categorias = cats.length;
  else problemas.push('sin categorias[] — el reflejo responde 422 sin productos/categorías');

  const prods = obj.productos;
  if (Array.isArray(prods) && prods.length > 0) productos = prods.length;
  else problemas.push('sin productos[] — el reflejo responde 422 sin productos/categorías');

  // El nombre de la carta: lo pide el reflejo (400 INVALID_INPUT si falta) —
  // se valida en el panel (input), no aquí.

  return { ok: problemas.length === 0, categorias, productos, problemas };
}

// =============================================================================
// LOCALES del store — solo estado de la ÚNICA transición del panel
// =============================================================================

/** Import en vuelo (botón muerto mientras viaja — no hay doble import). */
export const importando = writable(false);
/** Error de la última transición, YA NOMBRADO (R4) o null. */
export const errorImport = writable<string | null>(null);
/** Dictamen 200 de la última importación (null = aún sin importar). */
export const dictamenImport = writable<DictamenImport | null>(null);

/** Mensajes NOMBRADOS por error (el jefe sabe qué pasó y qué hacer). */
export function describeError(err: unknown): string {
  if (err instanceof ImportRpcError) {
    if (err.code === 'TIMEOUT') return 'sin respuesta del módulo (espera 20s — el reflejo guarda vía carta-manager)';
    if (err.status === 400 || err.code === 'INVALID_INPUT') return 'INPUT rechazado: falta nombre o la fuente del JSON';
    if (err.status === 404 || err.code === 'RESOURCE_NOT_FOUND') return 'JSON ILEGIBLE en la ruta: revisa que el fichero sea una carta (categorias[]/productos[])';
    if (err.status === 422 || err.code === 'UPSTREAM_INVALID_RESPONSE') return 'SIN productos/categorías detectables en el JSON';
    if (err.status === 503 || err.code === 'UPSTREAM_UNREACHABLE') return 'carta-manager no responde (custodio caído — reintenta)';
    if (err.status >= 500) return `custodio falló (status ${err.status}) — revisa carta-manager`;
    return err.message;
  }
  return (err as Error)?.message || 'error desconocido';
}

// =============================================================================
// LA TRANSICIÓN — IMPORTAR (la ÚNICA escritura del panel)
// =============================================================================

/**
 * IMPORTAR: puente fs.write (JSON verbatim) → menu.import {nombre,
 * material_ref} → dictamen 200 {carta_id, nombre, categorias, productos}.
 * Lanza ImportRpcError nombrada (describeError la traduce).
 */
export async function importarCatalogo(nombre: string, textoJson: string): Promise<DictamenImport> {
  const project_id = get(sessionProjectId);
  if (!project_id) throw new ImportRpcError('no hay proyecto activo', 0, 'NO_PROJECT');
  const nombreTrim = String(nombre ?? '').trim();
  if (!nombreTrim) throw new ImportRpcError('falta el nombre de la carta', 400, 'INVALID_INPUT');
  if (!textoJson.trim()) throw new ImportRpcError('falta el JSON del catálogo', 400, 'INVALID_INPUT');

  importando.set(true);
  errorImport.set(null);
  dictamenImport.set(null);
  try {
    // 1. PUENTE: el JSON inline NO viaja inline (el reflejo solo acepta rutas).
    const material_ref = await escribirMaterial(project_id, nombreTrim, textoJson);
    // 2. EL REFLEJO: 1 llamada única, dictamen en la respuesta.
    const data = await rpcEvento<DictamenImport>('menu', 'import', {
      project_id,
      nombre: nombreTrim,
      material_ref
    });
    const dictamen: DictamenImport = {
      carta_id: String(data?.carta_id ?? ''),
      nombre: String(data?.nombre ?? nombreTrim),
      categorias: Number(data?.categorias ?? 0),
      productos: Number(data?.productos ?? 0),
      ...(data as object)
    };
    dictamenImport.set(dictamen);
    return dictamen;
  } catch (err) {
    errorImport.set(describeError(err));
    throw err;
  } finally {
    importando.set(false);
  }
}

// =============================================================================
// SEÑAL INDIRECTA (INV3) — el custodio anuncia la nueva carta; el panel la
// muestra como re-confirmación (debounce 60ms, molde carta-jefe.ts)
// =============================================================================

const SENALES_CUSTODIO = [
  'carta.actualizada', // carta-manager L294 — la nueva carta nace (version 1, borrador)
  'carta.editada' // carta-manager _mutar L15 — opcional (ediciones inmediatas)
];

const DEBOUNCE_MS = 60;

function extraerProjectId(envelope: unknown): string | undefined {
  const e = envelope as {
    project_id?: string;
    data?: { project_id?: string; data?: { project_id?: string } };
  } | null;
  return e?.project_id ?? e?.data?.project_id ?? e?.data?.data?.project_id ?? undefined;
}

export interface EstadoCustodio {
  visto: number; // nº de señales del custodio aceptadas (correladas)
  ultimo: string | null; // última señal vista ('carta.actualizada'…)
  en: number | null; // timestamp de la última
}

/** Suscripción a la señal INDIRECTA del custodio. Devuelve cleanup. */
export function initImportadorSubscriptions(
  onSeñal: (estado: EstadoCustodio) => void = () => {}
): () => void {
  const unsubs: Array<() => void> = [];
  let visto = 0;
  let ultimo: string | null = null;
  let ultimoTs: number | null = null;
  let recargaProgramada: ReturnType<typeof setTimeout> | null = null;

  function onSenal(envelope: unknown): void {
    const activo = get(sessionProjectId);
    if (!activo) return;
    const pid = extraerProjectId(envelope);
    if (pid !== undefined && pid !== activo) return; // señal de otro negocio
    // debounce: absorbe tándems (ediciones encadenadas del jefe)
    if (recargaProgramada) return;
    recargaProgramada = setTimeout(() => {
      recargaProgramada = null;
      visto += 1;
      ultimoTs = Date.now();
      onSeñal({ visto, ultimo, en: ultimoTs });
    }, DEBOUNCE_MS);
    ultimo = (envelope as { event?: string; type?: string; __topic?: string })?.event
      ?? (envelope as { type?: string })?.type
      ?? null;
  }

  for (const senal of SENALES_CUSTODIO) {
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

/** Multi-tenant: vaciar al cambiar de proyecto (sin datos ajenos). */
export function resetImportador(): void {
  importando.set(false);
  errorImport.set(null);
  dictamenImport.set(null);
}