/**
 * Tests unitarios — extractor-juicio (respaldo hibrido del hueco de A4.1).
 *
 * Fija el contrato del respaldo LLM SIN llamar a la red: `fetch` global se mockea.
 *   · JSON valido → extraido + encadenado a control-cuadre-documento (propuesta != asiento)
 *   · campo inventado / tipo raro / fecha imposible / NIF con control invalido → se DESCARTA
 *     a null y se declara en `abierto` (no se inventa)
 *   · respuesta no JSON → 502 JUICIO_NO_DISPONIBLE
 *   · sin clave en el .env → 502 y NO se llama a fetch
 *   · sin texto (<8 caracteres) → 400 INVALID_INPUT
 *   · el rol de la cola es ENCOLADO_EXCEPCION y el origen es 'extractor-juicio'
 *   · la clave NUNCA aparece en la respuesta ni en los eventos publicados
 *
 * Ejecutar: node tests/unit/entrada__extractor-juicio.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const Modulo = require('../../modules/contabilidad-entrada/extractor-juicio/index.js');

const CLAVE_FALSA = 'sk-clave-de-prueba-no-real';
const TEXTO = 'FACTURA Nº 2024/117\nProveedor: Suministros ACME SL\nNIF: B12345674\n' +
  'Fecha: 05/03/2024\nBase imponible: 63,60\nIVA 10%: 6,36\nTotal: 69,96 EUR';

// ── infraestructura de prueba ──
function busFalso() {
  const eventos = [];
  return {
    eventos,
    publish(ev, payload) { eventos.push({ ev, payload }); },
    subscribe() { return () => {}; }
  };
}

function loggerFalso() {
  const logs = [];
  const guardar = (nivel) => (ev, data) => logs.push({ nivel, ev, data });
  return { logs, info: guardar('info'), warn: guardar('warn'), error: guardar('error'), debug: guardar('debug') };
}

// Un .env de mentira: la clave real jamas se usa en los tests.
function envFalso({ conClave = true } = {}) {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'juicio-'));
  const ruta = path.join(dir, '.env');
  fs.writeFileSync(ruta, conClave ? `OTRA=COSA\nOLLAMA_CLOUD_API_KEY_GLOBAL=${CLAVE_FALSA}\n` : 'OTRA=COSA\n');
  return { ruta, dir, limpiar: () => fs.rmSync(dir, { recursive: true, force: true }) };
}

// Mock de fetch: cuenta llamadas y devuelve `contenido` como message.content del proveedor.
// Nada sale a la red: todos los casos corren contra este mock.
function fetchConContenido(contenido) {
  const previo = global.fetch;
  const llamadas = [];
  global.fetch = async (url, opciones) => {
    llamadas.push({ url, opciones });
    return {
      ok: true,
      status: 200,
      json: async () => ({ choices: [{ message: { content: contenido } }] })
    };
  };
  return { llamadas, restaurar: () => { global.fetch = previo; } };
}

async function crear({ conClave = true, fetch: fetchMock } = {}) {
  const env = envFalso({ conClave });
  const bus = busFalso();
  const logger = loggerFalso();
  const m = new Modulo();
  await m.onLoad({
    logger, eventBus: bus, metrics: { increment() {} },
    moduleConfig: { env_path: env.ruta, timeout_ms: 5000 }
  });
  return { m, bus, logger, env, fetchMock };
}

// ── 1 · JSON válido → extraido + encadenado a cuadre (propone, NO asienta) ──
(async () => {
  const fm = fetchConContenido(JSON.stringify({
    proveedor: 'Suministros ACME SL',
    nif: 'B12345674',
    numero: '2024/117',
    fecha: '05/03/2024',
    base: '63,60',
    iva_pct: '10',
    iva_importe: '6,36',
    total: '69,96',
    moneda: 'EUR'
  }));
  const { m, bus, env } = await crear({ fetch: fm });
  try {
    await m.onExtraerRequest({
      request_id: 'r1', project_id: 'p1', texto: TEXTO, clase: 'factura',
      documento: { id: 'factura-117.pdf' }, correlation_id: 'c1'
    });

    const resp = bus.eventos.find((e) => e.ev === 'extractor-juicio.extraer.response');
    assert.ok(resp, 'debe responder por el bus');
    assert.strictEqual(resp.payload.status, 200);
    const d = resp.payload.data;
    assert.strictEqual(d.extraido.proveedor, 'Suministros ACME SL');
    assert.strictEqual(d.extraido.nif, 'B12345674');
    assert.strictEqual(d.extraido.fecha, '05/03/2024', 'la fecha va tal cual aparezca');
    assert.strictEqual(d.extraido.base, '63,60', 'el importe va tal cual (coma decimal)');
    assert.strictEqual(d.extraido.total, '69,96');
    assert.strictEqual(d.extraido.moneda, 'EUR');
    assert.strictEqual(d.motor, 'ollama-cloud');
    assert.strictEqual(d.modelo, 'deepseek-v4.1-flash');
    assert.strictEqual(d.propuesta, true);
    assert.deepStrictEqual(d.faltantes, []);
    assert.strictEqual(d.asienta, false, 'propone, NO asienta');

    const aCuadre = bus.eventos.find((e) => e.ev === 'control-cuadre-documento.cuadra.request');
    assert.ok(aCuadre, 'con propuesta:true debe encadenar a cuadre');
    assert.strictEqual(aCuadre.payload.project_id, 'p1');
    assert.strictEqual(aCuadre.payload.clase, 'factura');
    assert.strictEqual(aCuadre.payload.extraido.total, '69,96');
    assert.strictEqual(aCuadre.payload.correlation_id, 'c1');
    assert.deepStrictEqual(aCuadre.payload.documento, { id: 'factura-117.pdf', ruta: null, tipo: null });
    assert.ok(!bus.eventos.some((e) => e.ev === 'encolado-excepcion.encolar.request'),
      'una propuesta completa NO se encola');

    // La petición al proveedor va como pide el contrato: temperature 0, json_object, Bearer.
    const llamada = fm.llamadas[0];
    const cuerpo = JSON.parse(llamada.opciones.body);
    assert.strictEqual(cuerpo.temperature, 0);
    assert.strictEqual(cuerpo.model, 'deepseek-v4.1-flash');
    assert.deepStrictEqual(cuerpo.response_format, { type: 'json_object' });
    assert.strictEqual(llamada.url, 'https://ollama.com/v1/chat/completions');
    assert.ok(llamada.opciones.headers.Authorization.includes(CLAVE_FALSA));
    // El prompt lleva las reglas duras: NIF del EMISOR, no inventar, importes con coma decimal.
    const sistema = cuerpo.messages[0].content;
    assert.ok(/EMISOR/.test(sistema) && /NUNCA el del cliente/.test(sistema));
    assert.ok(/NUNCA inventes/.test(sistema));
    assert.ok(/coma decimal/.test(sistema) && /dd\/mm\/yyyy/.test(sistema));
    assert.ok(cuerpo.messages[1].content.includes(TEXTO.slice(0, 40)), 'el texto del documento viaja al juicio');

    // La clave NUNCA sale en la respuesta ni en los eventos (solo en la cabecera al proveedor).
    const publicado = JSON.stringify(bus.eventos);
    assert.ok(!publicado.includes(CLAVE_FALSA), 'la API key no puede aparecer en ningun evento');
    const logs = JSON.stringify(m.logger.logs);
    assert.ok(!logs.includes(CLAVE_FALSA), 'la API key no puede aparecer en ningun log');
  } finally {
    fm.restaurar();
    env.limpiar();
  }

  // ── 2 · campo inventado / tipo raro / fecha imposible / NIF con control inválido → descarte declarado ──
  const fm2 = fetchConContenido(JSON.stringify({
    proveedor: 'Suministros ACME SL',
    nif: 'B12345678',            // control inválido (el bueno es B12345674)
    numero: '2024/117',
    fecha: '31/02/2024',         // 31 de febrero: no existe
    base: 'mucho dinero',        // no es importe
    total: { valor: 69.96 },     // tipo raro
    moneda: 'euros',             // no es código de 3 letras
    banco: 'Santander'           // campo que el contrato no conoce
  }));
  const { m: m2, bus: bus2, env: env2 } = await crear({ fetch: fm2 });
  try {
    await m2.onExtraerRequest({
      request_id: 'r2', project_id: 'p1', texto: TEXTO, clase: 'factura',
      documento: { ruta: 'inbox/factura-117.pdf' }, obligatorios: ['proveedor', 'nif', 'fecha', 'total'],
      correlation_id: 'c2'
    });
    const d = bus2.eventos.find((e) => e.ev === 'extractor-juicio.extraer.response').payload.data;

    assert.strictEqual(d.extraido.proveedor, 'Suministros ACME SL', 'lo válido se conserva');
    assert.strictEqual(d.extraido.numero, '2024/117');
    assert.strictEqual(d.extraido.nif, null, 'un NIF que no pasa el control se descarta');
    assert.strictEqual(d.extraido.fecha, null, '31/02 no es una fecha plausible');
    assert.strictEqual(d.extraido.base, null, '"mucho dinero" no es un importe');
    assert.strictEqual(d.extraido.total, null, 'un objeto no es un importe');
    assert.strictEqual(d.extraido.moneda, null, '"euros" no es un código de 3 letras');
    assert.strictEqual(d.extraido.iva_pct, null, 'campo ausente = null (no se inventa)');

    // Todo descarte se DECLARA: se ve el motivo, no se pierde en silencio.
    assert.ok(d.abierto.campos, 'los descartes se declaran en abierto.campos');
    assert.ok(/control invalido/.test(d.abierto.campos.nif), 'el motivo del NIF se declara');
    assert.ok(/fecha/.test(d.abierto.campos.fecha), 'el motivo de la fecha se declara');
    assert.ok(/importe/.test(d.abierto.campos.base), 'el motivo del importe se declara');
    assert.ok(/tipo/.test(d.abierto.campos.total), 'el motivo del tipo raro se declara');
    assert.deepStrictEqual(d.abierto.ignorados, ['banco'], 'los campos inventados se declaran');
    assert.strictEqual(d.propuesta, false);
    assert.ok(d.faltantes.includes('total'));

    const cola = bus2.eventos.find((e) => e.ev === 'encolado-excepcion.encolar.request');
    assert.ok(cola, 'sin obligatorios completos debe encolar la excepción');
    assert.strictEqual(cola.payload.rol, 'ENCOLADO_EXCEPCION', 'el rol es del escritor de la parcela');
    assert.strictEqual(cola.payload.origen, 'extractor-juicio');
    assert.strictEqual(cola.payload.clave, 'doc:inbox/factura-117.pdf', 'la clave es la del documento');
    assert.strictEqual(cola.payload.payload.total, null, 'el parcial se encola tal cual, sin inventar');
    assert.ok(!bus2.eventos.some((e) => e.ev === 'control-cuadre-documento.cuadra.request'),
      'lo incompleto NO se encadena al cuadre');
  } finally {
    fm2.restaurar();
    env2.limpiar();
  }

  // ── 3 · cerca de markdown + números JSON (formato tolerado, no inventado) ──
  const fm3 = fetchConContenido('```json\n' + JSON.stringify({
    proveedor: 'ACME SL', nif: 'B12345674', fecha: '05/03/2024',
    base: 63.6, total: 69.96, iva_pct: 10
  }) + '\n```');
  const { m: m3, bus: bus3, env: env3 } = await crear({ fetch: fm3 });
  try {
    const res = await m3._extraer({ project_id: 'p1', texto: TEXTO });
    assert.strictEqual(res.status, 200, 'la cerca ```json no invalida la respuesta');
    assert.strictEqual(res.data.extraido.base, '63,6', 'un numero JSON se lleva a coma decimal');
    assert.strictEqual(res.data.extraido.total, '69,96');
    assert.strictEqual(res.data.extraido.iva_pct, '10');
    assert.strictEqual(res.data.propuesta, true);
  } finally {
    fm3.restaurar();
    env3.limpiar();
  }

  // ── 4 · respuesta NO JSON → 502 JUICIO_NO_DISPONIBLE ──
  const fm4 = fetchConContenido('Lo siento, no puedo procesar esa imagen.');
  const { m: m4, bus: bus4, env: env4 } = await crear({ fetch: fm4 });
  try {
    const res = await m4._extraer({ project_id: 'p1', texto: TEXTO });
    assert.strictEqual(res.status, 502);
    assert.strictEqual(res.error.code, 'JUICIO_NO_DISPONIBLE');
    assert.ok(res.error.details.abierto.juicio, 'abierto.juicio declara por qué no hay juicio');
    assert.ok(/no es un objeto JSON/.test(res.error.details.abierto.juicio));
    assert.ok(!bus4.eventos.some((e) => e.ev === 'encolado-excepcion.encolar.request'),
      'un 502 no encola por su cuenta: no hay dato que encolar');
  } finally {
    fm4.restaurar();
    env4.limpiar();
  }

  // ── 5 · sin clave en el .env → 502 y NO se llama a fetch ──
  const fm5 = fetchConContenido(JSON.stringify({ total: '69,96' }));
  const { m: m5, bus: bus5, env: env5 } = await crear({ conClave: false, fetch: fm5 });
  try {
    await m5.onExtraerRequest({ request_id: 'r5', project_id: 'p1', texto: TEXTO });
    const fallo = bus5.eventos.find((e) => e.ev === 'extractor-juicio.extraer.failed');
    assert.ok(fallo, 'un 502 publica su par .failed');
    assert.strictEqual(fallo.payload.status, 502);
    assert.strictEqual(fallo.payload.error.code, 'JUICIO_NO_DISPONIBLE');
    assert.strictEqual(fm5.llamadas.length, 0, 'sin clave NO se llama al proveedor');
    assert.ok(!bus5.eventos.some((e) => e.ev === 'encolado-excepcion.encolar.request'),
      'sin juicio no se encola desde aquí (el hueco lo declara el 502)');
  } finally {
    fm5.restaurar();
    env5.limpiar();
  }

  // ── 6 · sin texto (<8 caracteres) → 400 INVALID_INPUT, sin llamar al proveedor ──
  const fm6 = fetchConContenido(JSON.stringify({ total: '69,96' }));
  const { m: m6, env: env6 } = await crear({ fetch: fm6 });
  try {
    const vacio = await m6._extraer({ project_id: 'p1', texto: '' });
    assert.strictEqual(vacio.status, 400);
    assert.strictEqual(vacio.error.code, 'INVALID_INPUT');
    assert.strictEqual(vacio.error.details.field, 'texto');

    const corto = await m6._extraer({ project_id: 'p1', texto: '   corto ' });
    assert.strictEqual(corto.status, 400, 'menos de 8 caracteres no es un documento');

    const sinPid = await m6._extraer({ texto: TEXTO });
    assert.strictEqual(sinPid.status, 400);
    assert.strictEqual(sinPid.error.details.field, 'project_id');

    assert.strictEqual(fm6.llamadas.length, 0, 'sin texto no se gasta una llamada');
  } finally {
    fm6.restaurar();
    env6.limpiar();
  }

  // ── 7 · el proveedor falla (red/timeout/HTTP) → 502, nunca un 200 inventado ──
  {
    const previo = global.fetch;
    const { m: m7, env: env7 } = await crear({ fetch: { llamadas: [], restaurar() {} } });
    global.fetch = async () => { throw new Error('ECONNRESET'); };
    try {
      const res = await m7._extraer({ project_id: 'p1', texto: TEXTO });
      assert.strictEqual(res.status, 502);
      assert.strictEqual(res.error.code, 'JUICIO_NO_DISPONIBLE');
      assert.ok(/fallo de red/.test(res.error.details.abierto.juicio));
    } finally {
      global.fetch = previo;
      env7.limpiar();
    }
  }

  {
    const previo = global.fetch;
    const { m: m8, env: env8 } = await crear({ fetch: { llamadas: [], restaurar() {} } });
    global.fetch = async () => ({ ok: false, status: 401, json: async () => ({}) });
    try {
      const res = await m8._extraer({ project_id: 'p1', texto: TEXTO });
      assert.strictEqual(res.status, 502);
      assert.ok(/HTTP 401/.test(res.error.details.abierto.juicio), 'un 401 del proveedor se declara como 502');
    } finally {
      global.fetch = previo;
      env8.limpiar();
    }
  }

  console.log('OK · extractor-juicio: 7/7 (juicio validado, descartes declarados, degradacion honesta, sin red)');
})().catch((err) => {
  console.error('FALLO · extractor-juicio:', err && err.message);
  console.error(err && err.stack);
  process.exit(1);
});
