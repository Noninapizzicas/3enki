'use strict';

/**
 * instagram-bridge · M1 · RetratoFechado (CUSTODIO)
 *
 * La regla del bloque, fijada aqui:
 *
 *   **un dato sin fecha es una opinion.**
 *
 * Y se fija por los dos lados: `preparar` rechaza el dato sin fecha y el
 * custodio NO escribe nada; en el otro lado, la foto con fecha por dato entra
 * y se puede leer con sus fechas intactas.
 *
 * Ademas: la foto es append-only (no se corrige, se toma otra), `ultimo` no
 * mezcla cuentas y la auditoria del almacen encuentra un dato sin fecha aunque
 * se haya colado por una version anterior.
 *
 * Ejecutar: node modules/instagram-bridge/tests/retratos.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const m1 = require('../operacion/retratos');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const SELLO = { proyecto: 'proy-a', cuenta: 'taller_a', plataforma: 'instagram' };
const TOMADO = '2026-11-11T09:00:00Z';

function directorio() {
  return fs.mkdtempSync(path.join(os.tmpdir(), 'ib-retratos-'));
}

function retrato(opts = {}) {
  return Object.assign({
    sello: SELLO,
    tomado_en: TOMADO,
    datos: [{ nombre: 'seguidores', valor: 1200, leido_en: '2026-11-11T08:58:00Z' }]
  }, opts);
}

// ---------------------------------------------------------------------------
// 1 · LA REGLA
// ---------------------------------------------------------------------------

test('un_dato_sin_fecha_es_una_opinion', async () => {
  // --- el dato suelto, sin fecha: no hay foto ------------------------------
  const sinFecha = m1.preparar(retrato({ datos: [{ nombre: 'seguidores', valor: 1200 }] }));
  assert.strictEqual(sinFecha.ok, false, 'un dato sin fecha no puede ser un retrato');
  assert.strictEqual(sinFecha.motivo, 'dato_sin_fecha');
  assert.deepStrictEqual(sinFecha.datos_sin_fecha, ['seguidores']);

  // La forma corta (mapa valor pelado) tampoco pasa: es la misma opinion.
  const mapaPelado = m1.preparar(retrato({ datos: { seguidores: 1200 } }));
  assert.strictEqual(mapaPelado.ok, false);
  assert.strictEqual(mapaPelado.motivo, 'dato_sin_fecha');
  assert.deepStrictEqual(mapaPelado.datos_sin_fecha, ['seguidores']);

  // --- la foto sin fecha tampoco ------------------------------------------
  const fotoSinFecha = m1.preparar(retrato({ tomado_en: undefined }));
  assert.strictEqual(fotoSinFecha.ok, false);
  assert.strictEqual(fotoSinFecha.motivo, 'dato_sin_fecha');
  assert.deepStrictEqual(fotoSinFecha.faltan, ['tomado_en']);

  // --- y el custodio no escribe NADA de lo que rechaza --------------------
  const dir = directorio();
  try {
    const custodio = new m1.RetratosFechados({ directorio: dir });
    const r = await custodio.custodiar(retrato({ datos: [{ nombre: 'alcance', valor: 300 }] }));
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'dato_sin_fecha');
    assert.strictEqual(r.guardado, false);
    assert.strictEqual(fs.existsSync(path.join(dir, 'retratos.json')), false, 'un rechazo no deja fichero');
    assert.strictEqual((await custodio.ultimo({ sello: SELLO })).encontrado, false);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }

  // --- con fecha por dato, la foto SI entra ------------------------------
  const buena = m1.preparar(retrato());
  assert.strictEqual(buena.ok, true);
  assert.strictEqual(buena.retrato.datos[0].leido_en, '2026-11-11T08:58:00Z');
  assert.strictEqual(buena.retrato.tomado_en, TOMADO);
  assert.strictEqual(buena.retrato.retrato_id, 'proy-a:instagram:taller_a:2026-11-11T09:00:00Z');
});

test('un_dato_posterior_a_la_foto_no_es_de_esta_foto', () => {
  const r = m1.preparar(retrato({ datos: [{ nombre: 'seguidores', valor: 10, leido_en: '2026-11-11T10:00:00Z' }] }));
  assert.strictEqual(r.ok, false);
  assert.strictEqual(r.motivo, 'dato_posterior_al_retrato');
  assert.deepStrictEqual(r.datos_posteriores, ['seguidores']);
});

test('un_valor_nulo_con_fecha_es_un_dato_no_un_hueco', async () => {
  // "a las 09:00 no se pudo leer el alcance" es informacion, y se guarda.
  const dir = directorio();
  try {
    const c = new m1.RetratosFechados({ directorio: dir });
    const r = await c.custodiar(retrato({
      datos: [{ nombre: 'alcance', valor: null, leido_en: '2026-11-11T08:59:00Z', motivo: 'no_disponible' }]
    }));
    assert.strictEqual(r.ok, true);
    const u = await c.ultimo({ sello: SELLO });
    assert.strictEqual(u.retrato.datos[0].valor, null);
    assert.strictEqual(u.retrato.datos[0].leido_en, '2026-11-11T08:59:00Z');
    assert.strictEqual(u.retrato.datos[0].motivo, 'no_disponible');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// 2 · custodia: append-only, idempotente, por cuenta
// ---------------------------------------------------------------------------

test('la_foto_no_se_corrige_se_toma_otra', async () => {
  const dir = directorio();
  try {
    const c = new m1.RetratosFechados({ directorio: dir });
    const primera = await c.custodiar(retrato());
    assert.strictEqual(primera.ok, true);

    // Reenviar la MISMA foto es idempotente: ni duplica ni reescribe.
    const repetida = await c.custodiar(retrato());
    assert.strictEqual(repetida.repetido, true);
    assert.strictEqual(repetida.escrito, false);
    const h1 = await c.historial({ sello: SELLO });
    assert.strictEqual(h1.total, 1);

    // El mismo id con otros datos no es un reintento: es reescribir ayer.
    const otra = await c.custodiar(retrato({ datos: [{ nombre: 'seguidores', valor: 9999, leido_en: '2026-11-11T08:58:00Z' }] }));
    assert.strictEqual(otra.ok, false);
    assert.strictEqual(otra.motivo, 'retrato_id_ya_usado_con_otros_datos');

    // Corregir = tomar otra foto, con su momento.
    const segunda = await c.custodiar(retrato({
      tomado_en: '2026-11-12T09:00:00Z',
      datos: [{ nombre: 'seguidores', valor: 1300, leido_en: '2026-11-12T08:58:00Z' }]
    }));
    assert.strictEqual(segunda.ok, true);
    const h2 = await c.historial({ sello: SELLO });
    assert.strictEqual(h2.total, 2, 'la historia conserva las dos fotos');
    assert.strictEqual((await c.ultimo({ sello: SELLO })).retrato.tomado_en, '2026-11-12T09:00:00Z');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la_ultima_foto_de_una_cuenta_no_es_la_de_otra', async () => {
  const dir = directorio();
  try {
    const c = new m1.RetratosFechados({ directorio: dir });
    await c.custodiar(retrato());
    await c.custodiar(retrato({
      sello: { proyecto: 'proy-b', cuenta: 'taller_b' },
      tomado_en: '2026-11-11T10:00:00Z',
      datos: [{ nombre: 'seguidores', valor: 42, leido_en: '2026-11-11T09:59:00Z' }]
    }));

    const a = await c.ultimo({ sello: SELLO });
    assert.strictEqual(a.retrato.sello.cuenta, 'taller_a');
    assert.strictEqual(a.retrato.datos[0].valor, 1200);

    const b = await c.ultimo({ sello: { proyecto: 'proy-b', cuenta: 'taller_b' } });
    assert.strictEqual(b.retrato.sello.proyecto, 'proy-b');
    assert.strictEqual(b.retrato.datos[0].valor, 42);

    assert.strictEqual((await c.historial({ sello: SELLO })).total, 1, 'el historial no mezcla cuentas');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('el_almacen_se_escribe_con_temporal_y_rename_y_se_puede_auditar', async () => {
  const dir = directorio();
  try {
    const c = new m1.RetratosFechados({ directorio: dir });
    await c.custodiar(retrato());

    const fichero = path.join(dir, 'retratos.json');
    assert.strictEqual(fs.existsSync(fichero), true);
    assert.deepStrictEqual(fs.readdirSync(dir), ['retratos.json'], 'no queda ningun .tmp');

    const crudo = JSON.parse(fs.readFileSync(fichero, 'utf8'));
    assert.strictEqual(crudo.esquema, 'retratos-fechados-v1');
    assert.strictEqual(crudo.almacen, 'retratos');
    assert.strictEqual(crudo.revision, 1);
    assert.strictEqual(crudo.retratos.length, 1);
    assert.ok(crudo.retratos[0].guardado_en, 'el asiento lleva su metadato');

    const audit = await c.auditar_almacen();
    assert.strictEqual(audit.ok, true);
    assert.deepStrictEqual(audit.problemas, []);
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

test('la_auditoria_encuentra_un_dato_sin_fecha_ya_guardado', () => {
  // Un almacen escrito por una version anterior (o a mano) no se libra: la
  // auditoria es el test permanente sobre lo que ya esta en disco.
  const estado = {
    esquema: 'retratos-fechados-v1',
    almacen: 'retratos',
    revision: 3,
    retratos: [
      { retrato_id: 'r1', sello: SELLO, tomado_en: TOMADO, datos: [{ nombre: 'seguidores', valor: 10 }] },
      { retrato_id: 'r2', sello: SELLO, tomado_en: TOMADO, datos: [{ nombre: 'alcance', valor: 3, leido_en: '2026-11-11T08:00:00Z' }] }
    ]
  };
  const audit = m1.auditar_almacen(estado);
  assert.strictEqual(audit.ok, false);
  const sinFecha = audit.problemas.filter((p) => p.motivo === 'dato_sin_fecha');
  assert.strictEqual(sinFecha.length, 1);
  assert.strictEqual(sinFecha[0].dato, 'seguidores');
  assert.strictEqual(sinFecha[0].retrato_id, 'r1');
});

test('un_almacen_ilegible_no_se_sobrescribe', async () => {
  const dir = directorio();
  try {
    const fichero = path.join(dir, 'retratos.json');
    fs.writeFileSync(fichero, '{esto no es json', 'utf8');
    const c = new m1.RetratosFechados({ directorio: dir });
    const r = await c.custodiar(retrato());
    assert.strictEqual(r.ok, false);
    assert.strictEqual(r.motivo, 'sin_retratos');
    assert.strictEqual(fs.readFileSync(fichero, 'utf8'), '{esto no es json', 'no se pisa lo que no se entiende');
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
});

// ---------------------------------------------------------------------------
// runner
// ---------------------------------------------------------------------------

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; console.log(`  ok  ${name}`); }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[instagram-bridge__retratos] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[instagram-bridge__retratos] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
