<script lang="ts">
  /**
   * CredentialSelector - Gestión de API Keys
   *
   * @deprecated Usar CredentialButton + SelectorPanel + CredentialAddPanel + CredentialConfigPanel
   *
   * Este componente está DEPRECADO porque:
   * 1. No cumple con UI-SYSTEM-PLAN.md (triple interacción)
   * 2. Long press no tiene acción
   * 3. No separa responsabilidades (Select/Add/Config)
   *
   * Migración:
   * ```svelte
   * <CredentialButton
   *   on:select={handleSelect}
   *   on:add={handleAdd}
   *   on:config={handleConfig}
   * />
   * ```
   *
   * Gestos legacy (solo para referencia):
   * - Tap: Ver credenciales existentes
   * - Doble tap: Añadir nueva credencial
   *
   * Conecta con: /api/modules/credential-manager/ui/state (UI-ready endpoint)
   */
  import { createEventDispatcher, onMount, onDestroy } from 'svelte';
  import { FloatingPanel } from '$components/feedback';

  // Props
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let apiBase: string = '/api/modules/credential-manager';

  // Config tiempos
  const TAP_DELAY = 300;
  const LONG_PRESS_TIME = 500;

  // Estado
  let panelOpen = false;
  let panelMode: 'list' | 'add' | 'edit' = 'list';
  let loading = false;
  let error: string | null = null;

  // Estado para confirmación de eliminación
  let deleteConfirm: { key: string; provider: string } | null = null;

  // Datos UI-ready desde backend (no hardcodeados)
  let providers: Array<{ id: string; name: string; icon: string }> = [];
  let levels: Array<{ id: string; name: string; icon: string; requiresIdentifier: boolean }> = [];

  // Credenciales agrupadas desde backend
  let credentialsGrouped: {
    GLOBAL: Array<{
      key: string;
      provider: string;
      providerName: string;
      providerIcon: string;
      level: string;
      identifier: string | null;
      preview: string;
    }>;
    projects: Record<string, Array<{
      key: string;
      provider: string;
      providerName: string;
      providerIcon: string;
      level: string;
      identifier: string | null;
      preview: string;
    }>>;
  } = { GLOBAL: [], projects: {} };

  // Stats
  let stats = { total: 0, byLevel: { GLOBAL: 0, PROJECT: 0, CLIENT: 0, CUSTOM: 0 } };

  // Contador
  $: activeCount = stats.total;
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
    error: { message: string };
  }>();

  // ==========================================
  // API Functions - Conecta con .env via backend
  // ==========================================

  async function loadUIState() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/ui/state`);
      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }
      const data = await res.json();

      if (data.success) {
        // Datos UI-ready desde backend
        providers = data.providers || [];
        levels = data.levels || [];
        credentialsGrouped = data.credentials || { GLOBAL: [], projects: {} };
        stats = data.stats || { total: 0, byLevel: {} };
      } else {
        error = data.message || data.error || 'Error al cargar estado';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'No se pudo conectar con el servidor';
      dispatch('error', { message: error });
      console.error('CredentialSelector: Error loading UI state', err);
    } finally {
      loading = false;
    }
  }

  // Estado del test
  let testResult: { valid: boolean; message: string } | null = null;
  let testing = false;

  async function apiTestCredential(): Promise<boolean> {
    if (!newCredential.apiKey || !newCredential.provider) return false;

    testing = true;
    testResult = null;
    error = null;

    try {
      const res = await fetch(`${apiBase}/ui/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newCredential.provider,
          api_key: newCredential.apiKey
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.success) {
        const msg = typeof data.message === 'string' ? data.message : JSON.stringify(data.message) || 'Validación completada';
        testResult = { valid: data.valid, message: msg };
        return data.valid;
      } else {
        const errMsg = typeof data.error === 'string' ? data.error : JSON.stringify(data.error) || 'Error al validar';
        testResult = { valid: false, message: errMsg };
        return false;
      }
    } catch (err) {
      testResult = { valid: false, message: 'Error de conexión al validar' };
      console.error('CredentialSelector: Error testing credential', err);
      return false;
    } finally {
      testing = false;
    }
  }

  async function apiSaveCredential() {
    if (!newCredential.apiKey) return;

    // Primero validar la API key
    const isValid = await apiTestCredential();

    if (!isValid) {
      const errMsg = testResult?.message;
      error = typeof errMsg === 'string' ? errMsg : 'API key no válida';
      dispatch('error', { message: error });
      return;
    }

    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/credentials`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: newCredential.provider,
          level: newCredential.level,
          identifier: newCredential.level !== 'GLOBAL' ? newCredential.identifier : null,
          api_key: newCredential.apiKey
        })
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.success) {
        // Recargar estado desde backend
        await loadUIState();

        dispatch('save', {
          provider: newCredential.provider,
          level: newCredential.level,
          identifier: newCredential.identifier || null
        });

        panelMode = 'list';
        resetForm();
      } else {
        error = data.message || data.error || 'Error al guardar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al guardar';
      dispatch('error', { message: error });
      console.error('CredentialSelector: Error saving credential', err);
    } finally {
      loading = false;
    }
  }

  async function apiDeleteCredential(key: string) {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/credentials/${encodeURIComponent(key)}`, {
        method: 'DELETE'
      });

      if (!res.ok) {
        throw new Error(`HTTP ${res.status}: ${res.statusText}`);
      }

      const data = await res.json();

      if (data.success) {
        // Recargar estado desde backend
        await loadUIState();
        deleteConfirm = null;
        dispatch('delete', { key });
      } else {
        error = data.message || data.error || 'Error al eliminar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al eliminar';
      dispatch('error', { message: error });
      console.error('CredentialSelector: Error deleting credential', err);
    } finally {
      loading = false;
    }
  }

  // Cargar estado UI al montar
  onMount(() => {
    loadUIState();
  });

  onDestroy(() => {
    clearTimers();
  });

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

    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }

    tapCount++;

    // Cancelar timeout anterior para detectar doble tap correctamente
    if (tapTimeout) {
      clearTimeout(tapTimeout);
    }

    tapTimeout = window.setTimeout(() => {
      if (tapCount >= 2) {
        doDoubleTap();
      } else {
        doTap();
      }
      tapCount = 0;
      tapTimeout = null;
    }, TAP_DELAY);
  }

  function onTouchCancel() {
    clearTimers();
    tapCount = 0;
    isLongPress = false;
  }

  // === EVENTOS MOUSE (desktop) ===
  function onMouseDown() {
    isLongPress = false;
    longPressTimeout = window.setTimeout(() => {
      isLongPress = true;
      clearTimers();
      // Long press no hace nada en este componente
    }, LONG_PRESS_TIME);
  }

  function onMouseUp() {
    if (isLongPress) {
      isLongPress = false;
      return;
    }

    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }

    tapCount++;

    if (tapTimeout) {
      clearTimeout(tapTimeout);
    }

    tapTimeout = window.setTimeout(() => {
      if (tapCount >= 2) {
        doDoubleTap();
      } else {
        doTap();
      }
      tapCount = 0;
      tapTimeout = null;
    }, TAP_DELAY);
  }

  function onMouseLeave() {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
  }

  function resetForm() {
    newCredential = {
      provider: 'DEEPSEEK',
      level: 'GLOBAL',
      identifier: '',
      apiKey: ''
    };
    editingKey = null;
    testResult = null;
  }

  // Usa la API real para guardar en .env
  function saveCredential() {
    apiSaveCredential();
  }

  // Usa la API real para eliminar de .env
  function deleteCredential(key: string) {
    apiDeleteCredential(key);
  }

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
  on:mousedown={onMouseDown}
  on:mouseup={onMouseUp}
  on:mouseleave={onMouseLeave}
>
  <span class="cred-selector__icon">🔐</span>
  <span class="cred-selector__label">{activeCount}/{totalProviders}</span>
</button>

<!-- PANEL -->
<FloatingPanel bind:open={panelOpen}>
  {#if panelMode === 'list'}
    <!-- Lista de credenciales -->
    <div class="panel">
      <div class="panel-header">
        <h3>🔐 Credenciales</h3>
        <button class="refresh-btn" on:click={loadUIState} disabled={loading}>
          {loading ? '⏳' : '🔄'}
        </button>
      </div>

      {#if error}
        <div class="panel-error">{error}</div>
      {/if}

      {#if loading && stats.total === 0}
        <p class="panel-loading">Cargando...</p>
      {:else if stats.total === 0}
        <p class="panel-empty">No hay credenciales en .env</p>
      {:else}
        <!-- GLOBAL -->
        {#if credentialsGrouped.GLOBAL.length > 0}
          <div class="group">
            <div class="group-title">🟢 GLOBAL</div>
            {#each credentialsGrouped.GLOBAL as cred}
              <div class="cred-item">
                <span class="cred-icon">{cred.providerIcon}</span>
                <span class="cred-name">{cred.providerName}</span>
                <span class="cred-preview">{cred.preview}</span>
                <button class="cred-delete" on:click={() => deleteConfirm = { key: cred.key, provider: cred.providerName }} disabled={loading}>
                  🗑️
                </button>
              </div>
            {/each}
          </div>
        {/if}

        <!-- Proyectos -->
        {#each Object.entries(credentialsGrouped.projects) as [projectName, projectCreds]}
          <div class="group">
            <div class="group-title">🔵 {projectName}</div>
            {#each projectCreds as cred}
              <div class="cred-item">
                <span class="cred-icon">{cred.providerIcon}</span>
                <span class="cred-name">{cred.providerName}</span>
                <span class="cred-preview">{cred.preview}</span>
                <button class="cred-delete" on:click={() => deleteConfirm = { key: cred.key, provider: cred.providerName }} disabled={loading}>
                  🗑️
                </button>
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

      <!-- Identificador (si requiere identificador) -->
      {#if levels.find(l => l.id === newCredential.level)?.requiresIdentifier}
        <div class="form-group">
          <label>Identificador</label>
          {#if Object.keys(credentialsGrouped.projects).length > 0}
            <select bind:value={newCredential.identifier}>
              <option value="">-- Nuevo --</option>
              {#each Object.keys(credentialsGrouped.projects) as proj}
                <option value={proj}>{proj}</option>
              {/each}
            </select>
          {/if}
          <input
            type="text"
            placeholder="Nombre del identificador"
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

      <!-- Test result feedback -->
      {#if testResult}
        <div class="test-result" class:valid={testResult.valid} class:invalid={!testResult.valid}>
          {testResult.valid ? '✅' : '❌'} {testResult.message}
        </div>
      {/if}

      {#if error}
        <div class="panel-error">{error}</div>
      {/if}

      <div class="form-actions">
        <button class="cancel-btn" on:click={() => { panelMode = 'list'; error = null; testResult = null; }}>Cancelar</button>
        <button class="save-btn" on:click={saveCredential} disabled={loading || testing || !newCredential.apiKey}>
          {#if testing}
            🔍 Validando...
          {:else if loading}
            ⏳ Guardando...
          {:else}
            💾 Guardar
          {/if}
        </button>
      </div>

      <p class="form-hint">⚠️ Se valida y guarda en archivo .env del servidor</p>
    </div>
  {/if}

  <!-- Modal de confirmación de eliminación -->
  {#if deleteConfirm}
    <div class="delete-confirm-overlay" on:click={() => deleteConfirm = null} on:keydown={(e) => e.key === 'Escape' && (deleteConfirm = null)} role="button" tabindex="0">
      <div class="delete-confirm-modal" on:click|stopPropagation role="dialog" aria-modal="true">
        <div class="delete-confirm-icon">⚠️</div>
        <h4>¿Eliminar credencial?</h4>
        <p class="delete-confirm-name">{deleteConfirm.provider}</p>
        <p class="delete-confirm-warning">Esta acción eliminará la API key del archivo .env</p>
        <div class="delete-confirm-actions">
          <button class="cancel-btn" on:click={() => deleteConfirm = null}>Cancelar</button>
          <button
            class="confirm-delete-btn"
            on:click={() => deleteConfirm && apiDeleteCredential(deleteConfirm.key)}
            disabled={loading}
          >
            {loading ? '⏳ Eliminando...' : '🗑️ Eliminar'}
          </button>
        </div>
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

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 1rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1.1rem;
  }

  .refresh-btn {
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.25rem;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .refresh-btn:hover {
    opacity: 1;
  }

  .refresh-btn:disabled {
    cursor: not-allowed;
  }

  .panel-empty,
  .panel-loading {
    text-align: center;
    color: #888;
    padding: 1rem;
  }

  .panel-error {
    background: #fee2e2;
    color: #dc2626;
    padding: 0.5rem;
    border-radius: 6px;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }

  /* Test result */
  .test-result {
    padding: 0.5rem;
    border-radius: 6px;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
    text-align: center;
  }

  .test-result.valid {
    background: #dcfce7;
    color: #16a34a;
  }

  .test-result.invalid {
    background: #fee2e2;
    color: #dc2626;
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

  .save-btn:disabled {
    background: #9ca3af;
    cursor: not-allowed;
  }

  .form-hint {
    margin-top: 0.75rem;
    font-size: 0.7rem;
    color: #888;
    text-align: center;
  }

  /* Modal de confirmación de eliminación */
  .delete-confirm-overlay {
    position: fixed;
    top: 0;
    left: 0;
    right: 0;
    bottom: 0;
    background: rgba(0, 0, 0, 0.5);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .delete-confirm-modal {
    background: white;
    border-radius: 12px;
    padding: 1.5rem;
    max-width: 320px;
    text-align: center;
    box-shadow: 0 4px 24px rgba(0, 0, 0, 0.2);
  }

  .delete-confirm-icon {
    font-size: 2.5rem;
    margin-bottom: 0.5rem;
  }

  .delete-confirm-modal h4 {
    margin: 0 0 0.5rem 0;
    font-size: 1rem;
    font-weight: 600;
    color: #111;
  }

  .delete-confirm-name {
    font-weight: 500;
    color: #111;
    margin: 0 0 0.25rem 0;
  }

  .delete-confirm-warning {
    font-size: 0.8rem;
    color: #666;
    margin: 0 0 1rem 0;
  }

  .delete-confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  .confirm-delete-btn {
    padding: 0.5rem 1rem;
    background: #dc2626;
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
    font-weight: 500;
  }

  .confirm-delete-btn:hover {
    background: #b91c1c;
  }

  .confirm-delete-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }
</style>
