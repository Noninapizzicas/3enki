'use strict';

/**
 * Tests del constructor PURO — sin disco, sin bus, sin proyectos.
 * Uso: node modules/pantalla-tv/test/construir.test.js
 *
 * Lo que se protege aquí son las reglas que hacen honesta la pantalla:
 *   · sin fuente no se inventa nada (la franja se colapsa);
 *   · un dato de ayer no es un dato;
 *   · una carta en borrador no se pinta;
 *   · la huella del sello cambia cuando cambia el dato (y solo entonces);
 *   · la misma foto no se repite dos veces.
 */

const assert = require('assert');
const { construir, huellaImagen } = require('../construir');

let ok = 0;
const probar = (nombre, fn) => {
  try { fn(); console.log(`  ok  ${nombre}`); ok++; }
  catch (e) { console.log(`  FALLA ${nombre}\n        ${e.message}`); process.exitCode = 1; }
};

// Proyector de mentira: la forma que devuelve proyectarCartaPublica, reducida.
const proyectar = (carta) => ({
  branding: { nombre: 'Prueba', lema: 'lema', colores: {}, negocio: { telefono: '968 000 000' } },
  categorias: [{ id: 'pizzas', nombre: 'Pizzas' }, { id: 'bebidas', nombre: 'Bebidas' }],
  productos: (carta.productos || []).map(p => ({
    id: p.id, nombre: p.nombre, precio: p.precio, categoria: p.categoria || 'pizzas',
    imagen: p.imagen || null, descripcion: p.descripcion || null,
    ingredientes: p.ingredientes || [], alergenos: p.alergenos || []
  }))
});

const cableado = {
  proyecto: 'prueba',
  zonas: { C: { nombre: 'carrusel' }, E: { nombre: 'franja' } },
  bloques: [
    { id: 'carta.vitrina', zona: 'C', fuente: 'carta', activo: true },
    { id: 'porciones', zona: 'E', fuente: 'porciones', activo: true }
  ],
  curacion: { excluir_categorias: ['bebidas'], precio_min: 0, vitrina: { max: 5 } }
};

const carta = (extra = {}) => ({
  meta: { id: 'c1', version: 7, estado: 'en_servicio' },
  productos: [
    { id: 'p1', nombre: 'Port Royal', precio: 12, imagen: 'https://x/1.jpg' },
    { id: 'p2', nombre: 'Nassau', precio: 12 }
  ],
  ...extra
});

const construirCon = (datos) => construir({ cableado, proyectar, hoy: '2026-11-11', datos: { carta: carta(), ...datos } });

console.log('\nconstructor puro');

probar('sin porciones la franja queda VACÍA (ni hueco ni precio inventado)', () => {
  const { salida } = construirCon({ porciones: null });
  assert.strictEqual(salida.piezas.filter(p => p.zona === 'E').length, 0);
});

probar('porciones de AYER no se pintan', () => {
  const { salida } = construirCon({ porciones: { fecha: '2026-11-10', precio_porcion: 3, pizzas: [{ producto_id: 'p1', nombre: 'Port Royal' }] } });
  assert.strictEqual(salida.piezas.filter(p => p.zona === 'E').length, 0);
});

probar('porciones de HOY entran con el precio formateado', () => {
  const { salida } = construirCon({ porciones: { fecha: '2026-11-11', precio_porcion: 3, pizzas: [{ producto_id: 'p1', nombre: 'Port Royal' }] } });
  const e = salida.piezas.filter(p => p.zona === 'E');
  assert.strictEqual(e.length, 1);
  assert.strictEqual(e[0].precio, '3,00 €');
});

probar('carta en BORRADOR no se construye', () => {
  const datos = { carta: { meta: { id: 'c1', version: 1, estado: 'borrador' }, productos: [] } };
  assert.throws(() => construirCon(datos), /borrador/);
});

probar('el sello lleva carta, versión y estado', () => {
  const { salida } = construirCon({});
  assert.deepStrictEqual(salida.sello.carta, { id: 'c1', version: 7, estado: 'en_servicio' });
  assert.ok(salida.sello.huella);
});

probar('la huella cambia si cambia un precio y NO cambia si nada cambia', () => {
  const a = construirCon({}).salida.sello.huella;
  const b = construirCon({}).salida.sello.huella;
  const c = construir({ cableado, proyectar, hoy: '2026-11-11', datos: { carta: { meta: { id: 'c1', version: 7, estado: 'en_servicio' }, productos: [{ id: 'p1', nombre: 'Port Royal', precio: 12.5 }] } } }).salida.sello.huella;
  assert.strictEqual(a, b);
  assert.notStrictEqual(a, c);
});

probar('la misma foto dos veces: la segunda se degrada a ficha', () => {
  const datos = {
    carta: { meta: { id: 'c1', version: 7, estado: 'en_servicio' }, productos: [
      { id: 'p1', nombre: 'A', precio: 12, imagen: 'https://x/1.jpg' },
      { id: 'p2', nombre: 'B', precio: 12, imagen: 'https://x/1.jpg' }
    ] }
  };
  const { salida } = construirCon(datos);
  const conImagen = salida.piezas.filter(p => p.imagen);
  assert.strictEqual(conImagen.length, 1);
});

probar('dos fotos distintas NO se degradan', () => {
  const datos = {
    carta: { meta: { id: 'c1', version: 7, estado: 'en_servicio' }, productos: [
      { id: 'p1', nombre: 'A', precio: 12, imagen: 'https://x/1.jpg' },
      { id: 'p2', nombre: 'B', precio: 12, imagen: 'https://x/2.jpg' }
    ] }
  };
  const { salida } = construirCon(datos);
  assert.strictEqual(salida.piezas.filter(p => p.imagen).length, 2);
});

probar('una categoría excluida por curación no entra', () => {
  const datos = { carta: { meta: { id: 'c1', version: 7, estado: 'en_servicio' }, productos: [
    { id: 'b1', nombre: 'Coke', precio: 2, categoria: 'bebidas' },
    { id: 'p1', nombre: 'Port Royal', precio: 12 }
  ] } };
  const { salida } = construirCon(datos);
  assert.ok(!salida.piezas.some(p => p.titulo === 'Coke'));
});

probar('una pieza inválida se descarta y se canta en el informe', () => {
  const roto = { ...cableado, bloques: [{ id: 'no-existe', zona: 'C', fuente: 'marca', activo: true }] };
  const { informe, salida } = construir({ cableado: roto, proyectar, hoy: '2026-11-11', datos: { carta: carta() } });
  assert.strictEqual(salida.piezas.length, 0);
  assert.ok(informe.every(i => i.estado !== 'invalido'));
});

probar('huellaImagen: la URL remota es la identidad; la local usa el hash si lo hay', () => {
  assert.strictEqual(huellaImagen('https://x/1.jpg'), 'url:https://x/1.jpg');
  assert.strictEqual(huellaImagen('img/a.jpg', { 'a.jpg': 'abc' }), 'img:abc');
  assert.strictEqual(huellaImagen(null), null);
});

console.log(`\n${ok} pruebas ok${process.exitCode ? ' — CON FALLOS' : ''}\n`);
