<script lang="ts">
  /**
   * TelegramTab - Gestión de bots de Telegram por proyecto
   *
   * Funcionalidades:
   * - Lista de bots registrados
   * - Registrar nuevo bot (proyecto + token)
   * - Eliminar bot
   * - Ver estado del bot
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    telegramStore,
    initTelegram,
    loadBots,
    registerBot,
    removeBot,
    testBotToken,
    selectBot,
    setTelegramTab,
    clearTelegramTestResult,
    telegramBots,
    selectedBot,
    telegramLoading,
    telegramError,
    botCount,
    telegramActiveTab,
    telegramTestResult
  } from '$lib/stores/telegram';
  import { projectsList, loadProjects } from '$lib/stores/projects';

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Form state for "Nuevo" tab
  let newForm = {
    projectId: '',
    token: '',
    name: ''
  };

  // UI state
  let showToken = false;
  let saving = false;
  let testing = false;
  let deleting = false;
  let error: string | null = null;

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: activeTab = $telegramActiveTab;
  $: bots = $telegramBots;
  $: projects = $projectsList;
  $: loading = $telegramLoading;
  $: storeError = $telegramError;
  $: testResult = $telegramTestResult;
  $: selected = $selectedBot;
  $: count = $botCount;

  // Form validation
  $: canSaveNew = newForm.projectId && newForm.token.length > 10;

  // Projects without a bot
  $: availableProjects = projects.filter(p => !bots.find(b => b.projectId === p.id));

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initTelegram();
    loadProjects();

    // Set default project if available
    if (availableProjects.length > 0 && !newForm.projectId) {
      newForm.projectId = availableProjects[0].id;
    }
  });

  onDestroy(() => {
    cleanup?.();
  });

  // Update default project when projects load
  $: if (availableProjects.length > 0 && !newForm.projectId) {
    newForm.projectId = availableProjects[0].id;
  }

  // ==========================================================================
  // HANDLERS - TABS
  // ==========================================================================

  function handleTabChange(tab: 'lista' | 'nuevo' | 'config') {
    setTelegramTab(tab);
    error = null;
    clearTelegramTestResult();
  }

  // ==========================================================================
  // HANDLERS - LISTA
  // ==========================================================================

  function handleSelectBot(projectId: string) {
    selectBot(projectId);
    setTelegramTab('config');
  }

  // ==========================================================================
  // HANDLERS - NUEVO
  // ==========================================================================

  async function handleTestToken() {
    if (!newForm.token) return;

    testing = true;
    error = null;

    await testBotToken(newForm.token);
    testing = false;
  }

  async function handleSaveBot() {
    if (!canSaveNew || saving) return;

    // Test first if not tested
    if (!testResult) {
      await handleTestToken();
      if (!$telegramTestResult?.valid) {
        error = $telegramTestResult?.message || 'Token no válido';
        return;
      }
    } else if (!testResult.valid) {
      error = 'Token no válido, corrige antes de guardar';
      return;
    }

    saving = true;
    error = null;

    try {
      await registerBot(newForm.projectId, newForm.token, newForm.name || undefined);

      // Reset form
      newForm = {
        projectId: availableProjects[0]?.id || '',
        token: '',
        name: ''
      };
      clearTelegramTestResult();

      // Go to list
      setTelegramTab('lista');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al registrar bot';
    } finally {
      saving = false;
    }
  }

  function handleCancelNew() {
    newForm = {
      projectId: availableProjects[0]?.id || '',
      token: '',
      name: ''
    };
    clearTelegramTestResult();
    error = null;
    setTelegramTab('lista');
  }

  // ==========================================================================
  // HANDLERS - CONFIG
  // ==========================================================================

  async function handleDeleteBot() {
    if (!selected || deleting) return;

    const projectName = projects.find(p => p.id === selected.projectId)?.name || selected.projectId;

    if (!confirm(`¿Eliminar bot @${selected.username} del proyecto "${projectName}"?`)) {
      return;
    }

    deleting = true;
    error = null;

    try {
      await removeBot(selected.projectId);
      selectBot(null);
      setTelegramTab('lista');
    } catch (e) {
      error = e instanceof Error ? e.message : 'Error al eliminar bot';
    } finally {
      deleting = false;
    }
  }

  function handleCancelConfig() {
    selectBot(null);
    setTelegramTab('lista');
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function toggleToken() {
    showToken = !showToken;
  }

  function getProjectName(projectId: string): string {
    return projects.find(p => p.id === projectId)?.name || projectId;
  }

  function getProjectIcon(projectId: string): string {
    return projects.find(p => p.id === projectId)?.icon || '📁';
  }
</script>

<div class="telegram-tab">
  <!-- Header with tabs -->
  <div class="tab-header">
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'lista'}
        on:click={() => handleTabChange('lista')}
      >
        Bots
      </button>
      <button
        class="tab"
        class:active={activeTab === 'nuevo'}
        on:click={() => handleTabChange('nuevo')}
        disabled={availableProjects.length === 0}
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
    <span class="stats">{count} bots</span>
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
      {:else if count === 0}
        <div class="empty">
          <span class="empty-icon">🤖</span>
          <span class="empty-title">Sin bots</span>
          <span class="empty-text">Registra tu primer bot de Telegram</span>
          {#if availableProjects.length > 0}
            <button class="btn primary" on:click={() => handleTabChange('nuevo')}>
              + Agregar Bot
            </button>
          {:else}
            <span class="empty-hint">Crea un proyecto primero</span>
          {/if}
        </div>
      {:else}
        <div class="bots-list">
          {#each bots as bot (bot.projectId)}
            <button
              class="bot-item"
              class:selected={selected?.projectId === bot.projectId}
              on:click={() => handleSelectBot(bot.projectId)}
            >
              <span class="bot-avatar">🤖</span>
              <div class="bot-info">
                <span class="bot-name">@{bot.username}</span>
                <span class="bot-project">
                  {getProjectIcon(bot.projectId)} {getProjectName(bot.projectId)}
                </span>
              </div>
              <span class="bot-status" class:active={bot.hasWebhook}>
                {bot.hasWebhook ? '🟢' : '🟡'}
              </span>
            </button>
          {/each}
        </div>
      {/if}

      {#if storeError}
        <div class="error-msg">{storeError}</div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: NUEVO -->
    <!-- ================================================================== -->
    {:else if activeTab === 'nuevo'}
      <div class="form">
        <!-- Info -->
        <div class="info-box">
          <span class="info-icon">💡</span>
          <span class="info-text">
            Obtén el token de tu bot desde <strong>@BotFather</strong> en Telegram.
            Cada proyecto puede tener un bot asociado.
          </span>
        </div>

        <!-- Project -->
        <div class="field">
          <label class="label" for="new-project">Proyecto</label>
          <select
            id="new-project"
            class="input select"
            bind:value={newForm.projectId}
          >
            {#each availableProjects as project (project.id)}
              <option value={project.id}>
                {project.icon} {project.name}
              </option>
            {/each}
          </select>
        </div>

        <!-- Token -->
        <div class="field">
          <label class="label" for="new-token">Token del Bot</label>
          <div class="password-wrapper">
            {#if showToken}
              <input
                id="new-token"
                type="text"
                class="input password-input"
                placeholder="123456789:ABCdefGHI..."
                bind:value={newForm.token}
                on:input={() => clearTelegramTestResult()}
              />
            {:else}
              <input
                id="new-token"
                type="password"
                class="input password-input"
                placeholder="123456789:ABCdefGHI..."
                bind:value={newForm.token}
                on:input={() => clearTelegramTestResult()}
              />
            {/if}
            <button
              type="button"
              class="toggle-password"
              on:click={toggleToken}
            >
              {showToken ? '🙈' : '👁'}
            </button>
          </div>
        </div>

        <!-- Name (optional) -->
        <div class="field">
          <label class="label" for="new-name">Nombre (opcional)</label>
          <input
            id="new-name"
            type="text"
            class="input"
            placeholder="Mi Bot"
            bind:value={newForm.name}
          />
        </div>

        <!-- Test Result -->
        {#if testResult}
          <div class="test-result" class:valid={testResult.valid} class:invalid={!testResult.valid}>
            {#if testResult.valid && testResult.botInfo}
              ✅ Bot válido: @{testResult.botInfo.username} ({testResult.botInfo.firstName})
            {:else}
              ❌ {testResult.message}
            {/if}
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
            on:click={handleTestToken}
            disabled={!newForm.token || testing || saving}
          >
            {testing ? '🔍...' : '🧪 Verificar'}
          </button>
          <button
            class="btn primary"
            on:click={handleSaveBot}
            disabled={!canSaveNew || saving || testing}
          >
            {saving ? '⏳...' : '💾 Registrar'}
          </button>
        </div>
      </div>

    <!-- ================================================================== -->
    <!-- TAB: CONFIG -->
    <!-- ================================================================== -->
    {:else if activeTab === 'config'}
      {#if selected}
        <div class="form">
          <!-- Bot info -->
          <div class="bot-details">
            <div class="bot-header">
              <span class="bot-big-avatar">🤖</span>
              <div class="bot-main-info">
                <span class="bot-username">@{selected.username}</span>
                <span class="bot-fullname">{selected.firstName}</span>
              </div>
            </div>

            <div class="details-grid">
              <div class="detail-row">
                <span class="detail-label">Proyecto</span>
                <span class="detail-value">
                  {getProjectIcon(selected.projectId)} {getProjectName(selected.projectId)}
                </span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Bot ID</span>
                <span class="detail-value mono">{selected.botId}</span>
              </div>
              <div class="detail-row">
                <span class="detail-label">Estado</span>
                <span class="detail-value">
                  {selected.hasWebhook ? '🟢 Webhook activo' : '🟡 Sin webhook'}
                </span>
              </div>
              {#if selected.canJoinGroups}
                <div class="detail-row">
                  <span class="detail-label">Grupos</span>
                  <span class="detail-value">✅ Puede unirse a grupos</span>
                </div>
              {/if}
            </div>
          </div>

          <!-- Error -->
          {#if error}
            <div class="error-msg">{error}</div>
          {/if}

          <!-- Actions -->
          <div class="actions">
            <button
              class="btn danger"
              on:click={handleDeleteBot}
              disabled={deleting}
            >
              {deleting ? '⏳...' : '🗑️ Eliminar'}
            </button>
            <button class="btn secondary" on:click={handleCancelConfig}>
              Cerrar
            </button>
          </div>
        </div>
      {:else}
        <div class="empty">
          <span class="empty-icon">🤖</span>
          <span class="empty-text">Selecciona un bot en la lista</span>
          <button class="btn secondary" on:click={() => handleTabChange('lista')}>
            Ir a Lista
          </button>
        </div>
      {/if}
    {/if}
  </div>
</div>

<style>
  .telegram-tab {
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

  .empty-hint {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
    opacity: 0.7;
  }

  /* ==========================================================================
     Bots List
     ========================================================================== */
  .bots-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .bot-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .bot-item:hover {
    border-color: var(--_primary, #3b82f6);
  }

  .bot-item.selected {
    border-color: var(--_primary, #3b82f6);
    background: rgb(59 130 246 / 0.1);
  }

  .bot-avatar {
    font-size: 1.5rem;
  }

  .bot-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .bot-name {
    font-weight: 500;
    color: var(--_text, #e5e5e5);
    font-family: monospace;
  }

  .bot-project {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
  }

  .bot-status {
    font-size: 0.75rem;
  }

  /* ==========================================================================
     Form
     ========================================================================== */
  .form {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .info-box {
    display: flex;
    gap: 0.5rem;
    padding: 0.75rem;
    background: rgb(59 130 246 / 0.1);
    border: 1px solid rgb(59 130 246 / 0.3);
    border-radius: 0.5rem;
    font-size: 0.8125rem;
    color: var(--_text, #e5e5e5);
  }

  .info-icon {
    flex-shrink: 0;
  }

  .info-text {
    line-height: 1.4;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .label {
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

  .select {
    cursor: pointer;
  }

  .select option {
    background: var(--_bg, #1a1d24);
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

  /* Bot details */
  .bot-details {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    background: var(--_bg-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--_border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
  }

  .bot-header {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .bot-big-avatar {
    font-size: 2.5rem;
  }

  .bot-main-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .bot-username {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--_text, #e5e5e5);
    font-family: monospace;
  }

  .bot-fullname {
    font-size: 0.875rem;
    color: var(--_text-muted, #a3a3a3);
  }

  .details-grid {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding-top: 0.5rem;
    border-top: 1px solid var(--_border, rgba(255, 255, 255, 0.1));
  }

  .detail-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .detail-label {
    font-size: 0.75rem;
    color: var(--_text-muted, #a3a3a3);
  }

  .detail-value {
    font-size: 0.875rem;
    color: var(--_text, #e5e5e5);
  }

  .detail-value.mono {
    font-family: monospace;
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
  }

  .btn.danger:hover:not(:disabled) {
    filter: brightness(1.1);
  }
</style>
