<script lang="ts">
  /**
   * CredentialsPanel - Panel único con tabs [Lista | Nuevo | Config]
   *
   * Arquitectura:
   * - 1 panel = 1 clic (sin navegación a otros paneles)
   * - Datos via MQTT (no REST /ui/state)
   * - CSS variables con fallbacks
   *
   * Tabs:
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
    setActiveService,
    clearTestResult,
    saveOAuthConfig,
    deleteOAuthConfig,
    startOAuth,
    globalCredentials,
    projectCredentials,
    clientCredentials,
    customCredentials,
    botCredentials,
    selectedCredential,
    oauthConfigs,
    type ServiceType
  } from '$lib/stores/credentials';
  import { closePanel } from '$lib/stores';

  export let _panelId: string;

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Form state for "Nuevo" tab (Providers)
  let newForm = {
    provider: '',
    level: 'GLOBAL',
    identifier: '',
    apiKey: ''
  };

  // Form state for "Nuevo" tab (Telegram)
  let telegramForm = {
    botName: '',
    token: ''
  };

  // Form state for "Config" tab
  let editApiKey = '';

  // Form state for "OAuth" tab
  let oauthForm = {
    accountId: '',
    accountName: '',
    clientId: '',
    clientSecret: ''
  };

  // OAuth authorize form
  let oauthAuthorizeForm = {
    selectedAccount: '',
    level: 'GLOBAL',
    identifier: '',
    scopes: ['gmail'] as string[]
  };

  // Available OAuth scopes
  const availableScopes = [
    { id: 'gmail', name: 'Gmail', icon: '📧', description: 'Enviar y leer correos' },
    { id: 'cloud', name: 'Cloud Platform', icon: '☁️', description: 'Document AI, Vision, Speech, etc.' },
    { id: 'drive', name: 'Drive', icon: '📁', description: 'Acceso a archivos' },
    { id: 'calendar', name: 'Calendar', icon: '📅', description: 'Eventos y calendarios' },
    { id: 'sheets', name: 'Sheets', icon: '📊', description: 'Hojas de cálculo' }
  ];

  // UI state
  let showPassword = false;
  let saving = false;
  let testing = false;
  let deleting = false;
  let authorizing = false;
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
  $: activeServiceValue = $credentialsStore.activeService;
  $: providers = $credentialsStore.providers;
  $: levels = $credentialsStore.levels;
  $: loading = $credentialsStore.loading;
  $: testResult = $credentialsStore.testResult;
  $: selected = $selectedCredential;
  $: stats = $credentialsStore.stats;

  // Filtrar providers y levels según servicio
  $: aiProviders = providers.filter(p => p.id !== 'TELEGRAM');
  $: aiLevels = levels.filter(l => l.id !== 'BOT');
  $: telegramBots = $botCredentials;

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
  // HANDLERS - SERVICE TABS
  // ==========================================================================

  function handleServiceChange(service: ServiceType) {
    setActiveService(service);
    error = null;
    clearTestResult();
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
  // HANDLERS - TELEGRAM
  // ==========================================================================

  async function handleSaveTelegramBot() {
    if (!telegramForm.botName || !telegramForm.token || saving) return;

    saving = true;
    error = null;

    try {
      // Crear credencial con provider=TELEGRAM, level=CUSTOM, identifier=botName
      await createCredential(
        'TELEGRAM',
        'CUSTOM',
        telegramForm.botName,
        telegramForm.token
      );

      // Reset form
      telegramForm = { botName: '', token: '' };
      clearTestResult();
      setActiveTab('lista');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar bot';
    } finally {
      saving = false;
    }
  }

  function handleCancelTelegram() {
    telegramForm = { botName: '', token: '' };
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
  // HANDLERS - OAUTH CONFIG
  // ==========================================================================

  async function handleSaveOAuthConfig() {
    if (!oauthForm.accountId || !oauthForm.clientId || !oauthForm.clientSecret || saving) return;

    saving = true;
    error = null;

    try {
      await saveOAuthConfig(
        oauthForm.accountId,
        oauthForm.accountName || oauthForm.accountId,
        oauthForm.clientId,
        oauthForm.clientSecret
      );

      // Reset form
      oauthForm = { accountId: '', accountName: '', clientId: '', clientSecret: '' };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar configuración OAuth';
    } finally {
      saving = false;
    }
  }

  async function handleDeleteOAuthConfig(accountId: string) {
    if (!confirm(`¿Eliminar configuración OAuth "${accountId}"?`)) return;

    deleting = true;
    error = null;

    try {
      await deleteOAuthConfig(accountId);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar configuración OAuth';
    } finally {
      deleting = false;
    }
  }

  async function handleStartOAuth() {
    if (!oauthAuthorizeForm.selectedAccount || authorizing) return;

    // Validar identifier si es necesario
    const level = oauthAuthorizeForm.level;
    const needsIdentifier = level !== 'GLOBAL';
    if (needsIdentifier && !oauthAuthorizeForm.identifier) {
      error = 'Identificador requerido para este nivel';
      return;
    }

    // Validar que hay al menos un scope seleccionado
    if (oauthAuthorizeForm.scopes.length === 0) {
      error = 'Selecciona al menos un servicio';
      return;
    }

    authorizing = true;
    error = null;

    try {
      const result = await startOAuth(
        'GMAIL',
        level,
        needsIdentifier ? oauthAuthorizeForm.identifier : null,
        oauthAuthorizeForm.selectedAccount,
        oauthAuthorizeForm.scopes
      );

      // Abrir URL de autorización en nueva ventana
      window.open(result.auth_url, 'oauth-popup', 'width=600,height=700');

      // Resetear formulario
      oauthAuthorizeForm = { selectedAccount: '', level: 'GLOBAL', identifier: '', scopes: ['gmail'] };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al iniciar autorización OAuth';
    } finally {
      authorizing = false;
    }
  }

  function toggleScope(scopeId: string) {
    if (oauthAuthorizeForm.scopes.includes(scopeId)) {
      oauthAuthorizeForm.scopes = oauthAuthorizeForm.scopes.filter(s => s !== scopeId);
    } else {
      oauthAuthorizeForm.scopes = [...oauthAuthorizeForm.scopes, scopeId];
    }
  }

  function handleCancelOAuthConfig() {
    oauthForm = { accountId: '', accountName: '', clientId: '', clientSecret: '' };
    error = null;
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

<div class="credentials-panel">
  <!-- Service tabs (Providers | Telegram) -->
  <div class="service-tabs">
    <button
      class="service-tab"
      class:active={activeServiceValue === 'providers'}
      on:click={() => handleServiceChange('providers')}
    >
      🤖 Providers
    </button>
    <button
      class="service-tab"
      class:active={activeServiceValue === 'telegram'}
      on:click={() => handleServiceChange('telegram')}
    >
      📱 Telegram
    </button>
  </div>

  <!-- Header with tabs -->
  <div class="panel-header">
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
      <button
        class="tab"
        class:active={activeTab === 'oauth'}
        on:click={() => handleTabChange('oauth')}
      >
        OAuth
      </button>
    </div>
    <span class="stats">
      {#if activeServiceValue === 'providers'}
        {stats.total - telegramBots.length} credenciales
      {:else}
        {telegramBots.length} bots
      {/if}
    </span>
  </div>

  <!-- Content -->
  <div class="panel-content">
    <!-- ================================================================== -->
    <!-- TAB: LISTA -->
    <!-- ================================================================== -->
    {#if activeTab === 'lista'}
      {#if loading}
        <div class="loading">
          <span class="loading-icon">⏳</span>
          <span>Cargando...</span>
        </div>

      <!-- TELEGRAM BOTS LIST -->
      {:else if activeServiceValue === 'telegram'}
        {#if telegramBots.length === 0}
          <div class="empty">
            <span class="empty-icon">📱</span>
            <span class="empty-title">Sin bots</span>
            <span class="empty-text">Registra tu primer bot de Telegram</span>
            <button class="btn primary" on:click={() => handleTabChange('nuevo')}>
              ➕ Agregar Bot
            </button>
          </div>
        {:else}
          <div class="credentials-list">
            <div class="group">
              <div class="group-items" style="padding-left: 0;">
                {#each telegramBots as bot (bot.key)}
                  <div
                    class="credential-item"
                    class:selected={selected?.key === bot.key}
                  >
                    <button class="cred-main" on:click={() => handleSelectCredential(bot.key)}>
                      <span class="cred-icon">🤖</span>
                      <div class="cred-info">
                        <span class="cred-name">{bot.identifier}</span>
                        <span class="cred-preview">{bot.preview}</span>
                      </div>
                    </button>
                    <button
                      class="cred-edit"
                      on:click|stopPropagation={() => handleEditCredential(bot.key)}
                      title="Editar"
                    >
                      ✏️
                    </button>
                  </div>
                {/each}
              </div>
            </div>
          </div>
        {/if}

      <!-- AI PROVIDERS LIST -->
      {:else if stats.total - telegramBots.length === 0}
        <div class="empty">
          <span class="empty-icon">🔑</span>
          <span class="empty-title">Sin credenciales</span>
          <span class="empty-text">Agrega tu primera API key</span>
          <button class="btn primary" on:click={() => handleTabChange('nuevo')}>
            ➕ Agregar
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

      <!-- TELEGRAM NEW BOT FORM -->
      {#if activeServiceValue === 'telegram'}
        <div class="form">
          <div class="field">
            <label class="label" for="bot-name">Nombre del Bot</label>
            <input
              id="bot-name"
              type="text"
              class="input"
              placeholder="facturas, ventas, alertas..."
              bind:value={telegramForm.botName}
            />
            <span class="field-hint">Identificador interno (sin espacios)</span>
          </div>

          <div class="field">
            <label class="label" for="bot-token">Token (de @BotFather)</label>
            <div class="password-wrapper">
              {#if showPassword}
                <input
                  id="bot-token"
                  type="text"
                  class="input password-input"
                  placeholder="123456789:ABCdefGHI..."
                  bind:value={telegramForm.token}
                />
              {:else}
                <input
                  id="bot-token"
                  type="password"
                  class="input password-input"
                  placeholder="123456789:ABCdefGHI..."
                  bind:value={telegramForm.token}
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

          {#if error}
            <div class="error-msg">{error}</div>
          {/if}

          <div class="actions">
            <button class="btn secondary" on:click={handleCancelTelegram} disabled={saving}>
              Cancelar
            </button>
            <button
              class="btn primary"
              on:click={handleSaveTelegramBot}
              disabled={!telegramForm.botName || !telegramForm.token || saving}
            >
              {saving ? '⏳...' : '💾 Guardar Bot'}
            </button>
          </div>
        </div>

      <!-- AI PROVIDERS NEW FORM -->
      {:else}
        <div class="form">
          <!-- Provider -->
          <fieldset class="field">
            <legend class="label">Proveedor</legend>
            <div class="providers-grid" role="group">
              {#each aiProviders as p (p.id)}
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
              {#each aiLevels as l (l.id)}
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
      {/if}

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

    <!-- ================================================================== -->
    <!-- TAB: OAUTH CONFIG -->
    <!-- ================================================================== -->
    {:else if activeTab === 'oauth'}
      <div class="oauth-section">
        <!-- Cuentas OAuth configuradas -->
        <div class="oauth-accounts">
          <div class="section-title">📧 Cuentas Google/Gmail Configuradas</div>

          {#if $oauthConfigs.length === 0}
            <div class="empty-small">
              <span>No hay cuentas OAuth configuradas</span>
            </div>
          {:else}
            <div class="oauth-list">
              {#each $oauthConfigs as config (config.accountId)}
                <div class="oauth-item">
                  <div class="oauth-item-info">
                    <span class="oauth-item-name">📧 {config.accountName}</span>
                    <span class="oauth-item-id">{config.accountId}</span>
                    <span class="oauth-item-preview">{config.clientIdPreview}</span>
                  </div>
                  <button
                    class="btn-icon danger"
                    on:click={() => handleDeleteOAuthConfig(config.accountId)}
                    title="Eliminar"
                    disabled={deleting}
                  >
                    🗑️
                  </button>
                </div>
              {/each}
            </div>
          {/if}
        </div>

        <!-- Formulario para añadir cuenta OAuth -->
        <div class="oauth-form-section">
          <div class="section-title">➕ Añadir Cuenta OAuth</div>

          <div class="info-box">
            <p>Para conectar Gmail necesitas credenciales OAuth de Google Cloud Console:</p>
            <ol>
              <li>Ve a <a href="https://console.cloud.google.com/apis/credentials" target="_blank">Google Cloud Console</a></li>
              <li>Crea un proyecto o selecciona uno existente</li>
              <li>Habilita la API de Gmail</li>
              <li>Crea credenciales OAuth 2.0 (tipo "Aplicación web")</li>
              <li>Añade URI de redirección: <code>http://localhost:3000/modules/credential-manager/oauth/callback</code></li>
              <li>Copia Client ID y Client Secret aquí</li>
            </ol>
          </div>

          <div class="form">
            <div class="field">
              <label class="label" for="oauth-account-id">ID de Cuenta</label>
              <input
                id="oauth-account-id"
                type="text"
                class="input"
                placeholder="empresa, personal, default..."
                bind:value={oauthForm.accountId}
              />
              <span class="field-hint">Identificador único (sin espacios)</span>
            </div>

            <div class="field">
              <label class="label" for="oauth-account-name">Nombre (opcional)</label>
              <input
                id="oauth-account-name"
                type="text"
                class="input"
                placeholder="Mi Cuenta de Empresa"
                bind:value={oauthForm.accountName}
              />
            </div>

            <div class="field">
              <label class="label" for="oauth-client-id">Client ID</label>
              <input
                id="oauth-client-id"
                type="text"
                class="input"
                placeholder="123456789.apps.googleusercontent.com"
                bind:value={oauthForm.clientId}
              />
            </div>

            <div class="field">
              <label class="label" for="oauth-client-secret">Client Secret</label>
              <div class="password-wrapper">
                {#if showPassword}
                  <input
                    id="oauth-client-secret"
                    type="text"
                    class="input password-input"
                    placeholder="GOCSPX-xxxxx"
                    bind:value={oauthForm.clientSecret}
                  />
                {:else}
                  <input
                    id="oauth-client-secret"
                    type="password"
                    class="input password-input"
                    placeholder="GOCSPX-xxxxx"
                    bind:value={oauthForm.clientSecret}
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

            {#if error}
              <div class="error-msg">{error}</div>
            {/if}

            <div class="actions">
              <button class="btn secondary" on:click={handleCancelOAuthConfig} disabled={saving}>
                Cancelar
              </button>
              <button
                class="btn primary"
                on:click={handleSaveOAuthConfig}
                disabled={!oauthForm.accountId || !oauthForm.clientId || !oauthForm.clientSecret || saving}
              >
                {saving ? '⏳...' : '💾 Guardar'}
              </button>
            </div>
          </div>
        </div>

        <!-- Autorizar cuenta Google -->
        {#if $oauthConfigs.length > 0}
          <div class="oauth-authorize-section">
            <div class="section-title">🔐 Autorizar Acceso a Google</div>

            <div class="form">
              <div class="field">
                <label class="label" for="oauth-select-account">Cuenta OAuth</label>
                <select
                  id="oauth-select-account"
                  class="input"
                  bind:value={oauthAuthorizeForm.selectedAccount}
                >
                  <option value="">Selecciona una cuenta...</option>
                  {#each $oauthConfigs as config}
                    <option value={config.accountId}>{config.accountName}</option>
                  {/each}
                </select>
              </div>

              <!-- Selector de servicios/scopes -->
              <fieldset class="field">
                <legend class="label">Servicios a autorizar</legend>
                <div class="scopes-grid">
                  {#each availableScopes as scope}
                    <button
                      type="button"
                      class="scope-btn"
                      class:active={oauthAuthorizeForm.scopes.includes(scope.id)}
                      on:click={() => toggleScope(scope.id)}
                      title={scope.description}
                    >
                      <span class="scope-icon">{scope.icon}</span>
                      <span class="scope-name">{scope.name}</span>
                    </button>
                  {/each}
                </div>
                <span class="field-hint">Selecciona los servicios que necesitas. Cloud Platform incluye Document AI, Vision, Speech, etc.</span>
              </fieldset>

              <div class="field">
                <label class="label" for="oauth-level">Nivel de Credencial</label>
                <select
                  id="oauth-level"
                  class="input"
                  bind:value={oauthAuthorizeForm.level}
                >
                  <option value="GLOBAL">🟢 Global</option>
                  <option value="PROJECT">🔵 Proyecto</option>
                  <option value="CLIENT">🟡 Cliente</option>
                  <option value="CUSTOM">🔴 Custom</option>
                </select>
              </div>

              {#if oauthAuthorizeForm.level !== 'GLOBAL'}
                <div class="field">
                  <label class="label" for="oauth-identifier">Identificador</label>
                  <input
                    id="oauth-identifier"
                    type="text"
                    class="input"
                    placeholder="proyecto-1, cliente-abc..."
                    bind:value={oauthAuthorizeForm.identifier}
                  />
                </div>
              {/if}

              <div class="actions">
                <button
                  class="btn primary"
                  on:click={handleStartOAuth}
                  disabled={!oauthAuthorizeForm.selectedAccount || authorizing}
                >
                  {authorizing ? '⏳...' : '🔐 Autorizar Google'}
                </button>
              </div>
            </div>
          </div>
        {/if}
      </div>
    {/if}
  </div>
</div>

<style>
  /* ==========================================================================
     CSS Variables with fallbacks
     ========================================================================== */
  .credentials-panel {
    --_bg: var(--panel-bg, var(--color-bg-card, #1a1d24));
    --_bg-surface: var(--panel-bg-surface, rgba(255, 255, 255, 0.05));
    --_text: var(--panel-text, var(--color-text, #e5e5e5));
    --_text-muted: var(--panel-text-muted, var(--color-text-muted, #a3a3a3));
    --_border: var(--panel-border, rgba(255, 255, 255, 0.1));
    --_primary: var(--panel-primary, var(--color-primary, #3b82f6));
    --_success: var(--panel-success, var(--color-success, #22c55e));
    --_danger: var(--panel-danger, var(--color-danger, #ef4444));
    --_radius: var(--panel-radius, 0.5rem);

    display: flex;
    flex-direction: column;
    height: 100%;
    color: var(--_text);
  }

  /* ==========================================================================
     Service Tabs
     ========================================================================== */
  .service-tabs {
    display: flex;
    gap: 0;
    border-bottom: 1px solid var(--_border);
  }

  .service-tab {
    flex: 1;
    padding: 0.5rem;
    background: transparent;
    border: none;
    border-bottom: 2px solid transparent;
    color: var(--_text-muted);
    font-size: 0.8rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .service-tab:hover {
    background: var(--_bg-surface);
    color: var(--_text);
  }

  .service-tab.active {
    color: var(--_primary);
    border-bottom-color: var(--_primary);
  }

  /* ==========================================================================
     Header & Tabs
     ========================================================================== */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.375rem 0.5rem;
    border-bottom: 1px solid var(--_border);
  }

  .tabs {
    display: flex;
    gap: 0.2rem;
  }

  .tab {
    padding: 0.375rem 0.625rem;
    background: transparent;
    border: none;
    border-radius: var(--_radius);
    color: var(--_text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .tab:hover:not(:disabled) {
    background: var(--_bg-surface);
    color: var(--_text);
  }

  .tab.active {
    background: var(--_primary);
    color: white;
  }

  .tab:disabled {
    opacity: 0.4;
    cursor: not-allowed;
  }

  .stats {
    font-size: 0.7rem;
    color: var(--_text-muted);
  }

  /* ==========================================================================
     Content
     ========================================================================== */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 0.5rem;
  }

  /* ==========================================================================
     Loading & Empty
     ========================================================================== */
  .loading, .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 1.5rem;
    text-align: center;
  }

  .loading-icon {
    font-size: 1.5rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .empty-icon {
    font-size: 2rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 0.95rem;
    font-weight: 600;
    color: var(--_text);
  }

  .empty-text {
    font-size: 0.8rem;
    color: var(--_text-muted);
  }

  /* ==========================================================================
     Credentials List
     ========================================================================== */
  .credentials-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .group {
    display: flex;
    flex-direction: column;
  }

  .group-header {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem;
    background: transparent;
    border: none;
    border-radius: var(--_radius);
    color: var(--_text-muted);
    cursor: pointer;
    transition: all 0.15s;
    text-align: left;
    width: 100%;
  }

  .group-header:hover {
    background: var(--_bg-surface);
  }

  .group-icon {
    font-size: 0.55rem;
    width: 0.875rem;
  }

  .group-level {
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .group-count {
    font-size: 0.6rem;
    padding: 0.1rem 0.3rem;
    background: var(--_bg-surface);
    border-radius: 9999px;
    margin-left: auto;
  }

  .group-items {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding-left: 1.25rem;
    margin-top: 0.25rem;
  }

  .credential-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.375rem;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    transition: all 0.15s;
  }

  .credential-item:hover {
    border-color: var(--_primary);
  }

  .credential-item.selected {
    border-color: var(--_primary);
    background: rgb(59 130 246 / 0.1);
  }

  .cred-main {
    flex: 1;
    display: flex;
    align-items: center;
    gap: 0.375rem;
    background: none;
    border: none;
    color: inherit;
    cursor: pointer;
    text-align: left;
    padding: 0;
  }

  .cred-icon {
    font-size: 1rem;
  }

  .cred-info {
    display: flex;
    flex-direction: column;
    gap: 0.05rem;
    min-width: 0;
  }

  .cred-name {
    font-size: 0.8rem;
    font-weight: 500;
    color: var(--_text);
  }

  .cred-identifier {
    font-size: 0.7rem;
    color: var(--_primary);
  }

  .cred-preview {
    font-size: 0.7rem;
    color: var(--_text-muted);
    font-family: monospace;
  }

  .cred-edit {
    padding: 0.2rem;
    background: transparent;
    border: none;
    border-radius: 0.25rem;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s;
    font-size: 0.8rem;
  }

  .credential-item:hover .cred-edit {
    opacity: 1;
  }

  .cred-edit:hover {
    background: var(--_bg-surface);
  }

  /* ==========================================================================
     Form
     ========================================================================== */
  .form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.35rem;
  }

  fieldset.field {
    border: none;
    padding: 0;
    margin: 0;
  }

  .label, legend.label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--_text-muted);
  }

  .input {
    width: 100%;
    padding: 0.5rem 0.625rem;
    font-size: 0.8rem;
    background: var(--_bg-surface);
    color: var(--_text);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    transition: border-color 0.15s;
  }

  .input:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .input::placeholder {
    color: var(--_text-muted);
  }

  .field-hint {
    font-size: 0.7rem;
    color: var(--_text-muted);
    margin-top: 0.15rem;
  }

  /* Providers Grid */
  .providers-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.375rem;
  }

  .provider-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.2rem;
    padding: 0.5rem;
    background: var(--_bg-surface);
    border: 2px solid var(--_border);
    border-radius: var(--_radius);
    cursor: pointer;
    transition: all 0.15s;
  }

  .provider-btn:hover {
    border-color: var(--_primary);
  }

  .provider-btn.active {
    border-color: var(--_primary);
    background: rgb(59 130 246 / 0.1);
  }

  .provider-icon {
    font-size: 1.2rem;
  }

  .provider-name {
    font-size: 0.7rem;
    color: var(--_text-muted);
  }

  /* Levels Grid */
  .levels-grid {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.2rem;
  }

  .level-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.1rem;
    padding: 0.375rem 0.2rem;
    font-size: 0.6rem;
    background: var(--_bg-surface);
    border: 2px solid var(--_border);
    border-radius: var(--_radius);
    cursor: pointer;
    transition: all 0.15s;
    color: var(--_text-muted);
  }

  .level-btn:hover {
    border-color: var(--_primary);
  }

  .level-btn.active {
    border-color: var(--_primary);
    background: rgb(59 130 246 / 0.1);
    color: var(--_text);
  }

  /* Password wrapper */
  .password-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .password-input {
    padding-right: 2.5rem;
  }

  .toggle-password {
    position: absolute;
    right: 0.4rem;
    background: none;
    border: none;
    font-size: 1rem;
    cursor: pointer;
    padding: 0.2rem;
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
    gap: 0.35rem;
    padding: 0.625rem;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 0.75rem;
  }

  .info-label {
    font-size: 0.7rem;
    color: var(--_text-muted);
  }

  .info-value {
    display: flex;
    align-items: center;
    gap: 0.3rem;
    font-size: 0.8rem;
    color: var(--_text);
    font-weight: 500;
  }

  .info-value.mono {
    font-family: monospace;
    font-weight: 400;
  }

  /* Test result */
  .test-result {
    padding: 0.5rem;
    border-radius: var(--_radius);
    font-size: 0.8rem;
    text-align: center;
  }

  .test-result.valid {
    background: rgb(34 197 94 / 0.15);
    color: var(--_success);
  }

  .test-result.invalid {
    background: rgb(239 68 68 / 0.15);
    color: var(--_danger);
  }

  /* Error message */
  .error-msg {
    padding: 0.5rem;
    background: rgb(239 68 68 / 0.15);
    color: var(--_danger);
    border-radius: var(--_radius);
    font-size: 0.8rem;
    text-align: center;
  }

  /* ==========================================================================
     Actions & Buttons
     ========================================================================== */
  .actions {
    display: flex;
    gap: 0.375rem;
    margin-top: 0.375rem;
  }

  .btn {
    flex: 1;
    padding: 0.5rem;
    font-size: 0.8rem;
    font-weight: 500;
    border: none;
    border-radius: var(--_radius);
    cursor: pointer;
    transition: all 0.15s;
  }

  .btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .btn.primary {
    background: var(--_success);
    color: white;
  }

  .btn.primary:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  .btn.secondary {
    background: var(--_bg-surface);
    color: var(--_text-muted);
  }

  .btn.secondary:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.1);
    color: var(--_text);
  }

  .btn.danger {
    background: var(--_danger);
    color: white;
    flex: 0 0 auto;
    padding: 0.5rem 0.75rem;
  }

  .btn.danger:hover:not(:disabled) {
    filter: brightness(1.1);
  }

  /* ==========================================================================
     OAuth Section Styles
     ========================================================================== */
  .oauth-section {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 0.75rem;
    overflow-y: auto;
  }

  .oauth-accounts,
  .oauth-form-section,
  .oauth-authorize-section {
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    padding: 0.75rem;
  }

  .section-title {
    font-size: 0.85rem;
    font-weight: 600;
    color: var(--_text);
    margin-bottom: 0.75rem;
    padding-bottom: 0.5rem;
    border-bottom: 1px solid var(--_border);
  }

  .oauth-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .oauth-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    background: rgba(0, 0, 0, 0.2);
    border-radius: var(--_radius);
    gap: 0.5rem;
  }

  .oauth-item-info {
    display: flex;
    flex-direction: column;
    gap: 0.15rem;
    min-width: 0;
  }

  .oauth-item-name {
    font-size: 0.85rem;
    font-weight: 500;
    color: var(--_text);
  }

  .oauth-item-id {
    font-size: 0.7rem;
    color: var(--_text-muted);
  }

  .oauth-item-preview {
    font-size: 0.7rem;
    font-family: monospace;
    color: var(--_text-muted);
  }

  .btn-icon {
    background: transparent;
    border: none;
    padding: 0.35rem;
    font-size: 0.9rem;
    cursor: pointer;
    border-radius: var(--_radius);
    transition: all 0.15s;
  }

  .btn-icon.danger:hover:not(:disabled) {
    background: rgba(239, 68, 68, 0.2);
  }

  .btn-icon:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .info-box {
    background: rgba(59, 130, 246, 0.1);
    border: 1px solid rgba(59, 130, 246, 0.3);
    border-radius: var(--_radius);
    padding: 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.75rem;
    color: var(--_text-muted);
    line-height: 1.5;
  }

  .info-box p {
    margin: 0 0 0.5rem 0;
  }

  .info-box ol {
    margin: 0;
    padding-left: 1.25rem;
  }

  .info-box li {
    margin-bottom: 0.25rem;
  }

  .info-box a {
    color: var(--_primary);
    text-decoration: underline;
  }

  .info-box code {
    background: rgba(0, 0, 0, 0.3);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.7rem;
  }

  .empty-small {
    text-align: center;
    padding: 1rem;
    color: var(--_text-muted);
    font-size: 0.8rem;
  }

  .field-hint {
    font-size: 0.65rem;
    color: var(--_text-muted);
    margin-top: 0.25rem;
  }

  /* Scopes Grid */
  .scopes-grid {
    display: grid;
    grid-template-columns: repeat(3, 1fr);
    gap: 0.35rem;
  }

  .scope-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.15rem;
    padding: 0.4rem 0.25rem;
    background: var(--_bg-surface);
    border: 2px solid var(--_border);
    border-radius: var(--_radius);
    cursor: pointer;
    transition: all 0.15s;
    color: var(--_text-muted);
  }

  .scope-btn:hover {
    border-color: var(--_primary);
    color: var(--_text);
  }

  .scope-btn.active {
    border-color: var(--_primary);
    background: rgb(59 130 246 / 0.15);
    color: var(--_text);
  }

  .scope-icon {
    font-size: 1rem;
  }

  .scope-name {
    font-size: 0.6rem;
    text-align: center;
    line-height: 1.2;
  }
</style>
