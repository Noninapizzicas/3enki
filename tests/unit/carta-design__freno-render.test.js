'use strict';

/**
 * 2º FRENO en carta-design.save: tras el freno estructural (productos/alérgenos),
 * el render NO debe salir roto. Best-effort: solo bloquea si el verificador-visual
 * pudo MIRAR de verdad (verificado && !ok). Sin ojos / sin órgano / sin respuesta → pasa.
 */

const assert = require('assert');
const CartaDesign = require('../../modules/pizzepos/carta-design/index.js');

let pass = 0, fail = 0;
const ok = (n) => { pass++; console.log('  ✓ ' + n); };
const ko = (n, e) => { fail++; console.log('  ✗ ' + n + ' — ' + (e && e.message || e)); };

// Carta con 2 productos sin alérgenos → el freno estructural pasa si el HTML los nombra.
const CARTA = { productos: [{ nombre: 'Margarita', alergenos: [] }, { nombre: 'Trufa', alergenos: [] }] };
const HTML_OK = '<html><body>' + 'x'.repeat(250) + ' Margarita 8€ · Trufa 14€</body></html>';

// Stub de _rpc: despacha por evento. `render` controla la respuesta del verificador.
function stubRpc(m, render) {
  const writes = [];
  m._rpc = async (evento) => {
    if (evento === 'carta.get.request') return { status: 200, data: CARTA };
    if (evento === 'render.verificar.request') return render;     // lo que devuelva el verificador
    if (evento === 'fs.write.request') { writes.push(evento); return { status: 200, data: {} }; }
    return null;
  };
  return writes;
}

async function run() {
  console.log('carta-design__freno-render');
  const noop = () => {};
  const ctx = { logger: { info: noop, warn: noop, error: noop, debug: noop }, metrics: { increment: noop }, eventBus: { publish: noop, subscribe: () => noop } };

  // 1. render ROTO (pudo mirar) → 422 + NO escribe
  {
    const m = new CartaDesign(); await m.onLoad(ctx);
    const writes = stubRpc(m, { status: 200, data: { ok: false, verificado: true, motivos: ['overflow_horizontal'] } });
    const r = await m._save({ project_id: 'p', carta_id: 'c', html: HTML_OK });
    try {
      assert.strictEqual(r.status, 422);
      assert.ok(r.error.message.includes('RENDERIZA roto'));
      assert.deepStrictEqual(r.error.details.motivos, ['overflow_horizontal']);
      assert.strictEqual(writes.length, 0, 'NO persiste un diseño con render roto');
      ok('render roto (verificado && !ok) → 422, no escribe');
    } catch (e) { ko('render roto → 422', e); }
    await m.onUnload();
  }

  // 2. render OK → 201 (guarda)
  {
    const m = new CartaDesign(); await m.onLoad(ctx);
    const writes = stubRpc(m, { status: 200, data: { ok: true, verificado: true, motivos: [] } });
    const r = await m._save({ project_id: 'p', carta_id: 'c', html: HTML_OK });
    try {
      assert.strictEqual(r.status, 201);
      assert.strictEqual(writes.length, 2, 'escribe html + meta');
      ok('render ok → 201 (persiste)');
    } catch (e) { ko('render ok → 201', e); }
    await m.onUnload();
  }

  // 3. sin navegador (verificado:false) → 201 (no bloquea donde no hay ojos)
  {
    const m = new CartaDesign(); await m.onLoad(ctx);
    stubRpc(m, { status: 200, data: { ok: true, verificado: false, motivo: 'sin_navegador' } });
    const r = await m._save({ project_id: 'p', carta_id: 'c', html: HTML_OK });
    try {
      assert.strictEqual(r.status, 201, 'sin ojos no bloquea (fail-open)');
      ok('sin navegador → 201 (best-effort, no bloquea)');
    } catch (e) { ko('sin navegador → 201', e); }
    await m.onUnload();
  }

  // 4. verificador no responde (_rpc null) → 201 (no es dependencia dura)
  {
    const m = new CartaDesign(); await m.onLoad(ctx);
    stubRpc(m, null);
    const r = await m._save({ project_id: 'p', carta_id: 'c', html: HTML_OK });
    try {
      assert.strictEqual(r.status, 201, 'sin verificador desplegado no rompe carta-design');
      ok('verificador ausente → 201 (best-effort)');
    } catch (e) { ko('verificador ausente → 201', e); }
    await m.onUnload();
  }

  // 5. el freno ESTRUCTURAL sigue mandando ANTES del de render (no se saltó)
  {
    const m = new CartaDesign(); await m.onLoad(ctx);
    // html que NO nombra los productos → estructural falla, ni se llega al render
    let renderLlamado = false;
    m._rpc = async (evento) => {
      if (evento === 'carta.get.request') return { status: 200, data: CARTA };
      if (evento === 'render.verificar.request') { renderLlamado = true; return { status: 200, data: { ok: true, verificado: true } }; }
      if (evento === 'fs.write.request') return { status: 200, data: {} };
      return null;
    };
    const r = await m._save({ project_id: 'p', carta_id: 'c', html: '<html><body>' + 'x'.repeat(250) + '</body></html>' });
    try {
      assert.strictEqual(r.status, 422);
      assert.ok(r.error.details.errors.find(e => e.code === 'PRODUCTOS_FALTAN'), 'falla por estructura');
      assert.strictEqual(renderLlamado, false, 'no llega al freno de render si el estructural ya bloqueó');
      ok('freno estructural manda primero (no se salta)');
    } catch (e) { ko('estructural primero', e); }
    await m.onUnload();
  }

  console.log(`[carta-design__freno-render] ${fail === 0 ? 'OK' : 'FAIL'} ${pass}/${pass + fail}`);
  process.exit(fail === 0 ? 0 : 1);
}

run();
