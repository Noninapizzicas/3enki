'use strict';

/**
 * conserje__fuera — la CUARTA facultad: buscar FUERA (skills.sh) y trae+activa auto.
 *
 * Cuando la cantera propia no cubre la tarea, el conserje sale al ecosistema público
 * (feeder.buscar). Si una skill DOMINA (instalaciones ≥ suelo Y ≥ dominancia× sobre la
 * 2ª), la trae (feeder.instalar) y la activa sola (cosecha.promover al hogar de lente de
 * la tarea), avisando después con acción de deshacer. Si no domina, solo ofrece traerla.
 * Cada paso degrada a OFRECER si no puede completarse solo (P0, no_silent).
 *
 * Ejecutar: node tests/unit/conserje__fuera.test.js
 */

const assert = require('assert');
const ConserjeModule = require('../../modules/conserje/index.js');

function make() {
  const m = new ConserjeModule();
  m.logger = { debug(){}, info(){}, warn(){}, error(){} };
  m.metrics = { increment(){} };
  m._publicados = [];
  m.eventBus = { publish: (ev, payload) => m._publicados.push({ ev, payload }) };
  m.activoFuera = true;
  m.fueraInstallsMin = 50000;
  m.fueraDominanciaX = 1.5;
  return m;
}
function estado(m, proj, ultimaCapacidad) {
  m.estados.set(proj, { usadas: new Set(), intentadas: new Set(), ultimaCapacidad });
}
// simula la salida cruda (con ANSI) de `npx skills find`
const SALIDA_SKILLS_SH =
  '\x1b[38;5;145mvercel-labs/agent-skills@web-design-guidelines\x1b[0m \x1b[36m430.7K installs\x1b[0m\n' +
  '\x1b[38;5;102m└ https://skills.sh/...\x1b[0m\n' +
  '\x1b[38;5;145msleekdotdesign/agent-skills@sleek-design-mobile-apps\x1b[0m \x1b[36m120.0K installs\x1b[0m\n';
const empujon = (m) => m._publicados.find(p => p.ev === 'conserje.empujon');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ── parse determinista ──
test('_parseSkillsSh: strip ANSI, parsea id+installs, ordena desc', () => {
  const m = make();
  const cands = m._parseSkillsSh(SALIDA_SKILLS_SH);
  assert.strictEqual(cands.length, 2);
  assert.strictEqual(cands[0].id, 'vercel-labs/agent-skills@web-design-guidelines');
  assert.strictEqual(cands[0].installs, 430700);
  assert.strictEqual(cands[1].installs, 120000);
});

test('_installsToNum: K y M', () => {
  const m = make();
  assert.strictEqual(m._installsToNum('430.7K'), 430700);
  assert.strictEqual(m._installsToNum('1.2M'), 1200000);
  assert.strictEqual(m._installsToNum('900'), 900);
});

// ── DENTRO gana: si la cantera cubre la tarea, no sale fuera ──
test('si la cantera propia cubre la tarea, NO busca fuera', async () => {
  const m = make();
  let llamoFeeder = false;
  m._rpc = async (ev) => {
    if (ev === 'cosecha.buscar.request') return { data: { skills: [{ nombre: 'x', descripcion: 'y' }] } };
    if (ev === 'feeder.buscar.request') { llamoFeeder = true; return { data: { salida: SALIDA_SKILLS_SH } }; }
    return null;
  };
  estado(m, 'p1', 'diseno');
  await m._tickFuera(['p1']);
  assert.ok(!llamoFeeder, 'no debe llamar a feeder si dentro cubre');
  assert.ok(!empujon(m), 'no ofrece');
});

// ── la búsqueda de FUERA traduce el cap interno (español) a query pública (inglés) ──
test('_tickFuera: fuera busca con MAPA_CAP_CONSULTA, no con el cap crudo', async () => {
  const m = make();
  let queryFuera = null;
  m._rpc = async (ev, payload) => {
    if (ev === 'cosecha.buscar.request') return { data: { skills: [] } };        // dentro con el cap
    if (ev === 'feeder.buscar.request') { queryFuera = payload.query; return { data: { salida: '' } }; }
    return null;
  };
  estado(m, 'p1', 'diseno');
  await m._tickFuera(['p1']);
  assert.strictEqual(queryFuera, 'frontend design', 'fuera traduce diseno→"frontend design"');
});

test('_tickFuera: cap sin entrada en el mapa busca fuera con su propio nombre', async () => {
  const m = make();
  let queryFuera = null;
  m._rpc = async (ev, payload) => {
    if (ev === 'cosecha.buscar.request') return { data: { skills: [] } };
    if (ev === 'feeder.buscar.request') { queryFuera = payload.query; return { data: { salida: '' } }; }
    return null;
  };
  estado(m, 'p1', 'recetas');   // recetas no está en MAPA_CAP_CONSULTA
  await m._tickFuera(['p1']);
  assert.strictEqual(queryFuera, 'recetas', 'sin mapeo, usa el cap crudo (probable 0 → silencio)');
});

// ── DOMINA + hogar conocido -> TRAE y ACTIVA auto, avisa con deshacer ──
test('skill dominante con hogar (diseno→diseño/tema): trae, activa, avisa (traido_activado)', async () => {
  const m = make();
  const llamadas = [];
  m._rpc = async (ev, payload) => {
    llamadas.push({ ev, payload });
    if (ev === 'cosecha.buscar.request') return { data: { skills: [] } };            // dentro vacío
    if (ev === 'feeder.buscar.request') return { data: { salida: SALIDA_SKILLS_SH } };// fuera: domina 430K vs 120K
    if (ev === 'feeder.instalar.request') return { status: 200, data: { ingeridas: ['web-design-guidelines'] } };
    if (ev === 'cosecha.promover.request') return { status: 200, data: { promovida: true } };
    return null;
  };
  estado(m, 'p1', 'diseno');
  await m._tickFuera(['p1']);
  const prom = llamadas.find(l => l.ev === 'cosecha.promover.request');
  assert.ok(prom, 'debe promover');
  assert.strictEqual(prom.payload.dominio, 'diseño');
  assert.strictEqual(prom.payload.tarea, 'tema');
  const emp = empujon(m);
  assert.ok(emp && emp.payload.tipo === 'traido_activado', 'avisa que trajo y activó');
  assert.ok(/olvidar/.test(emp.payload.accion_sugerida), 'ofrece deshacer (olvidar)');
});

// ── DOMINA pero sin hogar de lente -> trae pero solo OFRECE activar ──
test('skill dominante sin hogar (recetas): trae pero ofrece activar (traido)', async () => {
  const m = make();
  m._rpc = async (ev) => {
    if (ev === 'cosecha.buscar.request') return { data: { skills: [] } };
    if (ev === 'feeder.buscar.request') return { data: { salida: SALIDA_SKILLS_SH } };
    if (ev === 'feeder.instalar.request') return { status: 200, data: { ingeridas: ['algo'] } };
    if (ev === 'cosecha.promover.request') throw new Error('no debería promover sin hogar');
    return null;
  };
  estado(m, 'p1', 'recetas');   // recetas no está en MAPA_CAP_LENTE
  await m._tickFuera(['p1']);
  const emp = empujon(m);
  assert.ok(emp && emp.payload.tipo === 'traido', 'trajo pero ofrece activar');
  assert.ok(/promover/.test(emp.payload.accion_sugerida), 'ofrece promover');
});

// ── NO domina (top no supera el suelo ni el factor) -> solo OFRECE traer ──
test('sin dominancia: solo ofrece traer (descubrimiento_externo), no baja nada', async () => {
  const m = make();
  const salidaFloja =
    'a/b@uno 40.0K installs\n' +   // por debajo del suelo 50K
    'c/d@dos 39.0K installs\n';
  let instalo = false;
  m._rpc = async (ev) => {
    if (ev === 'cosecha.buscar.request') return { data: { skills: [] } };
    if (ev === 'feeder.buscar.request') return { data: { salida: salidaFloja } };
    if (ev === 'feeder.instalar.request') { instalo = true; return { status: 200, data: { ingeridas: ['x'] } }; }
    return null;
  };
  estado(m, 'p1', 'diseno');
  await m._tickFuera(['p1']);
  assert.ok(!instalo, 'no instala si no domina');
  const emp = empujon(m);
  assert.ok(emp && emp.payload.tipo === 'descubrimiento_externo', 'ofrece traer');
  assert.ok(/traer_skill/.test(emp.payload.accion_sugerida));
});

// ── feeder degrada (npx no está) -> silencio honesto, sin empujón ──
test('feeder degradado (sin salida): silencio, no ofrece nada falso', async () => {
  const m = make();
  m._rpc = async (ev) => {
    if (ev === 'cosecha.buscar.request') return { data: { skills: [] } };
    if (ev === 'feeder.buscar.request') return { status: 503, error: { code: 'UPSTREAM_UNREACHABLE' } }; // sin data.salida
    return null;
  };
  estado(m, 'p1', 'diseno');
  await m._tickFuera(['p1']);
  assert.ok(!empujon(m), 'degradado no inventa oferta');
});

// ── instalar falla -> degrada a ofrecer traer (no miente que activó) ──
test('instalar sin ingeridas: degrada a ofrecer traer', async () => {
  const m = make();
  m._rpc = async (ev) => {
    if (ev === 'cosecha.buscar.request') return { data: { skills: [] } };
    if (ev === 'feeder.buscar.request') return { data: { salida: SALIDA_SKILLS_SH } };
    if (ev === 'feeder.instalar.request') return { status: 200, data: { ingeridas: [] } };
    return null;
  };
  estado(m, 'p1', 'diseno');
  await m._tickFuera(['p1']);
  const emp = empujon(m);
  assert.ok(emp && emp.payload.tipo === 'descubrimiento_externo', 'no pudo traer -> ofrece');
});

// ── OFF: el tick no sale fuera ──
test('OFF (activoFuera=false) -> el tick no busca fuera', async () => {
  const m = make();
  m.activoFuera = false;
  let toco = false;
  m._rpc = async () => { toco = true; return null; };
  estado(m, 'p1', 'diseno');
  m.dirty.add('p1');
  await m._tick();
  assert.ok(!toco, 'apagado no toca el bus');
  assert.ok(!empujon(m));
});

// ── prioridad: si ya hay pendiente (brecha/rutas/cantera), fuera no pisa ──
test('con pendiente previo, fuera no actúa', async () => {
  const m = make();
  let toco = false;
  m._rpc = async () => { toco = true; return null; };
  estado(m, 'p1', 'diseno');
  m.pendientes.set('p1', { tipo: 'brecha', recurso: 'x' });
  await m._tickFuera(['p1']);
  assert.ok(!toco, 'no toca el bus si ya hay empujón pendiente');
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[conserje__fuera] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[conserje__fuera] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
