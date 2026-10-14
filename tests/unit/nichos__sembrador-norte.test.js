#!/usr/bin/env node
'use strict';
/**
 * nichos__sembrador-norte — regresion del ARRANQUE del vertical por el NORTE.
 *
 * El fallo que fija: el buscador tiene norte (el catalogo marca puede_cobrar),
 * pero la SEMILLA seguia viniendo de fuera — la idea que el dueno escribe al
 * bot. Asi el vertical juzgaba dominios donde no podemos servir (la competencia
 * del taller de crochet) y todo acababa en PUENTE: «buscar donde nosotros
 * fallamos».
 *
 * Lo que se fija aqui:
 *   1. La semilla sale del CATALOGO (el dato), no de una lista clavada: siembra
 *      una idea por semilla declarada en meta.semillas.
 *   2. La idea entra con la forma del dueno y por la MISMA puerta:
 *      nichos.semilla.capturar.request → texto "<semilla> en <territorio>".
 *   3. Sin catalogo NO se inventa NADA: 0 publicadas + pulso sin_norte.
 *   4. Fallback honesto: sin meta.semillas, el dominio es la semilla.
 *   5. Contrato: project_id y territorio son obligatorios (400 si faltan).
 *
 * Sin core ni MQTT: bus de mentira + stub de _rpc.
 * Ejecutar con: node tests/unit/nichos__sembrador-norte.test.js
 */

const assert = require('assert');
const N = process.env.ENKI_MODULES || '/opt/enki/modules/nichos';
const load = (m) => require(`${N}/${m}/index.js`);

let fallos = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fallos++; console.error(`✗ ${desc}\n  ${e.message}`); }
}

const PROJECT_ID = '4fe1fb71-df73-4d67-8fb7-ba6b0beff253';

const CAP_COMERCIO = {
  id: 'comercio-pizzepos-pos',
  descripcion: 'POS y carta digital para hosteleria',
  meta: { dominio: 'comercio', semillas: ['pizzeria', 'restaurante', 'cafeteria'] }
};
const CAP_3D = {
  id: 'impresion-3d-por-encargo',
  descripcion: 'Taller de impresion 3D por encargo',
  meta: { dominio: 'impresion-3d', semillas: ['taller de mecanizado'] }
};

/** Monta el sembrador con bus de mentira; `disponibles` es el catalogo (el norte). */
function montar({ disponibles = [CAP_COMERCIO], catalogoCaido = false } = {}) {
  const s = new (load('sembrador-norte'))();
  const pub = [];
  s.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  s.logger = { info() {}, error() {} };
  s._rpc = async (ev) => {
    if (ev === 'nichos.catalogo.capacidad.disponibles.request') {
      if (catalogoCaido) throw new Error('catalogo caido');
      return { status: 200, data: { capacidades: disponibles } };
    }
    return null;
  };
  return { s, pub };
}

const sembrar = (s, extra = {}) =>
  s._sembrar({ request_id: 'r-1', project_id: PROJECT_ID, territorio: 'Lorca', ...extra });

const semillasPublicadas = (pub) =>
  pub.filter((x) => x.e === 'nichos.semilla.capturar.request').map((x) => x.p);

(async () => {
  console.log('\n🧪 Running nichos — el SEMBRADOR del norte\n');

  // ── 1. Siembra una idea por semilla, desde el catalogo ────────────────
  await test('siembra una idea por semilla declarada en el catalogo', async () => {
    const { s, pub } = montar();
    const r = await sembrar(s);

    assert.strictEqual(r.status, 200);
    const ideas = semillasPublicadas(pub);
    assert.strictEqual(ideas.length, 3, 'tres semillas declaradas → tres ideas sembradas');
    assert.deepStrictEqual(
      ideas.map((i) => i.texto),
      ['pizzeria en Lorca', 'restaurante en Lorca', 'cafeteria en Lorca'],
      'la idea lleva la forma del dueno: "<semilla> en <territorio>"'
    );
    assert.ok(ideas.every((i) => i.capacidad_id === 'comercio-pizzepos-pos'), 'cada idea cita su capacidad');
  });

  // ── 2. Entra por la MISMA puerta que el dueno ──────────────────────────
  await test('entra por la puerta del vertical, con la forma del contrato del capturador', async () => {
    const { s, pub } = montar();
    await sembrar(s);

    const idea = semillasPublicadas(pub)[0];
    assert.ok(idea.request_id, 'lleva request_id');
    assert.strictEqual(idea.project_id, PROJECT_ID, 'lleva el proyecto del vertical');
    assert.strictEqual(idea.origen, 'sembrador-norte', 'el origen declara que viene del sembrador');
    assert.strictEqual(idea.territorio, 'Lorca', 'el territorio viaja en el payload');
    assert.ok(idea.texto && typeof idea.texto === 'string', 'y el texto es la idea completa');
  });

  // ── 3. Sin catalogo NO se inventa nada ─────────────────────────────────
  await test('sin catalogo: 0 ideas, motivo sin_norte y pulso que lo dice', async () => {
    const { s, pub } = montar({ disponibles: [] });
    const r = await sembrar(s);

    assert.strictEqual(r.data.publicadas, 0, 'no se siembra ni una idea inventada');
    assert.strictEqual(r.data.motivo, 'sin_norte');
    assert.strictEqual(semillasPublicadas(pub).length, 0, 'no sale nada por la puerta');
    assert.ok(pub.some((x) => x.e === 'nichos.sembrador.norte.sin_norte'), 'DEBE pulsar que no hay norte');
  });

  // ── 4. Catalogo caido = mismo trato honesto (no cuelga, no inventa) ────
  await test('catalogo caido: degrada honesto, no cuelga', async () => {
    const { s, pub } = montar({ catalogoCaido: true });
    const r = await sembrar(s);

    assert.strictEqual(r.status, 200, 'no revienta el reflejo');
    assert.strictEqual(r.data.publicadas, 0);
    assert.ok(pub.some((x) => x.e === 'nichos.sembrador.norte.sin_norte'));
  });

  // ── 5. Tope por capacidad y filtro por capacidad ───────────────────────
  await test('max_semillas corta, y el filtro elige la capacidad', async () => {
    const { s, pub } = montar({ disponibles: [CAP_COMERCIO, CAP_3D] });

    await sembrar(s, { max_semillas: 1 });
    assert.strictEqual(semillasPublicadas(pub).length, 2, '1 por capacidad con tope 1');
    assert.deepStrictEqual(
      semillasPublicadas(pub).map((i) => i.capacidad_id),
      ['comercio-pizzepos-pos', 'impresion-3d-por-encargo'],
      'una por cada capacidad'
    );

    const { s: s2, pub: pub2 } = montar({ disponibles: [CAP_COMERCIO, CAP_3D] });
    await sembrar(s2, { capacidades: ['impresion-3d-por-encargo'] });
    const ideas = semillasPublicadas(pub2);
    assert.strictEqual(ideas.length, 1, 'el filtro deja fuera la otra capacidad');
    assert.strictEqual(ideas[0].texto, 'taller de mecanizado en Lorca');
  });

  // ── 6. Fallback honesto: sin meta.semillas, el dominio ─────────────────
  await test('capacidad sin meta.semillas: cae al dominio (no a una lista clavada)', async () => {
    const { s, pub } = montar({
      disponibles: [{ id: 'x-1', descripcion: 'algo', meta: { dominio: 'construccion' } }]
    });
    await sembrar(s);

    const ideas = semillasPublicadas(pub);
    assert.strictEqual(ideas.length, 1);
    assert.strictEqual(ideas[0].texto, 'construccion en Lorca');
  });

  // ── 7. El cierre lleva su resumen ───────────────────────────────────────
  await test('pulsa el resumen de la siembra (capacidades, publicadas, sembradas)', async () => {
    const { s, pub } = montar({ disponibles: [CAP_COMERCIO, CAP_3D] });
    await sembrar(s);

    const fin = pub.find((x) => x.e === 'nichos.sembrador.norte.sembrado');
    assert.ok(fin, 'pulsa el cierre');
    assert.strictEqual(fin.p.publicadas, 4, '3 de comercio + 1 de 3D');
    assert.deepStrictEqual(fin.p.capacidades, ['comercio-pizzepos-pos', 'impresion-3d-por-encargo']);
    assert.strictEqual(fin.p.territorio, 'Lorca');
  });

  // ── 8. Contrato: project_id y territorio obligatorios ─────────────────
  await test('sin project_id o sin territorio: 400 INVALID_INPUT', async () => {
    const { s, pub } = montar();

    const sinProyecto = await s._sembrar({ territorio: 'Lorca' });
    assert.strictEqual(sinProyecto.status, 400);
    assert.strictEqual(sinProyecto.error.code, 'INVALID_INPUT');
    assert.strictEqual(sinProyecto.error.details.field, 'project_id');

    const sinTerritorio = await s._sembrar({ project_id: PROJECT_ID });
    assert.strictEqual(sinTerritorio.status, 400);
    assert.strictEqual(sinTerritorio.error.details.field, 'territorio');

    assert.strictEqual(semillasPublicadas(pub).length, 0, 'no siembra nada si el contrato esta mal');
  });

  // ── 9. La semilla NO esta clavada en el codigo ────────────────────────
  await test('cambiar el catalogo cambia la semilla (dato, no codigo)', async () => {
    const { s, pub } = montar({
      disponibles: [{ id: 'y-1', descripcion: 'z', meta: { semillas: ['gestoria'] } }]
    });
    await sembrar(s);

    assert.deepStrictEqual(semillasPublicadas(pub).map((i) => i.texto), ['gestoria en Lorca']);
  });

  console.log(`\n${fallos === 0 ? '✅ SEMBRADOR-NORTE OK' : `❌ ${fallos} fallo(s)`} — 9 casos\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
