<script lang="ts">
  /**
   * CredentialSelector - Gestión de API Keys
   *
   * Gestos:
   * - Tap: Ver credenciales existentes
   * - Doble tap: Añadir nueva credencial
   *
   * Icono muestra contador (activas/total proveedores)
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { FloatingPanel } from '$components/feedback';

  // Props
  export let size: 'sm' | 'md' | 'lg' = 'md';

  // Proveedores disponibles
  const providers = [
    { id: 'DEEPSEEK', name: 'DeepSeek', icon: '🔮' },
    { id: 'ANTHROPIC', name: 'Anthropic', icon: '🧠' },
    { id: 'OPENAI', name: 'OpenAI', icon: '🤖' },
    { id: 'OLLAMA', name: 'Ollama', icon: '🦙' }
  ];

  // Niveles
  const levels = [
    { id: 'GLOBAL', name: 'Global', icon: '🟢' },
    { id: 'PROJECT', name: 'Proyecto', icon: '🔵' }
  ];

  // Config tiempos
  const TAP_DELAY = 300;
  const LONG_PRESS_TIME = 500;

  // Estado
  let panelOpen = false;
  let panelMode: 'list' | 'add' | 'edit' = 'list';

  // Credenciales (mock inicial)
  let credentials: Array<{
    key: string;
    provider: string;
    level: string;
    identifier: string | null;
    preview: string;
  }> = [
    { key: 'DEEPSEEK_API_KEY_GLOBAL', provider: 'DEEPSEEK', level: 'GLOBAL', identifier: null, preview: '****abc' },
    { key: 'OPENAI_API_KEY_GLOBAL', provider: 'OPENAI', level: 'GLOBAL', identifier: null, preview: '****xyz' }
  ];

  // Proyectos existentes (extraídos de credenciales)
  $: projects = [...new Set(
    credentials
      .filter(c => c.level === 'PROJECT' && c.identifier)
      .map(c => c.identifier)
  )];

  // Contador
  $: activeCount = credentials.length;
  $: totalProviders = providers.length;

  // Formulario añadir
  let newCredential = {
    provider: 'DEEPSEEK',
    level: 'GLOBAL',
    identifier: '',
    apiKey: ''
  };

  // Editar
  let editingKey: string | null = null;

  // Timers
  let tapTimeout: number | null = null;
  let longPressTimeout: number | null = null;
  let tapCount = 0;
  let isLongPress = false;

  const dispatch = createEventDispatcher<{
    save: { provider: string; level: string; identifier: string | null };
    delete: { key: string };
  }>();

  function clearTimers() {
    if (tapTimeout) clearTimeout(tapTimeout);
    if (longPressTimeout) clearTimeout(longPressTimeout);
    tapTimeout = null;
    longPressTimeout = null;
  }

  // === ACCIONES ===
  function doTap() {
    panelMode = 'list';
    panelOpen = true;
  }

  function doDoubleTap() {
    resetForm();
    panelMode = 'add';
    panelOpen = true;
  }

  // === EVENTOS TOUCH ===
  function onTouchStart(e: TouchEvent) {
    e.preventDefault();
    isLongPress = false;
    longPressTimeout = window.setTimeout(() => {
      isLongPress = true;
      clearTimers();
      // Long press no hace nada en este componente
    }, LONG_PRESS_TIME);
  }

  function onTouchEnd(e: TouchEvent) {
    e.preventDefault();
    if (isLongPress) {
      isLongPress = false;
      return;
    }
    clearTimers();
    tapCount++;
    if (tapCount === 1) {
      tapTimeout = window.setTimeout(() => {
        if (tapCount === 1) doTap();
        tapCount = 0;
      }, TAP_DELAY);
    } else if (tapCount >= 2) {
      clearTimers();
      doDoubleTap();
      tapCount = 0;
    }
  }

  function onTouchCancel() {
    clearTimers();
    tapCount = 0;
    isLongPress = false;
  }

  function resetForm() {
    newCredential = {
      provider: 'DEEPSEEK',
      level: 'GLOBAL',
      identifier: '',
      apiKey: ''
    };
    editingKey = null;
  }

  function saveCredential() {
    if (!newCredential.apiKey) return;

    const key = newCredential.level === 'GLOBAL'
      ? `${newCredential.provider}_API_KEY_GLOBAL`
      : `${newCredential.provider}_API_KEY_${newCredential.level}_${newCredential.identifier}`;

    // Mock: añadir a la lista
    const existing = credentials.findIndex(c => c.key === key);
    const preview = '****' + newCredential.apiKey.slice(-4);

    if (existing >= 0) {
      credentials[existing].preview = preview;
    } else {
      credentials = [...credentials, {
        key,
        provider: newCredential.provider,
        level: newCredential.level,
        identifier: newCredential.identifier || null,
        preview
      }];
    }

    dispatch('save', {
      provider: newCredential.provider,
      level: newCredential.level,
      identifier: newCredential.identifier || null
    });

    panelMode = 'list';
    resetForm();
  }

  function deleteCredential(key: string) {
    credentials = credentials.filter(c => c.key !== key);
    dispatch('delete', { key });
  }

  function getProviderIcon(providerId: string): string {
    return providers.find(p => p.id === providerId)?.icon || '🔑';
  }

  // Agrupar por nivel/proyecto
  $: grouped = {
    GLOBAL: credentials.filter(c => c.level === 'GLOBAL'),
    projects: projects.map(proj => ({
      name: proj,
      credentials: credentials.filter(c => c.level === 'PROJECT' && c.identifier === proj)
    })).filter(g => g.credentials.length > 0)
  };

  // Tamaños
  const sizes = {
    sm: { btn: 48, icon: '1.25rem', label: '0.6rem' },
    md: { btn: 64, icon: '1.75rem', label: '0.7rem' },
    lg: { btn: 80, icon: '2rem', label: '0.75rem' }
  };
  $: s = sizes[size];
</script>

<!-- BOTÓN -->
<button
  class="cred-selector"
  style="--btn-size: {s.btn}px; --icon-size: {s.icon}; --label-size: {s.label};"
  on:touchstart={onTouchStart}
  on:touchend={onTouchEnd}
  on:touchcancel={onTouchCancel}
>
  <span class="cred-selector__icon">🔐</span>
  <span class="cred-selector__label">{activeCount}/{totalProviders}</span>
</button>

<!-- PANEL -->
<FloatingPanel bind:open={panelOpen}>
  {#if panelMode === 'list'}
    <!-- Lista de credenciales -->
    <div class="panel">
      <h3>🔐 Credenciales</h3>

      {#if credentials.length === 0}
        <p class="panel-empty">No hay credenciales configuradas</p>
      {:else}
        <!-- GLOBAL -->
        {#if grouped.GLOBAL.length > 0}
          <div class="group">
            <div class="group-title">🟢 GLOBAL</div>
            {#each grouped.GLOBAL as cred}
              <div class="cred-item">
                <span class="cred-icon">{getProviderIcon(cred.provider)}</span>
                <span class="cred-name">{cred.provider}</span>
                <span class="cred-preview">{cred.preview}</span>
                <button class="cred-delete" on:click={() => deleteCredential(cred.key)}>🗑️</button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Proyectos -->
        {#each grouped.projects as proj}
          <div class="group">
            <div class="group-title">🔵 {proj.name}</div>
            {#each proj.credentials as cred}
              <div class="cred-item">
                <span class="cred-icon">{getProviderIcon(cred.provider)}</span>
                <span class="cred-name">{cred.provider}</span>
                <span class="cred-preview">{cred.preview}</span>
                <button class="cred-delete" on:click={() => deleteCredential(cred.key)}>🗑️</button>
              </div>
            {/each}
          </div>
        {/each}
      {/if}

      <button class="add-btn" on:click={() => { resetForm(); panelMode = 'add'; }}>
        + Añadir
      </button>
    </div>

  {:else if panelMode === 'add'}
    <!-- Formulario añadir -->
    <div class="panel">
      <h3>🔐 Nueva Credencial</h3>

      <!-- Proveedor -->
      <div class="form-group">
        <label>Proveedor</label>
        <div class="provider-select">
          {#each providers as p}
            <button
              class="provider-btn"
              class:active={newCredential.provider === p.id}
              on:click={() => newCredential.provider = p.id}
            >
              {p.icon}
            </button>
          {/each}
        </div>
      </div>

      <!-- Nivel -->
      <div class="form-group">
        <label>Nivel</label>
        <div class="level-select">
          {#each levels as l}
            <button
              class="level-btn"
              class:active={newCredential.level === l.id}
              on:click={() => newCredential.level = l.id}
            >
              {l.icon} {l.name}
            </button>
          {/each}
        </div>
      </div>

      <!-- Identificador (si es PROJECT) -->
      {#if newCredential.level === 'PROJECT'}
        <div class="form-group">
          <label>Proyecto</label>
          {#if projects.length > 0}
            <select bind:value={newCredential.identifier}>
              <option value="">-- Nuevo proyecto --</option>
              {#each projects as proj}
                <option value={proj}>{proj}</option>
              {/each}
            </select>
          {/if}
          <input
            type="text"
            placeholder="Nombre del proyecto"
            bind:value={newCredential.identifier}
          />
        </div>
      {/if}

      <!-- API Key -->
      <div class="form-group">
        <label>API Key</label>
        <input
          type="password"
          placeholder="sk-..."
          bind:value={newCredential.apiKey}
        />
      </div>

      <div class="form-actions">
        <button class="cancel-btn" on:click={() => panelMode = 'list'}>Cancelar</button>
        <button class="save-btn" on:click={saveCredential}>💾 Guardar</button>
      </div>
    </div>
  {/if}
</FloatingPanel>

<style>
  .cred-selector {
    width: var(--btn-size);
    height: var(--btn-size);
    border: none;
    border-radius: 16px;
    background: var(--cred-selector-bg, #333);
    color: var(--cred-selector-color, #fff);
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 4px;
    cursor: pointer;
    touch-action: manipulation;
    -webkit-tap-highlight-color: transparent;
    user-select: none;
    transition: transform 0.1s, background 0.15s;
  }

  .cred-selector:active {
    background: var(--cred-selector-active, #22c55e);
    transform: scale(0.95);
  }

  .cred-selector__icon {
    font-size: var(--icon-size);
    line-height: 1;
  }

  .cred-selector__label {
    font-size: var(--label-size);
    opacity: 0.9;
  }

  /* Panel */
  .panel {
    min-width: 300px;
    max-width: 340px;
    padding: 0.5rem;
  }

  .panel h3 {
    margin: 0 0 1rem;
    font-size: 1.1rem;
  }

  .panel-empty {
    text-align: center;
    color: #888;
    padding: 1rem;
  }

  /* Grupos */
  .group {
    margin-bottom: 1rem;
  }

  .group-title {
    font-size: 0.75rem;
    font-weight: bold;
    color: #666;
    margin-bottom: 0.5rem;
    padding-left: 0.25rem;
  }

  /* Credential item */
  .cred-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    background: #f5f5f5;
    border-radius: 8px;
    margin-bottom: 0.25rem;
  }

  .cred-icon {
    font-size: 1.25rem;
  }

  .cred-name {
    flex: 1;
    font-size: 0.875rem;
    font-weight: 500;
    color: #333;
  }

  .cred-preview {
    font-family: monospace;
    font-size: 0.75rem;
    color: #888;
  }

  .cred-delete {
    background: none;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    padding: 0.25rem;
  }

  .cred-delete:hover {
    opacity: 1;
  }

  .add-btn {
    width: 100%;
    padding: 0.75rem;
    margin-top: 0.5rem;
    background: #e0f0ff;
    color: #3b82f6;
    border: 2px dashed #3b82f6;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
  }

  /* Form */
  .form-group {
    margin-bottom: 1rem;
  }

  .form-group label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: #333;
    margin-bottom: 0.25rem;
  }

  .provider-select, .level-select {
    display: flex;
    gap: 0.5rem;
  }

  .provider-btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 1.5rem;
    border: 2px solid #ddd;
    border-radius: 8px;
    background: #f5f5f5;
    cursor: pointer;
  }

  .provider-btn.active {
    border-color: #3b82f6;
    background: #e0f0ff;
  }

  .level-btn {
    flex: 1;
    padding: 0.5rem;
    font-size: 0.875rem;
    border: 2px solid #ddd;
    border-radius: 8px;
    background: #f5f5f5;
    cursor: pointer;
  }

  .level-btn.active {
    border-color: #3b82f6;
    background: #e0f0ff;
  }

  .form-group input,
  .form-group select {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid #ddd;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-top: 0.25rem;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .cancel-btn {
    flex: 1;
    padding: 0.75rem;
    background: #f0f0f0;
    color: #666;
    border: none;
    border-radius: 8px;
    cursor: pointer;
  }

  .save-btn {
    flex: 2;
    padding: 0.75rem;
    background: #22c55e;
    color: white;
    border: none;
    border-radius: 8px;
    font-weight: bold;
    cursor: pointer;
  }
</style>
