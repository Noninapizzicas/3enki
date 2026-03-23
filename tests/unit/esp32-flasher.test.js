/**
 * Tests para esp32-flasher
 * Ejecutar con: node tests/unit/esp32-flasher.test.js
 */

const fs = require('fs');
const path = require('path');

// ==========================================
// Test Framework
// ==========================================

let testsPassed = 0;
let testsFailed = 0;

function assert(condition, message) {
  if (!condition) {
    throw new Error(`Assertion failed: ${message}`);
  }
}

async function test(description, fn) {
  try {
    await fn();
    console.log(`  ✓ ${description}`);
    testsPassed++;
  } catch (error) {
    console.error(`  ✗ ${description}`);
    console.error(`    ${error.message}`);
    testsFailed++;
  }
}

// ==========================================
// Mocks
// ==========================================

const TEST_DATA_PATH = path.join(__dirname, '..', '.tmp-test-flasher');

function createMockCore(configOverrides = {}) {
  const published = [];
  const metrics = {
    _counters: {},
    _gauges: {},
    _timings: {},
    increment(name, value = 1) {
      this._counters[name] = (this._counters[name] || 0) + value;
    },
    gauge(name, value) {
      this._gauges[name] = value;
    },
    timing(name, value) {
      if (!this._timings[name]) this._timings[name] = [];
      this._timings[name].push(value);
    },
    getCounter(name) { return this._counters[name] || 0; },
    reset() { this._counters = {}; this._gauges = {}; this._timings = {}; }
  };

  return {
    logger: {
      info: () => {},
      warn: () => {},
      error: () => {},
      debug: () => {}
    },
    metrics,
    eventBus: {
      publish: async (event, data) => {
        published.push({ event, data });
      },
      _published: published
    },
    config: {
      'esp32-flasher': {
        esptool_path: 'esptool.py',
        platformio_path: 'platformio',
        flash_timeout_ms: 5000,
        serial_patterns: ['/dev/ttyUSB*', '/dev/ttyACM*'],
        ...configOverrides
      }
    }
  };
}

function createTestBinary(filename = 'test-firmware.bin') {
  fs.mkdirSync(TEST_DATA_PATH, { recursive: true });
  const binPath = path.join(TEST_DATA_PATH, filename);
  fs.writeFileSync(binPath, 'fake firmware binary content for testing');
  return binPath;
}

function cleanup() {
  if (fs.existsSync(TEST_DATA_PATH)) {
    fs.rmSync(TEST_DATA_PATH, { recursive: true, force: true });
  }
}

// ==========================================
// Tests
// ==========================================

async function runTests() {
  console.log('\n🧪 Testing esp32-flasher\n');

  const ESP32FlasherModule = require('../../modules/esp32-flasher/index');

  // ============================================
  // GRUPO 1: Lifecycle
  // ============================================
  console.log('\n📦 Lifecycle\n');

  await test('onLoad inicializa correctamente', async () => {
    const mod = new ESP32FlasherModule();
    const core = createMockCore();
    await mod.onLoad(core);

    assert(mod.eventBus === core.eventBus, 'eventBus asignado');
    assert(mod.logger === core.logger, 'logger asignado');
    assert(mod.config.flash_baud === 460800, 'flash_baud default');
    assert(core.metrics._gauges['flash.active.count'] === 0, 'gauge activos = 0');
    assert(core.metrics._gauges['flash.monitors.count'] === 0, 'gauge monitores = 0');

    await mod.onUnload();
  });

  await test('onLoad aplica config custom', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore({ flash_timeout_ms: 30000 }));

    assert(mod.config.flash_timeout_ms === 30000, 'flash_timeout_ms aplicado');

    await mod.onUnload();
  });

  await test('onUnload limpia flashes y monitores', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    // Simular flash activo
    mod.activeFlashes.set('test-id', { process: { killed: true, kill: () => {} }, port: '/dev/ttyUSB0' });
    mod.activeMonitors.set('/dev/ttyUSB1', { process: { killed: true, kill: () => {} } });

    await mod.onUnload();

    assert(mod.activeFlashes.size === 0, 'flashes limpiados');
    assert(mod.activeMonitors.size === 0, 'monitores limpiados');
  });

  // ============================================
  // GRUPO 2: List Ports
  // ============================================
  console.log('\n🔌 List Ports\n');

  await test('list-ports devuelve resultado válido', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleListPorts();
    assert(result.status === 200, 'status 200');
    assert(Array.isArray(result.data.ports), 'ports es array');
    assert(typeof result.data.total === 'number', 'total es número');

    await mod.onUnload();
  });

  await test('list-ports incluye last_build si hay', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    mod.lastBuild = {
      project_name: 'test',
      binary_path: '/tmp/test.bin',
      timestamp: new Date().toISOString()
    };

    const result = await mod.handleListPorts();
    assert(result.data.last_build !== null, 'last_build presente');
    assert(result.data.last_build.project_name === 'test', 'last_build correcto');

    await mod.onUnload();
  });

  await test('list-ports muestra puertos en uso', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleListPorts();
    assert(result.data.active_flash === null, 'sin flash activo');
    assert(result.data.active_monitors === null, 'sin monitores activos');

    // Simular flash activo
    mod.activeFlashes.set('abc', { port: '/dev/ttyUSB0', process: null });
    const result2 = await mod.handleListPorts();
    assert(result2.data.active_flash.includes('abc'), 'muestra flash activo');

    mod.activeFlashes.clear();
    await mod.onUnload();
  });

  // ============================================
  // GRUPO 3: Start Flash
  // ============================================
  console.log('\n⚡ Start Flash\n');

  await test('start requiere port', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStart({ binary_path: '/tmp/test.bin' });
    assert(result.status === 400, 'status 400');
    assert(result.error.includes('port'), 'error menciona port');

    await mod.onUnload();
  });

  await test('start requiere binary_path', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStart({ port: '/dev/ttyUSB0' });
    assert(result.status === 400, 'status 400');
    assert(result.error.includes('binary_path'), 'error menciona binary_path');

    await mod.onUnload();
  });

  await test('start rechaza binario inexistente', async () => {
    cleanup();
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStart({
      port: '/dev/ttyUSB0',
      binary_path: '/tmp/no-existe-firmware.bin'
    });

    assert(result.status === 400, 'status 400');
    assert(result.error.includes('no encontrado'), 'error menciona no encontrado');

    await mod.onUnload();
    cleanup();
  });

  await test('start con binario válido retorna 202 (esptool)', async () => {
    cleanup();
    const binPath = createTestBinary();
    const mod = new ESP32FlasherModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleStart({
      port: '/dev/ttyUSB0',
      binary_path: binPath,
      method: 'esptool'
    });

    assert(result.status === 202, 'status 202');
    assert(result.data.status === 'flashing', 'estado flashing');
    assert(result.data.flash_id, 'tiene flash_id');
    assert(result.data.port === '/dev/ttyUSB0', 'port correcto');
    assert(result.data.method === 'esptool', 'method esptool');

    // Verificar evento publicado
    const event = core.eventBus._published.find(e => e.event === 'flash.started');
    assert(event, 'evento flash.started publicado');
    assert(event.data.flash_id === result.data.flash_id, 'flash_id en evento');

    // Verificar métrica
    assert(core.metrics.getCounter('flash.started.total') === 1, 'métrica started');

    // Esperar a que el proceso falle (esptool no instalado en tests)
    await new Promise(r => setTimeout(r, 500));

    await mod.onUnload();
    cleanup();
  });

  await test('start con binario válido retorna 202 (platformio)', async () => {
    cleanup();
    const binPath = createTestBinary();
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStart({
      port: '/dev/ttyUSB0',
      binary_path: binPath,
      method: 'platformio'
    });

    assert(result.status === 202, 'status 202');
    assert(result.data.method === 'platformio', 'method platformio');

    await new Promise(r => setTimeout(r, 500));
    await mod.onUnload();
    cleanup();
  });

  await test('start rechaza método no soportado', async () => {
    cleanup();
    const binPath = createTestBinary();
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStart({
      port: '/dev/ttyUSB0',
      binary_path: binPath,
      method: 'avrdude'
    });

    assert(result.status === 400, 'status 400');
    assert(result.error.includes('no soportado'), 'error menciona no soportado');

    await mod.onUnload();
    cleanup();
  });

  await test('start rechaza puerto en uso por otro flash', async () => {
    cleanup();
    const binPath = createTestBinary();
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    // Simular flash activo en el mismo puerto
    mod.activeFlashes.set('existing', {
      port: '/dev/ttyUSB0',
      process: { killed: true, kill: () => {} }
    });

    const result = await mod.handleStart({
      port: '/dev/ttyUSB0',
      binary_path: binPath
    });

    assert(result.status === 409, 'status 409');
    assert(result.error.includes('ya en uso'), 'error menciona en uso');

    mod.activeFlashes.clear();
    await mod.onUnload();
    cleanup();
  });

  await test('start usa baud por defecto si no se especifica', async () => {
    cleanup();
    const binPath = createTestBinary();
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStart({
      port: '/dev/ttyUSB0',
      binary_path: binPath
    });

    assert(result.data.baud === 460800, 'baud default 460800');
    assert(result.data.method === 'esptool', 'method default esptool');

    await new Promise(r => setTimeout(r, 500));
    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 4: Flash Status
  // ============================================
  console.log('\n📊 Flash Status\n');

  await test('status sin flashes activos', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStatus({});
    assert(result.status === 200, 'status 200');
    assert(result.data.count === 0, 'sin flashes activos');

    await mod.onUnload();
  });

  await test('status muestra flash activo', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    mod.activeFlashes.set('test-flash', {
      port: '/dev/ttyUSB0',
      method: 'esptool',
      started_at: new Date().toISOString(),
      log: ['line1', 'line2', 'line3'],
      progress: { stage: 'writing', percent: 50 },
      process: null
    });

    const result = await mod.handleStatus({ flash_id: 'test-flash' });
    assert(result.status === 200, 'status 200');
    assert(result.data.status === 'flashing', 'estado flashing');
    assert(result.data.progress.percent === 50, 'progreso 50%');
    assert(result.data.log_lines === 3, '3 líneas de log');

    mod.activeFlashes.clear();
    await mod.onUnload();
  });

  await test('status retorna 404 para flash inexistente', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleStatus({ flash_id: 'no-existe' });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
  });

  await test('status busca en historial', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    mod.flashHistory.push({
      flash_id: 'old-flash',
      port: '/dev/ttyUSB0',
      status: 'completed',
      duration_ms: 5000
    });

    const result = await mod.handleStatus({ flash_id: 'old-flash' });
    assert(result.status === 200, 'status 200');
    assert(result.data.status === 'completed', 'del historial');

    await mod.onUnload();
  });

  // ============================================
  // GRUPO 5: Cancel Flash
  // ============================================
  console.log('\n🚫 Cancel Flash\n');

  await test('cancel requiere flash_id', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleCancel({});
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
  });

  await test('cancel retorna 404 si no existe', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleCancel({ flash_id: 'no-existe' });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
  });

  await test('cancel mata proceso y registra en historial', async () => {
    const mod = new ESP32FlasherModule();
    const core = createMockCore();
    await mod.onLoad(core);

    let killed = false;
    mod.activeFlashes.set('to-cancel', {
      port: '/dev/ttyUSB0',
      method: 'esptool',
      binary_path: '/tmp/test.bin',
      started_at: new Date().toISOString(),
      process: { killed: false, kill: () => { killed = true; } }
    });

    const result = await mod.handleCancel({ flash_id: 'to-cancel' });
    assert(result.status === 200, 'status 200');
    assert(result.data.status === 'cancelled', 'estado cancelled');
    assert(killed, 'proceso matado');
    assert(mod.activeFlashes.size === 0, 'flash removido');
    assert(mod.flashHistory.length === 1, 'registrado en historial');
    assert(mod.flashHistory[0].status === 'cancelled', 'historial con cancelled');

    // Verificar métrica
    assert(core.metrics.getCounter('flash.cancelled.total') === 1, 'métrica cancelled');

    await mod.onUnload();
  });

  // ============================================
  // GRUPO 6: Monitor Serial
  // ============================================
  console.log('\n📺 Monitor Serial\n');

  await test('monitor-start requiere port', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleMonitorStart({});
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
  });

  await test('monitor-start rechaza si ya hay monitor en el puerto', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    mod.activeMonitors.set('/dev/ttyUSB0', { process: null });

    const result = await mod.handleMonitorStart({ port: '/dev/ttyUSB0' });
    assert(result.status === 409, 'status 409');

    mod.activeMonitors.clear();
    await mod.onUnload();
  });

  await test('monitor-start rechaza si hay flash activo en el puerto', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    mod.activeFlashes.set('f1', { port: '/dev/ttyUSB0', process: null });

    const result = await mod.handleMonitorStart({ port: '/dev/ttyUSB0' });
    assert(result.status === 409, 'status 409');
    assert(result.error.includes('flash activo'), 'error menciona flash');

    mod.activeFlashes.clear();
    await mod.onUnload();
  });

  await test('monitor-stop requiere port', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleMonitorStop({});
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
  });

  await test('monitor-stop retorna 404 si no hay monitor', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleMonitorStop({ port: '/dev/ttyUSB0' });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
  });

  await test('monitor-stop cierra monitor activo', async () => {
    const mod = new ESP32FlasherModule();
    const core = createMockCore();
    await mod.onLoad(core);

    let killed = false;
    mod.activeMonitors.set('/dev/ttyUSB0', {
      process: { killed: false, kill: () => { killed = true; } },
      baud: 115200
    });

    const result = await mod.handleMonitorStop({ port: '/dev/ttyUSB0' });
    assert(result.status === 200, 'status 200');
    assert(result.data.status === 'stopped', 'estado stopped');
    assert(killed, 'proceso matado');
    assert(mod.activeMonitors.size === 0, 'monitor removido');

    await mod.onUnload();
  });

  // ============================================
  // GRUPO 7: Monitor Send
  // ============================================
  console.log('\n📤 Monitor Send\n');

  await test('monitor-send requiere port y data', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    assert((await mod.handleMonitorSend({})).status === 400, 'sin port = 400');
    assert((await mod.handleMonitorSend({ port: '/dev/ttyUSB0' })).status === 400, 'sin data = 400');

    await mod.onUnload();
  });

  await test('monitor-send retorna 404 si no hay monitor', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleMonitorSend({ port: '/dev/ttyUSB0', data: 'test' });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
  });

  await test('monitor-send envía datos al stdin', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    let written = '';
    mod.activeMonitors.set('/dev/ttyUSB0', {
      process: {
        stdin: { write: (data) => { written = data; } },
        killed: false
      }
    });

    const result = await mod.handleMonitorSend({ port: '/dev/ttyUSB0', data: 'hello' });
    assert(result.status === 200, 'status 200');
    assert(written === 'hello\n', 'datos escritos con newline');

    mod.activeMonitors.clear();
    await mod.onUnload();
  });

  // ============================================
  // GRUPO 8: History
  // ============================================
  console.log('\n📜 History\n');

  await test('history devuelve lista vacía inicialmente', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleHistory({});
    assert(result.status === 200, 'status 200');
    assert(result.data.total === 0, 'sin historial');

    await mod.onUnload();
  });

  await test('history devuelve entradas y respeta limit', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    for (let i = 0; i < 10; i++) {
      mod.flashHistory.push({
        flash_id: `flash-${i}`,
        port: `/dev/ttyUSB${i % 2}`,
        status: i % 3 === 0 ? 'completed' : 'failed'
      });
    }

    const result = await mod.handleHistory({ limit: '3' });
    assert(result.status === 200, 'status 200');
    assert(result.data.history.length === 3, 'limit respetado');
    assert(result.data.total === 10, 'total correcto');

    await mod.onUnload();
  });

  await test('history filtra por port', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    mod.flashHistory.push({ flash_id: 'a', port: '/dev/ttyUSB0', status: 'completed' });
    mod.flashHistory.push({ flash_id: 'b', port: '/dev/ttyUSB1', status: 'failed' });
    mod.flashHistory.push({ flash_id: 'c', port: '/dev/ttyUSB0', status: 'completed' });

    const result = await mod.handleHistory({ port: '/dev/ttyUSB0' });
    assert(result.data.total === 2, 'filtrado por port');
    assert(result.data.history.every(h => h.port === '/dev/ttyUSB0'), 'todos del puerto correcto');

    await mod.onUnload();
  });

  await test('history se limita a max_history', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore({ max_history: 5 }));

    for (let i = 0; i < 10; i++) {
      mod._addHistory({ flash_id: `h-${i}`, port: '/dev/ttyUSB0', status: 'completed' });
    }

    assert(mod.flashHistory.length === 5, 'max_history respetado');
    assert(mod.flashHistory[0].flash_id === 'h-9', 'más reciente primero');

    await mod.onUnload();
  });

  // ============================================
  // GRUPO 9: Event handler
  // ============================================
  console.log('\n🔔 Event Handlers\n');

  await test('onBuildCompleted guarda referencia al último build', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    await mod.onBuildCompleted({
      data: {
        project_name: 'my-sensor',
        board: 'esp32dev',
        binary_path: '/data/projects/my-sensor/.pio/build/esp32dev/firmware.bin',
        binary_size: 512000
      }
    });

    assert(mod.lastBuild !== null, 'lastBuild guardado');
    assert(mod.lastBuild.project_name === 'my-sensor', 'project_name correcto');
    assert(mod.lastBuild.binary_path.includes('firmware.bin'), 'binary_path correcto');

    await mod.onUnload();
  });

  await test('onBuildCompleted ignora evento sin binary_path', async () => {
    const mod = new ESP32FlasherModule();
    await mod.onLoad(createMockCore());

    mod.lastBuild = null;
    await mod.onBuildCompleted({ data: { project_name: 'test' } });
    assert(mod.lastBuild === null, 'lastBuild no cambiado');

    await mod.onUnload();
  });

  // ============================================
  // GRUPO 10: Progress parsing
  // ============================================
  console.log('\n📈 Progress Parsing\n');

  await test('parseEsptoolProgress detecta etapas', async () => {
    const mod = new ESP32FlasherModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const flash = {
      progress: { stage: 'starting', percent: 0 },
      log: []
    };
    mod.activeFlashes.set('parse-test', flash);

    mod._parseEsptoolProgress('parse-test', ['Connecting...']);
    assert(flash.progress.stage === 'connecting', 'detecta connecting');

    mod._parseEsptoolProgress('parse-test', ['Chip is ESP32-D0WDQ6']);
    assert(flash.progress.stage === 'connected', 'detecta chip');

    mod._parseEsptoolProgress('parse-test', ['Erasing flash (this may take a while)...']);
    assert(flash.progress.stage === 'erasing', 'detecta erasing');

    mod._parseEsptoolProgress('parse-test', ['Writing at 0x00010000... (50 %)']);
    assert(flash.progress.stage === 'writing', 'detecta writing');
    assert(flash.progress.percent > 50, 'progreso > 50%');

    mod._parseEsptoolProgress('parse-test', ['Hash of data verified.']);
    assert(flash.progress.stage === 'verifying', 'detecta verifying');

    mod._parseEsptoolProgress('parse-test', ['Hard resetting via RTS pin...']);
    assert(flash.progress.stage === 'resetting', 'detecta resetting');

    // Verificar que publicó eventos de progreso
    const progressEvents = core.eventBus._published.filter(e => e.event === 'flash.progress');
    assert(progressEvents.length >= 6, 'publicó eventos de progreso');

    mod.activeFlashes.clear();
    await mod.onUnload();
  });

  // ============================================
  // Resumen
  // ============================================

  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed, ${testsPassed + testsFailed} total`);
  console.log('='.repeat(50) + '\n');

  cleanup();

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Fatal test error:', err);
  cleanup();
  process.exit(1);
});
