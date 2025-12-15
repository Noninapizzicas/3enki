<script lang="ts">
  /**
   * Página de Test - Sistema de Logs por Módulo
   *
   * Prueba el sistema de logging con operaciones de proyecto
   */
  import { onMount } from 'svelte';
  import { browser } from '$app/environment';

  let selectedModule = 'log-test';
  let modules: any[] = [];
  let logs: any[] = [];
  let status = { show: false, success: false, message: '' };
  let isRunning = false;
  let refreshInterval: any = null;

  const API_BASE = browser ? `http://${window.location.hostname}:3000` : '';

  async function runTest() {
    isRunning = true;
    status = { show: true, success: false, message: 'Ejecutando operaciones de prueba...' };

    try {
      // Log desde frontend
      await logFrontend('test.button_clicked', { timestamp: Date.now() });

      const res = await fetch(`${API_BASE}/modules/log-test/api/test`, { method: 'POST' });
      const data = await res.json();

      if (data.success) {
        // Más logs desde frontend
        await logFrontend('test.completed', { operations: data.operations });

        status = {
          show: true,
          success: true,
          message: `Prueba completada: ${data.operations} operaciones, ${data.backendLogs} logs backend, duración: ${data.duration_ms}ms`
        };

        await loadModules();
        await loadLogs('log-test');
      } else {
        throw new Error(data.error || 'Error desconocido');
      }
    } catch (err: any) {
      status = { show: true, success: false, message: `Error: ${err.message}` };
    } finally {
      isRunning = false;
    }
  }

  async function loadModules() {
    try {
      const res = await fetch(`${API_BASE}/modules/log-manager/api/modules`);
      const data = await res.json();
      modules = data.modules || [];
    } catch (err) {
      modules = [];
    }
  }

  async function loadLogs(moduleName: string) {
    selectedModule = moduleName;
    try {
      const res = await fetch(`${API_BASE}/modules/log-manager/api/modules/${moduleName}/logs?limit=50`);
      const data = await res.json();
      logs = data.logs || [];
    } catch (err) {
      logs = [];
    }
  }

  async function logFrontend(msg: string, ctx: any = {}) {
    try {
      await fetch(`${API_BASE}/modules/log-manager/api/logs`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          level: 'info',
          module: 'log-test',
          msg,
          ctx,
          source: 'frontend'
        })
      });
    } catch (e) {
      // Silenciar errores
    }
  }

  function formatSize(bytes: number): string {
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
  }

  function formatTime(ts: string): string {
    return new Date(ts).toLocaleTimeString();
  }

  onMount(() => {
    loadModules();
    logFrontend('page.loaded', { url: '/1' });

    // Auto-refresh cada 5s
    refreshInterval = setInterval(() => {
      if (selectedModule) loadLogs(selectedModule);
    }, 5000);

    return () => {
      if (refreshInterval) clearInterval(refreshInterval);
    };
  });
</script>

<svelte:head>
  <title>Test Logs por Módulo</title>
</svelte:head>

<div class="container">
  <header>
    <h1>Test Sistema de Logs por Módulo</h1>
    <p class="subtitle">Backend + Frontend en el mismo archivo por módulo</p>
  </header>

  <div class="actions">
    <button class="btn primary" on:click={runTest} disabled={isRunning}>
      {#if isRunning}
        <span class="spinner"></span> Ejecutando...
      {:else}
        Ejecutar Prueba de Proyecto
      {/if}
    </button>
    <button class="btn secondary" on:click={loadModules}>Recargar Módulos</button>
    <button class="btn secondary" on:click={() => status.show = false}>Limpiar</button>
  </div>

  {#if status.show}
    <div class="status" class:success={status.success} class:error={!status.success && status.message.includes('Error')}>
      {status.message}
    </div>
  {/if}

  <section>
    <h2>Módulos con Logs ({modules.length})</h2>
    <div class="modules-grid">
      {#if modules.length === 0}
        <p class="empty">No hay logs de módulos aún. Ejecuta la prueba.</p>
      {:else}
        {#each modules as mod}
          <button
            class="module-card"
            class:active={mod.name === selectedModule}
            on:click={() => loadLogs(mod.name)}
          >
            <h3>{mod.name}</h3>
            <p>{mod.entries} entradas | {formatSize(mod.size)}</p>
          </button>
        {/each}
      {/if}
    </div>
  </section>

  <section>
    <h2>Logs del Módulo: <span class="highlight">{selectedModule}</span></h2>
    <div class="logs-container">
      {#if logs.length === 0}
        <p class="empty">Selecciona un módulo o ejecuta la prueba...</p>
      {:else}
        {#each logs as log}
          <div class="log-entry {log.level}" class:activity={log.source === 'activity'}>
            <span class="ts">{formatTime(log.ts)}</span>
            <span class="source {log.source}">{log.source}</span>
            <strong>{log.msg}</strong>
            {#if log.ctx}
              <span class="ctx">{JSON.stringify(log.ctx).substring(0, 80)}</span>
            {/if}
          </div>
        {/each}
      {/if}
    </div>
  </section>
</div>

<style>
  :global(body) {
    margin: 0;
    padding: 0;
  }

  .container {
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    background: #0a0a0a;
    color: #e0e0e0;
    padding: 20px;
    min-height: 100vh;
    max-width: 1200px;
    margin: 0 auto;
  }

  header {
    margin-bottom: 24px;
  }

  h1 {
    color: #00ff88;
    margin: 0 0 8px 0;
    font-size: 1.8rem;
  }

  .subtitle {
    color: #888;
    margin: 0;
    font-size: 0.9rem;
  }

  h2 {
    color: #00aaff;
    margin: 24px 0 12px;
    font-size: 1.1rem;
  }

  .highlight {
    color: #00ff88;
  }

  .actions {
    display: flex;
    gap: 10px;
    flex-wrap: wrap;
    margin-bottom: 20px;
  }

  .btn {
    border: none;
    padding: 12px 24px;
    font-size: 14px;
    font-weight: 600;
    border-radius: 8px;
    cursor: pointer;
    transition: transform 0.2s, box-shadow 0.2s, background 0.2s;
    display: inline-flex;
    align-items: center;
    gap: 8px;
  }

  .btn.primary {
    background: linear-gradient(135deg, #00ff88 0%, #00aaff 100%);
    color: #000;
  }

  .btn.primary:hover:not(:disabled) {
    transform: translateY(-2px);
    box-shadow: 0 5px 20px rgba(0, 255, 136, 0.4);
  }

  .btn.secondary {
    background: #222;
    color: #00ff88;
    border: 1px solid #00ff88;
  }

  .btn.secondary:hover {
    background: #00ff88;
    color: #000;
  }

  .btn:disabled {
    background: #333;
    color: #666;
    cursor: not-allowed;
    transform: none;
    box-shadow: none;
  }

  .spinner {
    display: inline-block;
    width: 16px;
    height: 16px;
    border: 2px solid #333;
    border-top-color: #000;
    border-radius: 50%;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .status {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 12px 16px;
    margin-bottom: 20px;
    font-size: 0.9rem;
  }

  .status.success {
    border-color: #00ff88;
    background: #0a1a0a;
  }

  .status.error {
    border-color: #ff4444;
    background: #1a0a0a;
  }

  .modules-grid {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(180px, 1fr));
    gap: 10px;
  }

  .module-card {
    background: #151515;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 12px;
    cursor: pointer;
    transition: border-color 0.2s, background 0.2s;
    text-align: left;
    width: 100%;
  }

  .module-card:hover {
    border-color: #00ff88;
  }

  .module-card.active {
    border-color: #00ff88;
    background: #0a1a0a;
  }

  .module-card h3 {
    color: #00ff88;
    font-size: 0.95rem;
    margin: 0 0 6px 0;
  }

  .module-card p {
    color: #888;
    font-size: 0.75rem;
    margin: 0;
  }

  .empty {
    color: #666;
    font-style: italic;
    padding: 20px;
    text-align: center;
  }

  .logs-container {
    background: #111;
    border: 1px solid #333;
    border-radius: 8px;
    padding: 12px;
    max-height: 400px;
    overflow-y: auto;
  }

  .log-entry {
    font-family: 'SF Mono', Monaco, 'Cascadia Code', monospace;
    font-size: 11px;
    padding: 6px 10px;
    margin: 3px 0;
    border-radius: 4px;
    background: #1a1a1a;
    display: flex;
    align-items: center;
    gap: 8px;
    flex-wrap: wrap;
  }

  .log-entry.info {
    border-left: 3px solid #00aaff;
  }

  .log-entry.error {
    border-left: 3px solid #ff4444;
    background: #1a0a0a;
  }

  .log-entry.debug {
    border-left: 3px solid #888;
  }

  .log-entry.activity {
    border-left: 3px solid #00ff88;
  }

  .ts {
    color: #666;
    font-size: 10px;
  }

  .source {
    display: inline-block;
    padding: 2px 6px;
    border-radius: 3px;
    font-size: 9px;
    text-transform: uppercase;
    font-weight: 600;
  }

  .source.backend {
    background: #0044aa;
    color: #88bbff;
  }

  .source.frontend {
    background: #aa4400;
    color: #ffbb88;
  }

  .source.activity {
    background: #00aa44;
    color: #88ffaa;
  }

  .ctx {
    color: #666;
    font-size: 10px;
    margin-left: auto;
  }

  section {
    margin-bottom: 24px;
  }
</style>
