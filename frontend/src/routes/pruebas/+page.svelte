<script lang="ts">
  /**
   * Página de Pruebas - UI-SYSTEM-PLAN Components (uisis-)
   *
   * Interacción triple:
   * - TAP: Panel Select
   * - DOUBLE TAP: Panel Add (si enableAdd=true)
   * - LONG PRESS: Panel Config
   */
  import { AIButton } from '$components/ai';
  import { CredentialButton } from '$components/credentials';
  import { PromptButton } from '$components/prompts';
  import { ConversationButton } from '$components/conversations';
  import { ProjectButton } from '$components/projects';
  import { FileBrowserButton } from '$components/files';
  import { MenuGeneratorButton } from '$components/menu';

  let log: string[] = [];

  // Project ID de prueba
  const testProjectId = 'test-project';

  function addLog(msg: string) {
    log = [`[${new Date().toLocaleTimeString()}] ${msg}`, ...log.slice(0, 19)];
  }

  // AI events
  function handleAISelect(e: CustomEvent) {
    addLog(`🤖 Select: ${e.detail?.model?.name || 'modelo'}`);
  }
  function handleAIConfig(e: CustomEvent) {
    addLog(`🤖 Config: ${JSON.stringify(e.detail || {}).slice(0, 50)}`);
  }

  // Credential events
  function handleCredSelect(e: CustomEvent) {
    addLog(`🔐 Select: ${e.detail?.provider || 'credencial'}`);
  }
  function handleCredAdd(e: CustomEvent) {
    addLog(`🔐 Add: nueva credencial`);
  }
  function handleCredConfig(e: CustomEvent) {
    addLog(`🔐 Config: ${e.detail?.key || 'config'}`);
  }

  // Prompt events
  function handlePromptSelect(e: CustomEvent) {
    addLog(`📝 Select: ${e.detail?.name || 'prompt'}`);
  }
  function handlePromptAdd(e: CustomEvent) {
    addLog(`📝 Add: nuevo prompt`);
  }
  function handlePromptConfig(e: CustomEvent) {
    addLog(`📝 Config: ${e.detail?.id || 'config'}`);
  }

  // Conversation events
  function handleConvSelect(e: CustomEvent) {
    addLog(`💬 Select: ${e.detail?.title || 'conversación'}`);
  }
  function handleConvAdd(e: CustomEvent) {
    addLog(`💬 Add: nueva conversación`);
  }
  function handleConvConfig(e: CustomEvent) {
    addLog(`💬 Config: ${e.detail?.id || 'config'}`);
  }

  // Project events
  function handleProjectSelect(e: CustomEvent) {
    addLog(`📂 Select: ${e.detail?.name || 'proyecto'}`);
  }
  function handleProjectAdd(e: CustomEvent) {
    addLog(`📂 Add: nuevo proyecto`);
  }
  function handleProjectConfig(e: CustomEvent) {
    addLog(`📂 Config: ${e.detail?.id || 'config'}`);
  }

  // FileBrowser events
  function handleFileSelect(e: CustomEvent) {
    addLog(`📁 Select: ${e.detail?.name || 'archivo'}`);
  }
  function handleFileAdd(e: CustomEvent) {
    addLog(`📁 Add: nuevo archivo/carpeta`);
  }
  function handleFileConfig(e: CustomEvent) {
    addLog(`📁 Config: ${e.detail?.path || 'config'}`);
  }

  // MenuGenerator events
  function handleMenuSelect(e: CustomEvent) {
    addLog(`🍔 Select: ${e.detail?.name || 'menú'}`);
  }
  function handleMenuAdd(e: CustomEvent) {
    addLog(`🍔 Add: nuevo menú`);
  }
  function handleMenuConfig(e: CustomEvent) {
    addLog(`🍔 Config: ${e.detail?.id || 'config'}`);
  }
</script>

<div class="page">
  <h1>🧪 Pruebas UI-SYSTEM-PLAN</h1>
  <p class="subtitle">Componentes uisis- con interacción triple</p>

  <!-- Interacción info -->
  <div class="interactions-info">
    <span class="interaction"><kbd>TAP</kbd> Select</span>
    <span class="interaction"><kbd>2×TAP</kbd> Add</span>
    <span class="interaction"><kbd>HOLD</kbd> Config</span>
  </div>

  <!-- Buttons Grid -->
  <div class="buttons-grid">
    <!-- AI (enableAdd=false) -->
    <div class="button-card">
      <AIButton
        size="lg"
        on:select={handleAISelect}
        on:config={handleAIConfig}
      />
      <div class="button-label">AIButton</div>
      <div class="button-info">enableAdd: ❌</div>
    </div>

    <!-- Credential (enableAdd=true) -->
    <div class="button-card">
      <CredentialButton
        size="lg"
        on:select={handleCredSelect}
        on:add={handleCredAdd}
        on:config={handleCredConfig}
      />
      <div class="button-label">CredentialButton</div>
      <div class="button-info">enableAdd: ✅</div>
    </div>

    <!-- Prompt (enableAdd=true) -->
    <div class="button-card">
      <PromptButton
        size="lg"
        on:select={handlePromptSelect}
        on:add={handlePromptAdd}
        on:config={handlePromptConfig}
      />
      <div class="button-label">PromptButton</div>
      <div class="button-info">enableAdd: ✅</div>
    </div>

    <!-- Conversation (enableAdd=true) -->
    <div class="button-card">
      <ConversationButton
        size="lg"
        projectId={testProjectId}
        on:select={handleConvSelect}
        on:add={handleConvAdd}
        on:config={handleConvConfig}
      />
      <div class="button-label">ConversationButton</div>
      <div class="button-info">enableAdd: ✅</div>
    </div>

    <!-- Project (enableAdd=true) -->
    <div class="button-card">
      <ProjectButton
        size="lg"
        on:select={handleProjectSelect}
        on:add={handleProjectAdd}
        on:config={handleProjectConfig}
      />
      <div class="button-label">ProjectButton</div>
      <div class="button-info">enableAdd: ✅</div>
    </div>

    <!-- FileBrowser (enableAdd=true) -->
    <div class="button-card">
      <FileBrowserButton
        size="lg"
        projectId={testProjectId}
        on:select={handleFileSelect}
        on:add={handleFileAdd}
        on:config={handleFileConfig}
      />
      <div class="button-label">FileBrowserButton</div>
      <div class="button-info">enableAdd: ✅</div>
    </div>

    <!-- MenuGenerator (enableAdd=true) -->
    <div class="button-card">
      <MenuGeneratorButton
        size="lg"
        on:select={handleMenuSelect}
        on:add={handleMenuAdd}
        on:config={handleMenuConfig}
      />
      <div class="button-label">MenuGeneratorButton</div>
      <div class="button-info">enableAdd: ✅</div>
    </div>
  </div>

  <!-- Log -->
  <div class="log">
    <h2>📋 Event Log</h2>
    {#each log as entry}
      <div class="log-item">{entry}</div>
    {:else}
      <div class="log-empty">Interactúa con los botones...</div>
    {/each}
  </div>
</div>

<style>
  .page {
    min-height: 100vh;
    padding: 1.5rem;
    background: var(--color-bg, #0a0a0a);
    color: var(--color-text, #fff);
  }

  h1 {
    margin: 0;
    font-size: 1.5rem;
  }

  h2 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
    color: var(--color-text-muted, #888);
  }

  .subtitle {
    margin: 0.25rem 0 1.5rem;
    color: var(--color-text-muted, #666);
    font-size: 0.875rem;
  }

  .interactions-info {
    display: flex;
    gap: 1.5rem;
    justify-content: center;
    margin-bottom: 2rem;
    padding: 0.75rem;
    background: var(--color-bg-card, #1a1d24);
    border-radius: 8px;
  }

  .interaction {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.75rem;
    color: var(--color-text-muted, #888);
  }

  kbd {
    padding: 0.2rem 0.4rem;
    background: var(--color-bg, #0a0a0a);
    border: 1px solid var(--color-border, #333);
    border-radius: 4px;
    font-size: 0.7rem;
    font-family: monospace;
  }

  .buttons-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(140px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .button-card {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.75rem;
    padding: 1.5rem 1rem;
    background: var(--color-bg-card, #1a1d24);
    border-radius: 12px;
    border: 1px solid var(--color-border, #2a2a2a);
  }

  .button-label {
    font-size: 0.75rem;
    color: var(--color-text, #fff);
    font-weight: 500;
  }

  .button-info {
    font-size: 0.65rem;
    color: var(--color-text-muted, #666);
  }

  .log {
    background: var(--color-bg-card, #1a1d24);
    border-radius: 12px;
    padding: 1rem;
    max-height: 300px;
    overflow-y: auto;
    border: 1px solid var(--color-border, #2a2a2a);
  }

  .log-item {
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border, #333);
    font-family: monospace;
    font-size: 0.75rem;
  }

  .log-item:last-child {
    border-bottom: none;
  }

  .log-empty {
    color: var(--color-text-muted, #666);
    text-align: center;
    padding: 2rem;
  }
</style>
