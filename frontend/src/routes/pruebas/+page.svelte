<script lang="ts">
  /**
   * Página de Pruebas - Selectores
   */
  import { AISelector } from '$components/ai';
  import { CredentialSelector } from '$components/credentials';
  import { SlotSelector } from '$components/prompts';

  let log: string[] = [];

  function addLog(msg: string) {
    log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log.slice(0, 9)];
  }

  // AISelector events
  function handleModelChange(e: CustomEvent) {
    addLog(`🤖 Modelo: ${e.detail.model.icon} ${e.detail.model.name}`);
  }

  function handleConfigChange(e: CustomEvent) {
    addLog(`🤖 Config: temp=${e.detail.temperature}`);
  }

  // CredentialSelector events
  function handleCredSave(e: CustomEvent) {
    addLog(`🔐 Guardado: ${e.detail.provider} (${e.detail.level})`);
  }

  function handleCredDelete(e: CustomEvent) {
    addLog(`🔐 Eliminado: ${e.detail.key}`);
  }

  // SlotSelector events
  function handlePromptSave(e: CustomEvent) {
    addLog(`📝 Prompt guardado: ${e.detail.prompt.name}`);
  }

  function handlePresetSelect(e: CustomEvent) {
    addLog(`📦 Preset aplicado: ${e.detail.presetId}`);
  }
</script>

<div class="page">
  <h1>Pruebas</h1>

  <!-- Selectores -->
  <div class="selectors">
    <div class="selector-card">
      <div class="selector-info">
        <span>Tap: Modelo</span>
        <span>Mantener: Config</span>
      </div>
      <AISelector
        size="lg"
        on:modelChange={handleModelChange}
        on:configChange={handleConfigChange}
      />
      <div class="selector-label">AISelector</div>
    </div>

    <div class="selector-card">
      <div class="selector-info">
        <span>Tap: Ver</span>
        <span>2x Tap: Añadir</span>
      </div>
      <CredentialSelector
        size="lg"
        on:save={handleCredSave}
        on:delete={handleCredDelete}
      />
      <div class="selector-label">CredentialSelector</div>
    </div>

    <div class="selector-card">
      <div class="selector-info">
        <span>Tap: Ver slots</span>
        <span>2x Tap: Añadir</span>
        <span>Mantener: Presets</span>
      </div>
      <SlotSelector
        size="lg"
        on:save={handlePromptSave}
        on:presetSelect={handlePresetSelect}
      />
      <div class="selector-label">SlotSelector</div>
    </div>
  </div>

  <!-- Log -->
  <div class="log">
    <h2>Log</h2>
    {#each log as entry}
      <div class="log-item">{entry}</div>
    {:else}
      <div class="log-empty">Toca los botones...</div>
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

  h1 {
    margin: 0 0 1.5rem;
    font-size: 1.5rem;
  }

  h2 {
    margin: 0 0 0.5rem;
    font-size: 1rem;
    color: #888;
  }

  .selectors {
    display: flex;
    gap: 1rem;
    justify-content: center;
    margin-bottom: 1.5rem;
  }

  .selector-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem;
    background: #1a1a1a;
    border-radius: 16px;
    min-width: 140px;
  }

  .selector-info {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    font-size: 0.65rem;
    color: #666;
  }

  .selector-label {
    font-size: 0.75rem;
    color: #888;
    font-weight: 500;
  }

  .log {
    background: #1a1a1a;
    border-radius: 12px;
    padding: 1rem;
    max-height: 250px;
    overflow-y: auto;
  }

  .log-item {
    padding: 0.4rem;
    border-bottom: 1px solid #333;
    font-family: monospace;
    font-size: 0.75rem;
  }

  .log-empty {
    color: #666;
    text-align: center;
    padding: 1rem;
  }
</style>
