#!/usr/bin/env node
/**
 * scaffold-rewrite.js — Genera el andamiaje del rewrite POC2 de un modulo.
 *
 * Uso:
 *   node arquitectura/migracion/scripts/scaffold-rewrite.js <slug>
 *   node arquitectura/migracion/scripts/scaffold-rewrite.js conversacion__chat-io
 *
 * Hace (sin intervencion humana):
 *   1. Resuelve path: slug "conversacion__chat-io" -> "modules/conversacion/chat-io"
 *   2. Lee audit JSON + cuenta drifts del baseline (path-matching)
 *   3. Archiva monolito en arquitectura/migracion/_legacy/<slug>-monolito-pre-rewrite.js.bak
 *   4. Genera notas/<slug>-mapa.md pre-rellenado:
 *      - Identidad (name, version actual, LOC, drift count, layer)
 *      - Eventos publishes/subscribes del audit
 *      - Tabla de drifts por tipo
 *      - Secciones <TODO> para decisiones de dominio
 *   5. Genera tests/unit/<slug>.test.js scaffold:
 *      - Imports + makeMocks + instantiate + testAsync + isCanonicalError/Success
 *      - Group 1 Lifecycle skeleton (onLoad/onUnload pendings)
 *      - Group 7 Helpers POC2 (5 tests identicos a todos los modulos)
 *   6. Wire package.json (test:<slug>) + .github/workflows/validate.yml (step)
 *   7. Imprime checklist de lo que falta hacer humano
 *
 * Lo que NO hace (queda para Claude):
 *   - Reescribir/patchear el index.js (parte intelectual)
 *   - Completar Groups 2-6 de tests con domain logic
 *   - Decidir cuando un drift es FP vs real
 *   - Completar las secciones <TODO> del mapa con decisiones de dominio
 *   - Bumps de version en module.json + observability/tracing
 */

'use strict';

const fs   = require('fs');
const path = require('path');

const REPO_ROOT     = path.resolve(__dirname, '../../..');
const AUDITS_DIR    = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/modulo-completo');
const MANIFESTS_DIR = path.join(REPO_ROOT, 'arquitectura/auditoria/_outputs/manifest-completo');
const LEGACY_DIR    = path.join(REPO_ROOT, 'arquitectura/migracion/_legacy');
const NOTAS_DIR     = path.join(REPO_ROOT, 'arquitectura/migracion/notas');
const TESTS_DIR     = path.join(REPO_ROOT, 'tests/unit');
const BASELINE_PATH = path.join(REPO_ROOT, 'drift-baseline.json');
const PACKAGE_JSON  = path.join(REPO_ROOT, 'package.json');
const WORKFLOW_YML  = path.join(REPO_ROOT, '.github/workflows/validate.yml');

const RED = '\x1b[31m', GRN = '\x1b[32m', YEL = '\x1b[33m', CYN = '\x1b[36m', BLD = '\x1b[1m', RST = '\x1b[0m';

function loadJson(p) { return JSON.parse(fs.readFileSync(p, 'utf-8')); }

function fail(msg) { console.error(`${RED}error:${RST} ${msg}`); process.exit(1); }

function slugToModulePath(slug) {
  return path.join(REPO_ROOT, 'modules', slug.replace(/__/g, '/'));
}

function countLoc(file) {
  if (!fs.existsSync(file)) return 0;
  return fs.readFileSync(file, 'utf-8').split('\n').length;
}

function readAudit(slug) {
  const p = path.join(AUDITS_DIR, `${slug}.json`);
  if (!fs.existsSync(p)) return null;
  try { return loadJson(p); } catch (_) { return null; }
}

function readManifest(modulePath) {
  const p = path.join(modulePath, 'module.json');
  if (!fs.existsSync(p)) return null;
  try { return loadJson(p); } catch (_) { return null; }
}

function countBaselineDrifts(slug, modulePath) {
  if (!fs.existsSync(BASELINE_PATH)) return { total: 0, byType: {} };
  const b = loadJson(BASELINE_PATH);
  const sigs = Array.isArray(b.signatures) ? b.signatures : [];
  const relDir = path.relative(REPO_ROOT, modulePath).replace(/\\/g, '/') + '/';
  const byType = {};
  let total = 0;
  for (const s of sigs) {
    if (typeof s !== 'string') continue;
    if (!s.includes(relDir) && !s.includes(slug)) continue;
    if (s.includes('arquitectura/migracion/notas/')) continue;
    total++;
    const m = s.match(/\|(drift_\w+)\|/);
    if (m) byType[m[1]] = (byType[m[1]] || 0) + 1;
  }
  return { total, byType };
}

function archiveMonolito(slug, modulePath) {
  if (!fs.existsSync(LEGACY_DIR)) fs.mkdirSync(LEGACY_DIR, { recursive: true });
  const src = path.join(modulePath, 'index.js');
  const dst = path.join(LEGACY_DIR, `${slug}-monolito-pre-rewrite.js.bak`);
  if (fs.existsSync(dst)) {
    return { archived: false, dst, reason: 'already exists' };
  }
  if (!fs.existsSync(src)) {
    return { archived: false, dst, reason: 'source index.js not found' };
  }
  fs.copyFileSync(src, dst);
  return { archived: true, dst };
}

function generateMapa(slug, modulePath, audit, manifest, drifts) {
  const indexPath = path.join(modulePath, 'index.js');
  const loc = countLoc(indexPath);
  const layer = audit?._meta?.parcela ? 'core' : 'TODO_AYUDA_INVENTARIO';
  const versionActual = manifest?.version || audit?.identidad?.version || '?';
  const description = manifest?.description || audit?.identidad?.description_oficial || '<TODO descripcion del modulo>';

  const publishes = audit?.eventos?.publica || [];
  const subscribes = audit?.eventos?.subscribes || [];

  const driftRows = Object.entries(drifts.byType)
    .sort((a, b) => b[1] - a[1])
    .map(([k, v]) => `| \`${k}\` | ${v} | <TODO clasificar: real / falso positivo / stale audit> |`)
    .join('\n');

  const publishLines = publishes.map(p => {
    const name = p?.nombre?.valor || p?.nombre || '<dynamic>';
    const where = p?.metodo_contenedor || '?';
    return `- \`${name}\` — emitido en \`${where}\`${p?.es_handler_de ? ` (handler de \`${p.es_handler_de}\`)` : ''}.`;
  }).join('\n') || '- _(ninguno)_';

  const subscribeLines = subscribes.map(s => {
    const name = s?.nombre || '?';
    const handler = s?.handler || '?';
    return `- \`${name}\` → \`${handler}\``;
  }).join('\n') || '- _(ninguno)_';

  return `# ${slug} — Mapa exhaustivo (PASO 0 del rewrite)

Generado siguiendo el contrato \`module-rewrite.contract.json\` antes de tocar codigo.
Scaffold automatico via \`scripts/scaffold-rewrite.js\` — completa las secciones \`<TODO>\`.

## Identidad

- **Path**: \`${path.relative(REPO_ROOT, modulePath)}/\`
- **Version actual**: ${versionActual} → bump a **<TODO>** post-rewrite.
- **LOC index.js**: ${loc}.
- **Drifts en baseline**: ${drifts.total} (${Object.keys(drifts.byType).length} tipos).
- **Categoria**: ${layer}.
- **Description oficial**: ${description}

## Responsabilidad acotada

<TODO en una frase: que hace este modulo y por que NO se descompone (o por que SI).>

## Inventario de eventos (extraido del audit)

### Publishes (${publishes.length})

${publishLines}

### Subscribes (${subscribes.length})

${subscribeLines}

## Drifts conocidos en baseline (${drifts.total})

| Tipo | Count | Naturaleza |
|---|---|---|
${driftRows || '| _(sin drifts)_ | 0 | — |'}

<TODO patron principal en 1-2 frases: cuantos son reales vs falsos positivos vs stale audit.>

## Cosas criticas a preservar (validacion post-rewrite)

<TODO lista numerada de invariantes que la reescritura DEBE preservar:
eventos del bus, ui_handlers, schemas idempotentes, backward-compat, cascades,
extension points, etc.>

## Plan del rewrite

1. Archivar monolito (${loc} LOC) en \`_legacy/${slug}-monolito-pre-rewrite.js.bak\`. _(automatico via scaffold)_
2. Reescribir \`index.js\` v<NEW> al canon:
   - 5 helpers POC2 (\`_errorResponse\`, \`_handleHandlerError\`, \`_classifyHandlerError\`, \`_publicarEvento\`, + auxiliar \`<TODO>\`).
   - Throws con \`_code\` canonico.
   - Handlers UI/HTTP devuelven \`{ status, data | error: { code, message, details? } }\`.
   - Telemetria completa con prefix \`${slug.split('__').pop()}.*\`.
3. \`module.json\` v<NEW>:
   - \`tracing.propaga_correlation_id: true\`.
   - Schemas refs si subsistema chat/agent/llm/embedding.
   - Counters/gauges con prefix canonico.
4. Tests por capas (\`tests/unit/${slug}.test.js\` ya scaffoldeado):
   - Group 1: Lifecycle. _(skeleton listo)_
   - Group 2: Validacion canonica. <TODO>
   - Group 3-N: <TODO especifico del dominio>
   - Group 7: Helpers POC2. _(skeleton listo)_
5. Wire CI: \`package.json\` + \`workflow.yml\`. _(automatico via scaffold)_
6. Verificar drift count + regenerar baseline si es legitimo.
7. Commit con metricas via \`finish-rewrite.js\`.
`;
}

function generateTestSkeleton(slug, modulePath) {
  const name = slug.split('__').pop();
  const relIndex = path.relative(TESTS_DIR, path.join(modulePath, 'index.js'));
  const className = slugToClassName(slug);

  return `/**
 * Tests unitarios — ${slug} (POC2 reescritura).
 *
 * SCAFFOLD generado por scripts/scaffold-rewrite.js — completar Groups 2-6
 * con domain logic. Group 1 (Lifecycle) y Group 7 (Helpers POC2) ya tienen
 * los tests minimos.
 *
 * Ejecutar: node tests/unit/${slug}.test.js
 */

'use strict';

const assert = require('assert');
const crypto = require('crypto');

const ${className} = require('${relIndex.startsWith('.') ? relIndex : './' + relIndex}');

// --------------------------------------------------
// Mock infra
// --------------------------------------------------

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

  const eventBus = {
    publish: async (event, payload) => { published.push([event, payload]); }
  };

  return { logs, published, metricsCalls, logger, metrics, eventBus };
}

async function instantiate(mocks, opts = {}) {
  const m = new ${className}();
  await m.onLoad({
    logger: mocks.logger,
    metrics: mocks.metrics,
    eventBus: mocks.eventBus,
    moduleConfig: opts.config || {}
    // <TODO inyectar otros campos del context si el modulo los usa>
  });
  return { module: m };
}

async function testAsync(description, fn) {
  try { await fn(); console.log(\`✓ \${description}\`); }
  catch (error) { console.error(\`✗ \${description}\`); console.error(\`  \${error.message}\`); if (process.env.STACK) console.error(error.stack); process.exit(1); }
}

function isCanonicalError(result) {
  return result && typeof result.status === 'number'
    && result.error && typeof result.error === 'object'
    && typeof result.error.code === 'string'
    && typeof result.error.message === 'string'
    && !('data' in result);
}

function isCanonicalSuccess(result) {
  return result && typeof result.status === 'number'
    && result.data && typeof result.data === 'object'
    && !('error' in result);
}

function publishedOf(mocks, name) {
  return mocks.published.filter(p => p[0] === name).map(p => p[1]);
}

// ==================================================
//                                                Tests
// ==================================================

(async () => {
  console.log('${slug} — reescritura canonica (POC2)\\n');

  // ==========================================
  // Group 1: Lifecycle
  // ==========================================

  await testAsync('onLoad inicializa estado limpio', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.ok(m.name === '${name}' || m.name);
    // <TODO assert estado inicial: maps vacios, etc.>
    await m.onUnload();
  });

  await testAsync('onUnload limpia pending Maps + timers sin leak', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    // <TODO inyectar pending entry y verificar que onUnload lo limpia con
    // clearTimeout y reject si aplica. Ejemplo:
    //
    //   let rejected = false;
    //   m.pendingX.set('leak-1', {
    //     resolve: () => {},
    //     reject: () => { rejected = true; },
    //     timeout: setTimeout(() => {}, 60000)
    //   });
    //   await m.onUnload();
    //   assert.strictEqual(m.pendingX.size, 0);
    // >
    await m.onUnload();
  });

  // ==========================================
  // Group 2: Validacion canonica de handlers
  // ==========================================

  // <TODO: por cada UI handler / HTTP handler / bus handler, un test que
  //  valide payload inicial y devuelva 400 VALIDATION_FAILED canonico.>

  // ==========================================
  // Group 3-6: Domain-specific
  // ==========================================

  // <TODO: tests especificos del dominio del modulo. Ejemplos por dominio:
  //  - Bus handlers: par success/failure correlacionado por request_id.
  //  - HTTP handlers: 200/404/409 con shape canonico + correlation_id.
  //  - Eventos publicados: payload con timestamp + correlation_id.
  //  - Cascades: delete con miembros borra ambos.
  //  - Extension points: emisores/consumidores externos.>

  // ==========================================
  // Group 7: Helpers POC2 internos
  // ==========================================

  await testAsync('_errorResponse construye shape canonico { status, error: { code, message, details? } }', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const r1 = m._errorResponse(400, 'VALIDATION_FAILED', 'msg', { field: 'x' });
    assert.deepStrictEqual(r1, { status: 400, error: { code: 'VALIDATION_FAILED', message: 'msg', details: { field: 'x' } } });
    const r2 = m._errorResponse(500, 'INTERNAL_ERROR', 'oops');
    assert.deepStrictEqual(r2, { status: 500, error: { code: 'INTERNAL_ERROR', message: 'oops' } });
    await m.onUnload();
  });

  await testAsync('_classifyHandlerError mapea por mensaje a codigos canonicos', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    assert.strictEqual(m._classifyHandlerError(new Error('not found')), 'RESOURCE_NOT_FOUND');
    assert.strictEqual(m._classifyHandlerError(new Error('field is required')), 'VALIDATION_FAILED');
    assert.strictEqual(m._classifyHandlerError(new Error('something exploded')), 'INTERNAL_ERROR');
    await m.onUnload();
  });

  await testAsync('_publicarEvento hereda correlation_id si se pasa, genera uno nuevo si no', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    mocks.published.length = 0;
    await m._publicarEvento('test.event', { foo: 1 }, { correlation_id: 'cid-inherit' });
    await m._publicarEvento('test.event', { bar: 2 });
    const evs = publishedOf(mocks, 'test.event');
    assert.strictEqual(evs.length, 2);
    assert.strictEqual(evs[0].correlation_id, 'cid-inherit');
    assert.notStrictEqual(evs[1].correlation_id, 'cid-inherit');
    assert.ok(typeof evs[1].correlation_id === 'string' && evs[1].correlation_id.length > 0);
    assert.ok(evs[0].timestamp && evs[1].timestamp);
    await m.onUnload();
  });

  await testAsync('_handleHandlerError mapea status segun code y registra metric', async () => {
    const mocks = makeMocks();
    const { module: m } = await instantiate(mocks);
    const err = Object.assign(new Error('not found'), { _code: 'RESOURCE_NOT_FOUND', _details: { e: 1 } });
    const r = m._handleHandlerError('test.failed', err, 'kind');
    assert.strictEqual(r.status, 404);
    assert.strictEqual(r.error.code, 'RESOURCE_NOT_FOUND');
    assert.deepStrictEqual(r.error.details, { e: 1 });
    await m.onUnload();
  });

  console.log('\\nTodos los tests pasaron.');
})();
`;
}

function slugToClassName(slug) {
  // gateway-manager → GatewayManagerModule
  // conversacion__chat-io → ChatIoModule
  const last = slug.split('__').pop();
  const camel = last.split('-').map(s => s[0].toUpperCase() + s.slice(1)).join('');
  return camel + 'Module';
}

function wirePackageJson(slug) {
  const pkg = loadJson(PACKAGE_JSON);
  const scriptName = `test:${slug}`;
  if (pkg.scripts[scriptName]) {
    return { wired: false, reason: `script ${scriptName} already exists` };
  }
  // Insertar despues del ultimo test:* para mantener orden
  const newScripts = {};
  let inserted = false;
  const entries = Object.entries(pkg.scripts);
  // Encontrar el ultimo test:* test:integration:* etc
  let lastTestIdx = -1;
  for (let i = 0; i < entries.length; i++) {
    if (entries[i][0].startsWith('test:')) lastTestIdx = i;
  }
  for (let i = 0; i < entries.length; i++) {
    newScripts[entries[i][0]] = entries[i][1];
    if (i === lastTestIdx && !inserted) {
      newScripts[scriptName] = `node tests/unit/${slug}.test.js`;
      inserted = true;
    }
  }
  if (!inserted) newScripts[scriptName] = `node tests/unit/${slug}.test.js`;
  pkg.scripts = newScripts;
  fs.writeFileSync(PACKAGE_JSON, JSON.stringify(pkg, null, 2) + '\n');
  return { wired: true, scriptName };
}

function wireWorkflow(slug) {
  if (!fs.existsSync(WORKFLOW_YML)) return { wired: false, reason: 'workflow.yml not found' };
  const content = fs.readFileSync(WORKFLOW_YML, 'utf-8');
  const stepName = `Run unit tests (${slug.replace(/__/g, '/')} — reescritura canonica)`;
  if (content.includes(stepName)) return { wired: false, reason: 'step already wired' };
  // Insertar antes de la siguiente vacia despues del ultimo "Run unit tests"
  const lines = content.split('\n');
  let lastTestStep = -1;
  for (let i = 0; i < lines.length; i++) {
    if (/run: npm run test:/.test(lines[i])) lastTestStep = i;
  }
  if (lastTestStep === -1) return { wired: false, reason: 'no anchor test step found' };
  const insertAt = lastTestStep + 1;
  const newLines = [
    '',
    `      - name: ${stepName}`,
    `        run: npm run test:${slug}`
  ];
  lines.splice(insertAt, 0, ...newLines);
  fs.writeFileSync(WORKFLOW_YML, lines.join('\n'));
  return { wired: true };
}

// --------------------------------------------------
// Main
// --------------------------------------------------

function main() {
  const slug = process.argv[2];
  if (!slug) fail(`uso: node ${path.basename(__filename)} <slug>`);

  const modulePath = slugToModulePath(slug);
  if (!fs.existsSync(modulePath)) {
    fail(`module dir not found: ${modulePath}`);
  }

  console.log(`${BLD}=== scaffold-rewrite ${slug} ===${RST}`);
  console.log(`${CYN}module path: ${path.relative(REPO_ROOT, modulePath)}${RST}\n`);

  const audit = readAudit(slug);
  if (!audit) console.log(`${YEL}aviso: audit JSON no encontrado para ${slug} — el mapa quedara incompleto${RST}`);

  const manifest = readManifest(modulePath);
  const drifts = countBaselineDrifts(slug, modulePath);
  console.log(`drifts en baseline: ${drifts.total} (${Object.keys(drifts.byType).length} tipos)`);

  // 1. Archive
  const arc = archiveMonolito(slug, modulePath);
  if (arc.archived) console.log(`${GRN}✓${RST} archivado: ${path.relative(REPO_ROOT, arc.dst)}`);
  else console.log(`${YEL}skip archivado:${RST} ${arc.reason} (${path.relative(REPO_ROOT, arc.dst)})`);

  // 2. Mapa
  if (!fs.existsSync(NOTAS_DIR)) fs.mkdirSync(NOTAS_DIR, { recursive: true });
  const mapaPath = path.join(NOTAS_DIR, `${slug}-mapa.md`);
  if (fs.existsSync(mapaPath)) {
    console.log(`${YEL}skip mapa:${RST} ${path.relative(REPO_ROOT, mapaPath)} ya existe`);
  } else {
    fs.writeFileSync(mapaPath, generateMapa(slug, modulePath, audit, manifest, drifts));
    console.log(`${GRN}✓${RST} mapa: ${path.relative(REPO_ROOT, mapaPath)}`);
  }

  // 3. Test scaffold
  const testPath = path.join(TESTS_DIR, `${slug}.test.js`);
  if (fs.existsSync(testPath)) {
    console.log(`${YEL}skip test scaffold:${RST} ${path.relative(REPO_ROOT, testPath)} ya existe`);
  } else {
    fs.writeFileSync(testPath, generateTestSkeleton(slug, modulePath));
    console.log(`${GRN}✓${RST} test scaffold: ${path.relative(REPO_ROOT, testPath)}`);
  }

  // 4. package.json
  const pkg = wirePackageJson(slug);
  if (pkg.wired) console.log(`${GRN}✓${RST} package.json: ${pkg.scriptName}`);
  else console.log(`${YEL}skip package.json:${RST} ${pkg.reason}`);

  // 5. workflow.yml
  const wf = wireWorkflow(slug);
  if (wf.wired) console.log(`${GRN}✓${RST} workflow.yml: step anyadido`);
  else console.log(`${YEL}skip workflow.yml:${RST} ${wf.reason}`);

  // 6. Checklist
  console.log(`\n${BLD}=== checklist humano (lo que falta hacer) ===${RST}`);
  console.log(`  [ ] Completar secciones <TODO> en notas/${slug}-mapa.md`);
  console.log(`  [ ] Reescribir/patchear modules/${slug.replace(/__/g, '/')}/index.js`);
  console.log(`      - Anyadir 5 helpers POC2 + auxiliar`);
  console.log(`      - Throws con _code canonico`);
  console.log(`      - Handlers devuelven { status, data | error: { code, message } }`);
  console.log(`      - Telemetria con prefix '${slug.split('__').pop()}.*'`);
  console.log(`  [ ] module.json bump version + observability + tracing.propaga_correlation_id=true`);
  console.log(`  [ ] Completar Groups 2-6 de tests con domain logic`);
  console.log(`  [ ] Cierre: node ${path.relative(REPO_ROOT, __filename).replace('scaffold', 'finish')} ${slug}`);
  console.log(`\n${GRN}listo.${RST} drift baseline antes del rewrite: ${drifts.total} signatures path-matching.`);
}

main();
