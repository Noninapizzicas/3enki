/**
 * Log Test Module - Prueba del sistema de logging por módulo
 *
 * Ruta /1 con un botón que ejecuta operaciones para probar el logging
 */

const fs = require('fs');
const path = require('path');

class LogTestModule {
  constructor() {
    this.name = 'log-test';
    this.core = null;
    this.activity = null;
  }

  async onLoad(core) {
    this.core = core;
    this.logger = core.logger?.child({ module: this.name });
    this.activity = core.activity?.forModule(this.name);

    this.logger?.info('log-test.loaded');
  }

  async onUnload() {
    this.logger?.info('log-test.unloaded');
  }

  /**
   * GET / - Página de prueba con botón
   */
  async getTestPage(req) {
    const html = `<!DOCTYPE html>
<html lang="es">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Test Logs por Módulo</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body {
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
      background: #0a0a0a;
      color: #e0e0e0;
      padding: 20px;
      min-height: 100vh;
    }
    .container { max-width: 1200px; margin: 0 auto; }
    h1 { color: #00ff88; margin-bottom: 20px; }
    h2 { color: #00aaff; margin: 20px 0 10px; font-size: 1.2rem; }

    .btn {
      background: linear-gradient(135deg, #00ff88 0%, #00aaff 100%);
      color: #000;
      border: none;
      padding: 15px 40px;
      font-size: 18px;
      font-weight: bold;
      border-radius: 8px;
      cursor: pointer;
      transition: transform 0.2s, box-shadow 0.2s;
      margin: 10px 5px;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 5px 20px rgba(0,255,136,0.4);
    }
    .btn:active { transform: translateY(0); }
    .btn:disabled {
      background: #333;
      color: #666;
      cursor: not-allowed;
      transform: none;
      box-shadow: none;
    }

    .btn-secondary {
      background: #333;
      color: #00ff88;
      border: 2px solid #00ff88;
    }
    .btn-secondary:hover {
      background: #00ff88;
      color: #000;
    }

    .status {
      background: #111;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      font-family: monospace;
    }
    .status.success { border-color: #00ff88; }
    .status.error { border-color: #ff4444; }

    .logs-container {
      background: #111;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 15px;
      margin: 20px 0;
      max-height: 400px;
      overflow-y: auto;
    }
    .log-entry {
      font-family: monospace;
      font-size: 12px;
      padding: 5px 10px;
      margin: 2px 0;
      border-radius: 4px;
      background: #1a1a1a;
    }
    .log-entry.info { border-left: 3px solid #00aaff; }
    .log-entry.error { border-left: 3px solid #ff4444; background: #1a0a0a; }
    .log-entry.activity { border-left: 3px solid #00ff88; }
    .log-entry .ts { color: #666; }
    .log-entry .source {
      display: inline-block;
      padding: 1px 6px;
      border-radius: 3px;
      font-size: 10px;
      margin: 0 5px;
    }
    .log-entry .source.backend { background: #0044aa; }
    .log-entry .source.frontend { background: #aa4400; }
    .log-entry .source.activity { background: #00aa44; }

    .modules-list {
      display: grid;
      grid-template-columns: repeat(auto-fill, minmax(200px, 1fr));
      gap: 10px;
      margin: 15px 0;
    }
    .module-card {
      background: #1a1a1a;
      border: 1px solid #333;
      border-radius: 8px;
      padding: 10px;
      cursor: pointer;
      transition: border-color 0.2s;
    }
    .module-card:hover { border-color: #00ff88; }
    .module-card.active { border-color: #00ff88; background: #0a1a0a; }
    .module-card h3 { color: #00ff88; font-size: 14px; }
    .module-card p { color: #888; font-size: 12px; margin-top: 5px; }

    .spinner {
      display: inline-block;
      width: 20px;
      height: 20px;
      border: 2px solid #333;
      border-top-color: #00ff88;
      border-radius: 50%;
      animation: spin 1s linear infinite;
      margin-right: 10px;
    }
    @keyframes spin { to { transform: rotate(360deg); } }
  </style>
</head>
<body>
  <div class="container">
    <h1>Test Sistema de Logs por Módulo</h1>

    <div style="margin: 20px 0;">
      <button class="btn" id="btnTest" onclick="runTest()">
        Ejecutar Prueba de Proyecto
      </button>
      <button class="btn btn-secondary" onclick="loadModules()">
        Recargar Módulos
      </button>
      <button class="btn btn-secondary" onclick="clearLogs()">
        Limpiar
      </button>
    </div>

    <div id="status" class="status" style="display: none;"></div>

    <h2>Módulos con Logs</h2>
    <div id="modules" class="modules-list">
      <p style="color: #666;">Cargando módulos...</p>
    </div>

    <h2>Logs del Módulo: <span id="selectedModule">log-test</span></h2>
    <div id="logs" class="logs-container">
      <p style="color: #666;">Selecciona un módulo o ejecuta la prueba...</p>
    </div>
  </div>

  <script>
    let selectedModule = 'log-test';
    let refreshInterval = null;

    async function runTest() {
      const btn = document.getElementById('btnTest');
      const status = document.getElementById('status');

      btn.disabled = true;
      btn.innerHTML = '<span class="spinner"></span> Ejecutando...';
      status.style.display = 'block';
      status.className = 'status';
      status.textContent = 'Ejecutando operaciones de prueba...';

      try {
        // Ejecutar test
        const res = await fetch('/modules/log-test/api/test', { method: 'POST' });
        const data = await res.json();

        if (data.success) {
          status.className = 'status success';
          status.innerHTML = \`
            <strong>Prueba completada</strong><br>
            Operaciones: \${data.operations}<br>
            Logs generados: backend(\${data.backendLogs}) + frontend(\${data.frontendLogs})<br>
            Duración: \${data.duration_ms}ms
          \`;

          // Recargar módulos y logs
          await loadModules();
          await loadLogs('log-test');
        } else {
          throw new Error(data.error || 'Error desconocido');
        }
      } catch (err) {
        status.className = 'status error';
        status.textContent = 'Error: ' + err.message;
      } finally {
        btn.disabled = false;
        btn.textContent = 'Ejecutar Prueba de Proyecto';
      }
    }

    async function loadModules() {
      const container = document.getElementById('modules');

      try {
        const res = await fetch('/modules/log-manager/api/modules');
        const data = await res.json();

        if (data.modules && data.modules.length > 0) {
          container.innerHTML = data.modules.map(m => \`
            <div class="module-card \${m.name === selectedModule ? 'active' : ''}"
                 onclick="loadLogs('\${m.name}')">
              <h3>\${m.name}</h3>
              <p>\${m.entries} entradas | \${formatSize(m.size)}</p>
            </div>
          \`).join('');
        } else {
          container.innerHTML = '<p style="color: #666;">No hay logs de módulos aún. Ejecuta la prueba.</p>';
        }
      } catch (err) {
        container.innerHTML = '<p style="color: #ff4444;">Error cargando módulos: ' + err.message + '</p>';
      }
    }

    async function loadLogs(moduleName) {
      selectedModule = moduleName;
      document.getElementById('selectedModule').textContent = moduleName;

      // Update active card
      document.querySelectorAll('.module-card').forEach(card => {
        card.classList.toggle('active', card.querySelector('h3').textContent === moduleName);
      });

      const container = document.getElementById('logs');
      container.innerHTML = '<p style="color: #666;">Cargando logs...</p>';

      try {
        const res = await fetch(\`/modules/log-manager/api/modules/\${moduleName}/logs?limit=50\`);
        const data = await res.json();

        if (data.logs && data.logs.length > 0) {
          container.innerHTML = data.logs.map(log => \`
            <div class="log-entry \${log.source === 'activity' ? 'activity' : log.level}">
              <span class="ts">\${new Date(log.ts).toLocaleTimeString()}</span>
              <span class="source \${log.source}">\${log.source}</span>
              <strong>\${log.msg}</strong>
              \${log.ctx ? '<span style="color:#666"> ' + JSON.stringify(log.ctx).substring(0,100) + '</span>' : ''}
            </div>
          \`).join('');
        } else {
          container.innerHTML = '<p style="color: #666;">No hay logs para este módulo.</p>';
        }
      } catch (err) {
        container.innerHTML = '<p style="color: #ff4444;">Error: ' + err.message + '</p>';
      }
    }

    function clearLogs() {
      document.getElementById('status').style.display = 'none';
      document.getElementById('logs').innerHTML = '<p style="color: #666;">Selecciona un módulo...</p>';
    }

    function formatSize(bytes) {
      if (bytes < 1024) return bytes + ' B';
      if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
      return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
    }

    // Auto-refresh cada 5s si hay módulo seleccionado
    function startAutoRefresh() {
      if (refreshInterval) clearInterval(refreshInterval);
      refreshInterval = setInterval(() => {
        if (selectedModule) loadLogs(selectedModule);
      }, 5000);
    }

    // Cargar al inicio
    loadModules();
    startAutoRefresh();

    // Simular logs de frontend
    async function logFrontend(msg, ctx = {}) {
      await fetch('/modules/log-manager/api/logs', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'info',
          module: 'log-test',
          msg: msg,
          ctx: ctx,
          source: 'frontend'
        })
      });
    }

    // Log de carga de página
    logFrontend('page.loaded', { url: window.location.href });
  </script>
</body>
</html>`;

    return {
      _html: html,
      _contentType: 'text/html'
    };
  }

  /**
   * POST /test - Ejecutar prueba de operaciones
   */
  async runTest(req) {
    const startTime = Date.now();
    let operations = 0;
    let backendLogs = 0;
    let frontendLogs = 0;

    try {
      // 1. Log de inicio
      this.logger?.info('test.started', { timestamp: startTime });
      this.activity?.action('test.started', { timestamp: startTime });
      backendLogs += 2;
      operations++;

      // 2. Simular operación de lectura de archivo
      this.activity?.action('file.read', {
        path: '/test/sample.txt',
        size: 1024
      });
      backendLogs++;
      operations++;

      // 3. Simular operación de escritura
      this.activity?.action('file.write', {
        path: '/test/output.json',
        size: 256
      });
      backendLogs++;
      operations++;

      // 4. Simular comunicación entre módulos
      this.activity?.comm('send', 'ai-gateway', 'chat.request', {
        model: 'gpt-4',
        tokens: 150
      });
      backendLogs++;
      operations++;

      // 5. Timer de performance
      const endTimer = this.activity?.timer('database.query');
      await new Promise(r => setTimeout(r, 50)); // Simular delay
      endTimer?.({ rows: 42, table: 'users' });
      backendLogs++;
      operations++;

      // 6. Simular evento publicado
      if (this.core.eventBus) {
        this.core.eventBus.emit('test.event', { test: true, value: Math.random() });
        operations++;
      }

      // 7. Simular error (capturado)
      try {
        throw new Error('Simulated error for testing');
      } catch (err) {
        this.activity?.error('test.simulated_error', err, { intentional: true });
        backendLogs++;
        operations++;
      }

      // 8. Log de finalización
      const duration = Date.now() - startTime;
      this.logger?.info('test.completed', { duration_ms: duration, operations });
      this.activity?.action('test.completed', { duration_ms: duration, operations });
      backendLogs += 2;

      // Frontend logs se añaden desde el HTML
      frontendLogs = 1; // page.loaded

      return {
        success: true,
        operations,
        backendLogs,
        frontendLogs,
        duration_ms: duration,
        message: 'Prueba completada. Revisa los logs del módulo log-test.'
      };

    } catch (error) {
      this.logger?.error('test.failed', { error: error.message });
      return {
        success: false,
        error: error.message
      };
    }
  }
}

module.exports = LogTestModule;
