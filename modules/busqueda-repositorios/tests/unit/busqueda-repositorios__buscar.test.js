/**
 * busqueda-repositorios — TEST unitario determinista (sin bus, sin red).
 * Verifica la LOGICA pura del CONVERSOR: _buscar(query) → [resultados] con
 * adaptadores inyectados (patron de la casa: el reflejo se testea por metodos
 * internos, _rpc/eventBus stubeados). Casos del plan-construccion.md (Fase 3b,
 * hoja 6.6 CONVERSOR): buscar en todos a la vez, elegir repositorio, unificar
 * (7.1) a forma canonica, omitir repositorio caido (invariante 12), vacio si
 * todos fallan + busqueda.buscar.failed, y query vacia → INVALID_INPUT.
 */

'use strict';
const assert = require('node:assert/strict');
const BusquedaRepositorios = require('../../index.js');

function nuevaInstancia() {
  const m = new BusquedaRepositorios();
  m._rpc = async () => ({ status: 500, data: {} });
  m.eventBus = { publish: () => {} };
  m.metrics = { increment: () => {} };
  return m;
}

// Adaptador de ejemplo: devuelve resultados crudos (forma del puente).
function adaptadorFake(resultados, falla = false) {
  return {
    buscar: async () => {
      if (falla) throw new Error('repositorio caido');
      return resultados;
    }
  };
}

let pasados = 0;
function ok(nombre) { pasados++; console.log('  ✓ ' + nombre); }

(async () => {
  const m = nuevaInstancia();

  // ── 1 · BUSCAR en todos a la vez: unifica resultados de varios repositorios ──
  console.log('T1 · buscar en todos a la vez');
  {
    m.registrarAdaptador('printables', adaptadorFake([
      { id: 'p1', titulo: 'Vaso PLA', url: 'https://printables.com/p1', autor: 'Ana', descargas: 1200 }
    ]));
    m.registrarAdaptador('makerworld', adaptadorFake([
      { id: 'mw1', titulo: 'Vaso PETG', url: 'https://makerworld.com/mw1', autor: 'Luis', descargas: 800 }
    ]));
    m.registrarAdaptador('cults3d', adaptadorFake([]));
    m.registrarAdaptador('thingiverse', adaptadorFake([]));

    const r = await m._buscar({ project_id: 'p1', query: 'vaso' });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 2);
    assert.equal(r.data.repositorios_consultados.length, 4);
    assert.equal(r.data.repositorios_caidos.length, 0);
    const titulos = r.data.resultados.map(x => x.titulo).sort();
    assert.deepEqual(titulos, ['Vaso PETG', 'Vaso PLA']);
    ok('busca en 4 repositorios → 2 resultados unificados · forma canonica');
  }

  // ── 2 · ELEGIR repositorio: solo consulta el pedido ──
  console.log('T2 · elegir repositorio');
  {
    const r = await m._buscar({ project_id: 'p1', query: 'vaso', repositorios: ['printables'] });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 1);
    assert.equal(r.data.resultados[0].repositorio, 'printables');
    assert.deepEqual(r.data.repositorios_consultados, ['printables']);
    ok('repositorios:["printables"] → solo consulta printables');
  }

  // ── 3 · UNIFICAR (7.1): huecos como 'desconocido', deduplica por (repo, id) ──
  console.log('T3 · unificar forma canonica');
  {
    m.registrarAdaptador('cults3d', adaptadorFake([
      { id: 'c1' } // crudo minimo: sin titulo/autor/licencia/descargas
    ]));
    const r = await m._buscar({ project_id: 'p1', query: 'soporte', repositorios: ['cults3d'] });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 1);
    const res = r.data.resultados[0];
    assert.equal(res.titulo, 'desconocido');   // crudo sin titulo
    assert.equal(res.autor, 'desconocido');
    assert.equal(res.licencia, 'desconocido');
    assert.equal(res.descargas, null);
    ok('crudo sin campos → forma canonica con huecos "desconocido"/null');
  }

  // ── 4 · REPOSITORIO CAIDO: se omite, no rompe la busqueda (invariante 12) ──
  console.log('T4 · repositorio caido se omite');
  {
    m.registrarAdaptador('thingiverse', adaptadorFake([], true)); // cae
    const r = await m._buscar({ project_id: 'p1', query: 'vaso', repositorios: ['printables', 'thingiverse'] });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 1);                       // printables sigue
    assert.deepEqual(r.data.repositorios_caidos, ['thingiverse']);
    assert.equal(r.data.resultados[0].repositorio, 'printables');
    ok('thingiverse cae → se omite · printables sigue dando resultados');
  }

  // ── 5 · TODOS CAIDOS: vacio + busqueda.buscar.failed ──
  console.log('T5 · todos los repositorios caidos');
  {
    const emitidos = [];
    m.eventBus = { publish: (ev, data) => emitidos.push(ev) };
    const r = await m._buscar({ project_id: 'p1', query: 'vaso', repositorios: ['thingiverse'] });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
    assert.deepEqual(r.data.repositorios_caidos, ['thingiverse']);
    assert.ok(emitidos.includes('busqueda.buscar.failed'), 'par de fallo emitido');
    ok('todos caidos → vacio · emite busqueda.buscar.failed');
  }

  // ── 6 · QUERY VACIA: INVALID_INPUT + failed ──
  console.log('T6 · query vacia');
  {
    const emitidos = [];
    m.eventBus = { publish: (ev, data) => emitidos.push(ev) };
    const r = await m._buscar({ project_id: 'p1', query: '   ' });
    assert.equal(r.status, 400);
    assert.equal(r.data.error, 'INVALID_INPUT');
    assert.ok(emitidos.includes('busqueda.buscar.failed'), 'par de fallo emitido');
    ok('query vacia → 400 INVALID_INPUT · emite busqueda.buscar.failed');
  }

  // ── 7 · SIN ADAPTADOR CABLEADO: repositorio caido, no rompe ──
  console.log('T7 · sin adaptador cableado');
  {
    const m2 = nuevaInstancia(); // sin registrarAdaptador
    const r = await m2._buscar({ project_id: 'p1', query: 'vaso' });
    assert.equal(r.status, 200);
    assert.equal(r.data.total, 0);
    assert.equal(r.data.repositorios_caidos.length, 4);
    ok('sin adaptadores → todos caidos · vacio, no rompe');
  }

  console.log(`\nRESULTADO: ${pasados}/7 bloques OK`);
  process.exit(pasados === 7 ? 0 : 1);
})().catch(e => { console.error('FALLO:', e.message); process.exit(1); });
