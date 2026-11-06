'use strict';
/**
 * whatsapp-qr — el lector que mete un pedido de WhatsApp en el POS.
 *
 * Lo que se prueba, sobre el fichero QUE VIAJA EN EL REPO (no la copia de la VPS):
 *   eventos JSONL → parser real de Enki → re-tasado contra la carta → payload tienda.
 *
 * Los tres invariantes que importan:
 *   · el precio sale de la CARTA, no del texto del cliente;
 *   · un pedido de otro negocio se ignora (el puente es multi-cuenta);
 *   · el script versionado no lleva rutas ni slugs de ningún cliente: lo de cada
 *     máquina vive en wa.env.
 */
const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { execFileSync } = require('child_process');

const RAIZ = path.join(__dirname, '../..');
const BRIDGE = path.join(RAIZ, 'bridges/whatsapp-qr');
const INGEST = path.join(BRIDGE, 'ingest/ingest.js');

let pasadas = 0;
function test(nombre, fn) {
  try {
    fn();
    pasadas++;
    console.log(`  ✅ ${nombre}`);
  } catch (e) {
    console.error(`  ❌ ${nombre}\n     ${e.message}`);
    process.exitCode = 1;
  }
}

/** Corre el lector (dry-run, un ciclo) sobre un eventos.jsonl de juguete. */
function leer(eventos, { slug = 'rapitvapers', carta } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'wa-qr-'));
  const fEventos = path.join(dir, 'eventos-tienda.jsonl');
  const fCarta = path.join(dir, `carta_${slug}.json`);
  fs.writeFileSync(fEventos, eventos.map((e) => JSON.stringify(e)).join('\n') + '\n');
  fs.writeFileSync(fCarta, JSON.stringify(carta || CARTA));

  const salida = execFileSync(
    process.execPath,
    [INGEST, '--slug', slug, '--eventos', fEventos, '--carta', fCarta, '--desde-inicio', '--once', '--dry-run'],
    { env: { ...process.env, ENKI_HOME: RAIZ }, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }
  );
  const m = salida.match(/\{[\s\S]*\}/);
  return { salida, payload: m ? JSON.parse(m[0]) : null };
}

const CARTA = {
  productos: [
    { id: 'elf600-watermelon', nombre: 'Elf Bar 600 Sandía', precio: 5.95 },
    { id: 'vozol-neon-1000', nombre: 'Vozol Neon 1000', precio: 8.0 }
  ]
};

const msg = (texto) => ({ tipo: 'mensaje', de: '34600000000@s.whatsapp.net', texto });

console.log('\n🧪 whatsapp-qr · lector JSONL → pedido\n');

test('el precio sale de la carta, no del texto (0,01 € → 5,95 €)', () => {
  const { payload } = leer([
    msg('PEDIDO rapitvapers-AB23\n- 1 x Elf Bar 600 Sandía (0,01 EUR)\nTotal: 0,01 EUR\nNombre: Prueba QR')
  ]);
  assert(payload, 'no imprimió payload en dry-run');
  assert.deepStrictEqual(payload.items.map((i) => i.producto_id), ['elf600-watermelon']);
  assert.strictEqual(payload.items[0].precio_unitario_centimos, 595);
  assert.strictEqual(payload.total_centimos, 595);
  assert.strictEqual(payload.cliente_telefono, '34600000000', 'un @s.whatsapp.net SÍ es un teléfono');
});

test('dos líneas y cantidades: el total lo compone la carta', () => {
  const { payload } = leer([
    msg('PEDIDO rapitvapers-CD45\n- 2 x Elf Bar 600 Sandía (0,01 EUR)\n- 1 x Vozol Neon 1000 (0,01 EUR)\nTotal: 0,02 EUR\nNombre: Prueba QR')
  ]);
  assert.strictEqual(payload.items.length, 2);
  assert.strictEqual(payload.total_centimos, 595 * 2 + 800);
});

test('un pedido de otro negocio se ignora (no se crea nada)', () => {
  const { salida, payload } = leer([
    msg('PEDIDO otra-tienda-EF67\n- 1 x Elf Bar 600 Sandía (5,95 EUR)\nTotal: 5,95 EUR\nNombre: Ajeno')
  ]);
  assert.strictEqual(payload, null, 'no debía imprimir payload');
  assert(/otro negocio/.test(salida), 'debía decir por qué lo ignora');
});

test('lo que no es un pedido no se toca', () => {
  const { salida, payload } = leer([msg('hola, ¿tenéis elf bar?')]);
  assert.strictEqual(payload, null);
  assert(!/PEDIDO CREADO/.test(salida));
});

test('lo de cada máquina vive en wa.env; el script no lleva rutas ni slugs de cliente', () => {
  for (const f of ['servicio/servicio.sh', 'servicio/watchdog.sh', 'servicio/pair.sh',
                   'servicio/wa-servicio.service.in', 'install.sh', 'build.sh', 'bridge/main.rs']) {
    const src = fs.readFileSync(path.join(BRIDGE, f), 'utf8');
    assert(!src.includes('/home/hermes'), `${f} tiene una ruta de una máquina concreta`);
  }
  const servicio = fs.readFileSync(path.join(BRIDGE, 'servicio/servicio.sh'), 'utf8');
  assert(/\bwa\.env\b/.test(servicio), 'servicio.sh debe leer wa.env');
  assert(/--slug "\$PROYECTO"/.test(servicio), 'el lector debe recibir $PROYECTO, no un slug clavado');
});

console.log(`\n${process.exitCode ? '❌' : '✅'} ${pasadas} prueba(s) en verde\n`);
