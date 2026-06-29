'use strict';

/**
 * Nervio de lentes: ai-gateway EMPUJA la lente por defecto de la página (push
 * determinista, entrega event-driven) tirándola de lentes-diseno por el bus.
 * Aquí probamos el lado lectura (_leerLente) end-to-end contra el reflejo real,
 * y la composición de la sección, sin levantar todo _executeLLM.
 */

const assert = require('assert');
const AiGateway = require('../../modules/conversacion/ai-gateway/index.js');
const LentesDiseno = require('../../modules/lentes-diseno/index.js');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const ko = (n, e) => { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message || e)); };

// Bus en proceso: entrega el payload como envelope { data: payload } (igual que EventBus real).
function makeBus() {
  const handlers = new Map();
  return {
    subscribe(ev, fn) {
      const set = handlers.get(ev) || new Set(); set.add(fn); handlers.set(ev, set);
      return () => set.delete(fn);
    },
    publish(ev, payload) {
      const set = handlers.get(ev);
      if (set) for (const fn of [...set]) { try { fn({ data: payload }); } catch (_) {} }
    }
  };
}

async function run() {
  console.log('ai-gateway__nervio-lentes');
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop };
  const metrics = { increment: noop };

  // 1. bus con lentes-diseno vivo
  const bus = makeBus();
  const lentes = new LentesDiseno();
  await lentes.onLoad({ logger, metrics, eventBus: bus });
  bus.subscribe('lentes.obtener.request', e => lentes.onObtenerRequest(e));
  bus.subscribe('lentes.listar.request', e => lentes.onListarRequest(e));

  // 2. ai-gateway sin onLoad pesado: solo le damos bus + config
  const ai = new AiGateway();
  ai.eventBus = bus;
  ai.config = { lentes_timeout_ms: 2000 };

  // 3. PUSH event-driven: _leerLente({tarea:'tema'}) → ux-architect + brand-guardian
  try {
    const got = await ai._leerLente({ tarea: 'tema' });
    assert.ok(Array.isArray(got) && got.length === 2, 'tema rutea a 2 lentes');
    const nombres = got.map(l => l.nombre).sort();
    assert.deepStrictEqual(nombres, ['brand-guardian', 'ux-architect']);
    assert.ok(got.every(l => l.contenido && l.contenido.length > 500), 'trae el .md completo');
    ok('_leerLente({tarea:tema}) tira la lente por el bus (end-to-end)');
  } catch (e) { ko('_leerLente({tarea:tema})', e); }

  // 4. por NOMBRE
  try {
    const got = await ai._leerLente({ nombres: ['whimsy-injector'] });
    assert.strictEqual(got.length, 1);
    assert.strictEqual(got[0].nombre, 'whimsy-injector');
    ok('_leerLente({nombres}) tira la lente elegida');
  } catch (e) { ko('_leerLente({nombres})', e); }

  // 5. composición de la sección
  try {
    const got = await ai._leerLente({ nombres: ['ux-architect'] });
    const sec = ai._composeLenteSection(got);
    assert.ok(sec.includes('LENTE DE DISEÑO'), 'cabecera de la sección');
    assert.ok(sec.includes('ADÓPTALA'), 'instrucción de adopción');
    assert.ok(sec.includes('UX Architect'), 'incluye el contenido de la lente');
    ok('_composeLenteSection enmarca la lente como contexto silencioso');
  } catch (e) { ko('_composeLenteSection', e); }

  // 6. best-effort: sin lentes-diseno detrás → [] por timeout, no cuelga
  try {
    const ai2 = new AiGateway();
    ai2.eventBus = makeBus();           // bus vacío, nadie responde
    ai2.config = { lentes_timeout_ms: 150 };
    const empty = await ai2._leerLente({ tarea: 'tema' });
    assert.deepStrictEqual(empty, []);
    ok('best-effort: sin respuesta → [] por timeout (no bloquea el turno)');
  } catch (e) { ko('best-effort timeout', e); }

  // 7. spec vacío → [] sin tocar el bus
  try {
    const empty = await ai._leerLente(null);
    assert.deepStrictEqual(empty, []);
    ok('spec nulo → [] (guarda)');
  } catch (e) { ko('spec nulo', e); }

  console.log(`[ai-gateway__nervio-lentes] ${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
