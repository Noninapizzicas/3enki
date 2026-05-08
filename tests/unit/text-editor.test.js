/**
 * Tests unitarios — text-editor (POC2).
 *
 * Ejecutar: node tests/unit/text-editor.test.js
 */

'use strict';

const assert = require('assert');
const fs = require('fs');
const fsp = require('fs').promises;
const os = require('os');
const path = require('path');

const TextEditorModule = require('../../modules/text-editor/index.js');

let TMP_ROOT;
let ORIG_CWD;

function setupTmpCwd() {
  ORIG_CWD = process.cwd();
  TMP_ROOT = fs.mkdtempSync(path.join(os.tmpdir(), 'text-editor-test-'));
  process.chdir(TMP_ROOT);
}

function teardownTmpCwd() {
  if (ORIG_CWD) process.chdir(ORIG_CWD);
  if (TMP_ROOT) {
    try { fs.rmSync(TMP_ROOT, { recursive: true, force: true }); } catch (_) {}
  }
}

function makeMocks() {
  const logs = [];
  const published = [];
  const metricsCalls = [];
  const logger = {
    debug: (e, p) => logs.push(['debug', e, p]),
    info:  (e, p) => logs.push(['info',  e, p]),
    warn:  (e, p) => logs.push(['warn',  e, p]),
    error: (e, p) => logs.push(['error', e, p])
  };
  const metrics = {
    increment: (n, l) => metricsCalls.push(['increment', n, l]),
    gauge:     (n, v, l) => metricsCalls.push(['gauge', n, v, l]),
    timing:    (n, ms, l) => metricsCalls.push(['timing', n, ms, l])
  };
  const eventBus = { publish: async (e, p) => { published.push([e, p]); } };
  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new TextEditorModule();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(`✓ ${description}`); }
  catch (error) { console.error(`✗ ${description}`); console.error(`  ${error.message}`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(r) {
  return r && typeof r.status === 'number' && r.error
    && typeof r.error.code === 'string'
    && typeof r.error.message === 'string'
    && !('data' in r);
}

function isCanonicalSuccess(r) {
  return r && typeof r.status === 'number' && r.data && !('error' in r);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

(async () => {
  setupTmpCwd();
  console.log('text-editor — reescritura canonica (POC2)\n');

  // Group 1: Lifecycle
  await testAsync('onLoad inicializa estado limpio + config defaults', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m.name, 'text-editor');
    assert.strictEqual(m.version, '2.0.0');
    assert.ok(m.config.supported_formats.includes('json'));
    assert.strictEqual(m.config.max_file_size, 5242880);
    await m.onUnload();
  });

  await testAsync('onLoad permite override de config', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, {
      config: { supported_formats: ['md'], max_file_size: 1024, tab_size: 4 }
    });
    assert.deepStrictEqual(m.config.supported_formats, ['md']);
    assert.strictEqual(m.config.tab_size, 4);
    await m.onUnload();
  });

  // Group 2: Validacion canonica
  await testAsync('handleOpen sin file_path devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleOpen({ project_id: 'p1' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.strictEqual(r.error.details.field, 'file_path');
    await m.onUnload();
  });

  await testAsync('handleSave sin content devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSave({ project_id: 'p1', file_path: 'x.json' });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleValidate sin content devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleValidate({ format: 'json' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  await testAsync('handleFormat sin format devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleFormat({ content: '{}' });
    assert.strictEqual(r.status, 400);
    await m.onUnload();
  });

  // Group 3: Open/Save flow + atomic write
  await testAsync('handleOpen file inexistente devuelve 404 RESOURCE_NOT_FOUND', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleOpen({ project_id: 'proj-1', file_path: 'no-existe.json' });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    await m.onUnload();
  });

  await testAsync('handleSave + handleOpen round trip preserva contenido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const saveR = await m.handleSave({
      project_id: 'proj-1',
      file_path: 'sub/notes.md',
      content: '# Hola\n\nEsto es prueba.'
    });
    assert.strictEqual(saveR.status, 200);
    assert.strictEqual(saveR.data.saved, true);

    const openR = await m.handleOpen({ project_id: 'proj-1', file_path: 'sub/notes.md' });
    assert.strictEqual(openR.status, 200);
    assert.strictEqual(openR.data.content, '# Hola\n\nEsto es prueba.');
    assert.strictEqual(openR.data.extension, 'md');
    await m.onUnload();
  });

  await testAsync('handleSave usa write atomico (tmp + rename)', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleSave({
      project_id: 'proj-atomic',
      file_path: 'atomic.json',
      content: '{"ok":true}'
    });
    const target = path.join(TMP_ROOT, 'data', 'projects', 'proj-atomic', 'atomic.json');
    assert.ok(fs.existsSync(target));
    assert.ok(!fs.existsSync(`${target}.tmp`));
    await m.onUnload();
  });

  await testAsync('handleSave json invalido devuelve 400 INVALID_INPUT', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleSave({
      project_id: 'p1',
      file_path: 'broken.json',
      content: '{not valid json'
    });
    assert.strictEqual(r.status, 400);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    assert.ok(r.error.message.includes('Invalid JSON'));
    await m.onUnload();
  });

  await testAsync('handleSave emite editor.saved con project_id + correlation_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleSave({
      project_id: 'proj-evt',
      file_path: 'a.md',
      content: 'hi',
      correlation_id: 'cid-save'
    });
    const evs = publishedOf(mocks, 'editor.saved');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].project_id, 'proj-evt');
    assert.strictEqual(evs[0].correlation_id, 'cid-save');
    assert.ok(evs[0].timestamp);
    await m.onUnload();
  });

  // Group 4: Path traversal security
  await testAsync('validatePath rechaza paths con ../', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.throws(
      () => m.validatePath('/tmp/proj', '../escape.txt'),
      /Access denied/
    );
    assert.throws(
      () => m.validatePath('/tmp/proj', '../../etc/passwd'),
      /Access denied/
    );
    await m.onUnload();
  });

  await testAsync('validatePath rechaza paths absolutos fuera del proyecto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.throws(() => m.validatePath('/tmp/proj', '/../escape'), /Access denied/);
    await m.onUnload();
  });

  await testAsync('handleOpen con path traversal devuelve 403 PERMISSION_DENIED', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleOpen({
      project_id: 'proj-1',
      file_path: '../../etc/passwd'
    });
    assert.ok(isCanonicalError(r));
    assert.strictEqual(r.status, 403);
    assert.strictEqual(r.error.code, 'PERMISSION_DENIED');
    await m.onUnload();
  });

  // Group 5: max_file_size + supported_formats
  await testAsync('handleOpen con archivo excediendo max_file_size devuelve 413', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { max_file_size: 10 } });
    await m.handleSave({ project_id: 'p1', file_path: 'big.txt', content: 'x'.repeat(100) });
    const r = await m.handleOpen({ project_id: 'p1', file_path: 'big.txt' });
    assert.strictEqual(r.status, 413);
    assert.strictEqual(r.error.code, 'INVALID_INPUT');
    await m.onUnload();
  });

  await testAsync('handleOpen con extension no soportada devuelve 400', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks, { config: { supported_formats: ['md'] } });
    await fsp.mkdir(path.join(TMP_ROOT, 'data', 'projects', 'p1'), { recursive: true });
    await fsp.writeFile(path.join(TMP_ROOT, 'data', 'projects', 'p1', 'a.exe'), 'binary');
    const r = await m.handleOpen({ project_id: 'p1', file_path: 'a.exe' });
    assert.strictEqual(r.status, 400);
    assert.ok(r.error.message.includes('Unsupported format'));
    await m.onUnload();
  });

  // Group 6: Validate + Format
  await testAsync('handleValidate JSON valido devuelve valid=true', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleValidate({ content: '{"a":1}', format: 'json' });
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.valid, true);
    assert.strictEqual(r.data.errors.length, 0);
    await m.onUnload();
  });

  await testAsync('handleValidate JSON invalido devuelve valid=false con error', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleValidate({ content: '{not valid', format: 'json' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.valid, false);
    assert.strictEqual(r.data.errors.length, 1);
    await m.onUnload();
  });

  await testAsync('handleValidate MD detecta link incompleto', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleValidate({
      content: 'check [out](https://example.com\nand [link](unclosed',
      format: 'md'
    });
    assert.ok(r.data.warnings.length >= 1);
    await m.onUnload();
  });

  await testAsync('handleFormat JSON pretty-printa con tab_size', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleFormat({ content: '{"a":1,"b":2}', format: 'json' });
    assert.strictEqual(r.status, 200);
    assert.strictEqual(r.data.changed, true);
    assert.ok(r.data.formatted.includes('\n'));
    await m.onUnload();
  });

  await testAsync('handleFormat MD trim trailing whitespace', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleFormat({ content: 'line1   \nline2\n', format: 'md' });
    assert.strictEqual(r.data.changed, true);
    assert.strictEqual(r.data.formatted, 'line1\nline2\n');
    await m.onUnload();
  });

  await testAsync('handleFormat sin cambios devuelve changed=false', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const json = JSON.stringify({ a: 1 }, null, 2);
    const r = await m.handleFormat({ content: json, format: 'json' });
    assert.strictEqual(r.data.changed, false);
    await m.onUnload();
  });

  // Group 7: Bus subscribers correlation
  await testAsync('onOpenRequest publica editor.open.response correlacionada por request_id', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.handleSave({ project_id: 'p1', file_path: 'a.md', content: 'data' });
    mocks.published.length = 0;

    await m.onOpenRequest({
      data: {
        request_id: 'rid-1',
        project_id: 'p1', file_path: 'a.md',
        correlation_id: 'cid-bus'
      }
    });
    const evs = publishedOf(mocks, 'editor.open.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].request_id, 'rid-1');
    assert.strictEqual(evs[0].success, true);
    assert.strictEqual(evs[0].data.content, 'data');
    assert.strictEqual(evs[0].correlation_id, 'cid-bus');
    await m.onUnload();
  });

  await testAsync('onSaveRequest publica editor.saved en exito', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onSaveRequest({
      data: {
        request_id: 'rid-save',
        project_id: 'p1',
        file_path: 'b.md',
        content: 'hello',
        correlation_id: 'cid-save'
      }
    });
    const saved = publishedOf(mocks, 'editor.saved');
    assert.strictEqual(saved.length, 1);
    assert.strictEqual(saved[0].file_path, 'b.md');
    assert.strictEqual(saved[0].correlation_id, 'cid-save');
    await m.onUnload();
  });

  await testAsync('onSaveRequest publica editor.error en JSON invalido', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onSaveRequest({
      data: {
        request_id: 'rid-err',
        project_id: 'p1',
        file_path: 'broken.json',
        content: '{nope'
      }
    });
    const errs = publishedOf(mocks, 'editor.error');
    assert.strictEqual(errs.length, 1);
    assert.strictEqual(errs[0].request_id, 'rid-err');
    await m.onUnload();
  });

  await testAsync('onValidateRequest publica editor.validate.response', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onValidateRequest({
      data: { request_id: 'rid-v', content: '{"a":1}', format: 'json' }
    });
    const evs = publishedOf(mocks, 'editor.validate.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].success, true);
    assert.strictEqual(evs[0].data.valid, true);
    await m.onUnload();
  });

  await testAsync('onFormatRequest publica editor.format.response', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    await m.onFormatRequest({
      data: { request_id: 'rid-f', content: '{"a":1}', format: 'json' }
    });
    const evs = publishedOf(mocks, 'editor.format.response');
    assert.strictEqual(evs.length, 1);
    assert.strictEqual(evs[0].success, true);
    assert.ok(evs[0].data.formatted.includes('\n'));
    await m.onUnload();
  });

  await testAsync('handleHealth devuelve shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = await m.handleHealth();
    assert.ok(isCanonicalSuccess(r));
    assert.strictEqual(r.data.status, 'healthy');
    assert.strictEqual(r.data.version, '2.0.0');
    await m.onUnload();
  });

  // Helpers POC2
  await testAsync('_errorResponse construye shape canonico', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._errorResponse(400, 'INVALID_INPUT', 'msg', { f: 'x' });
    assert.deepStrictEqual(r, { status: 400, error: { code: 'INVALID_INPUT', message: 'msg', details: { f: 'x' } } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.deepStrictEqual(m._classifyHandlerError(new Error('field is required')), { status: 400, code: 'INVALID_INPUT' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('Access denied: outside project')), { status: 403, code: 'PERMISSION_DENIED' });
    assert.deepStrictEqual(m._classifyHandlerError(Object.assign(new Error('x'), { code: 'ENOENT' })), { status: 404, code: 'RESOURCE_NOT_FOUND' });
    assert.deepStrictEqual(m._classifyHandlerError(new Error('File too large')), { status: 413, code: 'INVALID_INPUT' });
    await m.onUnload();
  });

  await testAsync('_publicarEvento añade correlation_id, project_id top-level y timestamp', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1, project_id: 'p-z' }, { correlation_id: 'cid-z' });
    const ev = mocks.published[0][1];
    assert.strictEqual(ev.correlation_id, 'cid-z');
    assert.strictEqual(ev.project_id, 'p-z');
    assert.ok(ev.timestamp);
    await m.onUnload();
  });

  await testAsync('_atomicWriteFile escribe via tmp + rename', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const target = path.join(TMP_ROOT, 'sub', 'atomic.json');
    await m._atomicWriteFile(target, '{"ok":1}');
    const data = JSON.parse(fs.readFileSync(target, 'utf8'));
    assert.strictEqual(data.ok, 1);
    assert.ok(!fs.existsSync(`${target}.tmp`));
    await m.onUnload();
  });

  await testAsync('_handleHandlerError emite metric text-editor.errors', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r = m._handleHandlerError('test.error', new Error('not found'));
    assert.strictEqual(r.status, 404);
    const errMetric = mocks.metricsCalls.find(c => c[1] === 'text-editor.errors');
    assert.ok(errMetric);
    await m.onUnload();
  });

  teardownTmpCwd();
  console.log('\nTodos los tests pasaron.');
})().catch(e => {
  teardownTmpCwd();
  console.error(e);
  process.exit(1);
});
