'use strict';

/**
 * portero-whatsapp — EL ACOPLE.
 *
 * No se prueba el bot (ya existe: puente Rust). Se prueba que el mensaje que ya llega
 * por el bus se contesta con el portero y se devuelve al puente, sin duplicar, sin
 * pisar a confirmacion-pedido y sin inventar cuando algo falla.
 *
 * Ejecutar: node tests/unit/pizzepos__portero-whatsapp.test.js
 */

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const PorteroWhatsapp = require('../../modules/pizzepos/portero-whatsapp');

const tests = [];
function test(name, fn) { tests.push({ name, fn }); }

const JID = '34600111222@s.whatsapp.net';

function nuevo() {
  const m = new PorteroWhatsapp();
  m.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  m.metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  const eventos = [];
  m.eventBus = { publish: async (n, p) => eventos.push([n, p]) };
  m.eventos = eventos;
  m.config = { proyectos: { 'the-pirate': { activado: true } } };
  m._configProyecto = async () => ({ whatsapp_qr: { activo: true, url: 'http://puente/send', slug: 'the-pirate' } });
  m.mqttRequest = async () => ({
    status: 200,
    data: { cuentas: [{ id: 'llevar_1', estado: 'abierta', datos_especificos: { telefono: '+34600111222' } }] }
  });
  return m;
}

function stubFetch({ porteroOk = true, texto = 'Mijael, tu pedido está en cocina.', puenteOk = true } = {}) {
  const calls = [];
  global.fetch = async (url, opts) => {
    const body = JSON.parse(opts.body || '{}');
    calls.push({ url: String(url), body });
    if (String(url).includes('/modules/portero/chat')) {
      if (!porteroOk) return { ok: false, status: 500, text: async () => '' };
      const sse = 'event: token\ndata: ' + JSON.stringify({ t: texto }) + '\n\n' +
                  'event: fin\ndata: ' + JSON.stringify({ intencion: 'estado_pedido', resuelto: true }) + '\n\n';
      return { ok: true, status: 200, text: async () => sse };
    }
    return { ok: true, status: 200, json: async () => ({ ok: puenteOk, id: 'msg-1' }) };
  };
  return calls;
}

const mensaje = (extra = {}) => ({ data: {
  project_slug: 'the-pirate', from: JID, text: '¿cómo va mi pedido?', message_id: 'm-1', ...extra
} });

test('contesta: pregunta al portero con la cuenta del teléfono y envía al puente', async () => {
  const m = nuevo(); const calls = stubFetch();
  await m.onWhatsappMensajeRecibido(mensaje());

  const portero = calls.find(c => c.url.includes('/modules/portero/chat'));
  assert.ok(portero, 'no se llamó al portero');
  assert.strictEqual(portero.body.project_id, 'the-pirate');
  assert.strictEqual(portero.body.message, '¿cómo va mi pedido?');
  assert.strictEqual(portero.body.sesion_id, JID);
  assert.strictEqual(portero.body.cuenta_id, 'llevar_1', 'debe pasar la cuenta resuelta por teléfono');

  const envio = calls.find(c => c.url === 'http://puente/send');
  assert.ok(envio, 'no se envió la respuesta');
  assert.strictEqual(envio.body.to, JID);
  assert.strictEqual(envio.body.slug, 'the-pirate');
  assert.strictEqual(envio.body.text, 'Mijael, tu pedido está en cocina.');

  const ev = m.eventos.find(([n]) => n === 'portero.whatsapp.respondido');
  assert.ok(ev, 'no se publicó el hecho');
  assert.strictEqual(ev[1].intencion, 'estado_pedido');
  assert.strictEqual(ev[1].enviado, true);
});

test('proyecto apagado: no hace nada', async () => {
  const m = nuevo(); const calls = stubFetch();
  m.config = { proyectos: { 'the-pirate': { activado: false } } };
  await m.onWhatsappMensajeRecibido(mensaje());
  assert.strictEqual(calls.length, 0);
});

test('grupo: no contesta', async () => {
  const m = nuevo(); const calls = stubFetch();
  await m.onWhatsappMensajeRecibido(mensaje({ from: '1203630@g.us' }));
  assert.strictEqual(calls.length, 0);
});

test('mismo message_id dos veces: contesta una sola vez', async () => {
  const m = nuevo(); const calls = stubFetch();
  await m.onWhatsappMensajeRecibido(mensaje({ message_id: 'rep-1' }));
  await m.onWhatsappMensajeRecibido(mensaje({ message_id: 'rep-1' }));
  assert.strictEqual(calls.filter(c => c.url.includes('/modules/portero/chat')).length, 1);
});

test('un SÍ/NO corto es de confirmacion-pedido: no se pisa', async () => {
  const m = nuevo(); const calls = stubFetch();
  await m.onWhatsappMensajeRecibido(mensaje({ text: 'sí', message_id: 'm-si' }));
  await m.onWhatsappMensajeRecibido(mensaje({ text: 'No', message_id: 'm-no' }));
  assert.strictEqual(calls.length, 0);
});

test('una frase que empieza por "sí" SÍ se contesta', async () => {
  const m = nuevo(); const calls = stubFetch();
  await m.onWhatsappMensajeRecibido(mensaje({ text: 'sí, ¿me pongo una Nassau?', message_id: 'm-frase' }));
  assert.strictEqual(calls.filter(c => c.url.includes('/modules/portero/chat')).length, 1);
});

test('portero caído: publica fallido y NO envía nada', async () => {
  const m = nuevo(); const calls = stubFetch({ porteroOk: false });
  await m.onWhatsappMensajeRecibido(mensaje({ message_id: 'm-fallo' }));
  assert.strictEqual(calls.filter(c => c.url === 'http://puente/send').length, 0);
  const ev = m.eventos.find(([n]) => n === 'portero.whatsapp.fallido');
  assert.ok(ev, 'no se publicó el fallo');
  assert.strictEqual(ev[1].motivo, 'portero_http_500');
});

test('contrato: los eventos publicados están declarados y al revés', () => {
  const src = fs.readFileSync(path.join(__dirname, '../../modules/pizzepos/portero-whatsapp/index.js'), 'utf8');
  const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../modules/pizzepos/portero-whatsapp/module.json'), 'utf8'));
  const declarados = new Set((manifest.events?.publishes || []).map(e => e.event));
  // Los eventos pueden ir en un ternario: se recogen todos los literales del dominio.
  const publicados = new Set([...src.matchAll(/'(portero\.whatsapp\.[a-z_]+)'/g)].map(m => m[1]));
  for (const ev of publicados) assert.ok(declarados.has(ev), `evento publicado sin declarar: ${ev}`);
  for (const ev of declarados) assert.ok(publicados.has(ev), `evento declarado sin publicar: ${ev}`);
});

test('constructor: el nombre es portero-whatsapp, no el "base" de BaseModule', () => {
  const m = new PorteroWhatsapp();
  assert.strictEqual(m.name, 'portero-whatsapp', 'sin esto se lee modules_config.base y el módulo se cree apagado');
});

test('onLoad lee modules_config[portero-whatsapp] y queda activado', async () => {
  const m = new PorteroWhatsapp();
  m.logger = { info: () => {}, warn: () => {}, error: () => {}, debug: () => {} };
  m.metrics = { increment: () => {}, gauge: () => {}, timing: () => {} };
  m.eventBus = { publish: async () => {} };
  await m.onLoad({
    logger: m.logger, metrics: m.metrics, eventBus: m.eventBus,
    config: { modules_config: { 'portero-whatsapp': { proyectos: { 'the-pirate': { activado: true } } } } }
  });
  assert.strictEqual(m._cfgProyecto('the-pirate').activado, true);
});

(async () => {
  let passed = 0; const fails = [];
  for (const { name, fn } of tests) {
    try { await fn(); passed++; }
    catch (err) { fails.push({ name, err }); }
  }
  if (fails.length === 0) { console.log(`\n[portero-whatsapp] OK ${passed}/${tests.length}`); process.exit(0); }
  console.error(`\n[portero-whatsapp] FAIL ${fails.length}/${tests.length}`);
  for (const { name, err } of fails) console.error(`  x ${name}\n    ${err.message}`);
  process.exit(1);
})();
