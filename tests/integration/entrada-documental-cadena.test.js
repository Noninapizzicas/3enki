/**
 * Integración REAL de la entrada documental (sin core, sin MQTT, sin LLM).
 *
 * Monta los módulos de la cadena con el EventBus real del core y un `filesystem` simulado
 * que sirve los bytes del storage del proyecto. Luego suelta un documento por el bus y
 * comprueba que el TEXTO sale del motor OCR de verdad, que el tipo se decide y que la
 * extracción llega a cuadre con las cifras del documento.
 *
 *   puerto-documento-digital → lector-documento → clasificador-documento
 *     → extraccion-dato → control-cuadre-documento
 *
 * Ejecutar: node tests/integration/entrada-documental-cadena.test.js
 * Sale 0 solo si la cadena entera avanza y el ticket de prueba cuadra.
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');
const crypto = require('crypto');
const EventBus = require('../../core/events/bus');

const RAIZ = path.resolve(__dirname, '../..');
const MODULOS = [
  ['contabilidad-entrada', 'puerto-documento-digital'],
  ['contabilidad-entrada', 'lector-documento'],
  ['contabilidad-entrada', 'clasificador-documento'],
  ['contabilidad-entrada', 'extraccion-dato'],
  ['contabilidad-entrada', 'control-cuadre-documento'],
  ['contabilidad-entrada', 'hecho-compra'],
  ['contabilidad-libro', 'escritor-diario'],
];

const PROYECTO = 'proyecto-prueba-entrada';

// Config del SITIO (equivale a config.json → modules_config). Sin cuenta de gasto declarada,
// `hecho-compra` NO asienta (no se inventa una cuenta): es lo correcto, pero aquí el sitio la
// declara para poder verificar la partida doble de punta a punta.
const CONFIG_SITIO = { 'hecho-compra': { cuenta_gasto_default: '629' } };

function logger() {
  const noop = () => {};
  return { info: noop, warn: noop, error: noop, debug: noop };
}

// ── storage del proyecto simulado: el bus responde como lo haría `filesystem` ──────────
function montarFilesystem(bus, raizStorage, traza) {
  // El EventBus del core ENVUELVE todo en un envelope ({event_type, data, ...}): el payload
  // de verdad viaja en `d.data`. Leer `d` a pelo deja los campos en undefined (bug medido).
  const payload = (d) => (d && d.data) || d || {};
  bus.subscribe('fs.read.request', (d) => {
    const req = payload(d);
    const rel = req.path;
    const abs = path.join(raizStorage, rel);
    let content = '';
    let encoding = req.encoding || 'utf-8';
    try {
      const buf = fs.readFileSync(abs);
      content = encoding === 'base64' ? buf.toString('base64') : buf.toString('utf-8');
    } catch (err) {
      traza.push({ evento: 'fs.read.error', path: rel, error: err.message });
      bus.publish('fs.read.response', {
        request_id: req.request_id,
        error: { code: 'RESOURCE_NOT_FOUND', message: `no existe: ${rel}` }
      });
      return;
    }
    traza.push({ evento: 'fs.read', path: rel, bytes: content.length });
    bus.publish('fs.read.response', { request_id: req.request_id, path: rel, content, encoding });
  });

  bus.subscribe('fs.write.request', (d) => {
    const req = payload(d);
    const abs = path.join(raizStorage, req.path);
    try {
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      const buf = req.encoding === 'base64' ? Buffer.from(req.content, 'base64') : String(req.content);
      fs.writeFileSync(abs, buf);
      traza.push({ evento: 'fs.write', path: req.path, bytes: buf.length });
      bus.publish('fs.write.response', { request_id: req.request_id, path: req.path, written: true });
    } catch (err) {
      bus.publish('fs.write.response', { request_id: req.request_id, error: { code: 'WRITE_ERROR', message: err.message } });
    }
  });

  bus.subscribe('fs.list.request', (d) => {
    const req = payload(d);
    const abs = path.join(raizStorage, req.path || '');
    let files = [];
    try {
      files = fs.readdirSync(abs, { withFileTypes: true }).map((e) => {
        const st = fs.statSync(path.join(abs, e.name));
        return {
          name: e.name,
          type: e.isDirectory() ? 'directory' : 'file',
          size: st.size,
          modified: st.mtime,
          path: (req.path ? req.path.replace(/\/$/, '') + '/' : '') + e.name,
          extension: e.isDirectory() ? null : path.extname(e.name).toLowerCase()
        };
      });
    } catch (err) {
      bus.publish('fs.list.response', { request_id: req.request_id, error: { code: 'RESOURCE_NOT_FOUND', message: err.message } });
      return;
    }
    traza.push({ evento: 'fs.list', path: req.path, count: files.length });
    bus.publish('fs.list.response', { request_id: req.request_id, path: req.path, files, items: files, count: files.length });
  });
}

// ── carga los módulos como el loader: module.json → handler del index ──────────────────
async function cargarModulos(bus, traza) {
  const cargados = [];
  for (const [vertical, slug] of MODULOS) {
    const dir = path.join(RAIZ, 'modules', vertical, slug);
    const manifest = JSON.parse(fs.readFileSync(path.join(dir, 'module.json'), 'utf-8'));
    const Clase = require(path.join(dir, 'index.js'));
    const modulo = new Clase();
    if (typeof modulo.onLoad === 'function') {
      const moduleConfig = { ...(manifest.config || {}), ...(CONFIG_SITIO[slug] || {}) };
      await modulo.onLoad({ logger: logger(), eventBus: bus, metrics: null, moduleConfig });
    }
    for (const sub of manifest.subscribes || []) {
      const evento = typeof sub === 'string' ? sub : sub.event;
      const handler = typeof sub === 'string' ? null : sub.handler;
      if (!evento || !handler) continue;
      assert.strictEqual(typeof modulo[handler], 'function', `${slug}: handler ${handler} no existe`);
      bus.subscribe(evento, (d) => {
        traza.push({ evento: `→ ${evento}`, handler: `${slug}.${handler}` });
        try {
          return modulo[handler](d);
        } catch (err) {
          traza.push({ evento: `${slug}.${handler}.THROW`, error: err.message });
        }
      });
    }
    cargados.push({ vertical, slug, modulo, manifest });
  }
  return cargados;
}

function esperarEvento(bus, evento, timeoutMs = 60000) {
  return new Promise((resolve, reject) => {
    const t = setTimeout(() => reject(new Error(`timeout esperando ${evento}`)), timeoutMs);
    bus.subscribe(evento, (d) => { clearTimeout(t); resolve(d); });
  });
}

async function principal() {
  const bus = new EventBus({ coreId: 'test-entrada', logger: logger() });
  const traza = [];
  const storage = fs.mkdtempSync(path.join(os.tmpdir(), 'entrada-doc-'));

  // Fixture: ticket real en imagen (PNG de una columna, como una foto de móvil decente).
  const png = path.join(storage, 'inbox', 'ticket.png');
  fs.mkdirSync(path.dirname(png), { recursive: true });
  const { execFileSync } = require('child_process');
  const texto = [
    'PANADERIA EL HORNO S.L.',
    'CIF: B12345678',
    'TICKET SIMPLIFICADO',
    'N. TICKET: 2026-004512',
    'FECHA: 21/10/2026',
    'BASE IMPONIBLE: 63,60',
    'IVA 10%: 6,36',
    'TOTAL: 69,96',
  ].join('\n');
  execFileSync('convert', [
    '-size', '900x420', 'xc:white',
    '-font', 'DejaVu-Sans-Mono', '-pointsize', '26', '-fill', 'black',
    '-annotate', '+40+60', texto,
    png,
  ], { timeout: 30000 });
  assert.ok(fs.statSync(png).size > 5000, 'el fixture PNG no se generó');

  montarFilesystem(bus, storage, traza);
  const cargados = await cargarModulos(bus, traza);
  console.log('módulos cargados:', cargados.map((c) => c.slug).join(' → '));

  const esperado = {
    leido: esperarEvento(bus, 'contabilidad.documento_leido'),
    // La RESPONSE es la que lleva el esquema; el HECHO solo anuncia la clase (y se comprueba aparte).
    clasificado: esperarEvento(bus, 'clasificador-documento.clasificar.response'),
    hechoClasificado: esperarEvento(bus, 'contabilidad.documento_clasificado'),
    extraido: esperarEvento(bus, 'extraccion-dato.juzgar.response'),
    cuadre: esperarEvento(bus, 'control-cuadre-documento.cuadra.response'),
    compuesto: esperarEvento(bus, 'hecho-compra.componer.response'),
    asentado: esperarEvento(bus, 'contabilidad.asiento_asentado'),
  };

  await bus.publish('puerto-documento-digital.recibir.request', {
    request_id: crypto.randomUUID(),
    project_id: PROYECTO,
    fuente: 'carpeta',
    documento: { path: 'inbox/ticket.png', nombre: 'ticket.png', mime: 'image/png' },
    correlation_id: 'cadena-1',
  });

  const [leido, clasificado, hechoClasificado, extraido, cuadre, compuesto, asentado] = await Promise.all([
    esperado.leido, esperado.clasificado, esperado.hechoClasificado, esperado.extraido, esperado.cuadre,
    esperado.compuesto, esperado.asentado,
  ]);

  // El EventBus envuelve en envelope; las RPC publican {status, data}: se desenvuelven las dos capas.
  const capa = (e) => { const p = (e && e.data) || e || {}; return p.data || p; };
  const dLeido = capa(leido);
  const dClas = capa(clasificado);
  const dHecho = capa(hechoClasificado);
  const dExt = capa(extraido);
  const dCua = capa(cuadre);
  const dCom = capa(compuesto);
  const dAsi = capa(asentado);

  console.log('\n── RASTRO ──');
  for (const t of traza) console.log(' ', JSON.stringify(t));
  console.log('\n── RESULTADOS ──');
  console.log(' texto OCR:', JSON.stringify((dLeido.texto || '').slice(0, 160)));
  console.log(' source_kind:', dLeido.source_kind, '| motor:', dLeido.motor);
  console.log(' clase:', dClas.clase, '| confianza:', dClas.confianza, '| motivos:', dClas.motivos);
  console.log(' extraido:', JSON.stringify(dExt.extraido));
  console.log(' faltantes:', JSON.stringify(dExt.faltantes), '| propuesta:', dExt.propuesta);
  console.log(' cuadra:', JSON.stringify({ cuadra: dCua.cuadra, diferencia: dCua.diferencia }));
  console.log(' asiento:', JSON.stringify(dCom.hecho && dCom.hecho.asiento ? dCom.hecho.asiento.lineas : dCom.hecho));
  console.log(' asentado:', JSON.stringify({ numero: dAsi.numero, total: dAsi.total }));

  assert.strictEqual((dLeido.source_kind || ''), 'ocr', 'el PNG debe leerse por OCR');
  assert.ok(/PANADERIA/i.test(dLeido.texto || ''), 'el OCR no devolvió el texto del ticket');
  assert.strictEqual(dClas.clase, 'ticket', `clase esperada ticket, llegó ${dClas.clase}`);
  assert.strictEqual(dHecho.clase, 'ticket', 'el hecho documento_clasificado no anunció la clase');
  assert.ok(dClas.esquema && Object.keys(dClas.esquema).length > 0, 'el clasificador no devolvió esquema');
  assert.ok(dExt.extraido, 'extraccion-dato no devolvió extraido');
  assert.strictEqual(dExt.extraido && dExt.extraido.total, '69,96', `total extraído: ${dExt.extraido && dExt.extraido.total}`);
  assert.strictEqual(dCua.cuadra, true, `el documento no cuadró: ${JSON.stringify(dCua)}`);
  assert.strictEqual(dCom.asienta, true, `hecho-compra no asienta: ${JSON.stringify(dCom.motivo || dCom.abierto)}`);
  const lineas = (dCom.hecho && dCom.hecho.asiento && dCom.hecho.asiento.lineas) || [];
  assert.strictEqual(lineas.length, 3, `el asiento debe tener 3 líneas (gasto/IVA/proveedor), tiene ${lineas.length}`);
  const debe = lineas.reduce((s, l) => s + Number(l.debe || 0), 0);
  const haber = lineas.reduce((s, l) => s + Number(l.haber || 0), 0);
  assert.ok(Math.abs(debe - 69.96) < 0.005 && Math.abs(haber - 69.96) < 0.005,
    `partida doble descuadrada: debe=${debe} haber=${haber}`);
  assert.ok(dAsi.numero != null, 'escritor-diario no anunció asiento_asentado con número');

  console.log('\nOK · cadena de entrada documental verificada con OCR real');
}

principal().catch((err) => {
  console.error('\nFALLO:', err.message);
  process.exitCode = 1;
});
