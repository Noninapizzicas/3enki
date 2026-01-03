<script lang="ts">
  /**
   * ProvidersTab - Gestión de API keys de proveedores IA
   *
   * Sub-tabs:
   * - Lista: Ver y seleccionar credenciales existentes
   * - Nuevo: Crear nueva credencial
   * - Config: Editar/eliminar credencial seleccionada
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    credentialsStore,
    initCredentialsSubscriptions,
    createCredential,
    updateCredential,
    deleteCredential,
    testCredential,
    selectCredential,
    setActiveTab,
    clearTestResult,
    globalCredentials,
    projectCredentials,
    clientCredentials,
    customCredentials,
    selectedCredential
  } from '$lib/stores/credentials';
  import { closePanel } from '$lib/stores';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Form state for "Nuevo" tab
  let newForm = {
    provider: '',
    level: 'GLOBAL',
    identifier: '',
    apiKey: ''
  };

  // Form state for "Config" tab
  let editApiKey = '';

  // UI state
  let showPassword = false;
  let saving = false;
  let testing = false;
  let deleting = false;
  let error: string | null = null;

  // Expanded groups
  let expandedGroups = {
    GLOBAL: true,
    PROJECT: false,
    CLIENT: false,
    CUSTOM: false
  };

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: activeTab = $credentialsStore.activeTab;
  $: providers = $credentialsStore.providers;
  $: levels = $credentialsStore.levels;
  $: loading = $credentialsStore.loading;
  $: testResult = $credentialsStore.testResult;
  $: selected = $selectedCredential;
  $: stats = $credentialsStore.stats;

  // Form validation
  $: selectedLevel = levels.find(l => l.id === newForm.level);
  $: requiresIdentifier = selectedLevel?.requiresIdentifier ?? false;
  $: canSaveNew = newForm.provider && newForm.apiKey.length > 0 &&
    (!requiresIdentifier || newForm.identifier.length > 0);
  $: canSaveEdit = editApiKey.length > 0;

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initCredentialsSubscriptions();

    // Set default provider
    if (providers.length > 0 && !newForm.provider) {
      newForm.provider = providers[0].id;
    }
  });

  onDestroy(() => {
    cleanup?.();
  });

  // Update default provider when providers load
  $: if (providers.length > 0 && !newForm.provider) {
    newForm.provider = providers[0].id;
  }

  // ==========================================================================
  // HANDLERS - TABS
  // ==========================================================================

  function handleTabChange(tab: 'lista' | 'nuevo' | 'config') {
    setActiveTab(tab);
    error = null;
    clearTestResult();
  }

  // ==========================================================================
  // HANDLERS - LISTA
  // ==========================================================================

  function handleSelectCredential(key: string) {
    selectCredential(key);
    closePanel();
  }

  function handleEditCredential(key: string) {
    selectCredential(key);
    setActiveTab('config');
    editApiKey = '';
    error = null;
  }

  function toggleGroup(level: string) {
    expandedGroups = {
      ...expandedGroups,
      [level]: !expandedGroups[level as keyof typeof expandedGroups]
    };
  }

  // ==========================================================================
  // HANDLERS - NUEVO
  // ==========================================================================

  async function handleTestNew() {
    if (!newForm.apiKey || !newForm.provider) return;

    testing = true;
    error = null;

    await testCredential(newForm.provider, newForm.apiKey);
    testing = false;
  }

  async function handleSaveNew() {
    if (!canSaveNew || saving) return;

    // Test first if not tested
    if (!testResult) {
      await handleTestNew();
      if (!$credentialsStore.testResult?.valid) {
        error = $credentialsStore.testResult?.message || 'API key no válida';
        return;
      }
    } else if (!testResult.valid) {
      error = 'API key no válida, corrige antes de guardar';
      return;
    }

    saving = true;
    error = null;

    createCredential(
      newForm.provider,
      newForm.level,
      requiresIdentifier ? newForm.identifier : null,
      newForm.apiKey
    );

    // Reset form
    newForm = {
      provider: providers[0]?.id || '',
      level: 'GLOBAL',
      identifier: '',
      apiKey: ''
    };
    clearTestResult();
    saving = false;

    // Go to list
    setActiveTab('lista');
  }

  function handleCancelNew() {
    newForm = {
      provider: providers[0]?.id || '',
      level: 'GLOBAL',
      identifier: '',
      apiKey: ''
    };
    clearTestResult();
    error = null;
    setActiveTab('lista');
  }

  // ==========================================================================
  // HANDLERS - CONFIG
  // ==========================================================================

  async function handleTestEdit() {
    if (!editApiKey || !selected) return;

    testing = true;
    error = null;

    await testCredential(selected.provider, editApiKey);
    testing = false;
  }

  async function handleSaveEdit() {
    if (!canSaveEdit || !selected || saving) return;

    // Test first if not tested
    if (!testResult) {
      await handleTestEdit();
      if (!$credentialsStore.testResult?.valid) {
        error = $credentialsStore.testResult?.message || 'API key no válida';
        return;
      }
    } else if (!testResult.valid) {
      error = 'API key no válida, corrige antes de guardar';
      return;
    }

    saving = true;
    error = null;

    updateCredential(selected.key, editApiKey);

    editApiKey = '';
    clearTestResult();
    saving = false;

    // Go to list
    setActiveTab('lista');
  }

  function handleDelete() {
    if (!selected || deleting) return;

    if (!confirm(`¿Eliminar credencial ${selected.providerName} (${selected.level})?`)) {
      return;
    }

    deleting = true;
    deleteCredential(selected.key);
    deleting = false;

    selectCredential(null);
    setActiveTab('lista');
  }

  function handleCancelEdit() {
    editApiKey = '';
    clearTestResult();
    error = null;
    selectCredential(null);
    setActiveTab('lista');
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function togglePassword() {
    showPassword = !showPassword;
  }

  function getLevelIcon(level: string): string {
    const icons: Record<string, string> = {
      GLOBAL: '🟢',
      PROJECT: '🔵',
      CLIENT: '🟡',
      CUSTOM: '🔴'
    };
    return icons[level] || '🔑';
  }

  function getLevelLabel(level: string): string {
    const labels: Record<string, string> = {
      GLOBAL: 'Global',
      PROJECT: 'Proyecto',
      CLIENT: 'Cliente',
      CUSTOM: 'Custom'
    };
    return labels[level] || level;
  }
</script>

<div class="providers-tab">
  <!-- Header with tabs -->
  <div class="tab-header">
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'lista'}
        on:click={() => handleTabChange('lista')}
      >
        Lista
      </button>
      <button
        class="tab"
        class:active={activeTab === 'nuevo'}
        on:click={() => handleTabChange('nuevo')}
      >
        Nuevo
      </button>
      <button
        class="tab"
        class:active={activeTab === 'config'}
        on:click={() => handleTabChange('config')}
        disabled={!selected}
      >
        Config
      </button>
    </div>
    <span class="stats">{stats.total} credenciales</span>
  </div>

  <!-- Content -->
  <div class="tab-content">
    <!-- ================================================================== -->
    <!-- TAB: LISTA -->
    <!-- ================================================================== -->
    {#if activeTab === 'lista'}
      {#if loading}
        <div class="loading">
          <span class="loading-icon">⏳</span>
          <span>Cargando...</span>
        </div>
      {:else if stats.total === 0}
        <div class="empty">
          <span class="empty-icon">🔑</span>
          <span class="empty-title">Sin credenciales</span>
          <span class="empty-text">Agrega tu primera API key</span>
          <button class="btn primary" on:click={() => handleTabChange('nuevo')}>
            + Agregar
          </button>
        </div>
      {:else}
        <div class="credentials-list">
          <!-- GLOBAL -->
          {#if $globalCredentials.length > 0}
            <div class="group">
              <button class="group-header" on:click={() => toggleGroup('GLOBAL')}>
                <span class="group-icon">{expandedGroups.GLOBAL ? '▼' : '▶'}</span>
                <span class="group-level">{getLevelIcon('GLOBAL')} Global</span>
                <span class="group-count">{$globalCredentials.length}</span>
              </button>
              {#if expandedGroups.GLOBAL}
                <div class="group-items">
                  {#each $globalCredentials as cred (cred.key)}
                    <div
                      class="credential-item"
                      class:selected={selected?.key === cred.key}
                    >
                      <button class="cred-main" on:click={() => handleSelectCredential(cred.key)}>
                        <span class="cred-icon">{cred.providerIcon}</span>
                        <div class="cred-info">
                          <span class="cred-name">{cred.providerName}</span>
                          <span class="cred-preview">{cred.preview}</span>
                        </div>
                      </button>
                      <button
                        class="cred-edit"
                        on:click|stopPropagation={() => handleEditCredential(cred.key)}
                        title="Editar"
                      >
                        ✏️
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- PROJECT -->
          {#if $projectCredentials.length > 0}
            <div class="group">
              <button class="group-header" on:click={() => toggleGroup('PROJECT')}>
                <span class="group-icon">{expandedGroups.PROJECT ? '▼' : '▶'}</span>
                <span class="group-level">{getLevelIcon('PROJECT')} Proyecto</span>
                <span class="group-count">{$projectCredentials.length}</span>
              </button>
              {#if expandedGroups.PROJECT}
                <div class="group-items">
                  {#each $projectCredentials as cred (cred.key)}
                    <div
                      class="credential-item"
                      class:selected={selected?.key === cred.key}
                    >
                      <button class="cred-main" on:click={() => handleSelectCredential(cred.key)}>
                        <span class="cred-icon">{cred.providerIcon}</span>
                        <div class="cred-info">
                          <span class="cred-name">{cred.providerName}</span>
                          <span class="cred-identifier">📁 {cred.identifier}</span>
                          <span class="cred-preview">{cred.preview}</span>
                        </div>
                      </button>
                      <button
                        class="cred-edit"
                        on:click|stopPropagation={() => handleEditCredential(cred.key)}
                        title="Editar"
                      >
                        ✏️
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- CLIENT -->
          {#if $clientCredentials.length > 0}
            <div class="group">
              <button class="group-header" on:click={() => toggleGroup('CLIENT')}>
                <span class="group-icon">{expandedGroups.CLIENT ? '▼' : '▶'}</span>
                <span class="group-level">{getLevelIcon('CLIENT')} Cliente</span>
                <span class="group-count">{$clientCredentials.length}</span>
              </button>
              {#if expandedGroups.CLIENT}
                <div class="group-items">
                  {#each $clientCredentials as cred (cred.key)}
                    <div
                      class="credential-item"
                      class:selected={selected?.key === cred.key}
                    >
                      <button class="cred-main" on:click={() => handleSelectCredential(cred.key)}>
                        <span class="cred-icon">{cred.providerIcon}</span>
                        <div class="cred-info">
                          <span class="cred-name">{cred.providerName}</span>
                          <span class="cred-identifier">👤 {cred.identifier}</span>
                          <span class="cred-preview">{cred.preview}</span>
                        </div>
                      </button>
                      <button
                        class="cred-edit"
                        on:click|stopPropagation={() => handleEditCredential(cred.key)}
                        title="Editar"
                      >
                        ✏️
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}

          <!-- CUSTOM -->
          {#if $customCredentials.length > 0}
            <div class="group">
              <button class="group-header" on:click={() => toggleGroup('CUSTOM')}>
                <span class="group-icon">{expandedGroups.CUSTOM ? '▼' : '▶'}</span>
                <span class="group-level">{getLevelIcon('CUSTOM')} Custom</span>
                <span class="group-count">{$customCredentials.length}</span>
              </button>
              {#if expandedGroups.CUSTOM}
                <div class="group-items">
                  {#each $customCredentials as cred (cred.key)}
                    <div
                      class="credential-item"
                      class:selected={selected?.key === cred.key}
                    >
                      <button class="cred-main" on:click={() => handleSelectCredential(cred.key)}>
                        <span class="cred-icon">{cred.providerIcon}</span>
                        <div class="cred-info">
                          <span class="cred-name">{cred.providerName}</span>
                          <span class="cred-identifier">⚙️ {cred.identifier}</span>
                          <span class="cred-preview">{cred.preview}</span>
                        </div>
                      </button>
                      <button
                        class="cred-edit"
                        on:click|stopPropagation={() => handleEditCredential(cred.key)}
                        title="Editar"
                      >
                        ✏️
                      </button>
                    </div>
                  {/each}
                </div>
              {/if}
            </div>
          {/if}
        </div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: NUEVO -->
    <!-- ================================================================== -->
    {:else if activeTab === 'nuevo'}
      <div class="form">
        <!-- Provider -->
        <fieldset class="field">
          <legend class="label">Proveedor</legend>
          <div class="providers-grid" role="group">
            {#each providers as p (p.id)}
              <button
                type="button"
                class="provider-btn"
                class:active={newForm.provider === p.id}
                on:click={() => { newForm.provider = p.id; clearTestResult(); }}
              >
                <span class="provider-icon">{p.icon}</span>
                <span class="provider-name">{p.name}</span>
              </button>
            {/each}
          </div>
        </fieldset>

        <!-- Level -->
        <fieldset class="field">
          <legend class="label">Nivel</legend>
          <div class="levels-grid" role="group">
            {#each levels as l (l.id)}
              <button
                type="button"
                class="level-btn"
                class:active={newForm.level === l.id}
                on:click={() => { newForm.level = l.id; newForm.identifier = ''; }}
              >
                <span>{l.icon}</span>
                <span>{l.name}</span>
              </button>
            {/each}
          </div>
        </fieldset>

        <!-- Identifier -->
        {#if requiresIdentifier}
          <div class="field">
            <label class="label" for="new-identifier">Identificador</label>
            <input
              id="new-identifier"
              type="text"
              class="input"
              placeholder={newForm.level === 'PROJECT' ? 'proyecto-123' : newForm.level === 'CLIENT' ? 'cliente-abc' : 'custom-id'}
              bind:value={newForm.identifier}
            />
          </div>
        {/if}

        <!-- API Key -->
        <div class="field">
          <label class="label" for="new-apikey">API Key</label>
          <div class="password-wrapper">
            {#if showPassword}
              <input
                id="new-apikey"
                type="text"
                class="input password-input"
                placeholder="sk-..."
                bind:value={newForm.apiKey}
                on:input={() => clearTestResult()}
              />
            {:else}
              <input
                id="new-apikey"
                type="password"
                class="input password-input"
                placeholder="sk-..."
                bind:value={newForm.apiKey}
                on:input={() => clearTestResult()}
              />
            {/if}
            <button
              type="button"
              class="toggle-password"
              on:click={togglePassword}
            >
              {showPassword ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <!-- Test Result -->
        {#if testResult}
          <div class="test-result" class:valid={testResult.valid} class:invalid={!testResult.valid}>
            {testResult.valid ? '✅' : '❌'} {testResult.message}
          </div>
        {/if}

        <!-- Error -->
        {#if error}
          <div class="error-msg">{error}</div>
        {/if}

        <!-- Actions -->
        <div class="actions">
          <button class="btn secondary" on:click={handleCancelNew} disabled={saving || testing}>
            Cancelar
          </button>
          <button
            class="btn secondary"
            on:click={handleTestNew}
            disabled={!newForm.apiKey || testing || saving}
          >
            {testing ? '🔍...' : '🧪 Test'}
          </button>
          <button
            class="btn primary"
            on:click={handleSaveNew}
            disabled={!canSaveNew || saving || testing}
          >
            {saving ? '⏳...' : '💾 Guardar'}
          </button>
        </div>
      </div>

    <!-- ================================================================== -->
    <!-- TAB: CONFIG -->
    <!-- ================================================================== -->
    {:else if activeTab === 'config'}
      {#if selected}
        <div class="form">
          <!-- Current credential info -->
          <div class="current-info">
            <div class="info-row">
              <span class="info-label">Proveedor</span>
              <span class="info-value">
                <span>{selected.providerIcon}</span>
                {selected.providerName}
              </span>
            </div>
            <div class="info-row">
              <span class="info-label">Nivel</span>
              <span class="info-value">
                <span>{getLevelIcon(selected.level)}</span>
                {getLevelLabel(selected.level)}
              </span>
            </div>
            {#if selected.identifier}
              <div class="info-row">
                <span class="info-label">Identificador</span>
                <span class="info-value">{selected.identifier}</span>
              </div>
            {/if}
            <div class="info-row">
              <span class="info-label">Key actual</span>
              <span class="info-value mono">{selected.preview}</span>
            </div>
          </div>

          <!-- New API Key -->
          <div class="field">
            <label class="label" for="edit-apikey">Nueva API Key</label>
            <div class="password-wrapper">
              {#if showPassword}
                <input
                  id="edit-apikey"
                  type="text"
                  class="input password-input"
                  placeholder="sk-..."
                  bind:value={editApiKey}
                  on:input={() => clearTestResult()}
                />
              {:else}
                <input
                  id="edit-apikey"
                  type="password"
                  class="input password-input"
                  placeholder="sk-..."
                  bind:value={editApiKey}
                  on:input={() => clearTestResult()}
                />
              {/if}
              <button
                type="button"
                class="toggle-password"
                on:click={togglePassword}
              >
                {showPassword ? '🙈' : '👁'}
              </button>
            </div>
          </div>

          <!-- Test Result -->
          {#if testResult}
            <div class="test-result" class:valid={testResult.valid} class:invalid={!testResult.valid}>
              {testResult.valid ? '✅' : '❌'} {testResult.message}
            </div>
          {/if}

          <!-- Error -->
          {#if error}
            <div class="error-msg">{error}</div>
          {/if}

          <!-- Actions -->
          <div class="actions">
            <button
              class="btn danger"
              on:click={handleDelete}
              disabled={deleting || saving || testing}
            >
              {deleting ? '⏳...' : '🗑️'}
            </button>
            <button class="btn secondary" on:click={handleCancelEdit} disabled={saving || testing}>
              Cancelar
            </button>
            <button
              class="btn secondary"
              on:click={handleTestEdit}
              disabled={!editApiKey || testing || saving}
            >
              {testing ? '🔍...' : '🧪 Test'}
            </button>
            <button
              class="btn primary"
              on:click={handleSaveEdit}
              disabled={!canSaveEdit || saving || testing}
            >
              {saving ? '⏳...' : '💾 Guardar'}
            </button>
          </div>
        </div>
      {:else}
        <div class="empty">
          <span class="empty-icon">🔑</span>
          <span class="empty-text">Selecciona una credencial en Lista</span>
          <button class="btn secondary" on:click={() => handleTabChange('lista')}>
            Ir a Lista
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .providers-tab {
    display: flex;
    flex-direction: column;
    height: 100%;
  }

  /* ==========================================================================
     Header & Tabs
     ========================================================================== */
  .tab-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid var(--_border, rgba(255, 255, 255, 0.1));
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
  }

  .tab {
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    color: var(--_text-muted, #a3a3a3);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover:not(:disabled) {
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    color: var(--_text, #e5e5e5);
  }

  .tab.active {
    background: var(--_primary, #3b82f6);
    color: white;
  }

  .tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .stats {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
  }

  /* ==========================================================================
     Content
     ========================================================================== */
  .tab-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.75rem;
  }

  /* ==========================================================================
     Loading & Empty
     ========================================================================== */
  .loading, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 2rem;
    text-align: center;
  }

  .loading-icon {
    font-size: 2rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .empty-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--_text, #e5e5e5);
  }

  .empty-text {
    font-size: 0.875rem;
    color: var(--_text-muted, #a3a3a3);
  }

  /* ==========================================================================
     Credentials List
     ========================================================================== */
  .credentials-list {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .group {
    display: flex;
    flex-direction: column;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-radius: 0.5rem;
    color: var(--_text-muted, #a3a3a3);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .group-header:hover {
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
  }

  .group-icon {
    font-size: 0.625rem;
    width: 1rem;
  }

  .group-level {
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .group-count {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border-radius: 9999px;
    margin-left: auto;
  }

  .group-items {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
    padding-left: 1.5rem;
    margin-top: 0.375rem;
  }

  .credential-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    transition: all 0.15s;
  }

  .credential-item:hover {
    border-color: var(--_primary, #3b82f6);
  }

  .credential-item.selected {
    border-color: var(--_primary, #3b82f6);
    background: rgb(59 130 246 / 0.1);
  }

  .cred-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .cred-icon {
    font-size: 1.25rem;
  }

  .cred-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .cred-name {
    font-weight: 500;
    color: var(--_text, #e5e5e5);
  }

  .cred-identifier {
    font-size: 0.75rem;
    color: var(--_primary, #3b82f6);
  }

  .cred-preview {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
    font-family: monospace;
  }

  .cred-edit {
    padding: 0.25rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  .credential-item:hover .cred-edit {
    opacity: 1;
  }

  .cred-edit:hover {
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
  }

  /* ==========================================================================
     Form
     ========================================================================== */
  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  fieldset.field {
    border: none;
    padding: 0;
    margin: 0;
  }

  .label, legend.label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_text-muted, #a3a3a3);
  }

  .input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    color: var(--_text, #e5e5e5);
    border: 1px solid var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    transition: border-color 0.15s;
  }

  .input:focus {
    outline: none;
    border-color: var(--_primary, #3b82f6);
  }

  .input::placeholder {
    color: var(--_text-muted, #a3a3a3);
  }

  /* Providers Grid */
  .providers-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .provider-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border: 2px solid var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .provider-btn:hover {
    border-color: var(--_primary, #3b82f6);
  }

  .provider-btn.active {
    border-color: var(--_primary, #3b82f6);
    background: rgb(59 130 246 / 0.1);
  }

  .provider-icon {
    font-size: 1.5rem;
  }

  .provider-name {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
  }

  /* Levels Grid */
  .levels-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
  }

  .level-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 0.25rem;
    font-size: 0.625rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border: 2px solid var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
    color: var(--_text-muted, #a3a3a3);
  }

  .level-btn:hover {
    border-color: var(--_primary, #3b82f6);
  }

  .level-btn.active {
    border-color: var(--_primary, #3b82f6);
    background: rgb(59 130 246 / 0.1);
    color: var(--_text, #e5e5e5);
  }

  /* Password wrapper */
  .password-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input {
    padding-right: 3rem;
  }

  .toggle-password {
    position: absolute;
    right: 0.5rem;
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    opacity: 0.7;
    transition: opacity 0.15s;
  }

  .toggle-password:hover {
    opacity: 1;
  }

  /* Current info */
  .current-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .info-label {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
  }

  .info-value {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--_text, #e5e5e5);
    font-weight: 500;
  }

  .info-value.mono {
    font-family: monospace;
    font-weight: 400;
  }

  /* Test result */
  .test-result {
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    text-align: center;
  }

  .test-result.valid {
    background: rgb(34 197 94 / 0.15);
    color: var(--_success, #22c55e);
  }

  .test-result.invalid {
    background: rgb(239 68 68 / 0.15);
    color: var(--_danger, #ef4444);
  }

  /* Error message */
  .error-msg {
    padding: 0.75rem;
    background: rgb(239 68 68 / 0.15);
    color: var(--_danger, #ef4444);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    text-align: center;
  }

  /* ==========================================================================
     Actions & Buttons
     ========================================================================== */
  .actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 0.5rem;
  }

  .btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--_success, #22c55e);
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn.secondary {
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    color: var(--_text-muted, #a3a3a3);
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--_text, #e5e5e5);
  }

  .btn.danger {
    background: var(--_danger, #ef4444);
    color: white;
    flex: 0 0 auto;
    padding: 0.75rem 1rem;
  }

  .btn.danger:hover:not(:disabled) {
    filter: brightness(1.1);
  }
</style>
