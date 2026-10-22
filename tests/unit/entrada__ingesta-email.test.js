/**
 * Tests unitarios — canal GMAIL de `ingesta-documental`.
 *
 * Fija el contrato del canal correo: los ADJUNTOS de Gmail entran como documentos del
 * proyecto (no el cuerpo del correo), se guardan en el buzón del storage y se entregan al
 * puerto digital con fuente 'gmail'. Y fija los dos fallos que importan en producción:
 * credenciales caducadas (invalid_grant → 401, no un 500 opaco) y adjuntos que la cadena
 * no sabe leer (se declaran ignorados, no se ingieren a ciegas).
 *
 * Ejecutar: node tests/unit/entrada__ingesta-email.test.js
 */

'use strict';

const assert = require('assert');
const Modulo = require('../../modules/contabilidad-entrada/ingesta-documental/index.js');

// Bus falso que habla request/response de verdad (correlación por request_id).
function busFalso(respuestas) {
  const publicados = [];
  const subs = new Map();
  return {
    publicados,
    subscribe(ev, fn) {
      if (!subs.has(ev)) subs.set(ev, []);
      subs.get(ev).push(fn);
      return () => {};
    },
    async publish(ev, payload) {
      publicados.push({ ev, payload });
      // Todo evento se NOTIFICA a sus suscriptores (aunque no tenga respuesta configurada):
      // así el test puede observar las entregas al puerto digital.
      for (const fn of (subs.get(ev) || [])) setImmediate(() => fn({ event_type: ev, data: payload }));
      const resp = respuestas[ev.split('.request')[0]];
      const respuestaEv = ev.endsWith('.request') ? ev.replace(/\.request$/, '.response') : null;
      if (!respuestaEv || resp === undefined) return;   // sin respuesta: simula servicio ausente
      const datos = typeof resp === 'function' ? await resp(payload) : resp;
      if (datos === undefined) return;
      setImmediate(() => {
        for (const fn of (subs.get(respuestaEv) || [])) {
          fn({ event_type: respuestaEv, data: { request_id: payload.request_id, ...datos } });
        }
      });
    },
  };
}

const PDF_B64 = Buffer.from('%PDF-1.4\n1 0 obj<</Type/Catalog>>endobj\ntrailer<</Root 1 0 R>>\n%%EOF\n').toString('base64');

function montar(respuestas) {
  const bus = busFalso(respuestas);
  const m = new Modulo();
  m.eventBus = bus;
  m.logger = { info() {}, warn() {}, error() {}, debug() {} };
  m.config = { ...m.config, cuenta_email: 'Nonina', timeout_proyecto_ms: 300, timeout_gmail_ms: 300 };
  m._entregados = new Set();
  return { m, bus };
}

const tick = () => new Promise((r) => setImmediate(r));

function capturarEntregas(bus) {
  const entregas = [];
  bus.subscribe('puerto-documento-digital.recibir.request', (e) => {
    entregas.push((e && e.data) || e);
  });
  return entregas;
}

(async () => {
  // ── 1 · dos correos, tres adjuntos (pdf soportado + zip no soportado) → 1 entrega ──
  {
    const escritos = [];
    const { m, bus } = montar({
      'local.gmail.search': { messages: [{ id: 'msg-1' }, { id: 'msg-2' }] },
      'local.gmail.read': (p) => (p.messageId === 'msg-1'
        ? {
            id: 'msg-1', from: 'proveedor@horno.es', subject: 'Factura octubre',
            attachments: [
              { id: 'att-1', filename: 'factura-octubre.pdf', mimeType: 'application/pdf', size: 100 },
              { id: 'att-2', filename: 'datos.zip', mimeType: 'application/zip', size: 10 },
            ],
          }
        : { id: 'msg-2', attachments: [] }),
      'local.gmail.attachments.download': { content: PDF_B64, size: 70 },
      'fs.write': (p) => { escritos.push(p); return { written: true }; },
    });
    const entregas = capturarEntregas(bus);

    const res = await m._barrerEmail({ project_id: 'p1' });

    assert.strictEqual(res.status, 200, `status ${res.status}`);
    assert.strictEqual(res.data.fuente, 'gmail');
    assert.strictEqual(res.data.entregados.length, 1, 'solo el PDF es ingerible');
    assert.strictEqual(res.data.ignorados.length, 1);
    assert.strictEqual(res.data.ignorados[0].motivo, 'adjunto_no_soportado');
    assert.strictEqual(escritos.length, 1, 'el adjunto se guarda en el storage del proyecto');
    assert.ok(escritos[0].path.startsWith('inbox/email-msg-1-'), `path: ${escritos[0].path}`);
    assert.strictEqual(escritos[0].encoding, 'base64');
    await tick();
    assert.strictEqual(entregas.length, 1);
    assert.strictEqual(entregas[0].fuente, 'gmail');
    assert.strictEqual(entregas[0].documento.mime, 'application/pdf');
    assert.strictEqual(entregas[0].documento.mensaje_id, 'msg-1');
    assert.strictEqual(entregas[0].documento.remitente, 'proveedor@horno.es');
    assert.ok(/^[a-f0-9]{64}$/.test(entregas[0].documento.sha256), 'sha256 de evidencia');
  }

  // ── 2 · segunda pasada: el mismo adjunto NO se entrega otra vez ──
  {
    const { m, bus } = montar({
      'local.gmail.search': { messages: [{ id: 'msg-1' }] },
      'local.gmail.read': {
        id: 'msg-1',
        attachments: [{ id: 'att-1', filename: 'factura.pdf', mimeType: 'application/pdf' }],
      },
      'local.gmail.attachments.download': { content: PDF_B64 },
      'fs.write': { written: true },
    });
    await m._barrerEmail({ project_id: 'p1' });
    const segunda = await m._barrerEmail({ project_id: 'p1' });
    assert.strictEqual(segunda.data.entregados.length, 0);
    assert.strictEqual(segunda.data.ignorados[0].motivo, 'duplicado_sha256');
  }

  // ── 3 · credenciales caducadas (invalid_grant) → 401 GMAIL_NO_AUTORIZADO, no 500 ──
  {
    const { m } = montar({
      'local.gmail.search': { error: { message: 'HTTP 400: {"error":"invalid_grant"}' } },
    });
    const res = await m._barrerEmail({ project_id: 'p1' });
    assert.strictEqual(res.status, 401);
    assert.strictEqual(res.error.code, 'GMAIL_NO_AUTORIZADO');
    assert.ok(/OAuth|reautorizar/i.test(res.error.message));
  }

  // ── 4 · servicio Gmail ausente (sin respuesta) → 502 GMAIL_NO_DISPONIBLE ──
  {
    const { m } = montar({});   // nadie responde
    const res = await m._barrerEmail({ project_id: 'p1' });
    assert.strictEqual(res.status, 502);
    assert.strictEqual(res.error.code, 'GMAIL_NO_DISPONIBLE');
  }

  // ── 5 · sin project_id → 400 y no se toca Gmail ──
  {
    const { m } = montar({});
    const res = await m._barrerEmail({});
    assert.strictEqual(res.status, 400);
  }


  // ── 6 · sin project_id pero UN solo proyecto activo → lo resuelve solo ──
  {
    const { m, bus } = montar({
      'project.list': { status: 200, data: { active_project_ids: ['p-unico'] } },
      'local.gmail.search': { messages: [{ id: 'msg-9' }] },
      'local.gmail.read': {
        id: 'msg-9',
        attachments: [{ id: 'att-9', filename: 'albaran.pdf', mimeType: 'application/pdf' }],
      },
      'local.gmail.attachments.download': { content: PDF_B64 },
      'fs.write': { written: true },
    });
    const entregas = capturarEntregas(bus);
    const res = await m._barrerEmail({});   // sin project_id: la ley resuelve
    assert.strictEqual(res.status, 200, JSON.stringify(res));
    assert.strictEqual(res.data.project_id, 'p-unico');
    await tick();
    assert.strictEqual(entregas[0].project_id, 'p-unico');
  }

  // ── 7 · sin project_id y VARIOS activos → 400 PROYECTO_NO_RESUELTO (no se adivina) ──
  {
    const { m } = montar({
      'project.list': { status: 200, data: { active_project_ids: ['p1', 'p2', 'p3'] } },
    });
    const res = await m._barrerEmail({});
    assert.strictEqual(res.status, 400);
    assert.strictEqual(res.error.code, 'PROYECTO_NO_RESUELTO');
    assert.ok(res.error.details.ambiguo === 3 || /3 proyectos activos/.test(res.error.message));
  }

  // ── 8 · Telegram: el proyecto lo trae el BRIDGE (botName→project_id), sin config ──
  {
    const os = require('os');
    const fsp = require('fs');
    const tmp = fsp.mkdtempSync(require('path').join(os.tmpdir(), 'ingesta-tg-'));
    const fichero = require('path').join(tmp, 'foto.jpg');
    fsp.writeFileSync(fichero, Buffer.from('JPEG-falso-de-prueba'));

    const { m, bus } = montar({
      'telegram.bridge.listar': {
        status: 200,
        data: { total: 1, vinculos: [{ botName: 'Despacho_pan_bot', project_id: 'p-bot', chats: 1 }] },
      },
      'telegram.get_file': { status: 200, data: { localPath: fichero, fileSize: 20 } },
      'fs.write': { written: true },
    });
    m.config.vinculos = {};                       // NADA declarado por proyecto
    const entregas = capturarEntregas(bus);

    await m.onTelegramPhotoReceived({
      data: { botName: 'Despacho_pan_bot', fileId: 'f-1', messageId: 7, mimeType: 'image/jpeg' },
    });

    await tick();
    assert.strictEqual(entregas.length, 1, 'la foto debe entregarse resolviendo el proyecto por el bridge');
    assert.strictEqual(entregas[0].project_id, 'p-bot');
    assert.strictEqual(entregas[0].fuente, 'telegram');
    fsp.rmSync(tmp, { recursive: true, force: true });
  }

  console.log('OK · ingesta-documental (canal gmail + resolucion de proyecto): 8/8');
  process.exit(0);
})().catch((err) => {
  console.error('FALLO:', err.message);
  process.exit(1);
});
