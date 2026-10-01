/**
 * proceso-negocio__adn — EL ESTÁNDAR ARQUITECTÓNICO EN TODAS LAS SALIDAS.
 * node tests/unit/proceso-negocio__adn.test.js
 *
 * Lo que estos tests sujetan (el cambio de esta rama): el PRINCIPIO
 * arquitectónico (el ADN event-driven) solo se decía en el EMPUJÓN; cualquier
 * otra salida del orquestador (un 400, un 409, un 200, el estado) devolvía un
 * mensaje seco y el estándar se diluía. Ahora el principio viaja en CADA salida
 * (_conArquitectura). Además: el gate de la FASE 4 ('construido') mide el ADN
 * del módulo (¿escribe sin anunciarlo? ¿escucha a nadie?), y existe una
 * RE-INSISTENCIA (reintentar) si el proceso se quedó parado.
 */
'use strict';
const assert = require('assert');
const ProcesoNegocio = require('../../modules/proceso-negocio');

const tests = [];
const test = (n, f) => tests.push({ n, f });

// El marcador del principio: la primera línea del estándar. Todos los mensajes
// del orquestador deben llevarlo antepuesto.
const MARCA = '[PRINCIPIO]';

// Un proyecto simulado: qué ficheros tiene esquemas/ y qué dice el plan.
// Recoge los empujones publicados (conserje.empujon) para poder afirmarlos.
function modulo({ ficheros = [], plan = '' } = {}) {
  const m = new ProcesoNegocio();
  m.logger = { info() {}, warn() {}, error() {} };
  m.metrics = { increment() {} };
  m.empujones = [];
  m.eventBus = { publish: (evt, data) => { if (evt === 'conserje.empujon') m.empujones.push(data); } };
  m._rpc = async (evt, p) => {
    if (evt === 'fs.list.request' && p.path === 'esquemas') return { files: ficheros };
    if (evt === 'fs.read.request' && p.path === 'esquemas/plan-construccion.md') return { content: plan };
    return {};
  };
  return m;
}

const PLAN = ['# Plan', '```json enki-plan', JSON.stringify({ hojas: [{ slug: 'taller-lamparas-inventado' }] }), '```'].join('\n');
const ESQUEMAS_F2 = ['esquema.md', 'pasada-1-negocio.md', 'pasada-2-produccion.md', 'pasada-3-diseccion.md'];

// ————————————————————————————————————————————————————————————————
// CAMBIO 1 · el principio en TODAS las salidas
// ————————————————————————————————————————————————————————————————

test('409 FASE_INCOMPLETA lleva el PRINCIPIO arquitectónico', async () => {
  const m = modulo({ ficheros: [] });                       // sin entregable → freno
  const r = await m._completarFase({ project_id: 'adn-409', fase: 'esquematizado' });
  assert.strictEqual(r.status, 409);
  assert.strictEqual(r.data.error, 'FASE_INCOMPLETA');
  assert.ok(r.data.message.startsWith(MARCA), `el 409 debe empezar por el principio, no por '${r.data.message.slice(0, 40)}'`);
  // Y la nota de fase: dice EN QUÉ FASE está y QUÉ se espera (motivo del MAPA).
  assert.match(r.data.message, /\[FASE \/ REGLA\]/);
  assert.match(r.data.message, /FASE 3 · PLASMA/);   // el motivo de la fase 'esquematizado' es su SIGUIENTE (la F3)
});

test('400 FASE_NO_MAPEADA lleva el PRINCIPIO arquitectónico', async () => {
  const m = modulo({});
  const r = await m._completarFase({ project_id: 'adn-400', fase: 'inventada' });
  assert.strictEqual(r.status, 400);
  assert.strictEqual(r.data.error, 'FASE_NO_MAPEADA');
  assert.ok(r.data.message.startsWith(MARCA), 'el 400 también dice el estándar');
});

test("409 de 'completado' sin plan lleva el PRINCIPIO arquitectónico", async () => {
  const m = modulo({ ficheros: [] });
  const r = await m._completarFase({ project_id: 'adn-compl', fase: 'completado' });
  assert.strictEqual(r.status, 409);
  assert.ok(r.data.message.startsWith(MARCA), 'el 409 de completitud también dice el estándar');
});

test('200 de cierre de fase lleva el PRINCIPIO en su campo de mensaje', async () => {
  const m = modulo({ ficheros: ESQUEMAS_F2 });
  const r = await m._completarFase({ project_id: 'adn-200', fase: 'esquematizado' });
  assert.strictEqual(r.status, 200);
  assert.ok(typeof r.data.mensaje === 'string' && r.data.mensaje.startsWith(MARCA), 'la salida BUENA también recuerda la FORMA');
  // El motivo es la fase que AHORA toca (la que el mapa empuja), no la cerrada.
  assert.match(r.data.mensaje, /planificar-construccion|FASE 3/);
});

test('200 de reiniciar_f0 lleva el PRINCIPIO arquitectónico', async () => {
  const m = modulo({});
  const r = await m._reiniciarF0({ project_id: 'adn-f0' });
  assert.strictEqual(r.status, 200);
  assert.ok(r.data.mensaje.startsWith(MARCA), 'relanzar la F0 también dice el estándar');
});

test('200 de estado lleva un RECORDATORIO con el PRINCIPIO', async () => {
  const m = modulo({});
  const sinPendiente = m._estado({ project_id: 'adn-estado-1' });
  assert.strictEqual(sinPendiente.status, 200);
  assert.ok(sinPendiente.data.recordatorio.startsWith(MARCA), 'el estado recuerda el estándar');
  // Con un empujón pendiente, el recordatorio dice QUÉ paso se espera.
  m.pendientes.set('adn-estado-2', { recurso: 'construir-modulos', fase: 'negocio.construido', mensaje: 'MÓDULO POR MÓDULO — hoja 1/3.' });
  const conPendiente = m._estado({ project_id: 'adn-estado-2' });
  assert.ok(conPendiente.data.recordatorio.startsWith(MARCA));
  assert.match(conPendiente.data.recordatorio, /construir-modulos/);
});


// ————————————————————————————————————————————————————————————————
// Un módulo que DERIVA, fabricado por el test (no depende del estado del repo).
// Antes se usaba `catalogo-cuentas`, que YA NO deriva (el proceso lo arregló) —
// el test quedó obsoleto y fallaba acusando a un módulo correcto. Un test que
// depende del estado del repo envejece mal: fabrica su propio caso.
// ————————————————————————————————————————————————————————————————
const os = require('os');
const fsx = require('fs');
const pathx = require('path');
// Fabrica una raíz temporal con UN módulo que deriva (escribe `anadir` y no
// anuncia el hecho → R2). Devuelve la raíz.
function raizConModuloQueDeriva() {
  const dir = fsx.mkdtempSync(pathx.join(os.tmpdir(), 'adn-deriva-'));
  const md = pathx.join(dir, 'modules', 'deriva-falsa');
  fsx.mkdirSync(md, { recursive: true });
  fsx.writeFileSync(pathx.join(md, 'module.json'), JSON.stringify({
    name: 'deriva-falsa', version: '0.1.0', description: 'fabricada por el test',
    ui_handlers: [{ domain: 'contabilidad', action: 'deriva-falsa.anadir', handler: 'onAnadirRequest', type: 'workspace_module', zone: 'barra_modulos' }],
    subscribes: [], publishes: [],
  }));
  fsx.writeFileSync(pathx.join(md, 'index.js'), "'use strict';\nmodule.exports = class {};\n");
  return dir;
}


// ————————————————————————————————————————————————————————————————
// CAMBIO 2 · el gate de la FASE 4 ('construido') MIDE el ADN
// ————————————————————————————————————————————————————————————————

test('el VERIFICADOR caza un módulo que deriva (fabricado por el test)', () => {
  const raiz = raizConModuloQueDeriva();
  const v = require('../../scripts/verificar-adn-modulo.js').medirSlug('deriva-falsa', raiz);
  assert.strictEqual(v.ok, false, 'escribe (anadir) y no anuncia el hecho → deriva');
  assert.ok(v.hallazgos.some(h => h.regla === 'R2'), 'la regla rota es R2');
});

test('gate de construido: un módulo que DERIVA (escribe y calla) → 409 con la regla rota', () => {
  const m = modulo({});
  // El gate delega en el verificador: se inyecta un veredicto de deriva para
  // probar la REACCIÓN del gate (que es lo que este test cubre).
  const rutaV = require.resolve('../../scripts/verificar-adn-modulo.js');
  const cache = require.cache[rutaV];
  const orig = cache.exports.medirSlug;
  cache.exports.medirSlug = () => ({ ok: false, hallazgos: [{ regla: 'R2', gravedad: 'deriva', msg: 'escribe (anadir) y NO anuncia el hecho' }] });
  try {
    const v = m._verificarUnSlug('construido', 'escritor-diario');
    assert.strictEqual(v.ok, false, 'un módulo que deriva NO debe pasar el gate');
    assert.match(v.mensaje, /no respeta el ADN/);
    assert.match(v.mensaje, /R2/, 'el mensaje nombra la regla rota (R2 · escritor mudo)');
    assert.ok(Array.isArray(v.esperado) && v.esperado.some(e => /ADN/.test(e)));
  } finally { cache.exports.medirSlug = orig; }
});

test('gate de construido: un módulo que CUMPLE el ADN → ok', () => {
  const m = modulo({});
  const v = m._verificarUnSlug('construido', 'escritor-diario');    // escribe Y anuncia el hecho
  assert.strictEqual(v.ok, true, 'un módulo que respeta el ADN pasa el gate');
  assert.ok((v.verificados || []).some(x => /escritor-diario/.test(x)));
});

test("completar_fase 'construido' con módulo que deriva → 409 FASE_INCOMPLETA (ADN) y con el principio", async () => {
  const m = modulo({ ficheros: ['plan-construccion.md'], plan: PLAN });
  const rutaV = require.resolve('../../scripts/verificar-adn-modulo.js');
  const cache = require.cache[rutaV];
  const orig = cache.exports.medirSlug;
  cache.exports.medirSlug = () => ({ ok: false, hallazgos: [{ regla: 'R2', gravedad: 'deriva', msg: 'escribe y NO anuncia el hecho' }] });
  try {
    const r = await m._completarFase({ project_id: 'adn-gate', fase: 'construido', resumen: { modulos: ['escritor-diario'] } });
    assert.strictEqual(r.status, 409);
    assert.strictEqual(r.data.error, 'FASE_INCOMPLETA');
    assert.match(r.data.message, /ADN event-driven/);
    assert.ok(r.data.message.startsWith(MARCA), 'el freno del ADN también lleva el principio');
  } finally { cache.exports.medirSlug = orig; }
});

test("completar_fase 'construido' con módulo que cumple → 200", async () => {
  const m = modulo({ ficheros: ['plan-construccion.md'], plan: PLAN });
  const r = await m._completarFase({ project_id: 'adn-gate-ok', fase: 'construido', resumen: { modulos: ['escritor-diario'] } });
  assert.strictEqual(r.status, 200, 'un módulo que respeta el ADN cierra la fase');
});

test('el gate NO se rompe si el verificador de ADN no está (best-effort)', () => {
  const m = modulo({});
  // Simula un verificador ausente/roto interceptando la carga perezosa.
  const original = require('../../scripts/verificar-adn-modulo.js');
  try {
    require.cache[require.resolve('../../scripts/verificar-adn-modulo.js')].exports = { medirSlug: () => { throw new Error('verificador caído'); } };
    const v = m._verificarUnSlug('construido', 'escritor-diario');   // no debe lanzar: sólo se salta el ADN
    assert.strictEqual(v.ok, true, 'sin verificador, el gate sigue funcionando (best-effort)');
  } finally {
    require.cache[require.resolve('../../scripts/verificar-adn-modulo.js')].exports = original;
  }
});

// ————————————————————————————————————————————————————————————————
// CAMBIO 3 · RE-INSISTENCIA si el proceso no avanza
// ————————————————————————————————————————————————————————————————

test('reintentar re-emite el empujón pendiente con el PRINCIPIO + la nota de que sigue esperando', async () => {
  const m = modulo({});
  m.pendientes.set('adn-re', { tipo: 'proceso', recurso: 'esquematizar-negocio', fase: 'negocio.identificado', mensaje: 'FASE 2: esquematizar el negocio.', lee: [], escribe: null });
  const r = await m._reintentar({ project_id: 'adn-re' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.reintentado, true);
  assert.strictEqual(r.data.skill, 'esquematizar-negocio');
  assert.ok(r.data.mensaje.startsWith(MARCA), 'la re-insistencia lleva el principio');
  // El empujón re-emitido (pendientes + conserje.empujon) dice que SIGUE esperando.
  assert.match(m.pendientes.get('adn-re').mensaje, /SIGUE esperando/);
  assert.ok(m.empujones.length >= 1, 'se re-publicó el empujón por conserje.empujon');
  assert.match(m.empujones[m.empujones.length - 1].mensaje, /SIGUE esperando/);
});

test('reintentar sin pendiente → 200 con reintentado=false (no inventa un paso)', async () => {
  const m = modulo({});
  const r = await m._reintentar({ project_id: 'adn-sin-pendiente' });
  assert.strictEqual(r.status, 200);
  assert.strictEqual(r.data.reintentado, false);
  assert.ok(r.data.mensaje.startsWith(MARCA));
});

test('reintentar sin project_id → INVALID_INPUT (misma puerta que el resto)', async () => {
  const m = modulo({});
  const r = await m._reintentar({});
  assert.strictEqual(r.status, 400);
});

test('la TOOL reintentar y el MÉTODO privado dan el mismo resultado (una puerta, un verbo)', async () => {
  const porTool = await modulo({}).toolReintentar({ project_id: 'adn-tool' });
  const porMetodo = await modulo({})._reintentar({ project_id: 'adn-tool' });
  assert.strictEqual(porTool.status, porMetodo.status);
  assert.strictEqual(porTool.data.reintentado, porMetodo.data.reintentado);
});

(async () => {
  let ok = 0; const fails = [];
  for (const { n, f } of tests) { try { await f(); ok++; } catch (e) { fails.push({ n, e }); } }
  if (fails.length === 0) { console.log(`[proceso-negocio adn] OK ${ok}/${tests.length}`); process.exit(0); }
  console.error(`[proceso-negocio adn] FAIL ${fails.length}/${tests.length}`);
  for (const { n, e } of fails) console.error(`  x ${n}: ${e.message}`);
  process.exit(1);
})();
