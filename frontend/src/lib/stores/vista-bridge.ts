/**
 * vista-bridge — refleja en vistaActual la SELECCIÓN de la página activa.
 *
 * Central y ADITIVO: no toca ningún panel. Mira la ruta (SvelteKit `page`) + el store
 * de selección de esa página y compone la vista que el chat manda al LLM en `context`.
 * Al cambiar de página la vista se recompone sola (no hay que limpiar a mano).
 *
 * Extender a otra página = añadir un `case`. Si una página no tiene selección, la vista
 * queda vacía (el `page_id` ya viaja aparte; la vista carga solo el EXTRA: qué hay elegido).
 *
 * Best-effort: si un campo no existe, queda undefined — nunca rompe el turno ni la UI.
 */

import { derived } from 'svelte/store';
import { page } from '$app/stores';
import { setVista, type Vista } from './vista-actual';
import { selectedReceta } from './recetas';
import { selectedFactura } from './facturas';
import { selectedDevice } from './dispositivos';
import { cartaDesignStore } from './carta-design';

// /[project_id]/<page>/... → <page>
function rutaPagina(pathname: string): string {
  const parts = (pathname || '').split('/').filter(Boolean);
  return parts[1] || '';
}

const vistaSrc = derived(
  [page, selectedReceta, selectedFactura, selectedDevice, cartaDesignStore],
  ([$page, $receta, $factura, $device, $design]): Vista => {
    const route = rutaPagina($page?.url?.pathname || '');
    switch (route) {
      case 'recetas':
        return $receta ? { page: route, receta_id: $receta.id, receta_nombre: $receta.nombre } : {};
      case 'facturas':
        return $factura ? { page: route, factura_id: $factura.id } : {};
      case 'dispositivos':
        return $device ? { page: route, device_id: $device.device_id } : {};
      case 'carta-design':
        return $design?.cartaId
          ? { page: route, carta_id: $design.cartaId, carta_nombre: $design.cartaNombre }
          : {};
      default:
        return {};
    }
  }
);

let started = false;
let unsub: (() => void) | null = null;

/** Arranca el puente (en LazyShell.onMount). Idempotente. */
export function initVistaBridge(): () => void {
  if (started) return () => {};
  started = true;
  unsub = vistaSrc.subscribe((v) => setVista(v));
  return () => {
    started = false;
    unsub?.();
    unsub = null;
    setVista({});
  };
}
