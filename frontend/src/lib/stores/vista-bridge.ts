/**
 * vista-bridge — escritor ÚNICO de vistaActual.
 *
 * Observa la ruta (SvelteKit `page`) + los stores registrados y recompone la
 * vista de la página activa desde el registro (vista-registry). Sustituye al
 * antiguo switch monolítico: cada página aporta su descriptor; el bridge solo
 * orquesta.
 *
 * Leak-safe por construcción: solo compone la entry de la ruta actual, así que
 * la selección de una página no puede filtrarse a la vista de otra; y recompone
 * en cada cambio de ruta, de modo que una vista vieja no se acumula (no hace
 * falta que las páginas "limpien" — eso mató a clearVista).
 *
 * Best-effort: ruta sin descriptor → vista vacía (seguro, nunca info errónea).
 * El chat solo vive en páginas project-scoped (/[project_id]/<page>/<sub?>),
 * por eso route = parts[1].
 */
import { get } from 'svelte/store';
import { page } from '$app/stores';
import { setVista } from './vista-actual';
import { getEntry, allStores, onRegistryChange } from './vista-registry';
import './vista-registrations'; // side-effect: dispara los registrarVista de cada página

let started = false;
const unsubs: Array<() => void> = [];

function recompute(): void {
  const parts = (get(page)?.url?.pathname || '').split('/').filter(Boolean);
  const route = parts[1] || '';
  const sub = parts[2] || null;
  const entry = getEntry(route);
  if (!entry) {
    setVista({});
    return;
  }
  setVista(entry.compose(entry.stores.map((s) => get(s)), { route, sub }));
}

function wire(): void {
  // (re)suscribe: page + todos los stores registrados. Re-llamado cuando una
  // página lazy registra su descriptor (onRegistryChange).
  while (unsubs.length) unsubs.pop()!();
  unsubs.push(page.subscribe(recompute));
  for (const s of allStores()) unsubs.push(s.subscribe(recompute));
}

/** Arranca el puente (en LazyShell.onMount). Idempotente. */
export function initVistaBridge(): () => void {
  if (started) return () => {};
  started = true;
  wire();
  const offReg = onRegistryChange(wire);
  return () => {
    started = false;
    offReg();
    while (unsubs.length) unsubs.pop()!();
    setVista({});
  };
}
