'use strict';

/**
 * entrada__ingesta-documental — el módulo es SOLO el cableado de canales: convierte
 * "hay un fichero" en "hay un documento recibido" y nada más. Lo que se comprueba aquí
 * es exactamente lo que puede romper la vertical:
 *   1. `barrer` entrega lo nuevo UNA vez (N eventos al puerto con fuente='carpeta') y en
 *      la segunda pasada NO entrega nada (idempotencia por sha256 en memoria).
 *   2. lo no soportado / ilegible NO se entrega: va a `ignorados` con motivo.
 *   3. un `telegram.photo.received` SIN vínculo bot→proyecto NO entrega nada (el proyecto
 *      no se adivina) y con vínculo sí: get_file → tmp → fs.write → puerto, y el tmp se borra.
 *
 * Sin framework (assert + node puro). Ejecutar:
 *   node tests/unit/entrada__ingesta-documental.test.js
 */

const assert = require('assert');
const crypto = require('crypto');
const fs = require('fs');
const os = require('os');
const path = require('path');

const IngestaDocumental = require('../../modules/contabilidad-entrada/ingesta-documental');

const PID = 'proj-test';
const EVENTO_PUERTO = 'puerto-documento-digital.recibir.request';

// ── Arnés: bus falso que SÍ habla request/response (para ejercitar _rpc de verdad) ──
function busFalso() {
  const published = [];
  const subs = [];
  const respondedores = new Map();

  const bus = {
    published,
    respond(evento, fn) { respondedores.set(evento, fn); },
    subscribe(evento, cb) {
      const s = { evento, cb };
      subs.push(s);
      return () => { const i = subs.indexOf(s); if (i >= 0) subs.splice(i, 1); };
    },
    publish(evento, payload) {
      published.push({ topic: evento, payload });
      const responder = respondedores.get(evento);
      if (!responder) return;
      const respEvento = evento.endsWith('.request')
        ? evento.slice(0, -'.request'.length) + '.response'
        : evento + '.response';
      // Asíncrono: el `_rpc` ya se ha suscrito antes de publicar (como en el bus real).
      Promise.resolve().then(async () => {
        const resp = await responder(payload || {});
        if (!resp) return;
        for (const s of [...subs]) {
          if (s.evento !== respEvento) continue;
          s.cb({ data: { request_id: (payload || {}).request_id, ...resp } });
        }
      });
    }
  };
  bus.eventos = (topic) => published.filter((p) => p.topic === topic);
  return bus;
}

// Storage falso del proyecto: path relativo → Buffer.
function storageFalso() {
  const files = new Map();
  return {
    files,
    put(ruta, buf) { files.set(ruta, Buffer.from(buf)); },
    dirs: new Set()
  };
}

function nuevo({ vinculos = {}, storage } = {}) {
  const store = storage || storageFalso();
  const bus = busFalso();

  // fs.list: un nivel; si la carpeta no existe → error RESOURCE_NOT_FOUND (forma real).
  bus.respond('fs.list.request', ({ path: carpeta }) => {
    const base = String(carpeta || '').replace(/\/+$/, '');
    const prefijo = `${base}/`;
    const nombres = new Set();
    for (const k of store.files.keys()) {
      if (!k.startsWith(prefijo)) continue;
      const resto = k.slice(prefijo.length);
      if (!resto || resto.includes('/')) continue;
      nombres.add(resto);
    }
    const hijos = [...store.files.keys()].some((k) => k.startsWith(prefijo));
    if (!hijos && !store.dirs.has(base)) {
      return { error: { code: 'RESOURCE_NOT_FOUND', message: 'Directory not found' } };
    }
    const files = [...nombres].sort().map((name) => {
      const buf = store.files.get(prefijo + name);
      return {
        name,
        type: 'file',
        size: buf.length,
        modified: new Date(0),
        path: prefijo + name,
        extension: path.extname(name).toLowerCase()
      };
    });
    return { path: carpeta, files, items: files, count: files.length };
  });

  // fs.read: base64 como el módulo real para binarios.
  bus.respond('fs.read.request', ({ path: ruta }) => {
    if (!store.files.has(ruta)) return { error: { code: 'RESOURCE_NOT_FOUND', message: 'File not found' } };
    const buf = store.files.get(ruta);
    return {
      path: ruta, content: buf.toString('base64'), encoding: 'base64',
      size: buf.length, type: 'binary'
    };
  });

  // fs.write: deja los bytes en el storage del proyecto.
  bus.respond('fs.write.request', ({ path: ruta, content }) => {
    store.files.set(ruta, Buffer.from(String(content || ''), 'base64'));
    return { path: ruta, size: store.files.get(ruta).length };
  });

  const descargas = [];
  // telegram.get_file: el servicio descarga en el HOST (ruta absoluta), no en el storage.
  bus.respond('telegram.get_file.request', async (p) => {
    descargas.push(p);
    const bytes = Buffer.from('%PDF-1.4 ticket de prueba', 'utf-8');
    await fs.promises.writeFile(p.destPath, bytes);
    return {
      status: 200,
      data: {
        fileId: p.fileId,
        filePath: `photos/${p.fileId}.jpg`,
        fileSize: bytes.length,
        downloadUrl: 'https://api.telegram.org/file/bot/file',
        localPath: p.destPath
      }
    };
  });

  const modulo = new IngestaDocumental();
  modulo.logger = { info() {}, warn() {}, error() {}, debug() {} };
  modulo.metrics = { increment() {} };
  modulo.eventBus = bus;
  modulo.config = {
    ...modulo.config,
    tmp_dir: os.tmpdir(),
    vinculos: { ...vinculos }
  };

  return { modulo, bus, store, descargas };
}

const sha = (buf) => crypto.createHash('sha256').update(buf).digest('hex');

const tests = [];
const test = (name, fn) => tests.push({ name, fn });

// ══════════════════════════════════════════════════════════════════════
// barrer
// ══════════════════════════════════════════════════════════════════════
test('barrer sin project_id → 400 INVALID_INPUT y .failed publicado', async () => {
  const { modulo, bus } = nuevo();
  const res = await modulo.onBarrerRequest({ data: { request_id: 'r-400' } });
  assert.strictEqual(res.status, 400);
  assert.strictEqual(res.error.code, 'INVALID_INPUT');
  assert.ok(res.error.details.field === 'project_id', 'declara el campo que falta');
  assert.strictEqual(bus.eventos('ingesta-documental.barrer.failed').length, 1, 'publica el par de fallo');
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 0, 'no entrega nada');
});

test('barrer con carpeta inexistente → 404 (no se entrega nada)', async () => {
  const { modulo, bus } = nuevo();
  const res = await modulo.onBarrerRequest({ data: { request_id: 'r-404', project_id: PID, carpeta: 'vacia/' } });
  assert.strictEqual(res.status, 404);
  assert.strictEqual(res.error.code, 'RESOURCE_NOT_FOUND');
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 0);
});

test('barrer entrega N documentos nuevos con fuente=carpeta e ignora el resto con motivo', async () => {
  const storage = storageFalso();
  const pdf = Buffer.from('%PDF-1.4 factura 2026/001');
  const jpg = Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x00, 0x10, 0x4a, 0x46]);
  const txt = Buffer.from('esto no es un documento de entrada');
  storage.put('inbox/factura.pdf', pdf);
  storage.put('inbox/ticket.jpg', jpg);
  storage.put('inbox/notas.txt', txt);

  const { modulo, bus } = nuevo({ storage });
  const res = await modulo.onBarrerRequest({ data: { request_id: 'r-b1', project_id: PID } });

  assert.strictEqual(res.status, 200, 'la pasada termina bien');
  assert.strictEqual(res.data.project_id, PID);
  assert.strictEqual(res.data.carpeta, 'inbox/', 'carpeta por defecto: inbox/');

  const entregas = bus.eventos(EVENTO_PUERTO);
  assert.strictEqual(entregas.length, 2, 'entrega los 2 ficheros soportados (N=2)');
  assert.strictEqual(res.data.entregados.length, 2);
  for (const e of entregas) {
    assert.strictEqual(e.payload.fuente, 'carpeta', "fuente='carpeta'");
    assert.strictEqual(e.payload.project_id, PID);
    assert.ok(e.payload.request_id, 'cada entrega lleva su request_id nuevo');
    assert.ok(e.payload.documento.sha256, 'el documento viaja con sha256');
  }
  assert.deepStrictEqual(
    entregas.map((e) => e.payload.documento.path).sort(),
    ['inbox/factura.pdf', 'inbox/ticket.jpg']
  );
  const pdfEntrega = entregas.find((e) => e.payload.documento.path === 'inbox/factura.pdf').payload.documento;
  assert.strictEqual(pdfEntrega.sha256, sha(pdf), 'sha256 del contenido real');
  assert.strictEqual(pdfEntrega.mime, 'application/pdf');
  assert.strictEqual(pdfEntrega.nombre, 'factura.pdf');

  // Lo no soportado se declara con motivo (no se entrega en silencio ni se inventa).
  const ign = res.data.ignorados.find((i) => i.path === 'inbox/notas.txt');
  assert.ok(ign, 'el .txt aparece en ignorados');
  assert.strictEqual(ign.motivo, 'extension_no_soportada');
  assert.strictEqual(res.data.ignorados.length, 1);
});

test('barrer es IDEMPOTENTE: la segunda pasada no entrega ninguno', async () => {
  const storage = storageFalso();
  storage.put('inbox/factura.pdf', Buffer.from('%PDF-1.4 factura 2026/001'));
  storage.put('inbox/ticket.jpg', Buffer.from([0xff, 0xd8, 0xff, 0xe0, 0x01, 0x02]));

  const { modulo, bus } = nuevo({ storage });
  await modulo.onBarrerRequest({ data: { request_id: 'r-i1', project_id: PID } });
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 2, 'primera pasada: N=2');

  const res2 = await modulo.onBarrerRequest({ data: { request_id: 'r-i2', project_id: PID } });
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 2, 'segunda pasada: sin entregas nuevas');
  assert.strictEqual(res2.data.entregados.length, 0);
  assert.strictEqual(res2.data.ignorados.length, 2);
  for (const i of res2.data.ignorados) {
    assert.strictEqual(i.motivo, 'duplicado_sha256', 'el motivo es explícito');
  }

  // Un fichero NUEVO en la misma carpeta sí entra en la segunda pasada.
  storage.put('inbox/albaran.pdf', Buffer.from('%PDF-1.4 albaran 2026/007'));
  const res3 = await modulo.onBarrerRequest({ data: { request_id: 'r-i3', project_id: PID } });
  assert.strictEqual(res3.data.entregados.length, 1, 'solo el nuevo');
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 3);
});

// ══════════════════════════════════════════════════════════════════════
// entregar
// ══════════════════════════════════════════════════════════════════════
test('entregar entrega un documento concreto del storage y es idempotente', async () => {
  const storage = storageFalso();
  storage.put('compras/2026/f-042.pdf', Buffer.from('%PDF-1.4 factura 42'));

  const { modulo, bus } = nuevo({ storage });
  const res = await modulo.onEntregarRequest({
    data: { request_id: 'r-e1', project_id: PID, path: 'compras/2026/f-042.pdf' }
  });
  assert.strictEqual(res.status, 200);
  assert.strictEqual(res.data.entregados.length, 1);
  assert.strictEqual(res.data.entregados[0].path, 'compras/2026/f-042.pdf');

  const entregas = bus.eventos(EVENTO_PUERTO);
  assert.strictEqual(entregas.length, 1);
  assert.strictEqual(entregas[0].payload.fuente, 'carpeta', 'fuente por defecto: carpeta');
  assert.strictEqual(entregas[0].payload.documento.mime, 'application/pdf');
  assert.strictEqual(entregas[0].payload.documento.nombre, 'f-042.pdf');

  const res2 = await modulo.onEntregarRequest({
    data: { request_id: 'r-e2', project_id: PID, path: 'compras/2026/f-042.pdf' }
  });
  assert.strictEqual(res2.status, 200);
  assert.strictEqual(res2.data.entregados.length, 0);
  assert.strictEqual(res2.data.ignorados[0].motivo, 'duplicado_sha256');
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 1, 'no se entrega dos veces');
});

test('entregar: sin path → 400 · extensión no soportada → 415 · ilegible → 404', async () => {
  const storage = storageFalso();
  storage.put('inbox/notas.txt', Buffer.from('hola'));
  const { modulo, bus } = nuevo({ storage });

  const sinPath = await modulo.onEntregarRequest({ data: { request_id: 'r-x1', project_id: PID } });
  assert.strictEqual(sinPath.status, 400);
  assert.strictEqual(sinPath.error.details.field, 'path');

  const noSoportado = await modulo.onEntregarRequest({
    data: { request_id: 'r-x2', project_id: PID, path: 'inbox/notas.txt' }
  });
  assert.strictEqual(noSoportado.status, 415);
  assert.strictEqual(noSoportado.error.code, 'FORMATO_NO_SOPORTADO');

  const ilegible = await modulo.onEntregarRequest({
    data: { request_id: 'r-x3', project_id: PID, path: 'inbox/no-existe.pdf' }
  });
  assert.strictEqual(ilegible.status, 404);
  assert.strictEqual(ilegible.error.code, 'RESOURCE_NOT_FOUND');

  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 0, 'nada se entrega');
  assert.strictEqual(bus.eventos('ingesta-documental.entregar.failed').length, 3);
});

// ══════════════════════════════════════════════════════════════════════
// canal Telegram
// ══════════════════════════════════════════════════════════════════════
test('telegram.photo.received SIN vinculos → NO entrega nada (el proyecto no se adivina)', async () => {
  const { modulo, bus, descargas } = nuevo({ vinculos: {} });
  const res = await modulo.onTelegramPhotoReceived({
    data: {
      botName: 'bot-sin-vinculo', chatId: 42, messageId: 7, from: { id: 42 },
      fileId: 'FILE_1', fileSize: 1234, width: 800, height: 600,
      mimeType: 'image/jpeg', caption: 'factura de luz', sizes: []
    }
  });
  assert.strictEqual(res, null, 'se ignora');
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 0, 'no se entrega al puerto');
  assert.strictEqual(descargas.length, 0, 'ni siquiera se descarga el fichero');
  assert.strictEqual(bus.eventos('fs.write.request').length, 0, 'no se escribe en ningún proyecto');
});

test('telegram.photo.received CON vinculo → descarga, sube al storage, borra el tmp y entrega', async () => {
  const { modulo, bus, store, descargas } = nuevo({ vinculos: { 'bot-panaderia': PID } });
  const res = await modulo.onTelegramPhotoReceived({
    data: {
      botName: 'bot-panaderia', chatId: 42, messageId: 7, from: { id: 42 },
      fileId: 'FILE_1', fileSize: 1234, width: 800, height: 600,
      mimeType: 'image/jpeg', caption: 'ignorame', sizes: []
    }
  });
  assert.ok(res && res.path, 'devuelve la entrega');

  // get_file con destPath ABSOLUTO del host (no del storage del proyecto).
  assert.strictEqual(descargas.length, 1);
  assert.ok(path.isAbsolute(descargas[0].destPath), 'destPath absoluto del host');
  assert.strictEqual(descargas[0].download, true);
  assert.ok(!fs.existsSync(descargas[0].destPath), 'el tmp se borra después');

  // Los bytes acaban en el storage del proyecto bajo inbox/<messageId>-<fileId>.<ext>.
  const ruta = 'inbox/7-FILE_1.jpg';
  assert.ok(store.files.has(ruta), `sube el fichero a ${ruta}`);
  assert.strictEqual(res.path, ruta);

  const entregas = bus.eventos(EVENTO_PUERTO);
  assert.strictEqual(entregas.length, 1);
  assert.strictEqual(entregas[0].payload.fuente, 'telegram');
  assert.strictEqual(entregas[0].payload.project_id, PID, 'el proyecto sale del vínculo');
  assert.strictEqual(entregas[0].payload.documento.path, ruta);
  assert.strictEqual(entregas[0].payload.documento.sha256, sha(store.files.get(ruta)));
  assert.strictEqual(entregas[0].payload.documento.mime, 'image/jpeg');

  // Mismo fichero otra vez → idempotente.
  await modulo.onTelegramPhotoReceived({
    data: { botName: 'bot-panaderia', messageId: 7, fileId: 'FILE_1', mimeType: 'image/jpeg' }
  });
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 1, 'no se entrega dos veces el mismo contenido');
});

test('telegram.document.received CON vinculo → entrega el PDF; formato no soportado se ignora', async () => {
  const { modulo, bus, store } = nuevo({ vinculos: { 'bot-panaderia': PID } });
  await modulo.onTelegramDocumentReceived({
    data: {
      botName: 'bot-panaderia', chatId: 42, messageId: 9, fileId: 'DOC_2',
      fileName: 'factura-2026-07.pdf', mimeType: 'application/pdf', fileSize: 2048, caption: null
    }
  });
  const entregas = bus.eventos(EVENTO_PUERTO);
  assert.strictEqual(entregas.length, 1);
  assert.strictEqual(entregas[0].payload.documento.path, 'inbox/9-DOC_2.pdf');
  assert.strictEqual(entregas[0].payload.documento.mime, 'application/pdf');
  assert.strictEqual(entregas[0].payload.documento.nombre, 'factura-2026-07.pdf');
  assert.ok(store.files.has('inbox/9-DOC_2.pdf'));

  const res = await modulo.onTelegramDocumentReceived({
    data: {
      botName: 'bot-panaderia', chatId: 42, messageId: 10, fileId: 'DOC_3',
      fileName: 'presupuesto.docx', mimeType: 'application/msword'
    }
  });
  assert.strictEqual(res, null);
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 1, 'el formato no soportado no se entrega');

  // Sin nombre ni mime no hay extensión deducible: no se inventa un tipo.
  const sinExt = await modulo.onTelegramDocumentReceived({
    data: { botName: 'bot-panaderia', chatId: 42, messageId: 11, fileId: 'DOC_4' }
  });
  assert.strictEqual(sinExt, null);
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 1, 'sin extensión no se entrega');
});

// ══════════════════════════════════════════════════════════════════════
// contrato declarado
// ══════════════════════════════════════════════════════════════════════
test('onLoad mezcla config: manifest (moduleConfig) y sitio (config[<mod>]) — el sitio manda', async () => {
  const storage = storageFalso();
  storage.put('buzon/albaran.pdf', Buffer.from('%PDF-1.4 albaran 1'));
  const { modulo, bus } = nuevo({ storage });

  await modulo.onLoad({
    logger: modulo.logger,
    eventBus: bus,
    metrics: modulo.metrics,
    moduleConfig: { carpeta_default: 'compras/', vinculos: { 'bot-manifest': 'p-manifest' } },
    config: { 'ingesta-documental': { carpeta_default: 'buzon/', vinculos: { 'bot-sitio': 'p-sitio' } } }
  });

  assert.strictEqual(modulo.config.carpeta_default, 'buzon/', 'el sitio pisa al manifest');
  assert.deepStrictEqual(modulo.config.vinculos, { 'bot-manifest': 'p-manifest', 'bot-sitio': 'p-sitio' },
    'los vínculos se MEZCLAN (no se borran los del manifest)');

  const res = await modulo.onBarrerRequest({ data: { request_id: 'r-cfg', project_id: PID } });
  assert.strictEqual(res.data.carpeta, 'buzon/', 'barrer usa la carpeta declarada');
  assert.strictEqual(bus.eventos(EVENTO_PUERTO).length, 1);
});

test('module.json: ops ORDEN con ui_handlers y publica SOLO lo declarado', async () => {
  const man = require('../../modules/contabilidad-entrada/ingesta-documental/module.json');
  assert.strictEqual(man.name, 'ingesta-documental');
  const eventos = man.subscribes.map((s) => s.event);
  assert.ok(eventos.includes('ingesta-documental.barrer.request'));
  assert.ok(eventos.includes('ingesta-documental.entregar.request'));
  assert.ok(eventos.includes('telegram.photo.received'));
  assert.ok(eventos.includes('telegram.document.received'));

  const publica = man.publishes.map((p) => p.event);
  assert.ok(publica.includes(EVENTO_PUERTO));
  assert.strictEqual(man.ui_handlers.length, 2, 'las dos ops son ORDEN → ui_handler');
  assert.deepStrictEqual(man.ui_handlers.map((u) => u.action).sort(),
    ['ingesta-documental.barrer', 'ingesta-documental.entregar']);
});

// ══════════════════════════════════════════════════════════════════════
// runner
// ══════════════════════════════════════════════════════════════════════
(async () => {
  let ok = 0;
  const fallos = [];
  for (const t of tests) {
    try {
      await t.fn();
      ok += 1;
      console.log(`  ok  ${t.name}`);
    } catch (err) {
      fallos.push({ name: t.name, err });
      console.log(`  FAIL ${t.name}\n       ${err.message}`);
    }
  }
  console.log(`\n${ok}/${tests.length} pruebas en verde`);
  if (fallos.length) {
    console.log('\nFallos:');
    for (const f of fallos) console.log(`- ${f.name}\n${f.err.stack}`);
    process.exitCode = 1;
  }
})();
