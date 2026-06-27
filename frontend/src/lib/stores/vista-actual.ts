/**
 * vista-actual — lo que el usuario está VIENDO en el frontend ahora mismo.
 *
 * Hermano del nervio propioceptivo: la propiocepción le cuenta al LLM lo que PASÓ
 * (eventos de dominio); esto le cuenta lo que SE VE (ids + nombres de lo que tiene
 * seleccionado/abierto). El chat (sendMessage) lo lee con getVista() y lo manda en
 * `context.vista_frontend`; el backend lo inyecta en el system prompt
 * (prompt-builder → "LO QUE EL USUARIO ESTÁ VIENDO").
 *
 * Un solo ESCRITOR: vista-bridge (compositor central), que recompone esta store
 * desde el registro (vista-registry) en cada cambio de ruta/selección. Las páginas
 * NO tocan esta store — solo mantienen su propio store de selección y registran su
 * descriptor. El "limpiado" al salir lo hace el bridge recomponiendo (ruta sin
 * entry → {}), por eso no hay clearVista: una vista vieja no puede acumularse.
 */

import { writable, get } from 'svelte/store';

export type Vista = Record<string, unknown>;

export const vistaActual = writable<Vista>({});

/** Reemplaza la vista actual. Único caller legítimo: vista-bridge. */
export function setVista(vista: Vista): void {
  vistaActual.set(vista || {});
}

/** Lectura puntual de la vista (la usa chat.sendMessage). */
export function getVista(): Vista {
  return get(vistaActual);
}
