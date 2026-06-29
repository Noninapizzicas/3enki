'use strict';

/**
 * lentes-diseno: el reflejo sirve las 8 lentes COMPLETAS por su puerta, con
 * selección HÍBRIDA (tarea→rutas determinista + nombres del LLM) y lazy.
 */

const assert = require('assert');
const LentesDiseno = require('../../modules/lentes-diseno/index.js');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const ko = (n, e) => { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message || e)); };
const t = (n, fn) => { try { fn(); ok(n); } catch (e) { ko(n, e); } };

async function run() {
  console.log('lentes-diseno__servir');

  const noop = () => {};
  const ctx = {
    logger: { info: noop, warn: noop, error: noop, debug: noop },
    metrics: { increment: noop },
    eventBus: { publish: noop, subscribe: () => noop }
  };

  const m = new LentesDiseno();
  await m.onLoad(ctx);

  // 1. carga las 8
  t('carga las 8 lentes', () => assert.strictEqual(m._lentes.size, 8));

  // 2. listar: catálogo barato (nombre + cuando_usar) + rutas, SIN contenido
  const list = m._listar();
  t('listar → 200 con 8 lentes + rutas', () => {
    assert.strictEqual(list.status, 200);
    assert.strictEqual(list.data.lentes.length, 8);
    assert.ok(list.data.lentes.every(l => l.nombre && l.cuando_usar));
    assert.ok(list.data.lentes.every(l => !('contenido' in l)), 'listar NO trae contenido (lazy)');
    assert.ok(list.data.rutas && list.data.rutas.tema);
  });

  // 3. RUTEO DETERMINISTA (mitad reflejo): tarea 'tema' → ux-architect + brand-guardian
  const tema = m._obtener({ tarea: 'tema' });
  t('obtener({tarea:tema}) → ux-architect + brand-guardian, con contenido íntegro', () => {
    assert.strictEqual(tema.status, 200);
    const nombres = tema.data.lentes.map(l => l.nombre).sort();
    assert.deepStrictEqual(nombres, ['brand-guardian', 'ux-architect']);
    assert.ok(tema.data.lentes.every(l => l.contenido && l.contenido.length > 500), 'trae el .md completo');
    assert.ok(tema.data.lentes.find(l => l.nombre === 'ux-architect').contenido.includes('UX Architect'));
  });

  // 4. ELECCIÓN FUZZY (mitad LLM): nombres explícitos
  const motion = m._obtener({ nombres: ['whimsy-injector'] });
  t('obtener({nombres:[whimsy-injector]}) → solo esa, con contenido', () => {
    assert.strictEqual(motion.status, 200);
    assert.strictEqual(motion.data.lentes.length, 1);
    assert.strictEqual(motion.data.lentes[0].nombre, 'whimsy-injector');
    assert.ok(motion.data.lentes[0].contenido.length > 500);
  });

  // 5. HÍBRIDO + dedupe: tarea 'motion' (→whimsy) + nombre 'whimsy-injector' = 1 sola
  const hib = m._obtener({ tarea: 'motion', nombres: ['whimsy-injector', 'brand-guardian'] });
  t('híbrido tarea+nombres se combina y DEDUPLICA', () => {
    assert.strictEqual(hib.status, 200);
    const nombres = hib.data.lentes.map(l => l.nombre).sort();
    assert.deepStrictEqual(nombres, ['brand-guardian', 'whimsy-injector']); // whimsy una sola vez
  });

  // 6. lazy: obtener NO trae las 8, solo las pedidas
  t('lazy: obtener trae solo lo pedido (no las 8)', () => {
    assert.ok(tema.data.lentes.length < 8);
  });

  // 7. guardas
  t('sin tarea ni nombres → 400 INVALID_INPUT', () => {
    const r = m._obtener({});
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
  });
  t('nombre inexistente → 404 RESOURCE_NOT_FOUND', () => {
    const r = m._obtener({ nombres: ['no-existe'] });
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
  });
  t('nombre válido + inválido → 200 con los válidos + aviso desconocidas', () => {
    const r = m._obtener({ nombres: ['ui-designer', 'no-existe'] });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.lentes.length, 1);
    assert.deepStrictEqual(r.data.desconocidas, ['no-existe']);
  });

  await m.onUnload();
  t('onUnload limpia el estado', () => assert.strictEqual(m._lentes.size, 0));

  console.log(`[lentes-diseno__servir] ${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
