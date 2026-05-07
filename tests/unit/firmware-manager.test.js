/**
 * Tests para firmware-manager
 * Ejecutar con: node tests/unit/firmware-manager.test.js
 */

const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

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

const TEST_DATA_PATH = path.join(os.tmpdir(), '.tmp-test-firmware-' + process.pid);

function createMockCore(configOverrides = {}) {
  const published = [];
  const metrics = {
    _counters: {},
    _gauges: {},
    _timings: {},
    increment(name, value = 1) {
      this._counters[name] = (this._counters[name] || 0) + value;
    },
    decrement(name, value = 1) {
      this._counters[name] = (this._counters[name] || 0) - value;
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
      'firmware-manager': {
        data_path: TEST_DATA_PATH,
        ota_timeout_ms: 2000,
        ota_cleanup_interval_ms: 1000,
        validate_binaries_on_load: true,
        ...configOverrides
      }
    }
  };
}

function cleanup() {
  if (fs.existsSync(TEST_DATA_PATH)) {
    fs.rmSync(TEST_DATA_PATH, { recursive: true, force: true });
  }
}

function createTestBinary(filename, content = 'test firmware binary data') {
  const binDir = path.join(TEST_DATA_PATH, 'binaries');
  fs.mkdirSync(binDir, { recursive: true });
  const filePath = path.join(binDir, filename);
  fs.writeFileSync(filePath, content);
  return {
    path: filePath,
    sha256: crypto.createHash('sha256').update(content).digest('hex'),
    size: Buffer.byteLength(content)
  };
}

// ==========================================
// Tests
// ==========================================

async function runTests() {
  console.log('\n🧪 Testing firmware-manager\n');

  const FirmwareManagerModule = require('../../modules/firmware-manager/index');

  // ============================================
  // Group 1: Lifecycle & Config
  // ============================================
  console.log('\nGroup 1: Lifecycle & Config\n');

  cleanup();

  await test('onLoad: inicializa correctamente con config default', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    assert(mod.config.data_path === TEST_DATA_PATH, 'data_path correcto');
    assert(mod.config.ota_timeout_ms === 2000, `ota_timeout_ms correcto, got ${mod.config.ota_timeout_ms}`);
    assert(Object.keys(mod.catalog).length === 0, 'catálogo vacío');
    assert(mod.otaLog.length === 0, 'log vacío');

    await mod.onUnload();
  });

  cleanup();

  await test('onLoad: valida config inválida y usa fallbacks', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore({
      ota_timeout_ms: 5,
      auto_check_on_register: 'not_boolean'
    });
    await mod.onLoad(core);

    assert(mod.config.ota_timeout_ms === 300000, 'ota_timeout_ms debe usar fallback 300000');
    assert(mod.config.auto_check_on_register === true, 'auto_check debe ser true como fallback');

    await mod.onUnload();
  });

  cleanup();

  await test('onUnload: guarda catálogo y log', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    mod.catalog['test-type'] = {
      latest: '1.0.0',
      releases: { '1.0.0': { file: 'test.bin', sha256: 'abc', size: 100, date: new Date().toISOString() } }
    };
    mod.otaLog.push({ device_id: 'dev1', status: 'completed' });

    await mod.onUnload();

    const manifestPath = path.join(TEST_DATA_PATH, 'manifest.json');
    const otaLogPath = path.join(TEST_DATA_PATH, 'ota-log.json');
    assert(fs.existsSync(manifestPath), 'manifest.json debe existir');
    assert(fs.existsSync(otaLogPath), 'ota-log.json debe existir');

    const manifest = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));
    assert(manifest.catalog['test-type'].latest === '1.0.0', 'catálogo persistido');

    const log = JSON.parse(fs.readFileSync(otaLogPath, 'utf8'));
    assert(log.log.length === 1, 'log persistido');
  });

  cleanup();

  await test('onLoad: carga catálogo y log existentes', async () => {
    // Preparar datos
    fs.mkdirSync(TEST_DATA_PATH, { recursive: true });
    fs.writeFileSync(path.join(TEST_DATA_PATH, 'manifest.json'), JSON.stringify({
      _version: '1.0.0',
      catalog: {
        'esp32-gw': { latest: '2.0.0', releases: {
          '1.0.0': { file: 'a.bin', sha256: 'aaa', size: 50, date: '2025-01-01T00:00:00Z' },
          '2.0.0': { file: 'b.bin', sha256: 'bbb', size: 60, date: '2025-02-01T00:00:00Z' }
        }}
      }
    }));
    fs.writeFileSync(path.join(TEST_DATA_PATH, 'ota-log.json'), JSON.stringify({
      log: [{ device_id: 'x', status: 'completed' }]
    }));

    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    assert(Object.keys(mod.catalog).length === 1, 'catálogo cargado');
    assert(mod.catalog['esp32-gw'].latest === '2.0.0', 'latest correcto');
    assert(Object.keys(mod.catalog['esp32-gw'].releases).length === 2, '2 releases');
    assert(mod.otaLog.length === 1, 'log cargado');

    await mod.onUnload();
  });

  // ============================================
  // Group 2: handleRegister
  // ============================================
  console.log('\n📝 handleRegister\n');

  cleanup();

  await test('handleRegister: registra firmware correctamente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const bin = createTestBinary('gw-1.0.0.bin');

    const result = await mod.handleRegister({
      type: 'esp32-gateway',
      version: '1.0.0',
      file: 'gw-1.0.0.bin',
      changelog: 'Initial release'
    });

    assert(result.status === 201, `status 201, got ${result.status}`);
    assert(result.data.sha256 === bin.sha256, 'sha256 correcto');
    assert(result.data.size === bin.size, 'size correcto');
    assert(mod.catalog['esp32-gateway'].latest === '1.0.0', 'latest actualizado');

    // Verificar evento publicado
    const regEvent = core.eventBus._published.find(e => e.event === 'firmware.registered');
    assert(regEvent, 'evento firmware.registered publicado');
    assert(regEvent.data.type === 'esp32-gateway', 'evento con type correcto');

    // Verificar métricas
    assert(core.metrics.getCounter('firmware.catalog_entries.total') === 1, 'métrica catalog_entries incrementada');
    assert(core.metrics._timings['firmware.register.duration']?.length === 1, 'timing registrado');

    await mod.onUnload();
  });

  cleanup();

  await test('handleRegister: rechaza sin type', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleRegister({ version: '1.0.0', file: 'x.bin' });
    assert(result.status === 400, 'status 400');
    assert(result.error.message.includes('type'), 'error menciona type');

    await mod.onUnload();
  });

  cleanup();

  await test('handleRegister: rechaza sin version', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleRegister({ type: 'x', file: 'x.bin' });
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
  });

  cleanup();

  await test('handleRegister: rechaza version no-semver', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleRegister({ type: 'x', version: 'abc', file: 'x.bin' });
    assert(result.status === 400, 'status 400');
    assert(result.error.message.includes('semver'), 'error menciona semver');

    await mod.onUnload();
  });

  cleanup();

  await test('handleRegister: rechaza binario inexistente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleRegister({
      type: 'esp32-gateway',
      version: '1.0.0',
      file: 'no-existe.bin'
    });
    assert(result.status === 400, 'status 400');
    assert(result.error.message.includes('no encontrado'), 'error menciona no encontrado');

    await mod.onUnload();
  });

  // ============================================
  // Group 3: handleTriggerOta
  // ============================================
  console.log('\n🚀 handleTriggerOta\n');

  cleanup();

  await test('handleTriggerOta: dispara OTA correctamente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    core.eventBus._published.length = 0;
    core.metrics.reset();

    const result = await mod.handleTriggerOta({
      device_id: 'dev-001',
      type: 'esp32-gw',
      current_version: '0.9.0'
    });

    assert(result.status === 200, `status 200, got ${result.status}`);
    assert(result.data.target_version === '1.0.0', 'target version = latest');
    assert(result.data.firmware_url.includes('esp32-gw'), 'URL contiene type');
    assert(result.data.timeout_ms === 2000, 'timeout incluido en respuesta');

    // Verificar pending
    assert(mod.pendingOtas.has('dev-001'), 'OTA pendiente registrada');
    assert(mod.pendingOtas.get('dev-001').target_version === '1.0.0', 'target correcto');

    // Verificar eventos
    const shadowEvent = core.eventBus._published.find(e => e.event === 'shadow.set_desired');
    assert(shadowEvent, 'shadow.set_desired publicado');
    assert(shadowEvent.data.state.firmware.version === '1.0.0', 'desired firmware correcto');

    const otaEvent = core.eventBus._published.find(e => e.event === 'firmware.ota_requested');
    assert(otaEvent, 'firmware.ota_requested publicado');

    // Verificar métricas
    assert(core.metrics.getCounter('firmware.ota_requested.total') === 1, 'métrica ota_requested incrementada');
    assert(core.metrics._gauges['firmware.pending_otas.count'] === 1, 'gauge pending_otas = 1');

    await mod.onUnload();
  });

  cleanup();

  await test('handleTriggerOta: rechaza sin device_id', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleTriggerOta({ type: 'x' });
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
  });

  cleanup();

  await test('handleTriggerOta: rechaza tipo no existente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleTriggerOta({ device_id: 'dev-001', type: 'inexistente' });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
  });

  cleanup();

  await test('handleTriggerOta: rechaza min_version no cumplida', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-2.0.0.bin');
    await mod.handleRegister({
      type: 'esp32-gw',
      version: '2.0.0',
      file: 'gw-2.0.0.bin',
      min_version: '1.5.0'
    });

    const result = await mod.handleTriggerOta({
      device_id: 'dev-001',
      type: 'esp32-gw',
      version: '2.0.0',
      current_version: '1.0.0'
    });

    assert(result.status === 400, 'status 400');
    assert(result.error.message.includes('mínima'), 'error menciona versión mínima');

    await mod.onUnload();
  });

  cleanup();

  await test('handleTriggerOta: reemplaza OTA pendiente existente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    createTestBinary('gw-2.0.0.bin', 'v2 binary data');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleRegister({ type: 'esp32-gw', version: '2.0.0', file: 'gw-2.0.0.bin' });

    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw', version: '1.0.0' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw', version: '2.0.0' });

    assert(mod.pendingOtas.get('dev-001').target_version === '2.0.0', 'OTA reemplazada con versión nueva');
    assert(mod.pendingOtas.size === 1, 'solo 1 OTA pendiente');

    await mod.onUnload();
  });

  // ============================================
  // Group 4: onShadowUpdated (OTA completion)
  // ============================================
  console.log('\n📡 onShadowUpdated\n');

  cleanup();

  await test('onShadowUpdated: detecta OTA completada', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw', current_version: '0.9.0' });
    core.eventBus._published.length = 0;
    core.metrics.reset();

    await mod.onShadowUpdated({
      data: {
        device_id: 'dev-001',
        reported: { firmware: { version: '1.0.0' } }
      }
    });

    assert(!mod.pendingOtas.has('dev-001'), 'OTA removida de pendientes');
    assert(core.metrics.getCounter('firmware.ota_completed.total') === 1, 'métrica completed');
    assert(core.metrics._gauges['firmware.pending_otas.count'] === 0, 'gauge pending = 0');
    assert(core.metrics._timings['firmware.ota.duration']?.length === 1, 'timing registrado');

    const completedEvent = core.eventBus._published.find(e => e.event === 'firmware.ota_completed');
    assert(completedEvent, 'evento ota_completed publicado');
    assert(completedEvent.data.from === '0.9.0', 'from correcto');
    assert(completedEvent.data.to === '1.0.0', 'to correcto');
    assert(completedEvent.data.duration_ms >= 0, 'duration_ms presente');

    assert(mod.otaLog.length > 0, 'log actualizado');
    assert(mod.otaLog[0].status === 'completed', 'log status = completed');

    await mod.onUnload();
  });

  cleanup();

  await test('onShadowUpdated: detecta OTA fallida (version_mismatch)', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-2.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '2.0.0', file: 'gw-2.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw', current_version: '1.0.0' });
    core.metrics.reset();

    await mod.onShadowUpdated({
      data: {
        device_id: 'dev-001',
        reported: { firmware: '1.5.0' }
      }
    });

    assert(!mod.pendingOtas.has('dev-001'), 'OTA removida');
    assert(core.metrics.getCounter('firmware.ota_failed.total') === 1, 'métrica failed');

    const failedLog = mod.otaLog.find(l => l.status === 'failed');
    assert(failedLog, 'log de fallo');
    assert(failedLog.reason === 'version_mismatch', 'reason = version_mismatch');
    assert(failedLog.actual === '1.5.0', 'actual registrado');

    await mod.onUnload();
  });

  cleanup();

  await test('onShadowUpdated: ignora si firmware no cambió (aún descargando)', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-2.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '2.0.0', file: 'gw-2.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw', current_version: '1.0.0' });

    await mod.onShadowUpdated({
      data: { device_id: 'dev-001', reported: { firmware: '1.0.0' } }
    });

    assert(mod.pendingOtas.has('dev-001'), 'OTA sigue pendiente');

    await mod.onUnload();
  });

  cleanup();

  await test('onShadowUpdated: ignora device sin OTA pendiente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);
    core.metrics.reset();

    await mod.onShadowUpdated({
      data: { device_id: 'dev-random', reported: { firmware: '5.0.0' } }
    });

    assert(core.metrics.getCounter('firmware.ota_completed.total') === 0, 'sin métricas');

    await mod.onUnload();
  });

  cleanup();

  await test('onShadowUpdated: ignora sin reported.firmware', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    mod.pendingOtas.set('dev-001', { target_version: '1.0.0', type: 'x', requested_at: new Date().toISOString() });

    await mod.onShadowUpdated({ data: { device_id: 'dev-001', reported: { temperature: 25 } } });

    assert(mod.pendingOtas.has('dev-001'), 'OTA sigue pendiente');

    await mod.onUnload();
  });

  // ============================================
  // Group 5: OTA Timeout
  // ============================================
  console.log('\n⏱️  OTA Timeout\n');

  cleanup();

  await test('OTA timeout: marca como fallida tras timeout', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore({ ota_timeout_ms: 200 });
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw' });

    assert(mod.pendingOtas.has('dev-001'), 'OTA pendiente antes del timeout');

    // Esperar a que expire el timeout
    await new Promise(resolve => setTimeout(resolve, 400));

    assert(!mod.pendingOtas.has('dev-001'), 'OTA removida tras timeout');

    const failedEvent = core.eventBus._published.find(
      e => e.event === 'firmware.ota_failed' && e.data.reason === 'timeout'
    );
    assert(failedEvent, 'evento ota_failed con reason=timeout');
    assert(core.metrics.getCounter('firmware.ota_timeout.total') >= 1, 'métrica timeout');

    await mod.onUnload();
  });

  cleanup();

  await test('OTA timeout: se cancela si OTA completa antes', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore({ ota_timeout_ms: 500 });
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw' });

    // Completar OTA antes del timeout
    await mod.onShadowUpdated({
      data: { device_id: 'dev-001', reported: { firmware: '1.0.0' } }
    });

    assert(!mod.pendingOtas.has('dev-001'), 'OTA completada');
    assert(!mod._otaTimeoutTimers.has('dev-001'), 'timer cancelado');

    // Esperar para confirmar que no hay efecto secundario
    await new Promise(resolve => setTimeout(resolve, 600));

    const timeoutEvents = core.eventBus._published.filter(
      e => e.event === 'firmware.ota_failed' && e.data?.reason === 'timeout'
    );
    assert(timeoutEvents.length === 0, 'no hay eventos de timeout falsos');

    await mod.onUnload();
  });

  // ============================================
  // Group 6: handleCleanupOtas
  // ============================================
  console.log('\n🧹 handleCleanupOtas\n');

  cleanup();

  await test('handleCleanupOtas: limpia OTA específica', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw' });
    await mod.handleTriggerOta({ device_id: 'dev-002', type: 'esp32-gw' });

    const result = await mod.handleCleanupOtas({ device_id: 'dev-001' });

    assert(result.status === 200, 'status 200');
    assert(result.data.cleaned === 1, '1 limpiada');
    assert(result.data.remaining === 1, '1 restante');
    assert(!mod.pendingOtas.has('dev-001'), 'dev-001 limpiada');
    assert(mod.pendingOtas.has('dev-002'), 'dev-002 intacta');

    await mod.onUnload();
  });

  cleanup();

  await test('handleCleanupOtas: limpia todas las OTAs', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw' });
    await mod.handleTriggerOta({ device_id: 'dev-002', type: 'esp32-gw' });

    const result = await mod.handleCleanupOtas({});

    assert(result.status === 200, 'status 200');
    assert(result.data.cleaned === 2, '2 limpiadas');
    assert(result.data.remaining === 0, '0 restantes');
    assert(mod.pendingOtas.size === 0, 'map vacío');

    await mod.onUnload();
  });

  // ============================================
  // Group 7: handleOtaStatus
  // ============================================
  console.log('\n📊 handleOtaStatus\n');

  cleanup();

  await test('handleOtaStatus: muestra pendientes con info de timeout', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw' });

    const result = await mod.handleOtaStatus({});

    assert(result.status === 200, 'status 200');
    assert(result.data.pending_count === 1, '1 pendiente');
    assert(result.data.pending[0].device_id === 'dev-001', 'device correcto');
    assert(typeof result.data.pending[0].elapsed_ms === 'number', 'elapsed_ms presente');
    assert(typeof result.data.pending[0].remaining_ms === 'number', 'remaining_ms presente');
    assert(result.data.pending[0].timeout_ms === 2000, 'timeout_ms presente');

    await mod.onUnload();
  });

  cleanup();

  await test('handleOtaStatus: filtra por device_id', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleTriggerOta({ device_id: 'dev-001', type: 'esp32-gw' });
    await mod.handleTriggerOta({ device_id: 'dev-002', type: 'esp32-gw' });

    const result = await mod.handleOtaStatus({ device_id: 'dev-002' });

    assert(result.data.pending_count === 1, 'solo 1');
    assert(result.data.pending[0].device_id === 'dev-002', 'dev-002 filtrado');

    await mod.onUnload();
  });

  // ============================================
  // Group 8: handleRollback
  // ============================================
  console.log('\n⏪ handleRollback\n');

  cleanup();

  await test('handleRollback: ejecuta rollback correctamente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-1.0.0.bin');
    createTestBinary('gw-2.0.0.bin', 'v2 data');
    await mod.handleRegister({ type: 'esp32-gw', version: '1.0.0', file: 'gw-1.0.0.bin' });
    await mod.handleRegister({ type: 'esp32-gw', version: '2.0.0', file: 'gw-2.0.0.bin' });
    core.metrics.reset();

    const result = await mod.handleRollback({
      device_id: 'dev-001',
      type: 'esp32-gw',
      target_version: '1.0.0'
    });

    assert(result.status === 200, 'status 200');
    assert(result.data.target_version === '1.0.0', 'target = 1.0.0 (rollback)');
    assert(core.metrics.getCounter('firmware.rollback.total') === 1, 'métrica rollback');

    await mod.onUnload();
  });

  cleanup();

  await test('handleRollback: rechaza sin target_version', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleRollback({ device_id: 'dev-001', type: 'x' });
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
  });

  // ============================================
  // Group 9: handleList & handleDeviceVersions
  // ============================================
  console.log('\n📋 handleList & handleDeviceVersions\n');

  cleanup();

  await test('handleList: lista catálogo', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('a.bin');
    createTestBinary('b.bin', 'otro');
    await mod.handleRegister({ type: 'type-a', version: '1.0.0', file: 'a.bin' });
    await mod.handleRegister({ type: 'type-b', version: '2.0.0', file: 'b.bin' });

    const result = await mod.handleList();

    assert(result.status === 200, 'status 200');
    assert(result.data.total === 2, '2 tipos');
    assert(result.data.types.find(t => t.type === 'type-a'), 'type-a presente');
    assert(result.data.types.find(t => t.type === 'type-b'), 'type-b presente');

    await mod.onUnload();
  });

  cleanup();

  await test('handleDeviceVersions: lista historial de OTA', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    mod.otaLog = [
      { device_id: 'dev-001', type: 'gw', from: '1.0.0', to: '2.0.0', status: 'completed', completed_at: '2025-01-01T00:00:00Z' },
      { device_id: 'dev-002', type: 'gw', from: '1.0.0', to: '2.0.0', status: 'failed', failed_at: '2025-01-01T01:00:00Z' }
    ];

    const all = await mod.handleDeviceVersions({});
    assert(all.data.total === 2, 'total 2');

    const filtered = await mod.handleDeviceVersions({ device_id: 'dev-001' });
    assert(filtered.data.total === 1, 'total 1 filtrado');
    assert(filtered.data.versions[0].device_id === 'dev-001', 'dev-001 filtrado');

    await mod.onUnload();
  });

  // ============================================
  // Group 10: handleServeBinary
  // ============================================
  console.log('\n📦 handleServeBinary\n');

  cleanup();

  await test('handleServeBinary: sirve binario existente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const content = 'fake firmware binary 12345';
    createTestBinary('test-fw.bin', content);

    const result = await mod.handleServeBinary({ params: { type: 'x', version: '1.0.0', file: 'test-fw.bin' } });

    assert(result.status === 200, 'status 200');
    assert(result.headers['Content-Type'] === 'application/octet-stream', 'content-type correcto');
    assert(result.body.toString() === content, 'contenido correcto');
    assert(core.metrics.getCounter('firmware.binary_served.total') === 1, 'métrica served');

    await mod.onUnload();
  });

  cleanup();

  await test('handleServeBinary: 404 para binario inexistente', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleServeBinary({ params: { type: 'x', version: '1.0.0', file: 'nope.bin' } });

    assert(result.status === 404, 'status 404');
    assert(core.metrics.getCounter('firmware.binary_served.errors') === 1, 'métrica error');

    await mod.onUnload();
  });

  // ============================================
  // Group 11: onDeviceRegistered
  // ============================================
  console.log('\n📱 onDeviceRegistered\n');

  cleanup();

  await test('onDeviceRegistered: detecta firmware desactualizado', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-2.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '2.0.0', file: 'gw-2.0.0.bin' });
    core.metrics.reset();

    await mod.onDeviceRegistered({
      data: {
        device: { device_id: 'dev-001', type: 'esp32-gw', firmware: '1.0.0' }
      }
    });

    assert(core.metrics.getCounter('firmware.device_outdated.total') === 1, 'métrica outdated');

    await mod.onUnload();
  });

  cleanup();

  await test('onDeviceRegistered: no alerta si firmware al día', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();
    await mod.onLoad(core);

    createTestBinary('gw-2.0.0.bin');
    await mod.handleRegister({ type: 'esp32-gw', version: '2.0.0', file: 'gw-2.0.0.bin' });
    core.metrics.reset();

    await mod.onDeviceRegistered({
      data: {
        device: { device_id: 'dev-001', type: 'esp32-gw', firmware: '2.0.0' }
      }
    });

    assert(core.metrics.getCounter('firmware.device_outdated.total') === 0, 'sin métrica outdated');

    await mod.onUnload();
  });

  // ============================================
  // Group 12: Validación de integridad
  // ============================================
  console.log('\n🔍 Validación de integridad\n');

  cleanup();

  await test('_validateCatalogIntegrity: detecta binarios faltantes', async () => {
    const mod = new FirmwareManagerModule();
    const core = createMockCore();

    // Preparar catálogo con referencia a binario que no existe
    fs.mkdirSync(path.join(TEST_DATA_PATH, 'binaries'), { recursive: true });
    fs.writeFileSync(path.join(TEST_DATA_PATH, 'manifest.json'), JSON.stringify({
      catalog: {
        'esp32-gw': {
          latest: '1.0.0',
          releases: {
            '1.0.0': { file: 'missing.bin', sha256: 'aaa', size: 100, date: '2025-01-01T00:00:00Z' }
          }
        }
      }
    }));
    // Crear un binario que sí existe
    createTestBinary('exists.bin');
    fs.writeFileSync(path.join(TEST_DATA_PATH, 'manifest.json'), JSON.stringify({
      catalog: {
        'esp32-gw': {
          latest: '2.0.0',
          releases: {
            '1.0.0': { file: 'missing.bin', sha256: 'aaa', size: 100, date: '2025-01-01T00:00:00Z' },
            '2.0.0': { file: 'exists.bin', sha256: 'bbb', size: 200, date: '2025-02-01T00:00:00Z' }
          }
        }
      }
    }));

    await mod.onLoad(core);

    assert(core.metrics._gauges['firmware.catalog_valid_binaries.count'] === 1, '1 válido');
    assert(core.metrics._gauges['firmware.catalog_missing_binaries.count'] === 1, '1 faltante');

    await mod.onUnload();
  });

  // ============================================
  // Group 13: _compareVersions
  // ============================================
  console.log('\n🔢 _compareVersions\n');

  await test('_compareVersions: comparaciones correctas', async () => {
    const mod = new FirmwareManagerModule();

    assert(mod._compareVersions('1.0.0', '1.0.0') === 0, '1.0.0 == 1.0.0');
    assert(mod._compareVersions('1.0.0', '2.0.0') === -1, '1.0.0 < 2.0.0');
    assert(mod._compareVersions('2.0.0', '1.0.0') === 1, '2.0.0 > 1.0.0');
    assert(mod._compareVersions('1.1.0', '1.0.0') === 1, '1.1.0 > 1.0.0');
    assert(mod._compareVersions('1.0.1', '1.0.0') === 1, '1.0.1 > 1.0.0');
    assert(mod._compareVersions('0.9.9', '1.0.0') === -1, '0.9.9 < 1.0.0');
    assert(mod._compareVersions('1.0', '1.0.0') === 0, '1.0 == 1.0.0 (parcial)');
  });

  // ============================================
  // RESULTADOS
  // ============================================

  cleanup();

  console.log(`\n${'='.repeat(60)}`);
  console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed, ${testsPassed + testsFailed} total`);
  console.log(`${'='.repeat(60)}\n`);

  if (testsFailed > 0) {
    process.exit(1);
  }
}

runTests().catch(error => {
  console.error('Fatal error:', error);
  cleanup();
  process.exit(1);
});
