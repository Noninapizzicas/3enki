'use strict';

/**
 * GRAFO de órganos (cúpula Obsidian, capa 3): sustrato DECLARADO (co-ruta/co-dominio)
 * + capa APRENDIDA que crece con el co-uso real. Verifica que la vecindad navega el
 * grafo y que lo CROSS-DOMINIO emerge del uso (lo que la tabla plana no declara).
 */

const assert = require('assert');
const LentesDiseno = require('../../modules/lentes-diseno/index.js');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const ko = (n, e) => { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message || e)); };
const t = (n, fn) => { try { fn(); ok(n); } catch (e) { ko(n, e); } };

function makeBus() {
  const log = [];
  return { log, publish(ev, p) { log.push({ ev, payload: p }); }, subscribe() { return () => {}; } };
}

async function run() {
  console.log('lentes-diseno__grafo');
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop };
  const metrics = { increment: noop };
  const bus = makeBus();
  const m = new LentesDiseno();
  await m.onLoad({ logger, metrics, eventBus: bus });

  // 1. SUSTRATO: el grafo tiene un nodo por lente y aristas declaradas
  t('construye el grafo (nodos = todas las lentes, aristas declaradas)', () => {
    assert.ok(m._nodos.size >= 16, 'un nodo por lente de todos los packs');
    assert.ok(m._declarado.size > 0, 'hay aristas declaradas (co-ruta/co-dominio)');
    // ux-architect y brand-guardian comparten la ruta 'tema' → arista fuerte
    assert.ok(m._peso('ux-architect', 'brand-guardian') >= 3, 'co-ruta tema + co-dominio');
  });

  // 2. VECINDAD: la vecina más fuerte de ux-architect es brand-guardian (co-ruta tema)
  t('vecinas(ux-architect) → brand-guardian la primera (peso declarado mayor)', () => {
    const r = m._vecinas('ux-architect', 5);
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.vecinas[0].nombre, 'brand-guardian');
    assert.ok(r.data.vecinas[0].declarado >= 3);
    assert.ok(r.data.vecinas.every(v => v.dominio === 'diseño'), 'sin tráfico, solo vecinas declaradas (mismo dominio)');
  });

  // 3. CROSS-DOMINIO EMERGE del co-uso: nada declara ux-architect↔financial-analyst,
  //    pero usarlas juntas (obtener) teje la arista aprendida.
  t('cross-dominio: obtener(2 lentes de packs distintos) teje la arista aprendida', () => {
    assert.strictEqual(m._peso('ux-architect', 'financial-analyst'), 0, 'antes: sin arista');
    const r = m._obtener({ nombres: ['ux-architect', 'financial-analyst'] });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.lentes.length, 2);
    assert.strictEqual(m._peso('ux-architect', 'financial-analyst'), 1, 'después: arista aprendida cross-dominio');
    // y emitió la señal pública para el destilador
    assert.ok(bus.log.find(e => e.ev === 'lente.co_uso' &&
      e.payload.lentes.includes('financial-analyst')), 'emite lente.co_uso');
  });

  // 4. la vecindad AHORA cruza el dominio (lo aprendido aflora donde la tabla calla)
  t('vecinas(ux-architect) ahora incluye financial-analyst (negocio) por co-uso', () => {
    const r = m._vecinas('ux-architect', 20);
    const fa = r.data.vecinas.find(v => v.nombre === 'financial-analyst');
    assert.ok(fa, 'la vecina cross-dominio aparece');
    assert.strictEqual(fa.dominio, 'negocio');
    assert.strictEqual(fa.aprendido, 1);
  });

  // 5. el co-uso REFUERZA (peso sube con cada uso conjunto)
  t('co-uso repetido refuerza la arista (aprende del tráfico)', () => {
    m.onCoUso({ data: { lentes: ['ux-architect', 'financial-analyst'] } });
    m.onCoUso({ data: { lentes: ['ux-architect', 'financial-analyst'] } });
    assert.strictEqual(m._peso('ux-architect', 'financial-analyst'), 3, '1 (obtener) + 2 (externos)');
  });

  // 6. vecinas filtrado por dominio
  t('vecinas(ux-architect, k, dominio:negocio) → solo vecinas de negocio', () => {
    const r = m._vecinas('ux-architect', 10, 'negocio');
    assert.ok(r.data.vecinas.length >= 1);
    assert.ok(r.data.vecinas.every(v => v.dominio === 'negocio'));
  });

  // 7. guardas
  t('vecinas de lente desconocida → 404', () => {
    const r = m._vecinas('no-existe');
    assert.strictEqual(r.status, 404);
  });

  // 8. la tabla plana SIGUE siendo el suelo (rutas determinista no se rompió)
  t('suelo determinista: obtener({tarea:tema}) sigue resolviendo por la tabla', () => {
    const r = m._obtener({ tarea: 'tema' });
    assert.strictEqual(r.status, 200);
    assert.deepStrictEqual(r.data.lentes.map(l => l.nombre).sort(), ['brand-guardian', 'ux-architect']);
  });

  await m.onUnload();
  t('onUnload limpia el grafo', () => {
    assert.strictEqual(m._nodos.size, 0);
    assert.strictEqual(m._declarado.size, 0);
    assert.strictEqual(m._aprendido.size, 0);
  });

  console.log(`[lentes-diseno__grafo] ${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
