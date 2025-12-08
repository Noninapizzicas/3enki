<script lang="ts">
  /**
   * Página de Pruebas - AISelector
   */
  import { AISelector } from '$components/ai';

  let log: string[] = [];

  function addLog(msg: string) {
    log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log.slice(0, 9)];
  }

  function handleModelChange(e: CustomEvent) {
    addLog(`Modelo: ${e.detail.model.icon} ${e.detail.model.name}`);
  }

  function handleConfigChange(e: CustomEvent) {
    addLog(`Config: temp=${e.detail.temperature}, tokens=${e.detail.maxTokens}`);
  }
</script>

<div class="page">
  <h1>AISelector</h1>

  <div class="info">
    <span>Tap: Modelo</span>
    <span>Mantener: Config</span>
  </div>

  <!-- AISelector -->
  <div class="selector-container">
    <AISelector
      size="lg"
      on:modelChange={handleModelChange}
      on:configChange={handleConfigChange}
    />
  </div>

  <!-- Log -->
  <div class="log">
    <h2>Log</h2>
    {#each log as entry}
      <div class="log-item">{entry}</div>
    {:else}
      <div class="log-empty">Toca el botón...</div>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 1rem;
    background: #111;
    color: #fff;
  }

  h1 { margin: 0 0 1rem; font-size: 1.5rem; }
  h2 { margin: 0 0 0.5rem; font-size: 1rem; color: #888; }

  .info {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
    margin-bottom: 1.5rem;
    font-size: 0.75rem;
  }

  .info span {
    padding: 0.5rem;
    background: #222;
    border-radius: 6px;
  }

  .selector-container {
    display: flex;
    justify-content: center;
    padding: 2rem;
    background: #1a1a1a;
    border-radius: 12px;
    margin-bottom: 1rem;
  }

  .log {
    background: #1a1a1a;
    border-radius: 12px;
    padding: 1rem;
    max-height: 200px;
    overflow-y: auto;
  }

  .log-item {
    padding: 0.4rem;
    border-bottom: 1px solid #333;
    font-family: monospace;
    font-size: 0.7rem;
  }

  .log-empty {
    color: #666;
    text-align: center;
  }
</style>
