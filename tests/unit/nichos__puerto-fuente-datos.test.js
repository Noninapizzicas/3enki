/**
 * Tests unitarios para nichos/puerto-fuente-datos (fachada de fuentes, J1)
 *
 * Cubre la reconciliación de contrato (v0.2.0): el puerto acepta tanto la
 * forma semántica de los 3 consumidores del vertical (sondeador-demanda-
 * competencia) como la forma explícita {fuente,peticion}, y devuelve
 * 'resultados' (array homogéneo) + 'resultado_crudo'.
 *
 * Ejecutar con: node tests/unit/nichos__puerto-fuente-datos.test.js
 */

const assert = require('assert');
const PuertoFuenteDatos = require('../../modules/nichos/puerto-fuente-datos');

function test(description, fn) {
  try {
    fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

async function testAsync(description, fn) {
  try {
    await fn();
    console.log(`✓ ${description}`);
  } catch (error) {
    console.error(`✗ ${description}`);
    console.error(`  ${error.message}`);
    process.exit(1);
  }
}

// Bus simulado: traduce cada <ev>.request a su <ev>.response correlada por request_id.
function fakeBus(respuestas) {
  return {
    subscribes: {},
    subscribe(ev, fn) { (this.subscribes[ev] = this.subscribes[ev] || []).push(fn); return () => {}; },
    publish(ev, payload) {
      const respEv = ev.endsWith('.request') ? ev.slice(0, -8) + '.response' : ev + '.response';
      const r = respuestas[respEv];
      if (r === undefined) return;
      const out = typeof r === 'function' ? r(payload) : r;
      for (const fn of (this.subscribes[respEv] || [])) fn({ data: { request_id: payload.request_id, ...out } });
    }
  };
}

const RESPUESTAS = {
  'nichos.fuente.limites.puede.consumir.response': { status: 200, data: { puede: true, margen: 100 } },
  'crawl4rs.buscar.response': { status: 200, data: { resultados: [
    { titulo: 'Empresa A placas solares', url: 'https://a.example', resumen: 'instaladores' },
    { titulo: 'Empresa B', url: 'https://b.example', resumen: 'fotovoltaica' }
  ], total: 2 } },
  'nichos.conversor.normalizar.response': (p) => ({ status: 200, data: { dato_homogeneo: {
    titulo: p.crudo.titulo, contenido: p.crudo.resumen, url: p.crudo.url, meta: {},
    origen: p.origen, normalizado_en: 'x', origen_desconocido: false } } })
};

async function nuevoPuerto(respuestas = RESPUESTAS) {
  const p = new PuertoFuenteDatos();
  await p.onLoad({ eventBus: fakeBus(respuestas), logger: { info() {}, error() {} }, metrics: { increment() {} } });
  return p;
}

async function runTests() {
  console.log('\n🧪 Running puerto-fuente-datos Tests\n');

  await testAsync('forma semántica del sondeador {semilla,territorio} → 200 con resultados', async () => {
    const p = await nuevoPuerto();
    const r = await p._consumir({ project_id: 'P1', semilla: { territorio: 'placas solares Alicante' }, territorio: 'Alicante' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.resultados.length, 2);
    assert.strictEqual(r.data.resultados[0].nombre, 'Empresa A placas solares');
    assert.strictEqual(r.data.resultados[0].fuente, 'searxng');
  });

  await testAsync('forma {candidato} del estudio-demanda → 200 con resultados', async () => {
    const p = await nuevoPuerto();
    const r = await p._consumir({ project_id: 'P1', candidato: { nombre: 'tienda crochet' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.resultados.length, 2);
  });

  await testAsync('forma {solucion} del estudio-competencia → 200 con resultados', async () => {
    const p = await nuevoPuerto();
    const r = await p._consumir({ project_id: 'P1', solucion: { descripcion: 'plataforma X' } });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.resultados.length, 2);
  });

  await testAsync('forma explícita {fuente,peticion} → 200 con resultado_crudo', async () => {
    const p = await nuevoPuerto();
    const r = await p._consumir({ fuente: { tipo: 'buscar', nombre: 'searxng', coste_unitario: 0.01 }, peticion: { query: 'x' }, project_id: 'P1' });
    assert.strictEqual(r.status, 200);
    assert.notStrictEqual(r.data.resultado_crudo, null);
    assert.strictEqual(r.data.resultado_crudo.resultados.length, 2);
  });

  await testAsync('sin query → 400 INVALID_INPUT (no excepción)', async () => {
    const p = await nuevoPuerto();
    const r = await p._consumir({ project_id: 'P1' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
  });

  await testAsync('límite agotado (puede=false) → 429 LIMITE_EXCEDIDO', async () => {
    const p = await nuevoPuerto({ ...RESPUESTAS, 'nichos.fuente.limites.puede.consumir.response': { status: 200, data: { puede: false, margen: 0 } } });
    const r = await p._consumir({ query: 'x', project_id: 'P1' });
    assert.strictEqual(r.status, 429);
    assert.strictEqual(r.error.code, 'LIMITE_EXCEDIDO');
  });

  await testAsync('sin project_id → omite pre-check y sigue (200)', async () => {
    const p = await nuevoPuerto();
    const r = await p._consumir({ query: 'x' });
    assert.strictEqual(r.status, 200);
  });

  console.log('\n✅ Todos los tests del puerto-fuente-datos pasaron');
}

runTests();
