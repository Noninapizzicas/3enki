/**
 * Tests unitarios — buscador-repositorios (PUENTE del taller 3D, F4 TANDA 1).
 *
 * Sin bus real. Dos modos:
 *   A) transport inyectado (función) → se prueban _buscar / _resultadoDe de forma pura.
 *   B) transport 'crawl4rs' con un eventBus fake que responde al RPC crawl4rs.buscar.request.
 * Verifica:
 *   - NO inventa resultados: devuelve TAL CUAL lo del puerto, mapeado a ResultadoRepositorio
 *   - etiqueta fuente por hostname (Printables/MakerWorld/Cults3D/Thingiverse)
 *   - formatos por pistas evidentes; CERO inventado si no hay pista
 *   - degradación honesta cuando el transporte no responde / falla / devuelve error
 *   - exige query; sin url se descarta
 *
 * Ejecutar: node modules/buscador-repositorios/tests/unit/buscador-repositorios.test.js
 */

'use strict';

const assert = require('assert');

const Buscador = require('../../index.js');

function makeMocks() {
  const published = [];
  const logger = { debug: () => {}, info: () => {}, warn: () => {}, error: () => {} };
  const metrics = { increment: () => {} };
  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };
  return { published, logger, metrics, eventBus };
}

async function setup(opts) {
  const mocks = makeMocks();
  const m = new Buscador(opts);
  await m.onLoad({ logger: mocks.logger, metrics: mocks.metrics, eventBus: mocks.eventBus });
  return { m, ...mocks };
}

(async () => {
  // ── 1. transport inyectado: devuelve TAL CUAL del puerto, mapeado ──
  {
    const { m } = await setup({
      transport: async ({ query }) => {
        assert.strictEqual(query, 'soporte teléfono 3mf');
        return [
          { titulo: 'Soporte teléfono', url: 'https://www.printables.com/model/123', autor: 'Ana', formato: '3MF' },
          { titulo: 'Caja engranajes', url: 'https://makerworld.com/en/models/999/download', autor: 'Bruno', formatos: ['STL', 'GCODE'] },
          { titulo: 'Miniatura dragón', url: 'https://cults3d.com/es/modelo/xyz' },
          { titulo: 'Sin url' }
        ];
      }
    });
    const r = await m._buscar({ project_id: 'proj-3d', query: 'soporte teléfono 3mf' });
    assert.strictEqual(r.status, 200);
    const res = r.data.resultados;
    assert.strictEqual(res.length, 3, 'descarta la entrada sin url');
    // Printables, formato 3MF explícito
    assert.strictEqual(res[0].fuente, 'Printables');
    assert.strictEqual(res[0].autor, 'Ana');
    assert.deepStrictEqual(res[0].formatos, ['3MF']);
    // MakerWorld, formatos STL+GCODE, url terminada en /download
    assert.strictEqual(res[1].fuente, 'MakerWorld');
    assert.deepStrictEqual([...res[1].formatos].sort(), ['GCODE', 'STL']);
    // Cults3D sin pista de formato → CERO inventado → []
    assert.strictEqual(res[2].fuente, 'Cults3D');
    assert.deepStrictEqual(res[2].formatos, [], 'sin pista → no inventa formato');
  }
  console.log('✓ buscador: devuelve TAL CUAL del puerto (mapeado, sin inventar)');

  // ── 2. etiquetado de fuente por hostname ──
  {
    const { m } = await setup({ transport: async () => [{ titulo: 'x', url: 'THINGIVERSE.COM/thing:1' }] });
    const r = await m._buscar({ query: 'x' });
    assert.strictEqual(r.data.resultados[0].fuente, 'Thingiverse', 'fuente por hostname');
  }
  console.log('✓ buscador: etiqueta fuente por hostname');

  // ── 3. transport inyectado devuelve error → degradación ──
  {
    const { m } = await setup({ transport: async () => { throw new Error('repo caído'); } });
    const r = await m._buscar({ query: 'x' });
    assert.strictEqual(r.status, 502, '502 cuando el puerto falla');
    assert.strictEqual(r.error.code, 'TRANSPORTE_FALLO');
  }
  console.log('✓ buscador: degradación honesta cuando el puerto falla');

  // ── 4. transport 'crawl4rs' con eventBus fake que responde al RPC ──
  {
    // eventBus fake con subscribe/publish reales que atiende crawl4rs.buscar.request
    // publicando la response correlada (patrón _rpc del reflejo).
    function rpcBus(handleRequest) {
      const subs = new Map();
      return {
        subscribe: (ev, cb) => { if (!subs.has(ev)) subs.set(ev, []); subs.get(ev).push(cb); return () => {}; },
        publish: async (ev, payload) => {
          const cbs = subs.get(ev) || [];
          let responded = false;
          const respond = (respEv, respPayload) => {
            if (responded) return;
            responded = true;
            for (const cb of (subs.get(respEv) || [])) cb({ data: respPayload });
          };
          await handleRequest(ev, payload, respond);
          if (!responded) {
            // timeout implícito → resolve null en _rpc
            for (const cb of cbs) cb(undefined);
          }
        }
      };
    }

    const bus = rpcBus((ev, payload, respond) => {
      if (ev !== 'crawl4rs.buscar.request') return;
      const q = payload.query;
      if (q === 'silla') {
        respond('crawl4rs.buscar.response', {
          request_id: payload.request_id, status: 200, data: {
            resultados: [{ titulo: 'Silla para muñecas', url: 'https://printables.com/m/1' }]
          }
        });
      } else {
        respond('crawl4rs.buscar.response', {
          request_id: payload.request_id, status: 502, data: null,
          error: { code: 'SIN_BUSQUEDA', message: 'SearXNG caído' }
        });
      }
    });

    const { m, published } = await setup({ transport: 'crawl4rs' });
    m.eventBus = bus;

    const ok = await m._buscar({ query: 'silla' });
    assert.strictEqual(ok.status, 200);
    assert.strictEqual(ok.data.resultados[0].fuente, 'Printables', 'fuente por hostname de la url');

    // transporte responde error → degradación 502 con código del transport
    const err = await m._buscar({ query: 'caidos' });
    assert.strictEqual(err.status, 502, '502 con error del transport');
    assert.strictEqual(err.error.code, 'SIN_BUSQUEDA');
    assert.strictEqual(published.length, 0, 'el puente no publica fire-and-forget');
  }
  console.log('✓ buscador: transporte crawl4rs (RPC) funciona + degrada');

  // ── 5. validaciones ──
  {
    const { m } = await setup({ transport: 'crawl4rs' });
    const noQ = await m._buscar({});
    assert.strictEqual(noQ.status, 400, 'exige query');
    const noTrans = await m._buscar({ query: 'x' }); // crawl4rs sin resp → sin respuesta
    assert.notStrictEqual(noTrans.status, 200, 'sin respuesta del transporte no inventa');
  }
  console.log('✓ buscador: validaciones');

  console.log('\n✅ TODOS LOS TESTS DE BUSCADOR-REPOSITORIOS PASAN');
})().catch((err) => { console.error('✗ TEST FALLÓ:', err); process.exit(1); });
