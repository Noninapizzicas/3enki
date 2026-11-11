'use strict';

/**
 * CONTRATO — la frontera entre la pantalla y los datos.
 *
 * La pantalla NO sabe qué es una pizza. Solo conoce PIEZAS: átomos neutros con
 * una forma (cómo se dibujan) y un contenido. Cada pieza la fabrica su BLOQUE,
 * y cada bloque es dueño de su fuente y de su forma. La pantalla solo coloca.
 *
 * Regla única: si un dato no cabe en Pieza, el que tiene que cambiar es el
 * bloque, no la pantalla. Así un módulo nuevo (porciones, promos, lo que venga)
 * se acopla sin tocar el render.
 */

const FORMAS = [
  'cabecera',   // marca · estado · logos
  'cinta',      // una línea que corre
  'foto',       // imagen grande + pie + precio
  'ficha',      // tipografía: nombre, argumento, etiquetas, precio
  'contacto',   // dónde y cómo pedir (fijo)
  'franja',     // piezas pequeñas en fila (trozos)
  'cifra'       // un dato solo, grande
];

const CADENCIAS = ['fijo', 'dia', 'tanda'];

const POSICIONES = ['izq', 'centro', 'der', null];

function piezaValida(p) {
  const errores = [];
  if (!p || typeof p !== 'object') return ['pieza no es objeto'];
  if (!p.id) errores.push('sin id');
  if (!p.bloque) errores.push('sin bloque');
  if (!FORMAS.includes(p.forma)) errores.push(`forma desconocida: ${p.forma}`);
  if (!cadenciaDe(p).includes(p.cadencia)) errores.push(`cadencia desconocida: ${p.cadencia}`);
  if (!POSICIONES.includes(p.posicion === undefined ? null : p.posicion)) errores.push(`posicion inválida: ${p.posicion}`);
  if (p.forma !== 'cinta' && p.forma !== 'cabecera' && !p.titulo) errores.push('sin titulo');
  return errores;
}

function cadenciaDe() { return CADENCIAS; }

/** Precio ya formateado. El bloque formatea; la pantalla no calcula nada. */
function euros(n) {
  const v = Number(n);
  if (!Number.isFinite(v)) return null;
  return v.toFixed(2).replace('.', ',') + ' €';
}

/** Alterna formas para que no haya dos iguales seguidas si se puede. */
function alternar(piezas) {
  const grupos = new Map();
  for (const p of piezas) {
    if (!grupos.has(p.forma)) grupos.set(p.forma, []);
    grupos.get(p.forma).push(p);
  }
  const colas = [...grupos.values()].sort((a, b) => b.length - a.length);
  const salida = [];
  let ultima = null;
  while (colas.some(c => c.length)) {
    const orden = colas.filter(c => c.length > 0).sort((a, b) => b.length - a.length);
    let cola = orden.find(c => c[0].forma !== ultima) || orden[0];
    const p = cola.shift();
    salida.push(p);
    ultima = p.forma;
  }
  return salida;
}

module.exports = { FORMAS, CADENCIAS, POSICIONES, piezaValida, euros, alternar };
