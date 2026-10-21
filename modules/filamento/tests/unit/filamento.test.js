/**
 * Tests unitarios — filamento (CUSTODIO del taller 3D, F4 TANDA 2).
 *
 * Sin bus real: instancia el reflejo con eventBus en memoria que captura publicaciones,
 * y llama a las proyecciones/op directamente. Verifica:
 *   - registrar bobina (gramos_total obligatorio; restantes = total si no se indica)
 *   - descontar SOLO con gramo MEDIDO (cero estimación): sin gramo → 400 + failed
 *   - descontar sin bobina → 404 + failed
 *   - umbral de reposición: resta < umbral → material.bajo (avisa, NO decide)
 *   - cambiar bobina (enUso) → material.actualizado
 *   - evaluar umbral sobre todas las bobinas
 *
 * Ejecutar: node modules/filamento/tests/unit/filamento.test.js
 */

'use strict';

const assert = require('assert');

const Filamento = require('../../index.js');

function makeMocks() {
  const published = [];
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const metrics = { increment: () => {} };
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  return { published, logger, metrics, eventBus };
}

async function setup() {
  const mocks = makeMocks();
  const m = new Filamento();
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

const evNames = (published, name) => published.filter(p => p[0] === name).map(p => p[1]);

(async () => {
  // ── 1. registrar: gramos_total obligatorio ──
  {
    const { m, published } = await setup();
    const r = await m._registrarBobina({ project_id: 'proj-3d', material: 'PETG', gramos_total: 1000 });
    assert.strictEqual(r.status, 201, 'crea bobina');
    const b = r.data.bobina;
    assert.ok(b.id, 'genera id');
    assert.strictEqual(b.gramos_total, 1000);
    assert.strictEqual(b.gramos_restantes, 1000, 'restantes = total si no se indica');
    assert.strictEqual(b.enUso, false);
    const evs = evNames(published, 'material.actualizado');
    assert.strictEqual(evs.length, 1, 'emite material.actualizado');
    assert.strictEqual(evs[0].accion, 'registrada');

    const noTotal = await m._registrarBobina({ project_id: 'p' });
    assert.strictEqual(noTotal.status, 400, 'exige gramos_total');
    const noPid = await m._registrarBobina({ gramos_total: 100 });
    assert.strictEqual(noPid.status, 400, 'exige project_id');
  }
  console.log('✓ filamento: registrar bobina + validaciones');

  // ── 2. descontar SOLO con gramo medido (CERO estimación) ──
  {
    const { m, published } = await setup();
    const creada = await m._registrarBobina({ project_id: 'proj-3d', gramos_total: 1000 });
    const id = creada.data.bobina.id;
    await m._cambiarBobina({ project_id: 'proj-3d', bobina_id: id, en_uso: true });

    const sinGramo = await m._descontar({ project_id: 'proj-3d', bobina_id: id });
    assert.strictEqual(sinGramo.status, 400, 'sin gramo medido → 400');
    const failed = evNames(published, 'filamento.descontar.failed');
    assert.strictEqual(failed.length, 1, 'emite par de fallo');
    assert.strictEqual(failed[0].motivo, 'sin_gramo_medido');

    const ok = await m._descontar({ project_id: 'proj-3d', bobina_id: id, gramos_medido: 120 });
    assert.strictEqual(ok.status, 200, 'descuenta con gramo medido');
    assert.strictEqual(ok.data.bobina.gramos_restantes, 880, '880 restantes');
    assert.strictEqual(ok.data.gramos_descontados, 120);
    const updated = evNames(published, 'material.actualizado').filter(e => e.accion === 'descontada');
    assert.strictEqual(updated.length, 1, 'emite material.actualizado descontada');
  }
  console.log('✓ filamento: descontar solo con gramo medido (CERO estimación)');

  // ── 3. descontar sin bobina → 404 + failed ──
  {
    const { m, published } = await setup();
    const r = await m._descontar({ project_id: 'proj-3d', bobina_id: 'bob_never', gramos_medido: 10 });
    assert.strictEqual(r.status, 404, 'bobina inexistente');
    assert.strictEqual(evNames(published, 'filamento.descontar.failed').length, 1, 'emite failed');
  }
  console.log('✓ filamento: descontar sin bobina -> 404 + failed');

  // ── 4. umbral de reposición → material.bajo (avisa, NO decide) ──
  {
    const { m, published } = await setup();
    const creada = await m._registrarBobina({ project_id: 'proj-3d', gramos_total: 1000, umbral_repos: 200 });
    const id = creada.data.bobina.id;
    await m._cambiarBobina({ project_id: 'proj-3d', bobina_id: id, en_uso: true });
    // descontar 900 → restan 100 < 200
    const r = await m._descontar({ project_id: 'proj-3d', bobina_id: id, gramos_medido: 900 });
    assert.strictEqual(r.data.bajo_umbral, true, 'bajo umbral');
    const bajos = evNames(published, 'material.bajo');
    assert.strictEqual(bajos.length, 1, 'emite material.bajo');
    assert.strictEqual(bajos[0].gramos_restantes, 100);
    assert.strictEqual(bajos[0].umbral, 200);

    // sin cruzar no emite bajo
    const p2 = await setup();
    const m2 = p2.m;
    await m2._registrarBobina({ project_id: 'proj-3d', gramos_total: 1000, umbral_repos: 200 });
    const id2 = [...m2.bobinas.keys()][0].split(':')[1];
    await m2._cambiarBobina({ project_id: 'proj-3d', bobina_id: id2, en_uso: true });
    await m2._descontar({ project_id: 'proj-3d', bobina_id: id2, gramos_medido: 50 });
    assert.strictEqual(evNames(p2.published, 'material.bajo').length, 0, 'no emite bajo si no cruza');
  }
  console.log('✓ filamento: umbral -> material.bajo (avisa, no decide)');

  // ── 5. cambiar bobina ──
  {
    const { m, published } = await setup();
    const a = await m._registrarBobina({ project_id: 'proj-3d', gramos_total: 500 });
    const b = await m._registrarBobina({ project_id: 'proj-3d', gramos_total: 750 });
    const idB = b.data.bobina.id;
    const r = await m._cambiarBobina({ project_id: 'proj-3d', bobina_id: idB });
    assert.strictEqual(r.status, 200);
    const bobB = m.bobinas.get(`proj-3d:${idB}`);
    assert.strictEqual(bobB.enUso, true, 'bobina B en uso');
    const bobA = m.bobinas.get(`proj-3d:${a.data.bobina.id}`);
    assert.strictEqual(bobA.enUso, false, 'bobina A ya no en uso');
    const evs = evNames(published, 'material.actualizado').filter(e => e.accion === 'cambio_bobina');
    assert.ok(evs.length >= 1, 'emite material.actualizado cambio_bobina');
    assert.ok(evs[evs.length - 1].en_uso === true);
  }
  console.log('✓ filamento: cambiar bobina (enUso) -> material.actualizado');

  // ── 6. evaluar umbral sobre todas ──
  {
    const { m, published } = await setup();
    await m._registrarBobina({ project_id: 'proj-3d', gramos_total: 1000, umbral_repos: 300 });
    const bob = m.bobinas.values().next().value;
    await m._cambiarBobina({ project_id: 'proj-3d', bobina_id: bob.id, en_uso: true });
    await m._descontar({ project_id: 'proj-3d', bobina_id: bob.id, gramos_medido: 800 }); // restan 200 < 300
    const r = await m._evaluarUmbral({ project_id: 'proj-3d' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.evaluadas, 1);
    assert.strictEqual(r.data.bajas.length, 1, 'detecta la bobina baja');
    assert.ok(evNames(published, 'material.bajo').length >= 2, 'emite bajo en descontar y en evaluar');
  }
  console.log('✓ filamento: evaluar umbral');

  console.log('\n✅ TODOS LOS TESTS DE FILAMENTO PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
