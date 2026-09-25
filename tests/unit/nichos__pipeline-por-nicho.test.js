/**
 * Test unitario — nichos/pipeline-por-nicho (L1, custodio / orquestador)
 *
 * La MÁQUINA DE ESTADOS semilla→caja. Cubre: el recorrido completo de estados
 * VÁLIDOS (SEMILLA→BUSCADO→VALIDANDO→VALIDADO→CONSTRUIDO→OPERANDO→COBRANDO→
 * EN_CAJA), que transición válida avanza, que una transición inválida se rechaza
 * con par de fallo (estado ilegal imposible, p.ej. saltar VALIDANDO→CONSTRUIDO),
 * el corte DURO C6 (NO_VIABLE→CORTADO), el gate RECHAZA→OPERANDO_EN_ESPERA,
 * cobro COMPROMETIDO permanece COBRANDO, ciclo_completado en terminal, y la
 * persistencia per-proyecto (PosPersistencia + project.activated restaura).
 *
 * Ejecutar: node tests/unit/nichos__pipeline-por-nicho.test.js
 */

'use strict';
const assert = require('assert');
const ModuleLoader = require('../../core/modules/loader.js');

function makeMiniBus() {
  const subs = new Map();
  const published = [];
  return {
    published,
    subscribe(name, handler) {
      if (!subs.has(name)) subs.set(name, new Set());
      subs.get(name).add(handler);
      return () => subs.get(name)?.delete(handler);
    },
    async publish(name, data) {
      published.push([name, data]);
      const set = subs.get(name);
      if (!set) return;
      for (const h of [...set]) { try { await h(data); } catch (_) {} }
    },
    listenerCount(name) { return subs.get(name)?.size || 0; }
  };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (err) {
    console.error(`✗ ${description}`);
    console.error(`  ${err.message}`);
    if (process.env.STACK) console.error(err.stack);
    process.exit(1);
  }
}

const LOG = { debug(){}, info(){}, warn(){}, error(){} };
const METRICS = { increment(){}, gauge(){} };

// Helper: aplica un evento de dominio al orquestador (fire-and-forget) y retorna.
function aplicar(instance, evento, data) {
  const handler = {
    'nichos.semilla.capturada': 'onSemillaCapturada',
    'nichos.semilla.normalizada': 'onSemillaNormalizada',
    'nichos.territorio.sondeado': 'onTerritorioSondeado',
    'nichos.veredicto.emitido': 'onVeredictoEmitido',
    'nichos.camino.decidido': 'onCaminoDecidido',
    'nichos.solucion.construida': 'onSolucionConstruida',
    'nichos.cobro.ejecutado': 'onCobroEjecutado',
    'nichos.salud.actualizada': 'onSaludActualizada'
  };
  return instance[handler[evento]]({ data });
}

(async () => {
  console.log('nichos/pipeline-por-nicho — machine de estados (L1)\n');

  const bus = makeMiniBus();
  const loader = new ModuleLoader({ modulesPath: './modules/nichos', core: { eventBus: bus }, logger: LOG, metrics: METRICS });
  const d = loader.discover().find(m => m.name === 'pipeline-por-nicho');
  assert.ok(d, 'módulo descubierto');
  assert.ok(loader.validateManifest(d.manifest), 'manifest válido (name/version/description + semver)');
  assert.ok(!d.group, 'vertical: sin group (módulo de nichos directo)');
  const instance = await loader.load(d.name, d.path, d.manifest);
  instance.project_id = 'p1';
  assert.strictEqual(typeof instance.onLoad, 'function', 'hereda onLoad de la base');
  assert.strictEqual(typeof instance._atender, 'function', 'hereda _atender');
  assert.strictEqual(typeof instance._persist, 'object', 'custodio: tiene PosPersistencia');
  assert.strictEqual(typeof instance.onProjectActivated, 'function', 'custodio: restaura en project.activated');
  assert.strictEqual(typeof instance._transicion, 'function', 'proyección _transicion (maquina) presente');
  assert.strictEqual(typeof instance._orquestarEtapa, 'function', 'proyección _orquestarEtapa presente');

  // ── RECORRIDO VÁLIDO COMPLETO: SEMILLA → EN_CAJA ──
  await testAsync('registrar semilla → ciclo_iniciado (SEMILLA)', async () => {
    const res = await instance.onRegistrarSemillaRequest({ data: { project_id: 'p1', nicho: 'n1', request_id: 'RE1' } });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.estado, 'SEMILLA');
    assert.ok(bus.published.some(([n]) => n === 'nichos.pipeline.ciclo_iniciado'), 'publica ciclo_iniciado');
  });

  await testAsync('recorrido válido: SEMILLA→BUSCADO→VALIDANDO→VALIDADO→CONSTRUIDO→OPERANDO→COBRANDO→EN_CAJA', async () => {
    const ver = () => instance.toolVer('n1', 'p1').data.estado;

    // SEMILLA → BUSCADO (semilla capturada / normalizada)
    await aplicar(instance, 'nichos.semilla.capturada', { project_id: 'p1', nicho: 'n1' });
    assert.strictEqual(ver(), 'BUSCADO', 'tras capturar');
    // BUSCADO → VALIDANDO (territorio sondeado)
    await aplicar(instance, 'nichos.territorio.sondeado', { project_id: 'p1', nicho: 'n1' });
    assert.strictEqual(ver(), 'VALIDANDO', 'tras sondear');
    // VALIDANDO → VALIDADO (veredicto VIABLE), corto C1 estudio antes (permanece)
    await aplicar(instance, 'nichos.veredicto.emitido', { project_id: 'p1', nicho: 'n1', veredicto: 'VIABLE' });
    assert.strictEqual(ver(), 'VALIDADO', 'veredicto VIABLE avanza a VALIDADO');
    // VALIDADO → CONSTRUIDO (camino decidido ENCONTRAR/CONSTRUIR)
    await aplicar(instance, 'nichos.camino.decidido', { project_id: 'p1', nicho: 'n1' });
    assert.strictEqual(ver(), 'CONSTRUIDO', 'tras decidir camino');
    // CONSTRUIDO → OPERANDO (solución construida)
    await aplicar(instance, 'nichos.solucion.construida', { project_id: 'p1', nicho: 'n1' });
    assert.strictEqual(ver(), 'OPERANDO', 'tras construir solución');

    // OPERANDO → COBRANDO (gate APRUEBA)
    const gate = instance.toolAvanzar({ project_id: 'p1', nicho: 'n1', tipo_evento: 'nichos.gate.aprobado', payload: {} });
    assert.strictEqual(gate.status, 200);
    assert.strictEqual(gate.data.nuevo_estado, 'COBRANDO', 'gate APRUEBA → COBRANDO');
    assert.strictEqual(ver(), 'COBRANDO', 'estado tras gate');

    // COBRANDO → EN_CAJA (cobro EFECTIVO)
    const cobro = await aplicar(instance, 'nichos.cobro.ejecutado', { project_id: 'p1', nicho: 'n1', tipo: 'EFECTIVO' });
    assert.strictEqual(cobro.status, 200);
    assert.strictEqual(cobro.data.nuevo_estado, 'EN_CAJA', 'cobro EFECTIVO → EN_CAJA');
    assert.strictEqual(ver(), 'EN_CAJA', 'ciclo completo en caja');

    // ciclo completado (terminal) publicado
    assert.ok(bus.published.some(([n, v]) => n === 'nichos.pipeline.ciclo_completado' && v.nuevo_estado === 'EN_CAJA'), 'ciclo_completado en EN_CAJA');
    assert.ok(bus.published.some(([n]) => n === 'nichos.pipeline.avanzado'), 'publica avanzado durante el recorrido');
  });

  await testAsync('transición ilegal: EN_CAJA → intento de avanzar → rechazado con par de fallo', () => {
    const res = instance.toolAvanzar({ project_id: 'p1', nicho: 'n1', tipo_evento: 'nichos.cobro.ejecutado', payload: { tipo: 'EFECTIVO' } });
    assert.strictEqual(res.status, 409);
    assert.strictEqual(res.error.code, 'CONFLICT_STATE', 'terminal no avanza');
  });

  // ── CORTE DURO C6: NO_VIABLE → CORTADO, nunca CONSTRUIDO ──
  await testAsync('corte DURO: veredicto NO_VIABLE en VALIDANDO → CORTADO (nunca avanza a construcción)', async () => {
    const res = await instance.onRegistrarSemillaRequest({ data: { project_id: 'p1', nicho: 'n7' } });
    assert.strictEqual(res.status, 200, 'semilla n7 registrada');
    await aplicar(instance, 'nichos.semilla.capturada', { project_id: 'p1', nicho: 'n7' });
    await aplicar(instance, 'nichos.territorio.sondeado', { project_id: 'p1', nicho: 'n7' });
    assert.strictEqual(instance.toolVer('n7', 'p1').data.estado, 'VALIDANDO');
    // NO_VIABLE → CORTADO
    const corte = await aplicar(instance, 'nichos.veredicto.emitido', { project_id: 'p1', nicho: 'n7', veredicto: 'NO_VIABLE' });
    assert.strictEqual(corte.status, 200);
    assert.strictEqual(corte.data.nuevo_estado, 'CORTADO', 'NO_VIABLE → CORTADO');
    assert.strictEqual(instance.toolVer('n7', 'p1').data.estado, 'CORTADO');
    assert.ok(bus.published.some(([n, v]) => n === 'nichos.pipeline.ciclo_completado' && v.nicho === 'n7' && v.nuevo_estado === 'CORTADO'), 'CORTADO es terminal');
  });

  await testAsync('estado ilegal imposible: VALIDANDO intenta llegar a EN_CAJA sin pasar las etapas → rechazado', async () => {
    // nicho n7 quedó en CORTADO (terminal): ningún evento le aplica (rechazo 409)
    const terminal = instance.toolAvanzar({ project_id: 'p1', nicho: 'n7', tipo_evento: 'nichos.camino.decidido', payload: {} });
    assert.strictEqual(terminal.status, 409, 'terminal rechaza avanzar');
    assert.strictEqual(instance.toolVer('n7', 'p1').data.estado, 'CORTADO');

    // salto de etapa imposible: en VALIDANDO un cobro (que exigiría pasar por VALIDADO→CONSTRUIDO→OPERANDO→COBRANDO) se rechaza
    await instance.onRegistrarSemillaRequest({ data: { project_id: 'p1', nicho: 'n9' } });
    await aplicar(instance, 'nichos.semilla.capturada', { project_id: 'p1', nicho: 'n9' });
    await aplicar(instance, 'nichos.territorio.sondeado', { project_id: 'p1', nicho: 'n9' });
    assert.strictEqual(instance.toolVer('n9', 'p1').data.estado, 'VALIDANDO');

    const salto = await aplicar(instance, 'nichos.cobro.ejecutado', { project_id: 'p1', nicho: 'n9', tipo: 'EFECTIVO' });
    assert.strictEqual(salto.status, 422, 'VALIDANDO no puede saltar a EN_CAJA');
    // la transición ilegal NO se aplicó: sigue en VALIDANDO
    assert.strictEqual(instance.toolVer('n9', 'p1').data.estado, 'VALIDANDO');
    assert.ok(bus.published.some(([n]) => n === 'nichos.pipeline.avanzar.failed'), 'publica par de fallo del salto ilegal');
  });

  // ── OPERANDO_EN_ESPERA: gate RECHAZA ──
  await testAsync('gate RECHAZA en OPERANDO → OPERANDO_EN_ESPERA (re-pregunta)', async () => {
    await instance.onRegistrarSemillaRequest({ data: { project_id: 'p1', nicho: 'n8' } });
    await aplicar(instance, 'nichos.semilla.capturada', { project_id: 'p1', nicho: 'n8' });
    await aplicar(instance, 'nichos.territorio.sondeado', { project_id: 'p1', nicho: 'n8' });
    await aplicar(instance, 'nichos.veredicto.emitido', { project_id: 'p1', nicho: 'n8', veredicto: 'VIABLE' });
    await aplicar(instance, 'nichos.camino.decidido', { project_id: 'p1', nicho: 'n8' });
    await aplicar(instance, 'nichos.solucion.construida', { project_id: 'p1', nicho: 'n8' });
    assert.strictEqual(instance.toolVer('n8', 'p1').data.estado, 'OPERANDO');
    const rechazo = instance.toolAvanzar({ project_id: 'p1', nicho: 'n8', tipo_evento: 'nichos.gate.rechazado', payload: {} });
    assert.strictEqual(rechazo.status, 200);
    assert.strictEqual(rechazo.data.nuevo_estado, 'OPERANDO_EN_ESPERA', 'RECHAZA → OPERANDO_EN_ESPERA');
    // re-pregunta: gate APRUEBA → COBRANDO
    const aprueba = instance.toolAvanzar({ project_id: 'p1', nicho: 'n8', tipo_evento: 'nichos.gate.aprobado', payload: {} });
    assert.strictEqual(aprueba.status, 200);
    assert.strictEqual(aprueba.data.nuevo_estado, 'COBRANDO', 're-pregunta APRUEBA → COBRANDO');
  });

  // ── COBRANDO con cobro COMPROMETIDO permanece ──
  await testAsync('cobro COMPROMETIDO permanece COBRANDO (no llega a caja)', async () => {
    const res = await aplicar(instance, 'nichos.cobro.ejecutado', { project_id: 'p1', nicho: 'n8', tipo: 'COMPROMETIDO' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.nuevo_estado, 'COBRANDO', 'COMPROMETIDO no llega a caja');
    assert.strictEqual(instance.toolVer('n8', 'p1').data.estado, 'COBRANDO');
  });

  // ── SANGRA: salud actualizada SANGRA en COBRANDO ──
  await testAsync('salud SANGRA en COBRANDO → SANGRA (no llega a caja con control)', async () => {
    const res = await aplicar(instance, 'nichos.salud.actualizada', { project_id: 'p1', nicho: 'n8', resultado: 'SANGRA' });
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.nuevo_estado, 'SANGRA', 'SANGRA → SANGRA (terminal)');
    assert.ok(bus.published.some(([n, v]) => n === 'nichos.pipeline.ciclo_completado' && v.nicho === 'n8' && v.nuevo_estado === 'SANGRA'), 'ciclo completado SANGRA');
  });

  // ── Entrada inválida ──
  await testAsync('avanzar sin proyecto o nicho → par de fallo (INVALID_INPUT)', async () => {
    const res = instance.toolAvanzar({ nicho: 'nX', tipo_evento: 'nichos.semilla.capturada', payload: {} });
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'INVALID_INPUT');
  });

  // ── Persistencia per-proyecto ──
  await testAsync('project.activated restaura la máquina de otro proyecto', async () => {
    instance._mapaDe('p9').set('m1', { project_id: 'p9', nicho: 'm1', estado: 'VALIDADO', etapa_actual: 'VALIDADO', historial: [], creado_en: new Date().toISOString(), actualizado_en: new Date().toISOString() });
    await instance.onProjectActivated({ data: { project_id: 'p9' } });
    const res = instance.toolVer('m1', 'p9');
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.estado, 'VALIDADO', 'restaurado');
    await instance.onUnload();  // no lanza
  });

  await testAsync('orquestar etapa: guía el siguiente paso según el estado', async () => {
    instance.project_id = 'p1';   // restaurar proyecto activo (el test de persistencia lo dejó en p9)
    const res = instance.toolOrquestarEtapa('n1');   // n1 llegó a EN_CAJA
    assert.strictEqual(res.status, 200);
    assert.strictEqual(res.data.estado, 'EN_CAJA');
    assert.strictEqual(res.data.etapa_siguiente, 'CICLO_COMPLETADO');
  });

  await testAsync('manifest: subscribes ↔ handlers y publishes exactos de la hoja L1', () => {
    const subs = d.manifest.subscribes || [];
    const esperados = [
      'nichos.pipeline.registrar_semilla.request',
      'nichos.pipeline.avanzar.request',
      'nichos.semilla.capturada',
      'nichos.semilla.normalizada',
      'nichos.territorio.sondeado',
      'nichos.candidato.encontrado',
      'nichos.estudio.medido',
      'nichos.veredicto.emitido',
      'nichos.corte.aplicado',
      'nichos.camino.decidido',
      'nichos.solucion.construida',
      'nichos.modelo_cobro.propuesto',
      'nichos.cobro.ejecutado',
      'nichos.cobro_registrado',
      'nichos.salud.actualizada',
      'project.activated'
    ];
    assert.deepStrictEqual(subs.map(s => s.event).sort(), [...esperados].sort());
    subs.forEach(s => assert.strictEqual(typeof instance[s.handler], 'function', `handler ${s.handler} definido`));
    const pubs = (d.manifest.publishes || []).map(p => p.event).sort();
    assert.deepStrictEqual(pubs, [
      'nichos.pipeline.ciclo_iniciado',
      'nichos.pipeline.avanzado',
      'nichos.pipeline.ciclo_completado',
      'nichos.pipeline.avanzar.failed'
    ].sort());
  });

  console.log('\nTodos los tests pasaron.');
})();
