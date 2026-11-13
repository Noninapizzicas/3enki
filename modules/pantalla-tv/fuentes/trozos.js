'use strict';

/**
 * TROZOS — de un pedido de cocina a la lista de lo que hay HOY al corte.
 *
 * El dueño elige las pizzas en el comandero (cuenta `trozos_*`), las manda a
 * cocina y esa MISMA lista es la que se anuncia en la calle. Este fichero es la
 * pieza pura de esa traducción: items del pedido → documento `pizzepos/porciones.json`
 * (el contrato que ya lee el bloque `porciones`, ver fuentes/porciones.js).
 *
 * Reglas (no son sugerencias, son la honestidad de la pantalla):
 *   · solo cuenta `trozos_*` alimenta la lista — una cuenta de mesa o de llevar
 *     con pizzas NO es «lo que hay al corte»;
 *   · la fecha es la del NEGOCIO (Europe/Madrid), no la del servidor;
 *   · si el documento guardado es de HOY se FUSIONA (mandar dos veces añade, no
 *     borra): al corte de las 20:00 siguen estando las de las 19:00;
 *   · si el documento es de ayer se descarta entero — un dato de ayer no es un
 *     dato, es una mentira con fecha.
 */

const PREFIJO_CUENTA = 'trozos_';
const PRECIO_PORCION_POR_DEFECTO = 3.0;
const BUNDLE_POR_DEFECTO = { cada: 4, precio: 10.5 };

/** ¿Esta cuenta es la del mostrador de trozos? (el prefijo lo pone cuentas) */
function esCuentaDeTrozos(cuenta_id) {
  return typeof cuenta_id === 'string' && cuenta_id.startsWith(PREFIJO_CUENTA);
}

/** Items del pedido → pizzas del documento, sin duplicar el mismo producto. */
function pizzasDe(items) {
  const vistas = new Map();
  for (const it of Array.isArray(items) ? items : []) {
    if (!it || !it.producto_id) continue;
    const previa = vistas.get(it.producto_id);
    if (previa) {
      if (!previa.nombre && it.nombre) previa.nombre = it.nombre;
      continue;
    }
    vistas.set(it.producto_id, {
      producto_id: it.producto_id,
      nombre: it.nombre || it.producto_id,
      imagen: it.imagen || null
    });
  }
  return [...vistas.values()];
}

function numPositivo(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 ? n : null;
}

/**
 * Construye el documento del día. Devuelve null cuando no hay nada que anunciar
 * (sin pizzas válidas) — la franja se colapsa en vez de pintar un hueco.
 */
function documentoDeTrozos({ items, hoy, previo, precio_porcion, bundle, cuenta_id } = {}) {
  const nuevas = pizzasDe(items);
  if (!nuevas.length) return null;

  const previas = previo && previo.fecha === hoy && Array.isArray(previo.pizzas) ? previo.pizzas : [];
  const porId = new Map();
  for (const p of [...previas, ...nuevas]) {
    if (!p || !p.producto_id) continue;
    porId.set(p.producto_id, {
      producto_id: p.producto_id,
      nombre: p.nombre || p.producto_id,
      imagen: p.imagen || null
    });
  }

  // Precio: el del cableado manda; si no, el que ya tenía el documento del día;
  // si no, el precio de referencia. `previo` puede venir NULL (fichero ausente),
  // no solo undefined — de ahí el guard explícito.
  const precio = numPositivo(precio_porcion)
    ?? numPositivo(previo ? previo.precio_porcion : null)
    ?? PRECIO_PORCION_POR_DEFECTO;

  const previoBundle = previo ? previo.bundle : null;
  const b = (bundle && numPositivo(bundle.cada) && numPositivo(bundle.precio))
    ? { cada: numPositivo(bundle.cada), precio: numPositivo(bundle.precio) }
    : (previoBundle && numPositivo(previoBundle.cada) && numPositivo(previoBundle.precio)
      ? { cada: numPositivo(previoBundle.cada), precio: numPositivo(previoBundle.precio) }
      : BUNDLE_POR_DEFECTO);

  return {
    fecha: hoy,
    precio_porcion: precio,
    pizzas: [...porId.values()],
    bundle: b,
    origen: { cuenta_id: cuenta_id || null }
  };
}

module.exports = {
  PREFIJO_CUENTA,
  PRECIO_PORCION_POR_DEFECTO,
  BUNDLE_POR_DEFECTO,
  esCuentaDeTrozos,
  pizzasDe,
  documentoDeTrozos
};
