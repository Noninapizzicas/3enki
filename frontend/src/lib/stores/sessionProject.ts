/**
 * sessionProject — el project_id de la SESIÓN/PÁGINA actual.
 *
 * MULTI-TENANT (fix del proyecto activo global):
 * El problema de fondo era que el frontend usaba UN único `activeProjectId`
 * global, persistido en localStorage y compartido entre pestañas. Con N
 * proyectos pizzepos abiertos en N pestañas, cada navegación sobrescribía el
 * global y TODOS los stores apuntaban al último activado → la página del
 * proyecto A mostraba los datos del proyecto B.
 *
 * La URL es la fuente de verdad (`/[project_id]/...`). Este store deriva el
 * project_id de la URL de la página actual y lo expone como `sessionProjectId`.
 * Cada pestaña/página tiene SU propio valor (el store vive en el heap de esa
 * pestaña), así que N proyectos no se pisan.
 *
 * El layout `[project_id]/+layout.svelte` lo alimenta con `setSessionProject(id)`
 * al montar y al cambiar de proyecto en la URL. Los stores y paneles leen
 * `get(sessionProjectId)` en vez de `get(activeProjectId)`.
 */
import { writable, get } from 'svelte/store';

export const sessionProjectId = writable<string | null>(null);

/** Alimenta el project_id de la sesión actual (lo llama el layout). */
export function setSessionProject(id: string | null): void {
  sessionProjectId.set(id);
}

/** Lee el project_id de la sesión actual. */
export function getSessionProject(): string | null {
  return get(sessionProjectId);
}
