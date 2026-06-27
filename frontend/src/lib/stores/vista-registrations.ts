/**
 * vista-registrations — registra el descriptor de vista de cada página.
 *
 * Importado por side-effect desde vista-bridge. Mantiene el MISMO mapeo que el
 * antiguo switch, ahora como entries del registro. Forma final (a futuro):
 * co-locar cada registrarVista en el módulo de store de su página, y este
 * archivo desaparece; mientras tanto, centraliza la migración en un sitio.
 */
import { registrarVista } from './vista-registry';
import { selectedReceta } from './recetas';
import { selectedFactura } from './facturas';
import { selectedDevice } from './dispositivos';
import { cartaDesignStore } from './carta-design';
import { categoriaActiva as cartaCategoria } from './carta';
import { vistaActiva as llevadooVista, categoriaActiva as llevadooCategoria } from './llevadoo';

registrarVista({
  route: 'recetas',
  stores: [selectedReceta],
  compose: ([r]: any) => (r ? { page: 'recetas', receta_id: r.id, receta_nombre: r.nombre } : {})
});

registrarVista({
  route: 'facturas',
  stores: [selectedFactura],
  compose: ([f]: any) => (f ? { page: 'facturas', factura_id: f.id } : {})
});

registrarVista({
  route: 'dispositivos',
  stores: [selectedDevice],
  compose: ([d]: any) => (d ? { page: 'dispositivos', device_id: d.device_id } : {})
});

registrarVista({
  route: 'carta-design',
  stores: [cartaDesignStore],
  compose: ([d]: any) =>
    d?.cartaId ? { page: 'carta-design', carta_id: d.cartaId, carta_nombre: d.cartaNombre } : {}
});

registrarVista({
  route: 'carta',
  stores: [cartaCategoria],
  compose: ([c]: any) => (c ? { page: 'carta', categoria_activa: c } : {})
});

registrarVista({
  route: 'llevadoo',
  stores: [llevadooVista, llevadooCategoria],
  compose: ([v, c]: any) =>
    v || c ? { page: 'llevadoo', vista: v ?? undefined, categoria_activa: c ?? undefined } : {}
});

registrarVista({
  route: 'comandero',
  stores: [], // la cuenta abierta viene de la URL (/comandero/<cuenta_id>), no de un store
  compose: (_values, ctx) => (ctx.sub ? { page: 'comandero', cuenta_id: ctx.sub } : { page: 'comandero' })
});
