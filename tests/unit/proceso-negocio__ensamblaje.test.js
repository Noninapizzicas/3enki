/**
 * Test del RECOMPONEDOR F7b (ensamblaje).
 *
 * Cubre: el cruce diseñado (F3b) vs escrito (módulos reales), la clasificación de
 * divergencias por hoja, las conexiones de dominio rotas, y el veredicto
 * 'ensamblado'. Casos construidos a mano + un caso real si existe el plan.
 *
 *   node tests/unit/proceso-negocio__ensamblaje.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { Ensamblaje } = require('../../modules/proceso-negocio/ensamblaje');

let pasados = 0, fallados = 0;
const _tests = [];
// Acepta tests SÍNCRONOS y ASÍNCRONOS (los de robustez esperan RPCs).
function test(desc, fn) { _tests.push({ desc, fn }); }
async function _correr() {
  for (const { desc, fn } of _tests) {
    try { await fn(); console.log(`✓ ${desc}`); pasados++; }
    catch (e) { console.log(`✗ ${desc}\n    ${e.message}`); fallados++; }
  }
  console.log(`\n${pasados} pasados, ${fallados} fallados`);
  process.exit(fallados ? 1 : 0);
}

// ── 1. Todo ensamblado: el plan declara, el módulo cumple → ensamblado=true ──
test('plan y módulo coinciden → ensamblado', () => {
  const plan = { hojas: [
    { slug: 'captura', subscribes: ['nichos.semilla.aceptar.request'], publishes: ['nichos.semilla.capturada'] },
    { slug: 'pipeline', subscribes: ['nichos.semilla.capturada'], publishes: [] }
  ] };
  const real = {
    captura: { existe: true, subscribes: ['nichos.semilla.aceptar.request'], publishes: ['nichos.semilla.capturada'] },
    // pipeline escucha lo que captura publica → la conexión existe
    pipeline: { existe: true, subscribes: ['nichos.semilla.capturada'], publishes: [] }
  };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.hojas_divergentes, 0, 'sin divergencias por hoja');
  assert.strictEqual(r.conexiones_rotas_count, 0, 'sin conexiones rotas');
  assert.strictEqual(r.ensamblado, true, 'está ensamblado');
});

// ── 2. El plan declara escuchar algo que el módulo NO escucha → divergencia ──
test('módulo no escucha lo que el plan declaró → DIVERGENTE', () => {
  const plan = { hojas: [
    { slug: 'alerta-sangria', subscribes: ['nichos.salud.actualizada'], publishes: ['nichos.alerta.sangria'] }
  ] };
  const real = {
    // el módulo real NO escucha salud.actualizada (bug real medido en nichos)
    'alerta-sangria': { existe: true, subscribes: [], publishes: ['nichos.alerta.sangria'] }
  };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.hojas_divergentes, 1);
  const h = r.hojas_divergentes_detalle[0];
  assert.strictEqual(h.slug, 'alerta-sangria');
  assert.deepStrictEqual(h.falta_subscribes, ['nichos.salud.actualizada'], 'detecta el subscribe que falta');
});

test('módulo no publica lo que el plan declaró → DIVERGENTE', () => {
  const plan = { hojas: [
    { slug: 'pipeline', subscribes: [], publishes: ['nichos.pipeline.ciclo_completado'] }
  ] };
  const real = {
    // el módulo real publica otra cosa (bug real: 'ciclo.iniciado' en vez de 'ciclo_iniciado')
    pipeline: { existe: true, subscribes: [], publishes: ['nichos.pipeline.ciclo_iniciado'] }
  };
  const r = new Ensamblaje(plan, real).recomponer();
  const h = r.hojas_divergentes_detalle[0];
  assert.deepStrictEqual(h.falta_publishes, ['nichos.pipeline.ciclo_completado']);
  assert.deepStrictEqual(h.extra_publishes, ['nichos.pipeline.ciclo_iniciado']);
});

// ── 3. CONEXIÓN ROTA: alguien publica, nadie escucha → se pierde silenciosa ──
test('evento de dominio publicado y nadie lo escucha → conexión rota', () => {
  const plan = { hojas: [
    { slug: 'estudio-competencia', subscribes: [], publishes: ['nichos.competencia.analizado'] },
    { slug: 'paquete-decision', subscribes: ['nichos.competencia.analizado'], publishes: [] }
  ] };
  const real = {
    'estudio-competencia': { existe: true, subscribes: [], publishes: ['nichos.competencia.analizado'] },
    // el consumidor diseñado NO lo escucha → el evento se pierde
    'paquete-decision': { existe: true, subscribes: [], publishes: [] }
  };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.conexiones_rotas_count, 1);
  assert.strictEqual(r.conexiones_rotas[0].evento, 'nichos.competencia.analizado');
  assert.deepStrictEqual(r.conexiones_rotas[0].publica_en, ['estudio-competencia']);
});

// ── 4. Los eventos de TRANSPORTE (.request/.response) NO cuentan como rotos ──
test('los .request/.response del bus no cuentan como conexiones rotas', () => {
  const plan = { hojas: [
    { slug: 'm', subscribes: ['nichos.x.leer.request'], publishes: ['nichos.x.leer.response'] }
  ] };
  const real = { m: { existe: true, subscribes: ['nichos.x.leer.request'], publishes: ['nichos.x.leer.response'] } };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.conexiones_rotas_count, 0, 'el transporte lo atiende el propio módulo');
  assert.strictEqual(r.ensamblado, true);
});

// ── 5. Hoja diseñada pero no escrita → NO_ESCRITA ──
test('hoja del plan sin módulo escrito → NO_ESCRITA', () => {
  const plan = { hojas: [
    { slug: 'fantasma', subscribes: ['nichos.a.b'], publishes: ['nichos.c.d'] }
  ] };
  const r = new Ensamblaje(plan, {}).recomponer();
  assert.strictEqual(r.hojas_no_escritas, 1);
  assert.strictEqual(r.hojas_divergentes_detalle[0].tipo, 'NO_ESCRITA');
  assert.strictEqual(r.ensamblado, false);
});

// ── 6. Tolerancia de forma: subscribes como objeto {event, handler} ──
test('acepta subscribes como {event, handler} y como string', () => {
  const plan = { hojas: [
    { slug: 'm', subscribes: [{ event: 'nichos.a.creada', handler: 'onCreada' }], publishes: ['nichos.b.lista'] }
  ] };
  const real = { m: { existe: true, subscribes: [{ event: 'nichos.a.creada', handler: 'onCreada' }], publishes: ['nichos.b.lista'] } };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.hojas_divergentes, 0, 'normaliza las dos formas');
});

// ── 8. ROBUSTEZ ANTE FALLOS — fail-SAFE, nunca fail-open ──
// Doctrina del cimiento: "success = ENTREGABLE VERIFICADO". Un fallo de
// infraestructura NO puede declarar ensamblado en verde (falso verde).
test('ROBUSTEZ: fs.read LANZA (RPC caído) → NO certifica (false)', async () => {
  const M = require('../../modules/proceso-negocio/index.js');
  const m = new M();
  if (m.iniciar) m.iniciar();
  m._rpc = async () => { throw new Error('RPC timeout'); };
  const ok = await m._ensambladoRecomponer({ project_id: 'fallo' });
  assert.strictEqual(ok, false, 'un RPC caído NO puede dar verde');
});

test('ROBUSTEZ: plan sin bloque enki-plan → NO certifica (false)', async () => {
  const M = require('../../modules/proceso-negocio/index.js');
  const m = new M();
  if (m.iniciar) m.iniciar();
  m._rpc = async () => ({ content: '# plan sin bloque json' });
  assert.strictEqual(await m._ensambladoRecomponer({ project_id: 'p' }), false);
});

test('ROBUSTEZ: JSON malformado en el plan → NO certifica (false)', async () => {
  const M = require('../../modules/proceso-negocio/index.js');
  const m = new M();
  if (m.iniciar) m.iniciar();
  m._rpc = async () => ({ content: '```json enki-plan\n{roto:\n```' });
  assert.strictEqual(await m._ensambladoRecomponer({ project_id: 'p' }), false);
});

test('ROBUSTEZ: escribir el informe falla → no tumba, pero el veredicto manda', async () => {
  const M = require('../../modules/proceso-negocio/index.js');
  const m = new M();
  if (m.iniciar) m.iniciar();
  m._rpc = async (ev) => {
    if (ev === 'fs.write.request') throw new Error('disco lleno');
    // plan VÁLIDO (con fence) y sin divergencias → ensamblado=true
    return { content: '```json enki-plan\n' + JSON.stringify({ hojas: [] }) + '\n```' };
  };
  const ok = await m._ensambladoRecomponer({ project_id: 'p' });
  assert.strictEqual(ok, true, 'un fallo al PERSISTIR no cambia el veredicto (best-effort)');
});

// ── 10. FRENO → EMPUJÓN: la rotura viene CLASIFICADA con su trabajo ──
test('la conexión rota trae el TRABAJO (falta_cablear + dónde), no solo el aviso', () => {
  const plan = { hojas: [
    { slug: 'cola-decisiones-gate', subscribes: [], publishes: ['nichos.decision.resuelta'] },
    { slug: 'gate-decision-operar', subscribes: ['nichos.decision.resuelta'], publishes: [] }
  ] };
  const real = {
    'cola-decisiones-gate': { existe: true, subscribes: [], publishes: ['nichos.decision.resuelta'] },
    // el consumidor EXISTE pero no lo escucha → falta cablear
    'gate-decision-operar': { existe: true, subscribes: [], publishes: [] }
  };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.conexiones_rotas_count, 1);
  const c = r.conexiones_rotas[0];
  assert.strictEqual(c.tipo, 'FALTA_CABLEAR');
  assert.deepStrictEqual(c.falta_en, ['gate-decision-operar'], 'dice DÓNDE engancharlo');
  assert.strictEqual(r.conexiones_falta_cablear, 1);
  assert.strictEqual(r.trabajo.length, 1);
  assert.strictEqual(r.trabajo[0].evento, 'nichos.decision.resuelta');
});

test('pares de fallo (.failed) NO cuentan como conexiones rotas', () => {
  const plan = { hojas: [{ slug: 'm', subscribes: [], publishes: ['nichos.x.analizar.failed'] }] };
  const real = { m: { existe: true, subscribes: [], publishes: ['nichos.x.analizar.failed'] } };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.conexiones_rotas_count, 0, '.failed es cierre de círculo del propio módulo');
  assert.strictEqual(r.ensamblado, true);
});

test('evento sin consumidor en el plan → SOBRA_EL_PUBLISH (decisión de diseño, sin falta_en)', () => {
  const plan = { hojas: [{ slug: 'm', subscribes: [], publishes: ['nichos.nadie.lo.quiere'] }] };
  const real = { m: { existe: true, subscribes: [], publishes: ['nichos.nadie.lo.quiere'] } };
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.conexiones_sobra_el_publish, 1);
  assert.strictEqual(r.conexiones_rotas[0].falta_en, null, 'sin destino escrito: es decisión, no cable');
  assert.strictEqual(r.trabajo.length, 0);
});

test('el 409 del proceso PROPAGA el trabajo (no solo prosa en el mensaje)', async () => {
  const M = require('../../modules/proceso-negocio/index.js');
  const fs = require('fs');
  const m = new M();
  if (m.iniciar) m.iniciar();
  let inf = null;
  const plan = '```json enki-plan\n' + JSON.stringify({ hojas: [
    { slug: 'cola-decisiones-gate', subscribes: [], publishes: ['nichos.decision.resuelta'] },
    { slug: 'gate-decision-operar', subscribes: ['nichos.decision.resuelta'], publishes: [] }
  ] }) + '\n```';
  m._rpc = async (ev, p) => {
    if (ev === 'fs.write.request') { inf = JSON.parse(p.content); return { ok: true }; }
    if (p.path === 'esquemas/plan-construccion.md') return { content: plan };
    if (p.path === 'proceso-negocio/fase7b-ensamblaje.json') return { content: JSON.stringify(inf) };
    return {};
  };
  // _buscarModulo resuelve los módulos reales; forzamos el mundo para el test
  m._interfazOperativaEnDisco = () => false;
  const res = await m._completarFase({ project_id: 'p-409', fase: 'ensamblado' });
  assert.strictEqual(res.status, 409);
  assert.strictEqual(res.data.error, 'FASE_INCOMPLETA');
  // el freno NO es un muro: el trabajo accionable viaja en el payload
  assert.ok(Array.isArray(res.data.trabajo), 'el 409 lleva trabajo[] estructurado');
});

// ── 11. CASO REAL: el plan de nichos, si está disponible ──
test('caso real — el plan de nichos produce un informe coherente', () => {
  const planPath = '/home/admin/3enki/boveda/nichos/proceso/fase3b/plan-construccion.md';
  if (!fs.existsSync(planPath)) { console.log('    (saltado: sin plan en disco)'); return; }
  const md = fs.readFileSync(planPath, 'utf8');
  const m = md.match(/```json enki-plan\s*([\s\S]*?)```/);
  assert.ok(m, 'el plan tiene bloque enki-plan');
  const plan = JSON.parse(m[1]);
  // construir el mapa real leyendo los module.json de nichos
  const base = '/home/admin/3enki/modules/nichos';
  const real = {};
  for (const slug of fs.readdirSync(base)) {
    const mj = path.join(base, slug, 'module.json');
    if (!fs.existsSync(mj)) continue;
    try {
      const d = JSON.parse(fs.readFileSync(mj, 'utf8'));
      real[slug] = { existe: true, subscribes: d.subscribes || [], publishes: d.publishes || [] };
    } catch (_) {}
  }
  const r = new Ensamblaje(plan, real).recomponer();
  assert.strictEqual(r.esquema, 'ensamblaje-f7b-v1');
  assert.ok(r.total_hojas > 0, 'el plan tiene hojas');
  assert.ok(r.conexiones_rotas_count > 0, 'la realidad de nichos tiene conexiones rotas (medido: 89 eventos diseñados sin consumidor)');
  assert.strictEqual(r.ensamblado, false, 'nichos NO está ensamblado — por eso existe esta fase');
  console.log(`    → ${r.total_hojas} hojas · ${r.hojas_divergentes} divergentes · ${r.conexiones_rotas_count} conexiones rotas`);
});

_correr();
