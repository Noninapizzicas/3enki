'use strict';

/**
 * verificador-visual — el órgano que MIRA el render.
 *   CEREBRO  _evaluarSnapshot (función pura)  — siempre, rápido, determinista.
 *   OJOS     _render (Chromium real)          — smoke guarded: solo si hay navegador.
 *   DEGRADACIÓN  sin navegador → fail-open con testigo.
 */

const assert = require('assert');
const Verificador = require('../../modules/verificador-visual/index.js');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const ko = (n, e) => { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message || e)); };
const t = (n, fn) => { try { fn(); ok(n); } catch (e) { ko(n, e); } };

function makeBus() {
  const log = [];
  return { log, publish(ev, p) { log.push({ ev, payload: p }); }, subscribe() { return () => {}; } };
}

async function run() {
  console.log('verificador-visual__render');
  const noop = () => {};
  const logger = { info: noop, warn: noop, error: noop, debug: noop };
  const metrics = { increment: noop };
  const bus = makeBus();
  const m = new Verificador();
  await m.onLoad({ logger, metrics, eventBus: bus, moduleConfig: {} });

  // ── CEREBRO: función pura sobre métricas del DOM ──
  t('snapshot sano → ok', () => {
    const r = m._evaluarSnapshot({ consoleErrors: [], pageErrors: [], scrollWidth: 1280, clientWidth: 1280, textLength: 200, imgRoto: 0 });
    assert.strictEqual(r.ok, true);
    assert.deepStrictEqual(r.motivos, []);
  });
  t('overflow horizontal → roto', () => {
    const r = m._evaluarSnapshot({ consoleErrors: [], pageErrors: [], scrollWidth: 3000, clientWidth: 1280, textLength: 200, imgRoto: 0 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.motivos.includes('overflow_horizontal'));
  });
  t('errores de consola/JS → roto', () => {
    const r = m._evaluarSnapshot({ consoleErrors: ['x'], pageErrors: ['boom'], scrollWidth: 1280, clientWidth: 1280, textLength: 200, imgRoto: 0 });
    assert.strictEqual(r.ok, false);
    assert.ok(r.motivos.includes('errores_consola') && r.motivos.includes('errores_js'));
  });
  t('página en blanco → roto', () => {
    const r = m._evaluarSnapshot({ consoleErrors: [], pageErrors: [], scrollWidth: 1280, clientWidth: 1280, textLength: 3, imgRoto: 0 });
    assert.ok(r.motivos.includes('pagina_en_blanco'));
  });
  t('imágenes rotas → roto', () => {
    const r = m._evaluarSnapshot({ consoleErrors: [], pageErrors: [], scrollWidth: 1280, clientWidth: 1280, textLength: 200, imgRoto: 2 });
    assert.ok(r.motivos.includes('imagenes_rotas'));
  });
  t('tolerancia de overflow (≤ max_overflow_px) no dispara', () => {
    const r = m._evaluarSnapshot({ consoleErrors: [], pageErrors: [], scrollWidth: 1283, clientWidth: 1280, textLength: 200, imgRoto: 0 }, m.config);
    assert.strictEqual(r.ok, true);
  });

  // ── guardas + degradación ──
  t('html vacío → 400 INVALID_INPUT', () => {
    // _verificar es async; lo resolvemos sincrónicamente vía promesa abajo
  });
  {
    const r = await m._verificar({ html: '' });
    t('html vacío → 400 INVALID_INPUT (async)', () => assert.strictEqual(r.status, 400));
  }
  {
    // DEGRADACIÓN: forzamos sin ojos → fail-open con testigo
    const chromiumReal = m._chromium;
    m._chromium = null;
    const r = await m._verificar({ html: '<p>hola</p>', etiqueta: 'x' });
    t('sin navegador → fail-open (ok:true, verificado:false) + testigo', () => {
      assert.strictEqual(r.status, 200);
      assert.strictEqual(r.data.ok, true);
      assert.strictEqual(r.data.verificado, false);
      assert.strictEqual(r.data.motivo, 'sin_navegador');
      assert.ok(bus.log.find(e => e.ev === 'verificacion-visual.sin_navegador'));
    });
    m._chromium = chromiumReal;
  }

  // ── OJOS: render real con Chromium (smoke guarded) ──
  if (!m._chromium) {
    console.log('  · (sin Chromium en el host: smoke de render omitido)');
  } else {
    try {
      const bueno = await m._verificar({ html: '<html><body style="margin:0;font-family:sans-serif"><h1>Carta</h1><p>Pizza Margarita 8,50€ · Pizza Trufa 14€</p></body></html>', etiqueta: 'ok' });
      t('render REAL de HTML sano → ok:true, verificado:true', () => {
        assert.strictEqual(bueno.data.verificado, true);
        assert.strictEqual(bueno.data.ok, true, 'motivos: ' + JSON.stringify(bueno.data.motivos));
        assert.ok(bueno.data.metricas && bueno.data.metricas.textLength > 12);
      });
      assert.ok(bus.log.find(e => e.ev === 'render.verificado'), 'emite render.verificado');

      const roto = await m._verificar({ html: '<html><body style="margin:0"><div style="width:3000px;height:50px;background:red">ancho enorme que desborda el viewport sin remedio</div></body></html>', etiqueta: 'roto' });
      t('render REAL con overflow → ok:false + verificacion-visual.failed', () => {
        assert.strictEqual(roto.data.verificado, true);
        assert.strictEqual(roto.data.ok, false);
        assert.ok(roto.data.motivos.includes('overflow_horizontal'), 'motivos: ' + JSON.stringify(roto.data.motivos));
      });
      assert.ok(bus.log.find(e => e.ev === 'verificacion-visual.failed'), 'emite el .failed canónico (lo siente la homeostasis)');

      const js = await m._verificar({ html: '<html><body><p>texto suficiente para no estar en blanco</p><script>throw new Error("boom")</script></body></html>', etiqueta: 'js' });
      t('render REAL con error JS → ok:false (errores_js)', () => {
        assert.strictEqual(roto.data.verificado, true);
        assert.ok(js.data.motivos.includes('errores_js'), 'motivos: ' + JSON.stringify(js.data.motivos));
      });
    } catch (e) { ko('render real (Chromium)', e); }
  }

  await m.onUnload();
  console.log(`[verificador-visual__render] ${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
