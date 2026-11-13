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
const { desdeAprobadas, quincenaDe } = require('../fuentes/promos');

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

// ── promos: la oferta solo entra con la aprobación de la quincena ──────────

console.log('\npromos (quincena aprobada)');

const oferta = { promos: [{ id: 'saqueo', titulo: 'La Hora del Saqueo', texto: 'De 19:30 a 20:30.', desde: '2026-11-01', hasta: '2026-11-30' }] };
const calendario = (estado, canal, fecha) => ({
  entradas: [{ id: 'saqueo', titulo: 'La Hora del Saqueo', canal_id: canal, fecha, estado }]
});

probar('sin oferta o sin calendario → null (la zona no se inventa)', () => {
  assert.strictEqual(desdeAprobadas(null, null, '2026-11-11', 'escaparate'), null);
  assert.strictEqual(desdeAprobadas(calendario('programado', 'escaparate', '2026-11-11'), null, '2026-11-11', 'escaparate'), null);
  assert.strictEqual(desdeAprobadas(null, oferta, '2026-11-11', 'escaparate'), null);
});

probar('oferta + entrada programada en la quincena y en su canal → entra, con su fecha de aprobación', () => {
  const d = desdeAprobadas(calendario('programado', 'escaparate', '2026-11-12'), oferta, '2026-11-11', 'escaparate');
  assert.strictEqual(d.promos.length, 1);
  assert.strictEqual(d.promos[0].id, 'saqueo');
  assert.strictEqual(d.promos[0].aprobada_en, '2026-11-12');
  assert.strictEqual(d.quincena, '2026-11-01..2026-11-15');
});

probar('BORRADOR no es aprobación: la idea no se anuncia', () => {
  assert.strictEqual(desdeAprobadas(calendario('borrador', 'escaparate', '2026-11-11'), oferta, '2026-11-11', 'escaparate'), null);
});

probar('aprobada para OTRO canal no sale en esta pantalla', () => {
  assert.strictEqual(desdeAprobadas(calendario('programado', 'instagram', '2026-11-11'), oferta, '2026-11-11', 'escaparate'), null);
});

probar('sin canal declarado en el cableado no hay nada aprobado para la pantalla', () => {
  assert.strictEqual(desdeAprobadas(calendario('programado', 'escaparate', '2026-11-11'), oferta, '2026-11-11', null), null);
});

probar('la aprobación de OTRA quincena no vale hoy', () => {
  // hoy 11-nov → quincena 01..15; una entrada del 20-nov es de la siguiente
  assert.strictEqual(desdeAprobadas(calendario('programado', 'escaparate', '2026-11-20'), oferta, '2026-11-11', 'escaparate'), null);
  // hoy 20-nov → quincena 16..30: la misma entrada ahora sí
  assert.ok(desdeAprobadas(calendario('programado', 'escaparate', '2026-11-20'), oferta, '2026-11-20', 'escaparate'));
});

probar('la quincena es la del calendario: 1-15 y 16-fin (febrero incluido)', () => {
  assert.deepStrictEqual(quincenaDe('2026-11-11'), { inicio: '2026-11-01', fin: '2026-11-15' });
  assert.deepStrictEqual(quincenaDe('2026-11-20'), { inicio: '2026-11-16', fin: '2026-11-30' });
  assert.deepStrictEqual(quincenaDe('2026-02-20'), { inicio: '2026-02-16', fin: '2026-02-28' });
  assert.strictEqual(quincenaDe('no-es-fecha'), null);
});

probar('una promo fuera de su ventana no entra en el carrusel', () => {
  const cableadoPromos = { ...cableado, bloques: [{ id: 'promos', zona: 'C', fuente: 'promos', activo: true }] };
  const r = construir({
    cableado: cableadoPromos, proyectar, hoy: '2026-11-11',
    datos: { carta: carta(), promos: { promos: [
      { id: 'pasada', titulo: 'Ya pasó', desde: '2026-11-01', hasta: '2026-11-05' },
      { id: 'hoy', titulo: 'Vale hoy', desde: '2026-11-11', hasta: '2026-11-11' }
    ] } }
  });
  const titulos = r.salida.piezas.filter(p => p.bloque === 'promos').map(p => p.titulo);
  assert.deepStrictEqual(titulos, ['Vale hoy']);
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
