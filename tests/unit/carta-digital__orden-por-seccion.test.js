/**
 * Tests unitarios — carta-digital / PROYECCIÓN: el orden del scroll.
 *
 * El grid "Todas" de la PWA pinta `DATA.productos` en el orden en que llega. Ese orden era
 * el orden de guardado de la carta, que puede no coincidir con `categorias[].orden` (las
 * pestañas de arriba) → la carta se leía de dos maneras distintas en la misma pantalla.
 *
 * Aquí se fija el contrato: la proyección devuelve los productos en tramos contiguos
 * siguiendo el orden de las secciones publicadas, conservando dentro de cada tramo el
 * orden culinario del dueño. Y hay canario contra la carta viva de the-pirate.
 *
 * Ejecutar: node tests/unit/carta-digital__orden-por-seccion.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { proyectarCartaPublica } = require('../../modules/pizzepos/carta-digital/proyeccion.js');

const RAIZ = path.join(__dirname, '..', '..');

let ok = 0, ko = 0;
function caso(nombre, fn) {
  try { fn(); ok++; console.log('  ✓ ' + nombre); }
  catch (e) { ko++; console.log('  ✗ ' + nombre + '\n      ' + e.message); }
}

// ─── La carta barajada: los productos llegan en desorden de secciones ─────────────
// Es el estado real que se encontró: las secciones 0..3 declaradas y la lista de productos
// en el orden de un montaje viejo (Calas, Bebidas, Pizzas, Flota, Fardel).
function cartaBarajada() {
  const cat = (id, nombre, orden) => ({ id, nombre, orden, activa: true });
  return {
    meta: { id: 'demo', version: 1 },
    categorias: [
      cat('la_flota', 'La Flota', 0),
      cat('las_calas', 'Las Calas', 1),
      cat('pizzas', 'Pizzas', 2),
      cat('el_fardel', 'El Fardel', 3),
      cat('bebidas', 'Bebidas', 4)
    ],
    productos: [
      { id: 'b1', nombre: 'Agua', categoria_id: 'bebidas', precio: 1 },
      { id: 'c1', nombre: 'Patatas', categoria_id: 'las_calas', precio: 5.5 },
      { id: 'p1', nombre: 'Margarita', categoria_id: 'pizzas', precio: 8 },
      { id: 'f1', nombre: 'Mahón', categoria_id: 'la_flota', precio: 9.95 },
      { id: 'q1', nombre: 'Barbanegra', categoria_id: 'el_fardel', precio: 7.5 },
      { id: 'c2', nombre: 'Huevos al horno', categoria_id: 'las_calas', precio: 4 },
      { id: 'p2', nombre: 'Cuatro Quesos', categoria_id: 'pizzas', precio: 11 },
      { id: 'f2', nombre: 'Nassau', categoria_id: 'la_flota', precio: 13 },
      { id: 'b2', nombre: 'Vermut', categoria_id: 'bebidas', precio: 2 }
    ]
  };
}

const ids = prods => prods.map(p => p.id);
const tramos = prods => {
  const out = [];
  for (const p of prods) {
    if (!out.length || out[out.length - 1].categoria !== p.categoria) out.push({ categoria: p.categoria, n: 0 });
    out[out.length - 1].n++;
  }
  return out.map(t => t.categoria + '×' + t.n);
};

// ─── 1. El grid de "Todas" sale en el orden de las pestañas ──────────────────────
caso('el scroll agrupa por sección en el orden de las pestañas (no en el de guardado)', () => {
  const p = proyectarCartaPublica(cartaBarajada(), null, {}, {});
  assert.deepStrictEqual(tramos(p.productos),
    ['la_flota×2', 'las_calas×2', 'pizzas×2', 'el_fardel×1', 'bebidas×2'],
    'la lista proyectada tiene que ir en tramos contiguos por sección');
  assert.deepStrictEqual(ids(p.productos),
    ['f1', 'f2', 'c1', 'c2', 'p1', 'p2', 'q1', 'b1', 'b2']);
});

// ─── 2. Dentro de cada tramo se respeta el orden culinario de la carta ───────────
caso('dentro de cada sección se conserva el orden de la carta', () => {
  const c = cartaBarajada();
  // En la carta, Patatas va antes que Huevos y Margarita antes que Cuatro Quesos.
  const p = proyectarCartaPublica(c, null, {}, {});
  const calas = p.productos.filter(x => x.categoria === 'las_calas').map(x => x.nombre);
  const pizzas = p.productos.filter(x => x.categoria === 'pizzas').map(x => x.nombre);
  assert.deepStrictEqual(calas, ['Patatas', 'Huevos al horno']);
  assert.deepStrictEqual(pizzas, ['Margarita', 'Cuatro Quesos']);
});

// ─── 3. El dato no se toca: ids, precios y orden de entrada intactos ─────────────
caso('la proyección reordena la SALIDA, no muta la carta de entrada', () => {
  const c = cartaBarajada();
  const antes = ids(c.productos);
  const p = proyectarCartaPublica(c, null, {}, {});
  assert.deepStrictEqual(ids(c.productos), antes, 'carta.productos no debe mutarse');
  assert.strictEqual(p.productos.length, c.productos.length);
  assert.deepStrictEqual(ids(p.productos).sort(), antes.sort());
  const margarita = p.productos.find(x => x.id === 'p1');
  assert.strictEqual(margarita.precio, 8, 'el precio no cambia al reordenar');
});

// ─── 4. Sección no publicada: sus productos van al final, sin romper tramos ──────
caso('un producto de una sección no publicada va al final y no rompe los tramos', () => {
  const c = cartaBarajada();
  c.productos.push({ id: 'x1', nombre: 'Huerfano', categoria_id: 'descatalogada', precio: 3 });
  const p = proyectarCartaPublica(c, null, {}, {});
  assert.strictEqual(p.productos[p.productos.length - 1].id, 'x1');
  assert.deepStrictEqual(tramos(p.productos).slice(0, 2), ['la_flota×2', 'las_calas×2']);
});

// ─── 5. Canario del DATO VIVO: the-pirate ────────────────────────────────────────
// Corre donde vive la carta (el VPS); en un árbol sin data/ se salta y lo dice.
const CARTA_VIVA = [
  process.env.CARTA_VIVA,   // permite comprobar que el canario MUERDE contra una copia retocada
  path.join(RAIZ, 'data/projects/the-pirate/storage/pizzepos/cartas/the-pirate-v4.json'),
  '/opt/enki/data/projects/the-pirate/storage/pizzepos/cartas/the-pirate-v4.json'
].filter(Boolean).find(p => { try { return fs.existsSync(p); } catch (_) { return false; } });

if (!CARTA_VIVA) {
  console.log('  SKIP canario del dato vivo: sin carta en disco (data/ es gitignored)');
} else {
  caso('dato vivo: el scroll de the-pirate sigue el orden aprobado por comercial', () => {
    const carta = JSON.parse(fs.readFileSync(CARTA_VIVA, 'utf8'));
    const p = proyectarCartaPublica(carta, null, {}, {});
    const secciones = p.categorias.map(c => c.nombre);
    assert.deepStrictEqual(secciones,
      ['La Flota', 'Las Calas', 'Pizzas Puerto Seguro', 'El Fardel', 'Bebidas'],
      'las pestañas siguen el orden comercial');

    const esperado = p.categorias.map(c => {
      const n = p.productos.filter(x => x.categoria === c.id).length;
      return c.id + '×' + n;
    });
    assert.deepStrictEqual(tramos(p.productos), esperado,
      'el scroll tiene que ir en el MISMO orden que las pestañas');
    assert.strictEqual(p.productos.length, carta.productos.length, 'no se pierde ningún producto');
  });
}

console.log('\n' + ok + ' ok, ' + ko + ' ko');
process.exit(ko ? 1 : 0);
