/**
 * vista-actual — lo que el usuario está VIENDO en el frontend ahora mismo.
 *
 * Hermano del nervio propioceptivo: la propiocepción le cuenta al LLM lo que PASÓ
 * (eventos de dominio); esto le cuenta lo que SE VE (estado de la página). Las
 * páginas/paneles lo rellenan (setVista) al seleccionar/abrir algo; el chat
 * (sendMessage) lo lee y lo manda en el campo `context` de conversation.send. El
 * backend ya lo inyecta en el system prompt (prompt-builder → "CONTEXTO ACTIVO"),
 * así que no hace falta tocar el bus: solo enchufar el origen.
 *
 * Contrato: cada página REEMPLAZA su vista (setVista) al entrar/seleccionar y la
 * LIMPIA (clearVista) al salir, para que una vista vieja no se filtre cuando el
 * usuario navega a otra página.
 */

import { writable, get } from 'svelte/store';

export type Vista = Record<string, unknown>;

export const vistaActual = writable<Vista>({});

/** Reemplaza la vista actual (cada página es dueña de la suya). */
export function setVista(vista: Vista): void {
  vistaActual.set(vista || {});
}

/** Limpia la vista (al salir de la página). */
export function clearVista(): void {
  vistaActual.set({});
}

/** Lectura puntual (la usa chat.sendMessage). */
export function getVista(): Vista {
  return get(vistaActual);
}
