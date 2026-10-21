#!/usr/bin/env node
'use strict';
/**
 * nichos__criterio-base — regresión del UMBRAL de viabilidad (C2, F0/F1 · F2 · F3).
 *
 * El fallo que fija: el esqueleto por defecto entregaba TODOS los campos en
 * 'ABIERTO'. F0/F1 fija la base («pasivo → 50-300 €/semana basta»), F2 C2 la
 * declara como «base 50-300 €/semana» y F3 C2 la sella como REGLA. Con el
 * umbral todo ABIERTO, C3 degrada TODO veredicto a PUENTE('umbral_sin_declarar'):
 * el embudo no puede cortar ni dejar pasar y el vertical no llega a monetizar
 * (medido en prod: 5 lotes, 0 viables, 9 puentes en reglas-aprendidas.json).
 *
 * Lo que se fija aquí:
 *   1. Sin declaración previa, el umbral vigente YA lleva la BASE declarada
 *      (ingresos_semana_min 50 / objetivo 300) — no nace 'ABIERTO'.
 *   2. Lo que F0/F2 NO declararon (disposición a pagar, overrides por tipo)
 *      sigue 'ABIERTO': dato ausente no se asume.
 *   3. Declarar (por 'dueño') sube versión y aplica el cambio sobre la base.
 *   4. Un autor no autorizado → 403, y el umbral NO cambia.
 *
 * Sin core ni MQTT: bus de mentira.
 * Ejecutar con: node tests/unit/nichos__criterio-base.test.js
 */

const assert = require('assert');
const N = process.env.ENKI_MODULES || '/opt/enki/modules/nichos';
const load = (m) => require(`${N}/${m}/index.js`);

let fallos = 0;
async function test(desc, fn) {
  try { await fn(); console.log(`✓ ${desc}`); }
  catch (e) { fallos++; console.error(`✗ ${desc}\n  ${e.message}`); }
}

const PROJECT_ID = 'e4bcbab9-654a-41e2-9bbd-bde6c2744379';

function montar() {
  const c = new (load('criterio-viabilidad'))();
  const pub = [];
  c.eventBus = { publish: (e, p) => pub.push({ e, p }) };
  c.logger = { info() {}, error() {} };
  return { c, pub };
}

(async () => {
  console.log('\n🧪 Running nichos — el umbral de viabilidad (C2)\n');

  // ── 1. La base declarada está desde el primer read ────────────────────
  await test('sin declarar nada, el umbral vigente ya lleva la base 50-300 €/sem', async () => {
    const { c } = montar();
    const r = c._leer({ project_id: PROJECT_ID });
    assert.strictEqual(r.status, 200);
    const u = r.data.umbral_viabilidad.umbral;
    assert.strictEqual(u.ingresos_semana_min, 50, `esperaba 50, vi ${u.ingresos_semana_min}`);
    assert.strictEqual(u.ingresos_semana_objetivo, 300, `esperaba 300, vi ${u.ingresos_semana_objetivo}`);
  });

  // ── 2. Lo no declarado en F0/F2 sigue ABIERTO (no se inventa) ─────────
  await test('lo que F0/F2 no declararon queda ABIERTO (no se asume)', async () => {
    const { c } = montar();
    const u = c._leer({ project_id: PROJECT_ID }).data.umbral_viabilidad.umbral;
    assert.strictEqual(u.disposicion_pagar_min, 'ABIERTO');
    assert.strictEqual(u.por_tipo_nicho, 'ABIERTO');
    assert.strictEqual(u.exige_vb_previo_construir, 'ABIERTO');
  });

  // ── 3. Declarar aplica sobre la base y sube versión ───────────────────
  await test("declarar (dueño) aplica el cambio sobre la base y sube versión", async () => {
    const { c, pub } = montar();
    const r = c._declarar({
      project_id: PROJECT_ID,
      por_autor: 'dueño',
      cambio: { disposicion_pagar_min: 30 }
    });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.nueva_version, 1);
    const u = r.data.umbral_viabilidad.umbral;
    assert.strictEqual(u.disposicion_pagar_min, 30);
    assert.strictEqual(u.ingresos_semana_min, 50, 'el cambio NO debe borrar la base');
    assert.ok(pub.find(x => x.e === 'nichos.criterio.viabilidad.declarado'), 'debe pulsar el declarado');
  });

  // ── 4. Autor no autorizado → 403 y sin cambio ────────────────────────
  await test('autor no autorizado → 403 y el umbral no cambia', async () => {
    const { c } = montar();
    const r = c._declarar({
      project_id: PROJECT_ID,
      por_autor: 'cualquiera',
      cambio: { ingresos_semana_min: 1 }
    });
    assert.strictEqual(r.status, 403);
    const u = c._leer({ project_id: PROJECT_ID }).data.umbral_viabilidad.umbral;
    assert.strictEqual(u.ingresos_semana_min, 50);
  });

  console.log(fallos === 0 ? '\n✅ 4/4 OK\n' : `\n❌ ${fallos} fallo(s)\n`);
  process.exit(fallos === 0 ? 0 : 1);
})();
