#!/usr/bin/env node

/**
 * Enki ESP32 CLI — Herramienta local para flash y monitor serial
 *
 * Se ejecuta en TU máquina (donde el ESP32 está conectado por USB).
 * Se conecta al broker MQTT del VPS para:
 *   - Descargar binarios compilados por firmware-builder
 *   - Publicar output serial al VPS (visible desde la UI web)
 *   - Recibir comandos del VPS (flash trigger, debug toggle)
 *
 * Comandos:
 *   enki-esp32 flash    --host VPS --port /dev/ttyUSB0 [--driver print-proxy]
 *   enki-esp32 monitor  --host VPS --port /dev/ttyUSB0 [--baud 115200]
 *   enki-esp32 ports    — lista puertos serial detectados
 *   enki-esp32 debug    --host VPS --device cocina-1 --project nonina
 *
 * Sin dependencias externas (solo Node.js + esptool/pio en PATH).
 *
 * Uso:
 *   node enki-esp32.js monitor --host tu-vps.com --port /dev/ttyUSB0
 */

'use strict';

const { spawn, execSync, execFileSync } = require('child_process');
const fs = require('fs');
const path = require('path');
const http = require('http');
const readline = require('readline');

// ============================================
// Config
// ============================================

const VERSION = '1.0.0';

const DEFAULTS = {
  mqtt_port: 1883,
  http_port: 3000,
  baud: 115200,
  flash_baud: 460800,
  project: 'enki',
  device: 'cli-device'
};

// ============================================
// Arg parser (sin dependencias)
// ============================================

function parseArgs(argv) {
  const args = { _: [] };
  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];
    if (arg.startsWith('--')) {
      const key = arg.slice(2);
      const next = argv[i + 1];
      if (next && !next.startsWith('--')) {
        args[key] = next;
        i++;
      } else {
        args[key] = true;
      }
    } else {
      args._.push(arg);
    }
  }
  return args;
}

// ============================================
// Puerto serial — detección
// ============================================

function listPorts() {
  const patterns = ['/dev/ttyUSB', '/dev/ttyACM', '/dev/cu.usb', '/dev/cu.SLAB'];
  const ports = [];

  for (const pattern of patterns) {
    const dir = path.dirname(pattern);
    const prefix = path.basename(pattern);
    try {
      const entries = fs.readdirSync(dir);
      for (const entry of entries) {
        if (entry.startsWith(prefix)) {
          ports.push(path.join(dir, entry));
        }
      }
    } catch {}
  }

  return ports;
}

function autoDetectPort() {
  const ports = listPorts();
  if (ports.length === 0) {
    console.error('No se detectaron puertos serial. ¿Está conectado el ESP32?');
    process.exit(1);
  }
  if (ports.length === 1) {
    return ports[0];
  }
  console.log('Puertos detectados:');
  ports.forEach((p, i) => console.log(`  ${i + 1}. ${p}`));
  console.log(`\nUsando: ${ports[0]} (usa --port para cambiar)`);
  return ports[0];
}

// ============================================
// MQTT — Conexión ligera sin dependencias npm
//
// Usa WebSocket o TCP directo. Para máxima
// compatibilidad sin npm install, usamos HTTP
// para descargar binarios y publicamos serial
// vía HTTP POST al backend.
// ============================================

/**
 * HTTP helper — GET/POST sin dependencias
 */
function httpRequest(url, options = {}) {
  return new Promise((resolve, reject) => {
    const parsedUrl = new URL(url);
    const opts = {
      hostname: parsedUrl.hostname,
      port: parsedUrl.port || 80,
      path: parsedUrl.pathname + parsedUrl.search,
      method: options.method || 'GET',
      headers: options.headers || {},
      timeout: options.timeout || 30000
    };

    const req = http.request(opts, (res) => {
      const chunks = [];
      res.on('data', chunk => chunks.push(chunk));
      res.on('end', () => {
        const body = Buffer.concat(chunks);
        if (options.binary) {
          resolve({ status: res.statusCode, data: body });
        } else {
          resolve({ status: res.statusCode, data: body.toString() });
        }
      });
    });

    req.on('error', reject);
    req.on('timeout', () => { req.destroy(); reject(new Error('Timeout')); });

    if (options.body) {
      req.write(typeof options.body === 'string' ? options.body : JSON.stringify(options.body));
    }
    req.end();
  });
}

// ============================================
// Comando: ports
// ============================================

function cmdPorts() {
  const ports = listPorts();
  if (ports.length === 0) {
    console.log('No se detectaron puertos serial.');
    console.log('Comprueba que el ESP32 está conectado por USB.');
    return;
  }
  console.log('Puertos serial detectados:\n');
  for (const port of ports) {
    console.log(`  ${port}`);
  }
  console.log(`\nTotal: ${ports.length}`);
}

// ============================================
// Comando: monitor
// ============================================

async function cmdMonitor(args) {
  const port = args.port || autoDetectPort();
  const baud = parseInt(args.baud) || DEFAULTS.baud;
  const host = args.host;
  const project = args.project || DEFAULTS.project;
  const device = args.device || DEFAULTS.device;

  console.log(`\n  Enki ESP32 Monitor Serial v${VERSION}`);
  console.log(`  Puerto: ${port}`);
  console.log(`  Baud:   ${baud}`);
  if (host) console.log(`  VPS:    ${host}:${args['http-port'] || DEFAULTS.http_port}`);
  console.log(`  Ctrl+C para salir\n`);

  // Configurar puerto serial
  try {
    execSync(`stty -F ${port} ${baud} raw -echo`, { stdio: 'pipe' });
  } catch (err) {
    console.error(`Error configurando ${port}: ${err.message}`);
    console.error('¿El puerto existe? ¿Tienes permisos? Prueba: sudo chmod 666 ' + port);
    process.exit(1);
  }

  // Abrir puerto bidireccional (un solo fd)
  const fd = fs.openSync(port, 'r+');
  const readStream = fs.createReadStream(null, { fd, encoding: 'utf-8', autoClose: false });
  const writeStream = fs.createWriteStream(null, { fd, encoding: 'utf-8', autoClose: false });

  let lineBuffer = '';

  readStream.on('data', (chunk) => {
    // Mostrar en terminal local
    process.stdout.write(chunk);

    // Acumular líneas para enviar al VPS
    lineBuffer += chunk;
    if (lineBuffer.length > 4096) {
      lineBuffer = lineBuffer.slice(-2048);
    }
  });

  readStream.on('error', (err) => {
    console.error(`\n[ERROR] Puerto serial: ${err.message}`);
    console.error('¿Se desconectó el ESP32?');
    process.exit(1);
  });

  readStream.on('close', () => {
    console.log('\n[INFO] Puerto serial cerrado');
    process.exit(0);
  });

  // Enviar líneas al VPS periódicamente (si host configurado)
  if (host) {
    const httpPort = args['http-port'] || DEFAULTS.http_port;
    const baseUrl = `http://${host}:${httpPort}`;

    setInterval(async () => {
      if (lineBuffer.length === 0) return;
      const lines = lineBuffer;
      lineBuffer = '';

      try {
        await httpRequest(`${baseUrl}/modules/esp32-flasher/serial-relay`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ port, device, project, lines: lines.split('\n').filter(l => l.trim()) }),
          timeout: 5000
        });
      } catch {
        // Silencioso — no bloquear el monitor por errores de red
      }
    }, 1000);
  }

  // Leer input del terminal y enviar al serial
  const rl = readline.createInterface({ input: process.stdin });
  rl.on('line', (line) => {
    try {
      writeStream.write(line + '\n');
    } catch {}
  });

  // Ctrl+C
  process.on('SIGINT', () => {
    console.log('\n[INFO] Monitor serial cerrado');
    try { readStream.destroy(); } catch {}
    try { writeStream.destroy(); } catch {}
    process.exit(0);
  });
}

// ============================================
// Comando: flash
// ============================================

async function cmdFlash(args) {
  const port = args.port || autoDetectPort();
  const baud = parseInt(args['flash-baud']) || DEFAULTS.flash_baud;
  const host = args.host;
  const driver = args.driver || 'print-proxy';
  let binaryPath = args.binary;

  console.log(`\n  Enki ESP32 Flash v${VERSION}`);
  console.log(`  Puerto:  ${port}`);
  console.log(`  Driver:  ${driver}`);
  console.log(`  Baud:    ${baud}`);

  // Si hay host VPS, descargar binario
  if (host && !binaryPath) {
    const httpPort = args['http-port'] || DEFAULTS.http_port;
    const baseUrl = `http://${host}:${httpPort}`;

    console.log(`  VPS:     ${host}:${httpPort}`);
    console.log(`\n  Descargando binario de ${driver}...`);

    try {
      // Pedir info del driver al backend
      const infoRes = await httpRequest(`${baseUrl}/modules/firmware-manager/firmware/${driver}/latest/firmware.bin`, {
        binary: true,
        timeout: 60000
      });

      if (infoRes.status !== 200) {
        // Fallback: intentar ruta directa del builder
        const builderRes = await httpRequest(`${baseUrl}/modules/firmware-builder/binary/${driver}`, {
          binary: true,
          timeout: 60000
        });

        if (builderRes.status !== 200) {
          console.error(`\n  Error: No se pudo descargar el binario del driver '${driver}'`);
          console.error(`  ¿Has compilado el driver? Compila desde la UI web primero.`);
          process.exit(1);
        }

        binaryPath = `/tmp/enki-${driver}-firmware.bin`;
        fs.writeFileSync(binaryPath, builderRes.data);
      } else {
        binaryPath = `/tmp/enki-${driver}-firmware.bin`;
        fs.writeFileSync(binaryPath, infoRes.data);
      }

      const size = fs.statSync(binaryPath).size;
      console.log(`  Descargado: ${binaryPath} (${(size / 1024).toFixed(1)} KB)`);
    } catch (err) {
      console.error(`\n  Error descargando: ${err.message}`);
      process.exit(1);
    }
  }

  if (!binaryPath) {
    console.error('\n  Error: Especifica --binary ruta/al/firmware.bin o --host VPS para descargar');
    process.exit(1);
  }

  if (!fs.existsSync(binaryPath)) {
    console.error(`\n  Error: Binario no encontrado: ${binaryPath}`);
    process.exit(1);
  }

  const size = fs.statSync(binaryPath).size;
  console.log(`  Binario: ${binaryPath} (${(size / 1024).toFixed(1)} KB)`);

  // Detectar esptool o pio
  let flashTool = 'esptool';
  try {
    execFileSync('which', ['esptool.py'], { stdio: 'pipe' });
    flashTool = 'esptool.py';
  } catch {
    try {
      execFileSync('which', ['esptool'], { stdio: 'pipe' });
      flashTool = 'esptool';
    } catch {
      console.error('\n  Error: esptool no encontrado. Instala con: pip install esptool');
      process.exit(1);
    }
  }

  console.log(`  Tool:    ${flashTool}`);
  console.log(`\n  Flasheando...\n`);

  // Ejecutar flash
  const flashArgs = [
    '--chip', 'auto',
    '--port', port,
    '--baud', String(baud),
    'write_flash',
    '--flash_mode', 'dio',
    '--flash_freq', '80m',
    '0x10000', binaryPath
  ];

  const proc = spawn(flashTool, flashArgs, {
    stdio: 'inherit'  // Output directo a terminal
  });

  proc.on('close', (code) => {
    if (code === 0) {
      console.log('\n  Flash completado. El ESP32 se está reiniciando...');
      console.log(`  Ejecuta: node enki-esp32.js monitor --port ${port}`);
      console.log('  para ver el output del arranque.\n');
    } else {
      console.error(`\n  Flash falló (código ${code})`);
      console.error('  Comprueba conexión USB y que el ESP32 está en modo boot.');
      process.exit(1);
    }
  });

  proc.on('error', (err) => {
    console.error(`\n  Error ejecutando ${flashTool}: ${err.message}`);
    process.exit(1);
  });
}

// ============================================
// Comando: debug (ver debug remoto del ESP32 via VPS)
// ============================================

async function cmdDebug(args) {
  const host = args.host;
  const device = args.device;
  const project = args.project || DEFAULTS.project;

  if (!host) {
    console.error('  --host requerido (IP o dominio del VPS)');
    process.exit(1);
  }
  if (!device) {
    console.error('  --device requerido (device_id del ESP32, ej: cocina-1)');
    process.exit(1);
  }

  const httpPort = args['http-port'] || DEFAULTS.http_port;
  const baseUrl = `http://${host}:${httpPort}`;

  console.log(`\n  Enki ESP32 Debug Remoto v${VERSION}`);
  console.log(`  Device:  ${device}`);
  console.log(`  Project: ${project}`);
  console.log(`  VPS:     ${host}:${httpPort}`);
  console.log(`  Ctrl+C para salir\n`);

  // Activar debug en el ESP32 via HTTP → MQTT
  console.log('  Activando debug remoto...');
  try {
    await httpRequest(`${baseUrl}/modules/esp32-flasher/debug-control`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ device, project, enable: true })
    });
    console.log('  Debug activado. Esperando output...\n');
  } catch (err) {
    console.error(`  Error activando debug: ${err.message}`);
    console.error('  Comprueba que el VPS está accesible.');
    process.exit(1);
  }

  // Poll debug output via HTTP
  let running = true;

  async function pollDebug() {
    while (running) {
      try {
        const res = await httpRequest(`${baseUrl}/modules/esp32-flasher/debug-stream?device=${device}&project=${project}`, {
          timeout: 35000  // long-poll
        });
        if (res.status === 200) {
          const data = JSON.parse(res.data);
          if (data.lines && data.lines.length > 0) {
            for (const line of data.lines) {
              console.log(line);
            }
          }
        }
      } catch {
        // Timeout normal del long-poll — reintentar
      }
      // Pequeña pausa entre requests
      await new Promise(r => setTimeout(r, 500));
    }
  }

  pollDebug();

  process.on('SIGINT', async () => {
    running = false;
    console.log('\n  Desactivando debug remoto...');
    try {
      await httpRequest(`${baseUrl}/modules/esp32-flasher/debug-control`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ device, project, enable: false })
      });
    } catch {}
    console.log('  Bye.\n');
    process.exit(0);
  });
}

// ============================================
// Comando: build (compilar localmente con PlatformIO)
// ============================================

async function cmdBuild(args) {
  const driver = args.driver || 'print-proxy';
  const clean = args.clean === true;

  // Buscar directorio del driver
  const firmwareDir = path.resolve(args['firmware-dir'] || './firmware');
  const driverDir = path.join(firmwareDir, driver);

  if (!fs.existsSync(path.join(driverDir, 'platformio.ini'))) {
    console.error(`\n  Error: No se encontró platformio.ini en ${driverDir}`);
    console.error(`  ¿Existe el driver '${driver}'?`);

    // Listar drivers disponibles
    try {
      const entries = fs.readdirSync(firmwareDir, { withFileTypes: true });
      const drivers = entries
        .filter(e => e.isDirectory() && fs.existsSync(path.join(firmwareDir, e.name, 'platformio.ini')))
        .map(e => e.name);
      if (drivers.length > 0) {
        console.log(`\n  Drivers disponibles: ${drivers.join(', ')}`);
      }
    } catch {}
    process.exit(1);
  }

  // Verificar PlatformIO
  let pioCmd = 'pio';
  try {
    execFileSync('which', ['pio'], { stdio: 'pipe' });
  } catch {
    try {
      execFileSync('which', ['platformio'], { stdio: 'pipe' });
      pioCmd = 'platformio';
    } catch {
      console.error('\n  Error: PlatformIO no encontrado.');
      console.error('  Instala con: pip install platformio');
      process.exit(1);
    }
  }

  console.log(`\n  Enki ESP32 Build v${VERSION}`);
  console.log(`  Driver:  ${driver}`);
  console.log(`  Dir:     ${driverDir}`);
  console.log(`  Tool:    ${pioCmd}`);
  if (clean) console.log(`  Clean:   si`);
  console.log();

  // Clean si se pidió
  if (clean) {
    console.log('  Limpiando build anterior...');
    try {
      execSync(`${pioCmd} run -t clean -d "${driverDir}"`, { stdio: 'inherit' });
    } catch {}
    console.log();
  }

  // Build
  console.log('  Compilando...\n');
  const startTime = Date.now();

  const proc = spawn(pioCmd, ['run', '-d', driverDir], {
    stdio: 'inherit'
  });

  proc.on('close', (code) => {
    const duration = ((Date.now() - startTime) / 1000).toFixed(1);
    if (code === 0) {
      // Buscar el binario
      const buildDir = path.join(driverDir, '.pio', 'build');
      let binPath = null;
      try {
        const envs = fs.readdirSync(buildDir);
        for (const env of envs) {
          const candidate = path.join(buildDir, env, 'firmware.bin');
          if (fs.existsSync(candidate)) {
            binPath = candidate;
            break;
          }
        }
      } catch {}

      console.log(`\n  Build completado en ${duration}s`);
      if (binPath) {
        const size = (fs.statSync(binPath).size / 1024).toFixed(1);
        console.log(`  Binario: ${binPath} (${size} KB)`);
        console.log(`\n  Para flashear:`);
        console.log(`    node enki-esp32.js flash --binary ${binPath}`);
      }
    } else {
      console.error(`\n  Build falló (código ${code}) en ${duration}s`);
    }
  });

  proc.on('error', (err) => {
    console.error(`\n  Error ejecutando ${pioCmd}: ${err.message}`);
    process.exit(1);
  });
}

// ============================================
// Comando: drivers (listar drivers disponibles)
// ============================================

function cmdDrivers(args) {
  const firmwareDir = path.resolve(args['firmware-dir'] || './firmware');

  console.log(`\n  Enki ESP32 Drivers v${VERSION}`);
  console.log(`  Directorio: ${firmwareDir}\n`);

  try {
    const entries = fs.readdirSync(firmwareDir, { withFileTypes: true });
    let count = 0;

    for (const entry of entries) {
      if (!entry.isDirectory()) continue;
      const driverDir = path.join(firmwareDir, entry.name);
      const pioIni = path.join(driverDir, 'platformio.ini');

      if (!fs.existsSync(pioIni)) continue;
      count++;

      // Leer info básica
      let board = 'esp32dev';
      try {
        const ini = fs.readFileSync(pioIni, 'utf-8');
        const m = ini.match(/board\s*=\s*(\S+)/);
        if (m) board = m[1];
      } catch {}

      // Contar archivos fuente
      let srcFiles = 0;
      try {
        srcFiles = fs.readdirSync(path.join(driverDir, 'src'))
          .filter(f => f.endsWith('.cpp') || f.endsWith('.h') || f.endsWith('.c')).length;
      } catch {}

      // Binario compilado?
      let binInfo = 'sin build';
      try {
        const buildDir = path.join(driverDir, '.pio', 'build');
        const envs = fs.readdirSync(buildDir);
        for (const env of envs) {
          const bin = path.join(buildDir, env, 'firmware.bin');
          if (fs.existsSync(bin)) {
            const size = (fs.statSync(bin).size / 1024).toFixed(1);
            const mtime = fs.statSync(bin).mtime.toISOString().slice(0, 16).replace('T', ' ');
            binInfo = `${size} KB (${mtime})`;
            break;
          }
        }
      } catch {}

      // Descripción del README
      let desc = '';
      try {
        const readme = fs.readFileSync(path.join(driverDir, 'README.md'), 'utf-8');
        const line = readme.split('\n').find(l => l.trim() && !l.startsWith('#'));
        if (line) desc = line.trim().substring(0, 60);
      } catch {}

      console.log(`  ${entry.name}`);
      console.log(`    Board: ${board} | Archivos: ${srcFiles} | Build: ${binInfo}`);
      if (desc) console.log(`    ${desc}`);
      console.log();
    }

    if (count === 0) {
      console.log('  No se encontraron drivers.');
      console.log(`  Cada subdirectorio de ${firmwareDir}/ con platformio.ini es un driver.`);
    } else {
      console.log(`  Total: ${count} driver(s)`);
    }
  } catch (err) {
    console.error(`  Error leyendo ${firmwareDir}: ${err.message}`);
  }
}

// ============================================
// Main
// ============================================

function showHelp() {
  console.log(`
  Enki ESP32 CLI v${VERSION}
  Herramienta local para compilar, flashear y monitorizar ESP32.

  Comandos:

    drivers                             Lista drivers disponibles en firmware/
    build    --driver print-proxy       Compilar driver con PlatformIO
    flash    --port /dev/ttyUSB0        Flash firmware al ESP32
    monitor  --port /dev/ttyUSB0        Monitor serial bidireccional
    ports                               Lista puertos serial detectados
    debug    --host VPS --device ID     Ver debug remoto del ESP32

  Opciones de build:

    --driver        Nombre del driver (default: print-proxy)
    --clean         Limpiar antes de compilar
    --firmware-dir  Directorio de drivers (default: ./firmware)

  Opciones de flash:

    --port        Puerto serial (auto-detectado si solo hay uno)
    --binary      Ruta al .bin (si no, descarga del VPS con --host)
    --driver      Nombre del driver (default: print-proxy)
    --host        IP del VPS para descargar binarios
    --flash-baud  Baudrate (default: ${DEFAULTS.flash_baud})

  Opciones de monitor:

    --port    Puerto serial (auto-detectado)
    --baud    Baudrate (default: ${DEFAULTS.baud})
    --host    IP del VPS para relay de serial

  Opciones de debug:

    --host      IP del VPS (requerido)
    --device    Device ID del ESP32 (requerido)
    --project   Project ID (default: ${DEFAULTS.project})

  Flujo de trabajo tipico:

    # 1. Ver drivers disponibles
    node enki-esp32.js drivers

    # 2. Compilar
    node enki-esp32.js build --driver print-proxy

    # 3. Flashear
    node enki-esp32.js flash --binary firmware/print-proxy/.pio/build/esp32/firmware.bin

    # 4. Monitor serial
    node enki-esp32.js monitor

    # 5. Debug remoto (ESP32 en pizzeria, sin cable)
    node enki-esp32.js debug --host mi-vps.com --device cocina-1
`);
}

const args = parseArgs(process.argv.slice(2));
const command = args._[0];

switch (command) {
  case 'drivers': cmdDrivers(args); break;
  case 'build':   cmdBuild(args); break;
  case 'flash':   cmdFlash(args); break;
  case 'monitor': cmdMonitor(args); break;
  case 'ports':   cmdPorts(); break;
  case 'debug':   cmdDebug(args); break;
  case 'help':    showHelp(); break;
  default:        showHelp(); break;
}
