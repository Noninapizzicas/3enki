/**
 * Tests para esp32-dev
 * Ejecutar con: node tests/unit/esp32-dev.test.js
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

const TEST_DATA_PATH = path.join(__dirname, '..', '.tmp-test-esp32-dev');

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
      'esp32-dev': {
        data_path: TEST_DATA_PATH,
        platformio_path: 'platformio',
        build_timeout_ms: 5000,
        max_concurrent_builds: 2,
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

// ==========================================
// Tests
// ==========================================

async function runTests() {
  console.log('\n🧪 Testing esp32-dev\n');

  const ESP32DevModule = require('../../modules/esp32-dev/index');

  // ============================================
  // GRUPO 1: Lifecycle
  // ============================================
  console.log('\n📦 Lifecycle\n');

  await test('onLoad inicializa correctamente', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    const core = createMockCore();
    await mod.onLoad(core);

    assert(mod.eventBus === core.eventBus, 'eventBus asignado');
    assert(mod.logger === core.logger, 'logger asignado');
    assert(mod.config.data_path === path.resolve(TEST_DATA_PATH), 'data_path resuelto');
    assert(mod.templates.size > 0, 'templates cargados');

    await mod.onUnload();
    cleanup();
  });

  await test('onLoad crea directorios base', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    assert(fs.existsSync(path.resolve(TEST_DATA_PATH)), 'data_path existe');
    assert(fs.existsSync(path.join(path.resolve(TEST_DATA_PATH), 'projects')), 'projects/ existe');

    await mod.onUnload();
    cleanup();
  });

  await test('onLoad aplica config custom', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore({ build_timeout_ms: 10000 }));

    assert(mod.config.build_timeout_ms === 10000, 'build_timeout_ms aplicado');

    await mod.onUnload();
    cleanup();
  });

  await test('onUnload guarda estado y limpia builds', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());
    await mod.onUnload();

    // No debe lanzar error
    assert(mod.activeBuilds.size === 0, 'builds limpiados');
    cleanup();
  });

  // ============================================
  // GRUPO 2: Templates
  // ============================================
  console.log('\n📋 Templates\n');

  await test('list-templates devuelve templates built-in', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleListTemplates({});
    assert(result.status === 200, 'status 200');
    assert(result.data.total >= 3, 'al menos 3 templates (kiosk, sensor, gateway)');
    assert(result.data.templates.length === result.data.total, 'total coincide');

    // Verificar que tienen las propiedades esperadas
    const tpl = result.data.templates[0];
    assert(tpl.id, 'tiene id');
    assert(tpl.name, 'tiene name');
    assert(tpl.description, 'tiene description');
    assert(tpl.framework, 'tiene framework');
    assert(tpl.boards && tpl.boards.length > 0, 'tiene boards');

    await mod.onUnload();
    cleanup();
  });

  await test('list-templates filtra por framework', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleListTemplates({ framework: 'arduino' });
    assert(result.status === 200, 'status 200');
    assert(result.data.templates.every(t => t.framework === 'arduino'), 'todos son arduino');

    const noResults = await mod.handleListTemplates({ framework: 'espidf' });
    assert(noResults.data.total === 0, 'no hay templates espidf (todos son arduino)');

    await mod.onUnload();
    cleanup();
  });

  await test('list-templates filtra por board', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleListTemplates({ board: 'esp32dev' });
    assert(result.status === 200, 'status 200');
    assert(result.data.templates.every(t => t.boards.includes('esp32dev')), 'todos soportan esp32dev');

    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 3: Create Project
  // ============================================
  console.log('\n🔨 Create Project\n');

  await test('create-project crea proyecto desde template', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    const core = createMockCore();
    await mod.onLoad(core);

    const result = await mod.handleCreateProject({
      project_name: 'test-sensor',
      template: 'sensor-mqtt',
      board: 'esp32dev'
    });

    assert(result.status === 201, 'status 201');
    assert(result.data.project_name === 'test-sensor', 'nombre correcto');
    assert(result.data.template === 'sensor-mqtt', 'template correcto');
    assert(result.data.board === 'esp32dev', 'board correcto');
    assert(result.data.framework === 'arduino', 'framework por defecto');

    // Verificar archivos creados
    const projectDir = path.join(path.resolve(TEST_DATA_PATH), 'projects', 'test-sensor');
    assert(fs.existsSync(projectDir), 'directorio creado');
    assert(fs.existsSync(path.join(projectDir, 'platformio.ini')), 'platformio.ini creado');
    assert(fs.existsSync(path.join(projectDir, 'src', 'main.cpp')), 'main.cpp creado');
    assert(fs.existsSync(path.join(projectDir, 'src', 'config.h')), 'config.h creado');

    // Verificar que platformio.ini tiene el board correcto
    const iniContent = fs.readFileSync(path.join(projectDir, 'platformio.ini'), 'utf-8');
    assert(iniContent.includes('esp32dev'), 'platformio.ini contiene board');

    // Verificar evento publicado
    const event = core.eventBus._published.find(e => e.event === 'esp32.project_created');
    assert(event, 'evento esp32.project_created publicado');
    assert(event.data.project_name === 'test-sensor', 'evento tiene project_name');

    // Verificar métrica
    assert(core.metrics.getCounter('esp32.project_created.total') === 1, 'métrica incrementada');

    await mod.onUnload();
    cleanup();
  });

  await test('create-project aplica variables de template', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({
      project_name: 'my-kiosk',
      template: 'kiosk-webview',
      board: 'esp32-p4',
      vars: {
        WIFI_SSID: 'MiRed',
        MQTT_HOST: '192.168.1.100',
        KIOSK_URL: 'http://server:5173/peppone/cocina',
        DEVICE_NAME: 'cocina-pizzas'
      }
    });

    const configPath = path.join(path.resolve(TEST_DATA_PATH), 'projects', 'my-kiosk', 'src', 'config.h');
    const content = fs.readFileSync(configPath, 'utf-8');

    assert(content.includes('"MiRed"'), 'WIFI_SSID sustituido');
    assert(content.includes('"192.168.1.100"'), 'MQTT_HOST sustituido');
    assert(content.includes('http://server:5173/peppone/cocina'), 'KIOSK_URL sustituido');
    assert(content.includes('"cocina-pizzas"'), 'DEVICE_NAME sustituido');

    await mod.onUnload();
    cleanup();
  });

  await test('create-project rechaza nombre inválido', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleCreateProject({
      project_name: 'My Project!',
      template: 'sensor-mqtt'
    });

    assert(result.status === 400, 'status 400');
    assert(result.error.code === 'INVALID_FORMAT', 'code INVALID_FORMAT');

    await mod.onUnload();
    cleanup();
  });

  await test('create-project rechaza template inexistente', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleCreateProject({
      project_name: 'test-project',
      template: 'no-existe'
    });

    assert(result.status === 404, 'status 404');

    await mod.onUnload();
    cleanup();
  });

  await test('create-project rechaza board inexistente', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleCreateProject({
      project_name: 'test-project',
      template: 'sensor-mqtt',
      board: 'arduino-mega'
    });

    assert(result.status === 400, 'status 400');
    assert(result.error.code === 'INVALID_INPUT', 'code INVALID_INPUT');

    await mod.onUnload();
    cleanup();
  });

  await test('create-project rechaza duplicado', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({
      project_name: 'duplicado',
      template: 'sensor-mqtt'
    });

    const result = await mod.handleCreateProject({
      project_name: 'duplicado',
      template: 'sensor-mqtt'
    });

    assert(result.status === 409, 'status 409');
    assert(result.error.code === 'ALREADY_EXISTS', 'code ALREADY_EXISTS');

    await mod.onUnload();
    cleanup();
  });

  await test('create-project sin project_name retorna 400', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleCreateProject({ template: 'sensor-mqtt' });
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
    cleanup();
  });

  await test('create-project sin template retorna 400', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleCreateProject({ project_name: 'test' });
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 4: List & Get Projects
  // ============================================
  console.log('\n📂 List & Get Projects\n');

  await test('list-projects devuelve lista vacía inicialmente', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleListProjects();
    assert(result.status === 200, 'status 200');
    assert(result.data.total === 0, 'sin proyectos');

    await mod.onUnload();
    cleanup();
  });

  await test('list-projects devuelve proyectos creados', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({ project_name: 'proj-a', template: 'sensor-mqtt' });
    await mod.handleCreateProject({ project_name: 'proj-b', template: 'kiosk-webview', board: 'esp32-p4' });

    const result = await mod.handleListProjects();
    assert(result.status === 200, 'status 200');
    assert(result.data.total === 2, '2 proyectos');

    const names = result.data.projects.map(p => p.name);
    assert(names.includes('proj-a'), 'contiene proj-a');
    assert(names.includes('proj-b'), 'contiene proj-b');

    await mod.onUnload();
    cleanup();
  });

  await test('get-project devuelve detalle de proyecto', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({ project_name: 'detail-test', template: 'sensor-mqtt' });

    const result = await mod.handleGetProject({ project_name: 'detail-test' });
    assert(result.status === 200, 'status 200');
    assert(result.data.name === 'detail-test', 'nombre correcto');
    assert(result.data.template === 'sensor-mqtt', 'template correcto');
    assert(result.data.files && result.data.files.length > 0, 'tiene archivos');
    assert(result.data.is_building === false, 'no está compilando');
    assert(result.data.binary === null, 'sin binario (no compilado)');

    await mod.onUnload();
    cleanup();
  });

  await test('get-project retorna 404 para proyecto inexistente', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleGetProject({ project_name: 'no-existe' });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 5: Delete Project
  // ============================================
  console.log('\n🗑️  Delete Project\n');

  await test('delete-project elimina proyecto', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({ project_name: 'to-delete', template: 'sensor-mqtt' });

    const result = await mod.handleDeleteProject({ project_name: 'to-delete', confirm: true });
    assert(result.status === 200, 'status 200');
    assert(result.data.deleted === 'to-delete', 'nombre devuelto');

    // Verificar que ya no existe
    const list = await mod.handleListProjects();
    assert(list.data.total === 0, 'lista vacía');

    const projectDir = path.join(path.resolve(TEST_DATA_PATH), 'projects', 'to-delete');
    assert(!fs.existsSync(projectDir), 'directorio eliminado');

    await mod.onUnload();
    cleanup();
  });

  await test('delete-project requiere confirm', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({ project_name: 'no-confirm', template: 'sensor-mqtt' });

    const result = await mod.handleDeleteProject({ project_name: 'no-confirm' });
    assert(result.status === 400, 'status 400 sin confirm');

    // Verificar que sigue existiendo
    const list = await mod.handleListProjects();
    assert(list.data.total === 1, 'proyecto sigue existiendo');

    await mod.onUnload();
    cleanup();
  });

  await test('delete-project retorna 404 si no existe', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleDeleteProject({ project_name: 'fantasma', confirm: true });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 6: Build
  // ============================================
  console.log('\n⚙️  Build\n');

  await test('build retorna 404 si proyecto no existe', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleBuild({ project_name: 'no-existe' });
    assert(result.status === 404, 'status 404');

    await mod.onUnload();
    cleanup();
  });

  await test('build retorna 400 sin project_name', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleBuild({});
    assert(result.status === 400, 'status 400');

    await mod.onUnload();
    cleanup();
  });

  await test('build retorna 202 y lanza compilación', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    const core = createMockCore();
    await mod.onLoad(core);

    await mod.handleCreateProject({ project_name: 'build-test', template: 'sensor-mqtt' });

    const result = await mod.handleBuild({ project_name: 'build-test' });
    assert(result.status === 202, 'status 202 (accepted)');
    assert(result.data.status === 'building', 'estado building');

    // Verificar evento de build_started
    const startEvent = core.eventBus._published.find(e => e.event === 'esp32.build_started');
    assert(startEvent, 'evento esp32.build_started publicado');

    // Verificar métrica
    assert(core.metrics.getCounter('esp32.build_started.total') === 1, 'métrica build_started');

    // Esperar un momento para que el build falle (platformio no está instalado en tests)
    await new Promise(r => setTimeout(r, 500));

    await mod.onUnload();
    cleanup();
  });

  await test('build rechaza si ya está compilando', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({ project_name: 'concurrent', template: 'sensor-mqtt' });

    // Simular build activo
    mod.activeBuilds.set('concurrent', { started_at: new Date().toISOString(), log: [] });

    const result = await mod.handleBuild({ project_name: 'concurrent' });
    assert(result.status === 409, 'status 409 (conflict)');

    mod.activeBuilds.clear();
    await mod.onUnload();
    cleanup();
  });

  await test('build respeta max_concurrent_builds', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore({ max_concurrent_builds: 1 }));

    await mod.handleCreateProject({ project_name: 'proj-1', template: 'sensor-mqtt' });
    await mod.handleCreateProject({ project_name: 'proj-2', template: 'sensor-mqtt' });

    // Simular 1 build activo
    mod.activeBuilds.set('proj-1', { started_at: new Date().toISOString(), log: [] });

    const result = await mod.handleBuild({ project_name: 'proj-2' });
    assert(result.status === 429, 'status 429 (too many)');

    mod.activeBuilds.clear();
    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 7: Build Status
  // ============================================
  console.log('\n📊 Build Status\n');

  await test('build-status sin builds activos', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleBuildStatus({});
    assert(result.status === 200, 'status 200');
    assert(result.data.count === 0, 'sin builds activos');

    await mod.onUnload();
    cleanup();
  });

  await test('build-status muestra build activo', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    mod.activeBuilds.set('test-proj', {
      started_at: new Date().toISOString(),
      log: ['line1', 'line2'],
      process: null
    });

    const result = await mod.handleBuildStatus({ project_name: 'test-proj' });
    assert(result.status === 200, 'status 200');
    assert(result.data.status === 'building', 'estado building');
    assert(result.data.log_lines === 2, '2 líneas de log');

    mod.activeBuilds.clear();
    await mod.onUnload();
    cleanup();
  });

  await test('build-status muestra último build de proyecto', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({ project_name: 'status-test', template: 'sensor-mqtt' });

    const result = await mod.handleBuildStatus({ project_name: 'status-test' });
    assert(result.status === 200, 'status 200');
    assert(result.data.status === 'never', 'nunca compilado');

    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 8: List Boards
  // ============================================
  console.log('\n🔧 List Boards\n');

  await test('list-boards devuelve boards soportados', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const result = await mod.handleListBoards();
    assert(result.status === 200, 'status 200');
    assert(result.data.total >= 6, 'al menos 6 boards');

    const ids = result.data.boards.map(b => b.id);
    assert(ids.includes('esp32dev'), 'contiene esp32dev');
    assert(ids.includes('esp32-s3'), 'contiene esp32-s3');
    assert(ids.includes('esp32-p4'), 'contiene esp32-p4');
    assert(ids.includes('esp32-c3'), 'contiene esp32-c3');

    // Verificar propiedades
    const board = result.data.boards.find(b => b.id === 'esp32-p4');
    assert(board.name === 'ESP32-P4', 'nombre correcto');
    assert(board.psram === true, 'tiene PSRAM');
    assert(board.flash === '16MB', 'flash correcto');

    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 9: Persistencia
  // ============================================
  console.log('\n💾 Persistencia\n');

  await test('proyectos persisten entre cargas', async () => {
    cleanup();

    // Primera sesión: crear proyecto
    const mod1 = new ESP32DevModule();
    await mod1.onLoad(createMockCore());
    await mod1.handleCreateProject({ project_name: 'persist-test', template: 'sensor-mqtt' });
    await mod1.onUnload();

    // Segunda sesión: verificar que existe
    const mod2 = new ESP32DevModule();
    await mod2.onLoad(createMockCore());

    const result = await mod2.handleListProjects();
    assert(result.data.total === 1, 'proyecto persiste');
    assert(result.data.projects[0].name === 'persist-test', 'nombre correcto');

    await mod2.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 10: Template rendering
  // ============================================
  console.log('\n🖌️  Template Rendering\n');

  await test('variables no proporcionadas se mantienen como placeholder', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({
      project_name: 'no-vars',
      template: 'sensor-mqtt'
    });

    const configPath = path.join(path.resolve(TEST_DATA_PATH), 'projects', 'no-vars', 'src', 'config.h');
    const content = fs.readFileSync(configPath, 'utf-8');

    // Variables no sustituidas se mantienen como {{VAR}}
    assert(content.includes('{{WIFI_SSID}}'), 'WIFI_SSID sin sustituir');
    assert(content.includes('{{MQTT_HOST}}'), 'MQTT_HOST sin sustituir');

    // Variables automáticas sí se sustituyen
    const iniPath = path.join(path.resolve(TEST_DATA_PATH), 'projects', 'no-vars', 'platformio.ini');
    const iniContent = fs.readFileSync(iniPath, 'utf-8');
    assert(!iniContent.includes('{{BOARD}}'), 'BOARD sustituido en platformio.ini');
    assert(iniContent.includes('esp32dev'), 'BOARD reemplazado por esp32dev');

    await mod.onUnload();
    cleanup();
  });

  await test('gateway-printer template genera archivos correctos', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    await mod.handleCreateProject({
      project_name: 'my-printer',
      template: 'gateway-printer',
      vars: {
        PRINTER_BLE_NAME: 'NT-1809',
        DEVICE_NAME: 'barra-printer'
      }
    });

    const projectDir = path.join(path.resolve(TEST_DATA_PATH), 'projects', 'my-printer');

    // Verificar que platformio.ini tiene NimBLE
    const iniContent = fs.readFileSync(path.join(projectDir, 'platformio.ini'), 'utf-8');
    assert(iniContent.includes('NimBLE'), 'incluye lib NimBLE');

    // Verificar que config.h tiene el nombre de la impresora
    const configContent = fs.readFileSync(path.join(projectDir, 'src', 'config.h'), 'utf-8');
    assert(configContent.includes('"NT-1809"'), 'PRINTER_BLE_NAME sustituido');
    assert(configContent.includes('"barra-printer"'), 'DEVICE_NAME sustituido');

    await mod.onUnload();
    cleanup();
  });

  // ============================================
  // GRUPO 11: Helpers POC2
  // ============================================
  console.log('\n🔩 Helpers POC2\n');

  await test('_errorResponse construye shape canónico { status, error: { code, message, details? } }', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    const r = mod._errorResponse(404, 'RESOURCE_NOT_FOUND', 'no existe', { entity_type: 'project' });
    assert(r.status === 404, 'status 404');
    assert(r.error.code === 'RESOURCE_NOT_FOUND', 'code correcto');
    assert(r.error.message === 'no existe', 'message correcto');
    assert(r.error.details.entity_type === 'project', 'details.entity_type');
    assert(!r.data, 'sin data');

    const r2 = mod._errorResponse(400, 'MISSING_FIELD', 'campo requerido');
    assert(!r2.error.details, 'sin details cuando no se pasan');

    await mod.onUnload();
    cleanup();
  });

  await test('_classifyHandlerError mapea ENOENT a FILESYSTEM_ERROR', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    await mod.onLoad(createMockCore());

    assert(mod._classifyHandlerError(new Error('ENOENT: no such file')) === 'FILESYSTEM_ERROR', 'ENOENT → FILESYSTEM_ERROR');
    assert(mod._classifyHandlerError(new Error('timeout expired')) === 'TIMEOUT', 'timeout → TIMEOUT');
    assert(mod._classifyHandlerError(new Error('unexpected')) === 'UNKNOWN_ERROR', 'genérico → UNKNOWN_ERROR');

    await mod.onUnload();
    cleanup();
  });

  await test('_publicarEvento hereda correlation_id del sourcePayload', async () => {
    cleanup();
    const mod = new ESP32DevModule();
    const core = createMockCore();
    await mod.onLoad(core);

    await mod._publicarEvento('test.event', { foo: 'bar' }, { correlation_id: 'cid-123' });
    const pub = core.eventBus._published.find(e => e.event === 'test.event');
    assert(pub, 'evento publicado');
    assert(pub.data.correlation_id === 'cid-123', 'correlation_id heredado');
    assert(pub.data.timestamp, 'timestamp presente');

    await mod.onUnload();
    cleanup();
  });

  await test('module.json v2.0.0 declara tracing.propaga_correlation_id=true', async () => {
    const manifest = JSON.parse(fs.readFileSync(path.join(__dirname, '../../modules/esp32-dev/module.json'), 'utf-8'));
    assert(manifest.version === '2.0.0', 'version 2.0.0');
    assert(manifest.observability?.tracing?.propaga_correlation_id === true, 'tracing.propaga_correlation_id=true');
  });

  // ============================================
  // Resumen
  // ============================================

  console.log('\n' + '='.repeat(50));
  console.log(`Tests: ${testsPassed} passed, ${testsFailed} failed, ${testsPassed + testsFailed} total`);
  console.log('='.repeat(50) + '\n');

  // Limpiar
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
