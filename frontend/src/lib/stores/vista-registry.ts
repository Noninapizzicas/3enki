/**
 * vista-registry — el mapa "ruta → cómo se compone su vista".
 *
 * Cada página REGISTRA su descriptor (idealmente cerca de sí misma); el bridge
 * compone la vista desde aquí. Mismo patrón que el loader del backend: los
 * módulos registran, un compositor central orquesta. Así añadir una página no
 * exige editar un switch monolítico — solo aportar su entry.
 *
 * Idempotente por route (último registro gana). Sin dependencias de SvelteKit:
 * solo tipos (erased en compilación), para mantenerlo puro y portable.
 */
import type { Readable } from 'svelte/store';
import type { Vista } from './vista-actual';

export interface VistaCtx {
  route: string;
  sub: string | null; // segmento extra de la URL (p.ej. cuenta_id en /comandero/<id>)
}

export interface VistaEntry {
  route: string;
  stores: Readable<unknown>[];                          // de qué stores depende su vista
  compose: (values: unknown[], ctx: VistaCtx) => Vista; // values en el mismo orden que stores
}

const entries = new Map<string, VistaEntry>();
const listeners = new Set<() => void>();

/** Registra (o reemplaza) el descriptor de una ruta. Avisa al bridge para que
 *  re-suscriba los stores nuevos (clave para páginas lazy). */
export function registrarVista(entry: VistaEntry): void {
  entries.set(entry.route, entry);
  for (const l of listeners) l();
}

export function getEntry(route: string): VistaEntry | undefined {
  return entries.get(route);
}

/** Conjunto único de todos los stores registrados (el bridge los observa). */
export function allStores(): Readable<unknown>[] {
  const s = new Set<Readable<unknown>>();
  for (const e of entries.values()) for (const st of e.stores) s.add(st);
  return [...s];
}

/** El bridge se suscribe a cambios del registro (alta de páginas lazy). */
export function onRegistryChange(fn: () => void): () => void {
  listeners.add(fn);
  return () => listeners.delete(fn);
}
