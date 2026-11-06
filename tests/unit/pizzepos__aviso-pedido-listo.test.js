/**
 * Tests unitarios — pizzepos/aviso-pedido-listo.
 *
 * El aviso de recogida es DINERO y CONFIANZA: si no sale, el cliente espera una pizza
 * que ya esta hecha; si sale al numero equivocado, se avisa a un desconocido. Por eso
 * se prueba con un puente HTTP de verdad (servidor local efimero) y una cuenta de
 * verdad, no con dobles que siempre dicen que si.
 *
 * Ejecutar: node tests/unit/pizzepos__aviso-pedido-listo.test.js
 */
'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const http = require('http');

const AvisoPedidoListo = require('../../modules/pizzepos/aviso-pedido-listo');

// ==========================================
// Harness
// ==========================================

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }
const esperar = (ms) => new Promise((r) => setTimeout(r, ms));

function makeBus(project, opciones) {
  const opts = opciones || {};
  const published = [];
  const subscribers = new Map();
  return {
    published,
    project: project === undefined ? { success: true, project: { base_path: '/tmp' } } : project,
    // Los ficheros que el módulo puede leer por el bus (fs.read.request).
    fsFiles: opts.fsFiles || {},
    publish(eventType, data) {
      published.push({ eventType, data });
      if (eventType === 'project.get.request' && this.project !== null) {
        const responseData = { ...this.project, request_id: data.request_id };
        const handlers = subscribers.get('project.get.response') || [];
        setImmediate(() => {
          for (const h of handlers) { try { h({ data: responseData }); } catch (_) { /* ignore */ } }
        });
      }
      // fs.read: se contesta SIEMPRE (con el fichero o con error). Si no, el lector de
      // servicio se comería su timeout en cada test y la suite tardaría minutos.
      if (eventType === 'fs.read.request') {
        const contenido = this.fsFiles[data.path];
        const respuesta = contenido === undefined
          ? { request_id: data.request_id, error: { code: 'RESOURCE_NOT_FOUND' } }
          : { request_id: data.request_id, content: contenido, error: null };
        const handlers = subscribers.get('fs.read.response') || [];
        setImmediate(() => {
          for (const h of handlers) { try { h({ data: respuesta }); } catch (_) { /* ignore */ } }
        });
      }
      return Promise.resolve();
    },
    subscribe(eventType, handler) {
      if (!subscribers.has(eventType)) subscribers.set(eventType, []);
      subscribers.get(eventType).push(handler);
      // DEVUELVE LA FUNCION, no una promesa: el bus real (`core/events/bus.js`) es
      // sincrono aqui y los lectores compartidos (LectorServicio) llaman `unsub()`
      // sin await. Un doble que devolviera promesa esconde ese contrato y cuelga.
      return () => {
        const arr = subscribers.get(eventType) || [];
        const i = arr.indexOf(handler);
        if (i >= 0) arr.splice(i, 1);
      };
    }
  };
}

function makeCuenta(over) {
  return {
    cuenta_id: 'llevar_abc123',
    project_id: 'the-pirate',
    tipo: 'llevar',
    turno: 395,
    ref_display: 'francisco sanchez L 395',
    nombre: 'francisco sanchez',
    estado: 'listo',
    // FORMA REAL: cuentas.handleCreateCuenta devuelve `metadata` (no
    // `datos_especificos`). El test usaba la forma del fichero de persistencia, así
    // que daba por bueno un módulo que en producción no habría avisado a nadie.
    metadata: {
      origen: 'tienda',
      canal_origen: 'web',
      modo_consumo: 'recoger',
      cliente_nombre: 'francisco sanchez',
      cliente_telefono: null,
      cliente_jid: '34111222333@s.whatsapp.net',
      canal_cuenta: 'the-pirate',
      ...(over || {})
    }
  };
}

/** Puente de mentira en un puerto libre: apunta lo que recibe y responde lo que le digan. */
async function arrancarPuente(respuesta) {
  const recibidos = [];
  const server = http.createServer((req, res) => {
    let body = '';
    req.on('data', (c) => { body += c; });
    req.on('end', () => {
      let json = null;
      try { json = JSON.parse(body); } catch (_) { /* ignore */ }
      recibidos.push(json);
      const r = typeof respuesta === 'function' ? respuesta(json, recibidos.length) : (respuesta || { ok: true, id: 'MSG1' });
      res.writeHead(200, { 'content-type': 'application/json' });
      res.end(JSON.stringify(r));
    });
  });
  await new Promise((r) => server.listen(0, '127.0.0.1', r));
  const url = `http://127.0.0.1:${server.address().port}/send`;
  return { url, recibidos, cerrar: () => new Promise((r) => server.close(r)) };
}

/** Proyecto de mentira en disco con su config/config.json. */
function proyectoConConfig(whatsapp_qr) {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'aviso-listo-'));
  fs.mkdirSync(path.join(base, 'config'), { recursive: true });
  const cfg = { pizzepos: { enabled: true } };
  if (whatsapp_qr) cfg.whatsapp_qr = whatsapp_qr;
  fs.writeFileSync(path.join(base, 'config', 'config.json'), JSON.stringify(cfg));
  return base;
}

// Config de servicio del the-pirate real (storage/pizzepos/servicio/config.json).
const SERVICIO = {
  zona_horaria: 'Europe/Madrid',
  horario: { lunes: [], martes: ['18:00-23:30'] },
  interruptor: { abierto: true },
  recogida: {
    direccion: 'Juan Carlo I, 49',
    ciudad: 'Lorca',
    maps_url: 'https://www.google.com/maps/search/?api=1&query=Juan+Carlo+I+49,+Lorca',
    notas: null
  }
};

async function montar({ cuenta, project, qr, respuesta, servicio, marca } = {}) {
  const puente = await arrancarPuente(respuesta);
  // qr === undefined → config valida apuntando al puente de prueba
  // qr === null      → config SIN bloque whatsapp_qr (proyecto que no lo tiene puesto)
  const base = proyectoConConfig(qr === undefined
    ? { url: puente.url, slug: 'the-pirate' }
    : (qr === null ? null : qr));
  // Sin config, el modulo cae al puente local por defecto: en test se redirige al de
  // mentira para no tocar el WhatsApp real de la maquina.
  if (qr === null) process.env.WA_PUENTE_URL = puente.url;
  else delete process.env.WA_PUENTE_URL;
  // servicio === undefined → el the-pirate real (con direccion y mapa)
  // servicio === null      → proyecto sin config de servicio (no hay donde recoger escrito)
  const fsFiles = {};
  const servicioCfg = servicio === undefined ? SERVICIO : servicio;
  if (servicioCfg) fsFiles['/pizzepos/servicio/config.json'] = JSON.stringify(servicioCfg);
  const bus = makeBus(
    project === undefined ? { success: true, project: { base_path: base } } : project,
    { fsFiles }
  );
  const logs = [];
  const metrics = [];
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info: (e, p) => logs.push(['info', e, p]),
    warn: (e, p) => logs.push(['warn', e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const cuentasPedidas = [];
  const registry = {
    get: (nombre) => nombre === 'cuentas' ? {
      instance: {
        handleGetCuenta: async ({ id }) => {
          cuentasPedidas.push(id);
          if (cuenta === null) return { status: 404, error: { code: 'RESOURCE_NOT_FOUND' } };
          return { status: 200, data: typeof cuenta === 'function' ? cuenta() : (cuenta || makeCuenta()) };
        }
      }
    } : (nombre === 'carta-marketing' ? {
      instance: {
        // Puerta del dueño: la marca del proyecto (marca.json → esencia.nombre).
        // marca === null → proyecto sin marca puesta.
        handleGetPerfil: async () => ({
          status: 200,
          data: { esencia: { nombre: marca === null ? null : (marca === undefined ? 'The Pirate' : marca) } }
        })
      }
    } : undefined)
  };

  const mod = new AvisoPedidoListo();
  mod._esperaMs = 5;   // reintentos rapidos en test
  mod._timeoutHttpMs = 500;
  await mod.onLoad({ logger, metrics: { increment: (n, l) => metrics.push([n, l]) }, eventBus: bus, moduleRegistry: registry });

  return {
    mod, bus, logs, metrics, cuentasPedidas, puente,
    async listo(data) { await mod.onCocinaPedidoListo({ data: { project_id: 'the-pirate', cuenta_id: 'llevar_abc123', ref_display: 'francisco sanchez L 395', ...(data || {}) } }); },
    eventos: (tipo) => bus.published.filter((p) => p.eventType === tipo),
    async cerrar() { await mod.onUnload(); await puente.cerrar(); }
  };
}

// ==========================================
// Tests
// ==========================================

test('avisa al cliente por WhatsApp con el codigo de turno y su nombre', async () => {
  const h = await montar();
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 1);
    assert.strictEqual(h.bus.published.filter((p) => p.eventType.startsWith('aviso_pedido_listo.fallido')).length, 0);
    const enviado = h.eventos('aviso_pedido_listo.enviado')[0].data;
    assert.strictEqual(enviado.ref_display, 'L 395');
    assert.strictEqual(enviado.cliente_nombre, 'francisco sanchez');
    assert.strictEqual(enviado.message_id, 'MSG1');
  } finally { await h.cerrar(); }
});

test('el texto dice que esta listo, que pase a recogerlo y COMO se identifica', async () => {
  const h = await montar();
  try {
    await h.listo();
    const enviado = h.puente.recibidos[0];
    assert.strictEqual(enviado.slug, 'the-pirate');
    assert.strictEqual(enviado.to, '34111222333@s.whatsapp.net');
    assert.match(enviado.text, /ya está listo/);
    assert.match(enviado.text, /recogerlo/);
    assert.match(enviado.text, /L 395/);
    assert.match(enviado.text, /Francisco sanchez/);
  } finally { await h.cerrar(); }
});

test('el aviso lleva DONDE recoger: el negocio, la direccion y el enlace del mapa', async () => {
  const h = await montar();
  try {
    await h.listo();
    const texto = h.puente.recibidos[0].text;
    assert.match(texto, /recogerlo por The Pirate/, 'el cliente tiene que saber POR QUE negocio viene');
    assert.match(texto, /📍 Juan Carlo I, 49, Lorca/, 'la direccion, escrita en el mensaje');
    assert.match(texto, /Cómo llegar: https:\/\/www\.google\.com\/maps\//, 'y el enlace del mapa, pegado al aviso');
  } finally { await h.cerrar(); }
});

test('al cliente se le saluda por su nombre de pila, y el completo queda para el mostrador', async () => {
  const h = await montar();
  try {
    await h.listo();
    const texto = h.puente.recibidos[0].text;
    assert.match(texto, /^¡Francisco, tu pedido ya está listo!/, 'el saludo es de casa: nombre de pila');
    assert.doesNotMatch(texto, /^¡Francisco sanchez,/, 'el nombre completo no saluda: eso es del mostrador');
    assert.match(texto, /A nombre de: Francisco sanchez/, 'el completo sigue, para que la barra lo identifique');
    assert.doesNotMatch(texto, /\bvan \d|\d+ pedidos?\b/, 'sin contadores: el cliente no es un tique');
  } finally { await h.cerrar(); }
});

test('la ubicacion sale de la config de servicio: si el dueño la mueve, el aviso se mueve', async () => {
  const h = await montar({
    servicio: { ...SERVICIO, recogida: { direccion: 'Alameda de Cervantes, 2', ciudad: 'Lorca', maps_url: 'https://maps.example.com/pirate-nuevo' } }
  });
  try {
    await h.listo();
    const texto = h.puente.recibidos[0].text;
    assert.match(texto, /Alameda de Cervantes, 2, Lorca/);
    assert.match(texto, /https:\/\/maps\.example\.com\/pirate-nuevo/);
    assert.doesNotMatch(texto, /Juan Carlo/, 'la direccion vieja no puede quedarse pegada en el codigo');
  } finally { await h.cerrar(); }
});

test('sin config de servicio el aviso sale igual, sin hueco de mapa vacio', async () => {
  const h = await montar({ servicio: null });
  try {
    await h.listo();
    const texto = h.puente.recibidos[0].text;
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 1, 'sin direccion el aviso NO se cae: el cliente tiene que saber que esta listo');
    assert.match(texto, /ya está listo/);
    assert.doesNotMatch(texto, /Cómo llegar/);
    assert.doesNotMatch(texto, /📍/);
  } finally { await h.cerrar(); }
});

test('un enlace que no es http(s) no se le manda al cliente', async () => {
  const h = await montar({
    servicio: { ...SERVICIO, recogida: { direccion: 'Juan Carlo I, 49', ciudad: 'Lorca', maps_url: 'javascript:alert(1)' } }
  });
  try {
    await h.listo();
    const texto = h.puente.recibidos[0].text;
    assert.match(texto, /Juan Carlo I, 49/, 'la direccion escrita si vale');
    assert.doesNotMatch(texto, /javascript:/, 'por el bufé de WhatsApp no se cuela cualquier cosa');
    assert.doesNotMatch(texto, /Cómo llegar/);
  } finally { await h.cerrar(); }
});

test('sin marca puesta el aviso no inventa el nombre del negocio', async () => {
  const h = await montar({ marca: null });
  try {
    await h.listo();
    const texto = h.puente.recibidos[0].text;
    assert.match(texto, /Puedes pasar a recogerlo cuando quieras/);
    assert.doesNotMatch(texto, /null|undefined/);
  } finally { await h.cerrar(); }
});

test('el destino es la JID que trajo el pedido (numero oculto incluido)', async () => {
  const h = await montar({ cuenta: makeCuenta({ cliente_jid: '191624311222342@lid', cliente_telefono: null }) });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 1);
  } finally { await h.cerrar(); }
});

test('un pedido ya avisado NO se avisa dos veces (dos pantallas marcando a la vez)', async () => {
  const h = await montar();
  try {
    await h.listo();
    await h.listo();
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 1);
    assert.ok(h.metrics.some(([n, l]) => n === 'aviso_pedido.descartado.total' && l && l.razon === 'duplicado'));
  } finally { await h.cerrar(); }
});

test('un pedido de MESA no se avisa: lo sirve el camarero', async () => {
  const h = await montar({ cuenta: makeCuenta({ modo_consumo: 'mesa' }) });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 0);
    assert.ok(h.metrics.some(([n, l]) => n === 'aviso_pedido.descartado.total' && l && l.razon === 'pedido_de_mesa'));
  } finally { await h.cerrar(); }
});

test('un pedido del POS interno (sin canal) no se avisa', async () => {
  const h = await montar({ cuenta: makeCuenta({ origen: null }) });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 0);
    assert.ok(h.metrics.some(([n, l]) => n === 'aviso_pedido.descartado.total' && l && l.razon === 'no_es_pedido_de_canal'));
  } finally { await h.cerrar(); }
});

test('sin JID ni telefono NO se inventa un destino: se declara el fallo', async () => {
  const h = await montar({ cuenta: makeCuenta({ cliente_jid: null, cliente_telefono: null }) });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 0);
    const fallo = h.eventos('aviso_pedido_listo.fallido');
    assert.strictEqual(fallo.length, 1);
    assert.strictEqual(fallo[0].data.motivo, 'sin_contacto');
  } finally { await h.cerrar(); }
});

test('el aviso sale por la MISMA cuenta del puente por la que entro el pedido', async () => {
  // Sin config en el proyecto: la cuenta la dicta el pedido (canal_cuenta).
  const h = await montar({ qr: null, cuenta: makeCuenta({ canal_cuenta: 'tienda' }) });
  try {
    await h.listo();
    assert.strictEqual(h.puente.recibidos.length, 1);
    assert.strictEqual(h.puente.recibidos[0].slug, 'tienda');
  } finally { await h.cerrar(); }
});

test('sin cuenta de puente y sin config NO se manda: el fallo se declara', async () => {
  const h = await montar({ qr: null, cuenta: makeCuenta({ canal_cuenta: null }) });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 0);
    const fallo = h.eventos('aviso_pedido_listo.fallido');
    assert.strictEqual(fallo.length, 1);
    assert.strictEqual(fallo[0].data.motivo, 'sin_cuenta_puente');
  } finally { await h.cerrar(); }
});

test('la config del proyecto puede forzar otra cuenta del puente', async () => {
  const h = await montar({ qr: { url: 'http://127.0.0.1:1/send', slug: 'forzada' }, cuenta: makeCuenta({ canal_cuenta: 'tienda' }) });
  try {
    // La url del config apunta a un puerto muerto: prueba que manda la config, no el pedido.
    await h.listo();
    const fallo = h.eventos('aviso_pedido_listo.fallido');
    assert.strictEqual(fallo.length, 1);
    assert.strictEqual(h.puente.recibidos.length, 0);
  } finally { await h.cerrar(); }
});

test('config desactivada (activo:false) tampoco manda', async () => {
  const h = await montar({ qr: { url: 'http://127.0.0.1:1/send', slug: 'x', activo: false } });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 0);
  } finally { await h.cerrar(); }
});

test('puente que rechaza (slug desconocido) NO se reintenta: fallo declarado', async () => {
  const h = await montar({ respuesta: { ok: false, error: 'slug desconocido' } });
  try {
    await h.listo();
    const fallo = h.eventos('aviso_pedido_listo.fallido');
    assert.strictEqual(fallo.length, 1);
    assert.strictEqual(fallo[0].data.motivo, 'puente_rechaza');
  } finally { await h.cerrar(); }
});

test('sesion no conectada es transitorio: reintenta y acaba enviando', async () => {
  let intentos = 0;
  const h = await montar({
    respuesta: () => {
      intentos++;
      return intentos < 3 ? { ok: false, error: 'sesion no conectada' } : { ok: true, id: 'MSG-TARDE' };
    }
  });
  try {
    await h.listo();
    assert.strictEqual(intentos, 3);
    const enviado = h.eventos('aviso_pedido_listo.enviado');
    assert.strictEqual(enviado.length, 1);
    assert.strictEqual(enviado[0].data.message_id, 'MSG-TARDE');
  } finally { await h.cerrar(); }
});

test('cuenta desaparecida: falla en voz alta, no manda a ciegas', async () => {
  const h = await montar({ cuenta: null });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 0);
    assert.ok(h.metrics.some(([n, l]) => n === 'aviso_pedido.fallido.total' && l && l.razon === 'cuenta_no_encontrada'));
  } finally { await h.cerrar(); }
});

test('evento sin cuenta_id no rompe nada (ni avisa)', async () => {
  const h = await montar();
  try {
    await h.mod.onCocinaPedidoListo({ data: { project_id: 'the-pirate' } });
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 0);
    assert.strictEqual(h.cuentasPedidas.length, 0);
  } finally { await h.cerrar(); }
});

test('el telefono es el respaldo cuando el canal no guardo JID', async () => {
  const h = await montar({ cuenta: makeCuenta({ cliente_jid: null, cliente_telefono: '34111222333' }) });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 1);
  } finally { await h.cerrar(); }
});

test('la ref se saca del turno si la cuenta no trae ref_display', async () => {
  const mod = new AvisoPedidoListo();
  assert.strictEqual(mod._refCorta({ turno: 42, tipo: 'llevar' }, {}), 'L 042');
  assert.strictEqual(mod._refCorta({ ref_display: 'pepe L 007' }, {}), 'L 007');
  assert.strictEqual(mod._refCorta({ turno: 9, tipo: 'mesa' }, {}), 'M 009');
});

test('la cuenta VIVA de cuentas (id + metadata, sin datos_especificos) se avisa', async () => {
  // Copia literal de una cuenta real del the-pirate (persistencia/current/eventos.json,
  // cuenta.creada del pedido L 395): no tiene `datos_especificos` por ningún lado.
  // Este es el test que faltaba: con la forma del fichero de persistencia el módulo
  // "pasaba" los tests y en producción no avisaba a nadie.
  const cuentaReal = {
    id: 'llevar_4849f0b2',
    project_id: 'the-pirate',
    turno: 395,
    tipo: 'llevar',
    nombre: 'francisco sanchez',
    ref_display: 'francisco sanchez L 395',
    estado: 'listo',
    pagado: false,
    hora: '18:36',
    items: 1,
    total: 10.5,
    alerta: false,
    metadata: {
      origen: 'tienda',
      canal_origen: 'web',
      modo_consumo: 'recoger',
      hora_recogida: null,
      cliente_nombre: 'francisco sanchez',
      cliente_telefono: null,
      cliente_jid: '191624311222342@lid',
      canal_cuenta: 'the-pirate',
      pedido_tienda_id: '237f211c-aa70-48b8-885a-10524e58b4fc',
      cerrar_al_cobrar: true
    },
    created_at: '2026-11-05T18:36:52.428Z',
    updated_at: '2026-11-05T18:36:52.428Z'
  };
  const h = await montar({ cuenta: cuentaReal });
  try {
    await h.listo({ cuenta_id: 'llevar_4849f0b2' });
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 1, 'la cuenta real tiene que avisar');
    assert.strictEqual(h.puente.recibidos[0].to, '191624311222342@lid', 'y al LID, no a un móvil inventado');
    assert.match(h.puente.recibidos[0].text, /L 395/);
  } finally { await h.cerrar(); }
});

test('una cuenta vieja restaurada (datos_especificos) también se entiende', async () => {
  const vieja = { id: 'llevar_abc123', tipo: 'llevar', turno: 395, ref_display: 'pepe L 395',
    datos_especificos: { origen: 'tienda', cliente_jid: '34111222333@s.whatsapp.net', canal_cuenta: 'the-pirate' } };
  const h = await montar({ cuenta: vieja });
  try {
    await h.listo();
    assert.strictEqual(h.eventos('aviso_pedido_listo.enviado').length, 1);
  } finally { await h.cerrar(); }
});

// ==========================================
// Runner
// ==========================================

(async function run() {
  let passed = 0;
  const failures = [];
  for (const { name, fn } of tests) {
    try {
      await fn();
      console.log('✓', name);
      passed++;
    } catch (err) {
      console.error('✗', name);
      console.error(' ', err.message);
      if (process.env.STACK) console.error(err.stack);
      failures.push({ name, err });
    }
  }
  console.log(`\n${passed}/${tests.length} passed`);
  if (failures.length > 0) process.exit(1);
})();
