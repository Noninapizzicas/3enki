<!--
  SelectorPanel Demo Page
  =======================
  Página de demostración del componente SelectorPanel unificado.
  Muestra los 4 módulos soportados con triple interacción.

  @author Event Core Team
  @version 2.0.0
-->
<script lang="ts">
  import { SelectorPanel } from '$lib/components/selectors';

  // Estado de los paneles
  let showAIPanel = false;
  let showCredentialPanel = false;
  let showPromptPanel = false;
  let showConversationPanel = false;

  // Valores seleccionados
  let selectedModel: string | null = null;
  let selectedCredential: string | null = null;
  let selectedPrompts: string[] = [];
  let selectedConversation: string | null = null;

  // Project ID (simular)
  const projectId = 'demo-project';

  // Handlers
  function handleSelect(module: string, event: CustomEvent) {
    console.log(`[${module}] Selected:`, event.detail);
  }

  function handleCreate(module: string, event: CustomEvent) {
    console.log(`[${module}] Create:`, event.detail);
    alert(`Crear nuevo en ${module}`);
  }

  function handleEdit(module: string, event: CustomEvent) {
    console.log(`[${module}] Edit:`, event.detail);
    alert(`Editar: ${event.detail.item?.label || event.detail.itemId}`);
  }

  function handleDelete(module: string, event: CustomEvent) {
    console.log(`[${module}] Delete:`, event.detail);
    if (confirm(`¿Eliminar ${event.detail.itemId}?`)) {
      console.log('Eliminado');
    }
  }

  // Selector buttons config
  const selectors = [
    {
      id: 'ai',
      module: 'ai-gateway' as const,
      icon: '🤖',
      label: 'Modelo IA',
      description: 'Tap: ver modelos • DoubleTap: configurar • LongPress: gestionar',
      color: 'primary',
      getValue: () => selectedModel,
      getPanel: () => showAIPanel,
      setPanel: (v: boolean) => showAIPanel = v
    },
    {
      id: 'credential',
      module: 'credential-manager' as const,
      icon: '🔑',
      label: 'Credenciales',
      description: 'Tap: seleccionar • DoubleTap: crear • LongPress: gestionar',
      color: 'warning',
      getValue: () => selectedCredential,
      getPanel: () => showCredentialPanel,
      setPanel: (v: boolean) => showCredentialPanel = v
    },
    {
      id: 'prompt',
      module: 'prompt-manager' as const,
      icon: '📝',
      label: 'Prompts',
      description: 'Selección múltiple • Organizado por slots',
      color: 'success',
      getValue: () => selectedPrompts.length > 0 ? `${selectedPrompts.length} activos` : null,
      getPanel: () => showPromptPanel,
      setPanel: (v: boolean) => showPromptPanel = v
    },
    {
      id: 'conversation',
      module: 'conversation-manager' as const,
      icon: '💬',
      label: 'Conversaciones',
      description: 'Historial • Agrupado por fecha',
      color: 'info',
      getValue: () => selectedConversation,
      getPanel: () => showConversationPanel,
      setPanel: (v: boolean) => showConversationPanel = v
    }
  ];
</script>

<svelte:head>
  <title>SelectorPanel Demo - Event Core</title>
</svelte:head>

<div class="demo-page">
  <!-- Header -->
  <header class="demo-header">
    <h1>🎛️ SelectorPanel Demo</h1>
    <p class="subtitle">Componente unificado para selectores de módulos Event-Core</p>
  </header>

  <!-- Info Section -->
  <section class="info-section">
    <div class="info-card">
      <h3>📱 Triple Interacción</h3>
      <ul>
        <li><strong>Tap:</strong> Ver/seleccionar (90% uso)</li>
        <li><strong>DoubleTap:</strong> Crear nuevo (8% uso)</li>
        <li><strong>LongPress:</strong> Gestionar (2% uso)</li>
      </ul>
    </div>

    <div class="info-card">
      <h3>✨ Características</h3>
      <ul>
        <li>Timer management correcto</li>
        <li>CSS variables para temas</li>
        <li>TouchCancel handler</li>
        <li>Accesibilidad (ARIA, keyboard)</li>
      </ul>
    </div>

    <div class="info-card">
      <h3>🔌 Módulos</h3>
      <ul>
        <li>ai-gateway (modelos)</li>
        <li>credential-manager (API keys)</li>
        <li>prompt-manager (prompts)</li>
        <li>conversation-manager (chats)</li>
      </ul>
    </div>
  </section>

  <!-- Selectors Grid -->
  <section class="selectors-section">
    <h2>Selectores Disponibles</h2>
    <p class="section-desc">Haz clic en cada botón para abrir el panel correspondiente</p>

    <div class="selectors-grid">
      {#each selectors as selector}
        <button
          class="selector-button {selector.color}"
          on:click={() => selector.setPanel(true)}
        >
          <span class="selector-icon">{selector.icon}</span>
          <div class="selector-info">
            <span class="selector-label">{selector.label}</span>
            <span class="selector-desc">{selector.description}</span>
            {#if selector.getValue()}
              <span class="selector-value">{selector.getValue()}</span>
            {/if}
          </div>
          <span class="selector-arrow">→</span>
        </button>
      {/each}
    </div>
  </section>

  <!-- Current Values -->
  <section class="values-section">
    <h2>Valores Actuales</h2>
    <div class="values-grid">
      <div class="value-card">
        <span class="value-icon">🤖</span>
        <span class="value-label">Modelo:</span>
        <code class="value-code">{selectedModel || 'ninguno'}</code>
      </div>
      <div class="value-card">
        <span class="value-icon">🔑</span>
        <span class="value-label">Credencial:</span>
        <code class="value-code">{selectedCredential || 'ninguna'}</code>
      </div>
      <div class="value-card">
        <span class="value-icon">📝</span>
        <span class="value-label">Prompts:</span>
        <code class="value-code">{selectedPrompts.length ? selectedPrompts.join(', ') : 'ninguno'}</code>
      </div>
      <div class="value-card">
        <span class="value-icon">💬</span>
        <span class="value-label">Conversación:</span>
        <code class="value-code">{selectedConversation || 'ninguna'}</code>
      </div>
    </div>
  </section>

  <!-- Code Example -->
  <section class="code-section">
    <h2>Uso del Componente</h2>
    <pre class="code-block"><code>{`<script>
  import { SelectorPanel } from '$lib/components/selectors';

  let showPanel = false;
  let selectedValue = null;
<\/script>

<SelectorPanel
  module="ai-gateway"
  panelMode="quick"
  projectId="my-project"
  bind:open={showPanel}
  bind:selectedValue={selectedValue}
  on:select={handleSelect}
  on:create={handleCreate}
  on:close={handleClose}
/>`}</code></pre>
  </section>
</div>

<!-- Paneles -->
<SelectorPanel
  module="ai-gateway"
  panelMode="quick"
  {projectId}
  bind:open={showAIPanel}
  bind:selectedValue={selectedModel}
  on:select={(e) => handleSelect('ai-gateway', e)}
  on:create={(e) => handleCreate('ai-gateway', e)}
  on:edit={(e) => handleEdit('ai-gateway', e)}
/>

<SelectorPanel
  module="credential-manager"
  panelMode="quick"
  {projectId}
  bind:open={showCredentialPanel}
  bind:selectedValue={selectedCredential}
  on:select={(e) => handleSelect('credential-manager', e)}
  on:create={(e) => handleCreate('credential-manager', e)}
  on:edit={(e) => handleEdit('credential-manager', e)}
  on:delete={(e) => handleDelete('credential-manager', e)}
/>

<SelectorPanel
  module="prompt-manager"
  panelMode="quick"
  {projectId}
  bind:open={showPromptPanel}
  bind:selectedValue={selectedPrompts}
  on:select={(e) => handleSelect('prompt-manager', e)}
  on:create={(e) => handleCreate('prompt-manager', e)}
/>

<SelectorPanel
  module="conversation-manager"
  panelMode="quick"
  {projectId}
  bind:open={showConversationPanel}
  bind:selectedValue={selectedConversation}
  on:select={(e) => handleSelect('conversation-manager', e)}
  on:create={(e) => handleCreate('conversation-manager', e)}
  on:delete={(e) => handleDelete('conversation-manager', e)}
/>

<style>
  .demo-page {
    --demo-bg: var(--color-bg, #0f0f1a);
    --demo-surface: var(--color-bg-card, #1a1a2e);
    --demo-border: var(--color-border, #2d2d44);
    --demo-text: var(--color-text, #e0e0e0);
    --demo-text-muted: var(--color-text-muted, #888);
    --demo-primary: var(--color-primary, #6366f1);
    --demo-success: var(--color-success, #22c55e);
    --demo-warning: var(--color-warning, #f59e0b);
    --demo-info: var(--color-info, #3b82f6);

    min-height: 100vh;
    background: var(--demo-bg);
    color: var(--demo-text);
    padding: 2rem;
    font-family: system-ui, sans-serif;
  }

  /* Header */
  .demo-header {
    text-align: center;
    margin-bottom: 2rem;
  }

  .demo-header h1 {
    font-size: 2rem;
    margin: 0 0 0.5rem;
  }

  .subtitle {
    color: var(--demo-text-muted);
    margin: 0;
  }

  /* Info Section */
  .info-section {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(250px, 1fr));
    gap: 1rem;
    margin-bottom: 2rem;
  }

  .info-card {
    background: var(--demo-surface);
    border: 1px solid var(--demo-border);
    border-radius: 0.75rem;
    padding: 1.25rem;
  }

  .info-card h3 {
    margin: 0 0 0.75rem;
    font-size: 1rem;
  }

  .info-card ul {
    margin: 0;
    padding-left: 1.25rem;
    color: var(--demo-text-muted);
    font-size: 0.875rem;
    line-height: 1.6;
  }

  .info-card li strong {
    color: var(--demo-text);
  }

  /* Selectors Section */
  .selectors-section {
    margin-bottom: 2rem;
  }

  .selectors-section h2 {
    margin: 0 0 0.25rem;
    font-size: 1.25rem;
  }

  .section-desc {
    color: var(--demo-text-muted);
    margin: 0 0 1rem;
    font-size: 0.875rem;
  }

  .selectors-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(280px, 1fr));
    gap: 1rem;
  }

  .selector-button {
    display: flex;
    align-items: center;
    gap: 1rem;
    padding: 1rem 1.25rem;
    background: var(--demo-surface);
    border: 1px solid var(--demo-border);
    border-radius: 0.75rem;
    color: var(--demo-text);
    cursor: pointer;
    text-align: left;
    transition: transform 0.15s, border-color 0.15s;
  }

  .selector-button:hover {
    transform: translateY(-2px);
  }

  .selector-button.primary:hover {
    border-color: var(--demo-primary);
  }

  .selector-button.warning:hover {
    border-color: var(--demo-warning);
  }

  .selector-button.success:hover {
    border-color: var(--demo-success);
  }

  .selector-button.info:hover {
    border-color: var(--demo-info);
  }

  .selector-icon {
    font-size: 2rem;
    flex-shrink: 0;
  }

  .selector-info {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .selector-label {
    font-weight: 600;
    font-size: 1rem;
  }

  .selector-desc {
    font-size: 0.75rem;
    color: var(--demo-text-muted);
  }

  .selector-value {
    font-size: 0.75rem;
    color: var(--demo-primary);
    font-family: monospace;
  }

  .selector-arrow {
    font-size: 1.25rem;
    color: var(--demo-text-muted);
    flex-shrink: 0;
  }

  /* Values Section */
  .values-section {
    margin-bottom: 2rem;
  }

  .values-section h2 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
  }

  .values-grid {
    display: grid;
    grid-template-columns: repeat(auto-fit, minmax(200px, 1fr));
    gap: 0.75rem;
  }

  .value-card {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    background: var(--demo-surface);
    border: 1px solid var(--demo-border);
    border-radius: 0.5rem;
    font-size: 0.875rem;
  }

  .value-icon {
    font-size: 1.125rem;
  }

  .value-label {
    color: var(--demo-text-muted);
  }

  .value-code {
    font-family: monospace;
    background: rgba(0, 0, 0, 0.2);
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    font-size: 0.75rem;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
    max-width: 150px;
  }

  /* Code Section */
  .code-section h2 {
    margin: 0 0 1rem;
    font-size: 1.25rem;
  }

  .code-block {
    background: var(--demo-surface);
    border: 1px solid var(--demo-border);
    border-radius: 0.75rem;
    padding: 1.25rem;
    overflow-x: auto;
    font-size: 0.8125rem;
    line-height: 1.5;
  }

  .code-block code {
    font-family: 'Fira Code', 'SF Mono', monospace;
    color: var(--demo-text);
  }

  /* Responsive */
  @media (max-width: 640px) {
    .demo-page {
      padding: 1rem;
    }

    .demo-header h1 {
      font-size: 1.5rem;
    }
  }
</style>
