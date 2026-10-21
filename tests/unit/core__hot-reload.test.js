/**
 * Tests de hot-reload del ModuleLoader
 *
 * Verifica que hot_reload:true es real:
 *   1. watchAll() observa cada módulo cargado
 *   2. editar un fichero del módulo lo recarga EN CALIENTE (sin reiniciar el core)
 *   3. la caché se limpia también para las DEPENDENCIAS locales (una recarga
 *      parcial dejaría el helper viejo cacheado → bug silencioso)
 *
 * Ejecutar con: node tests/unit/core__hot-reload.test.js
 */

const assert = require('assert');
const fs = require('fs');
const os = require('os');
const path = require('path');

const { ModuleLoader } = require('../../core/modules');

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

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Fabrica un módulo de prueba con un helper COMPARTIDO bajo _shared/
// para poder comprobar que la recarga limpia también esa dependencia.
function fabricarModulo(root) {
  const sharedDir = path.join(root, '_shared');
  const demoDir = path.join(root, 'demo');
  fs.mkdirSync(sharedDir, { recursive: true });
  fs.mkdirSync(demoDir, { recursive: true });

  fs.writeFileSync(
    path.join(sharedDir, 'helper.js'),
    'module.exports = { v: 1 };\n'
  );
  fs.writeFileSync(
    path.join(demoDir, 'index.js'),
    [
      "const h = require('../_shared/helper');",
      'class Demo {',
      '  constructor() { this.cargado = h.v; }',
      '  async onLoad() { return {}; }',
      '  async onUnload() {}',
      '}',
      'module.exports = Demo;',
      ''
    ].join('\n')
  );
  fs.writeFileSync(
    path.join(demoDir, 'module.json'),
    JSON.stringify({ name: 'demo', version: '1.0.0', description: 'demo' })
  );
  return { sharedDir, demoDir };
}

async function runTests() {
  console.log('\n🧪 Running ModuleLoader Hot-Reload Tests\n');

  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'enki-hotreload-'));
  const { sharedDir, demoDir } = fabricarModulo(root);

  const loader = new ModuleLoader({ modulesPath: root });

  // --- Carga inicial
  await loader.load('demo', demoDir, JSON.parse(fs.readFileSync(path.join(demoDir, 'module.json'), 'utf8')));

  test('El módulo carga y toma el valor del helper compartido (v=1)', () => {
    const inst = loader.getModule('demo').instance;
    assert.ok(inst, 'el módulo demo debe estar cargado');
    assert.strictEqual(inst.cargado, 1);
  });

  // --- watchAll
  test('watchAll() crea un watcher por módulo cargado', () => {
    loader.watchAll();
    assert.strictEqual(loader.watchers.size, loader.loadedModules.size);
    assert.ok(loader.watchers.has('demo'));
  });

  // --- clearModuleCache suelta también _shared
  test('clearModuleCache() suelta index.js Y el helper de _shared', () => {
    const indexPath = require.resolve(path.join(demoDir, 'index.js'));
    const helperPath = require.resolve(path.join(sharedDir, 'helper.js'));
    assert.ok(require.cache[indexPath], 'index.js debe estar en caché antes');
    assert.ok(require.cache[helperPath], 'helper.js debe estar en caché antes');

    loader.clearModuleCache(demoDir);

    assert.ok(!require.cache[indexPath], 'index.js debe salir de caché');
    assert.ok(!require.cache[helperPath], '_shared/helper.js debe salir de caché (recarga completa)');
  });

  // --- recarga en caliente ante un cambio real en disco
  await testAsync('Editar el helper en disco + recargar propaga el valor nuevo (v=2)', async () => {
    fs.writeFileSync(
      path.join(sharedDir, 'helper.js'),
      'module.exports = { v: 2 };\n'
    );
    await loader.reload('demo');
    const inst = loader.getModule('demo').instance;
    assert.strictEqual(inst.cargado, 2, 'la recarga debe tomar el helper actualizado');
  });

  // --- los node_modules NO se tocan (estables, sin fugas)
  test('clearModuleCache() respeta las dependencias de node_modules', () => {
    const nmPath = path.join(demoDir, 'node_modules', 'x', 'index.js');
    require.cache[nmPath] = { exports: {} };
    loader.clearModuleCache(demoDir);
    assert.ok(require.cache[nmPath], 'una dep de node_modules no debe soltarse');
    delete require.cache[nmPath];
  });

  // --- el watcher recarga de verdad ante un cambio en disco
  await testAsync('El watcher recarga solo al tocar index.js (sin llamada manual)', async () => {
    fs.writeFileSync(
      path.join(demoDir, 'index.js'),
      [
        "const h = require('../_shared/helper');",
        'class Demo {',
        '  constructor() { this.cargado = h.v; this.marca = 99; }',
        '  async onLoad() { return {}; }',
        '  async onUnload() {}',
        '}',
        'module.exports = Demo;',
        ''
      ].join('\n')
    );
    await sleep(1200); // watcher (500ms debounce) + recarga
    const inst = loader.getModule('demo').instance;
    assert.strictEqual(inst.marca, 99, 'el watcher debió recargar con el código nuevo');
  });

  // --- sin fugas de watcher
  await testAsync('unload() cierra el watcher y cancela su debounce', async () => {
    await loader.unload('demo');
    assert.ok(!loader.watchers.has('demo'), 'el watcher debe cerrarse al descargar');
  });

  fs.rmSync(root, { recursive: true, force: true });
  console.log('\n✅ Todos los tests de hot-reload pasaron\n');
}

runTests().catch((e) => {
  console.error(e);
  process.exit(1);
});
