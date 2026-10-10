#!/usr/bin/env node
'use strict';
/**
 * nichos__juicio-contratos — regresión de los contratos del vertical NICHOS.
 *
 * Fija lo que estaba roto: batch-validacion debe llamar a cada consumidor con
 * el NOMBRE de campo que ese consumidor valida, el orquestador debe disparar el
 * ensamblaje con id_nicho+veredicto+camino, y los módulos deben suscribir tras
 * super.onLoad (no antes, o el optional-chaining traga la suscripción).
 */
const assert = require('assert');
const fs = require('fs');
const path = require('path');

const N = '/opt/enki/modules/nichos';
const load = (m) => require(path.join(N, m, 'index.js'));
let pas = 0;
const ok = (t) => { console.log('✓', t); pas++; };

// ── batch-validacion: contratos de los 4 saltos ─────────────────────────
(async () => {
  const b = new (load('batch-validacion'))();
  const calls = [];
  b._rpc = async (ev, payload) => {
    calls.push({ ev, payload });
    if (ev === 'nichos.cola.candidatos.sacar.request') {
      return { data: { candidatos: [{ id_nicho: 'c1', payload: { semilla: { vertical_sugerido: 'taller ebike' } } }] } };
    }
    if (ev === 'nichos.demanda.estudiar.request') return { data: { informe: { demanda_1er_orden: 'x' } } };
    if (ev === 'nichos.veredicto.emitir.request') return { data: { veredicto: { codigo: 'VIABLE' } } };
    if (ev === 'nichos.camino.decidir.request') return { data: { camino: { tipo: 'CONSTRUIR' } } };
    return { data: {} };
  };
  const pulsos = [];
  b.eventBus = { publish: (e, p) => pulsos.push({ e, p }) };
  b.logger = { error() {}, info() {} };

  await b._correr({ project_id: 'p', correlation_id: 'cor' });

  const dm = calls.find(c => c.ev === 'nichos.demanda.estudiar.request');
  assert.ok(dm && dm.payload.candidato && typeof dm.payload.candidato === 'object', 'demanda recibe `candidato` (objeto)');
  assert.strictEqual(dm.payload.candidato.nombre, 'taller ebike', 'candidato trae `.nombre` para la query');
  ok('demanda.estudiar ← {candidato:{nombre}}');

  const vd = calls.find(c => c.ev === 'nichos.veredicto.emitir.request');
  assert.ok(vd && vd.payload.informe, 'veredicto recibe `informe`');
  ok('veredicto.emitir ← {informe}');

  const cm = calls.find(c => c.ev === 'nichos.camino.decidir.request');
  assert.ok(cm && cm.payload.informe && cm.payload.veredicto, 'camino recibe `informe`+`veredicto`');
  ok('camino.decidir ← {informe,veredicto}');

  const lote = pulsos.find(p => p.e === 'nichos.validacion.lote.completado');
  assert.ok(lote && Array.isArray(lote.p.detalle) && lote.p.detalle[0].id_nicho === 'c1', 'lote.completado trae `detalle` con el viable');
  assert.strictEqual(lote.p.viables, 1, 'contador viables correcto');
  ok('lote.completado ← {viables, detalle}');

  // Honestidad: un candidato sin informe NO es viable.
  const b2 = new (load('batch-validacion'))();
  b2._rpc = async (ev) => {
    if (ev === 'nichos.cola.candidatos.sacar.request') return { data: { candidatos: [{ id_nicho: 'c9', payload: {} }] } };
    if (ev === 'nichos.demanda.estudiar.request') return { data: {} }; // sin informe
    return { data: {} };
  };
  const p2 = [];
  b2.eventBus = { publish: (e, p) => p2.push({ e, p }) };
  b2.logger = { error() {}, info() {} };
  await b2._correr({ project_id: 'p', correlation_id: 'c2' });
  const l2 = p2.find(p => p.e === 'nichos.validacion.lote.completado');
  assert.strictEqual(l2.p.viables, 0, 'sin informe → 0 viables (no default seguro)');
  assert.strictEqual(l2.p.puentes, 1, 'sin informe → PUENTE');
  ok('degradación honesta: sin informe → PUENTE, no VIABLE');

  // ── orquestador: ensamblaje con el contrato del ensamblador ───────────
  const o = new (load('orquestador'))();
  const po = [];
  o.eventBus = { publish: (e, p) => po.push({ e, p }) };
  o.logger = { info() {}, error() {} };
  o._ciclos.set('cor', { project_id: 'p' });
  o.onValidacionCompletada({ data: { correlation_id: 'cor', viables: 1, detalle: [{ id_nicho: 'c1', veredicto: { codigo: 'VIABLE' }, camino: { tipo: 'CONSTRUIR' } }] } });
  const ens = po.find(p => p.e === 'nichos.solucion.ensamblar.request');
  assert.ok(ens, 'orquestador dispara ensamblar');
  assert.strictEqual(ens.p.id_nicho, 'c1', 'ensamblar recibe `id_nicho`');
  assert.ok(ens.p.veredicto && ens.p.camino, 'ensamblar recibe `veredicto`+`camino`');
  ok('solucion.ensamblar ← {id_nicho,veredicto,camino}');

  // ── estático: suscripción DESPUÉS de super.onLoad ─────────────────────
  for (const m of ['estudio-demanda', 'veredicto-viabilidad', 'camino-encontrar-construir', 'paquetador-decision', 'propuesta-valor-canal']) {
    const src = fs.readFileSync(path.join(N, m, 'index.js'), 'utf8');
    const onLoad = src.slice(src.indexOf('onLoad(context)'), src.indexOf('onLoad(context)') + 600);
    const iSuper = onLoad.indexOf('super.onLoad');
    const iSub = onLoad.indexOf('subscribe');
    assert.ok(iSuper !== -1 && iSub !== -1 && iSuper < iSub, `${m}: super.onLoad ANTES de subscribe`);
  }
  ok('5 módulos suscriben tras super.onLoad');

  console.log('\n✅ Todos los contratos del juicio NICHOS pasan (' + pas + ')');
})().catch(e => { console.error('✗ FALLO:', e.message); process.exit(1); });
