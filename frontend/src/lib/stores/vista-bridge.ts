/**
 * vista-bridge — refleja en vistaActual la SELECCIÓN de la página activa.
 *
 * Central y ADITIVO: no toca ningún panel. Mira la ruta (SvelteKit `page`) + el store
 * de selección de esa página (o el propio param de la URL) y compone la vista que el
 * chat manda al LLM en `context`. Al cambiar de página la vista se recompone sola.
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
import { categoriaActiva as cartaCategoria } from './carta';
import { vistaActiva as llevadooVista, categoriaActiva as llevadooCategoria } from './llevadoo';

const vistaSrc = derived(
  [page, selectedReceta, selectedFactura, selectedDevice, cartaDesignStore, cartaCategoria, llevadooVista, llevadooCategoria],
  ([$page, $receta, $factura, $device, $design, $cartaCat, $llevVista, $llevCat]): Vista => {
    // /[project_id]/<page>/<sub?>...  → parts[1]=page, parts[2]=sub (p.ej. cuenta_id)
    const parts = ($page?.url?.pathname || '').split('/').filter(Boolean);
    const route = parts[1] || '';
    const sub = parts[2] || null;
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
      case 'comandero':
        // La cuenta abierta viene en la URL: /comandero/<cuenta_id>.
        return sub ? { page: route, cuenta_id: sub } : { page: route };
      case 'carta':
        return $cartaCat ? { page: route, categoria_activa: $cartaCat } : {};
      case 'llevadoo':
        return ($llevVista || $llevCat)
          ? { page: route, vista: $llevVista ?? undefined, categoria_activa: $llevCat ?? undefined }
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
