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
    saveGlovoConfig,
    deleteGlovoConfig,
    saveTelegramNotifConfig,
    deleteTelegramNotifConfig,
    startOAuth,
    globalCredentials,
    projectCredentials,
    clientCredentials,
    customCredentials,
    botCredentials,
    selectedCredential,
    oauthConfigs,
    glovoConfigs,
    telegramNotifConfigs,
    PROJECT_ONLY_PROVIDERS,
    type ServiceType
  } from '$lib/stores/credentials';
  import {
    channelsStore,
    loadChannels,
    registerChannel,
    updateChannel,
    removeChannel,
    selectChannel,
    channels,
    channelCount,
    selectedChannel,
    channelsByType,
    CHANNEL_TYPES,
    CHANNEL_PURPOSES,
    getChannelTypeIcon,
    getPurposeIcon
  } from '$lib/stores/channels';
  import { closePanel } from '$lib/stores';
  import { subscribe } from '$lib/ui-core/mqtt';
  import { activeProject } from '$lib/stores/workspace';

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

  // Form state for "Nuevo" tab (Canales)
  let channelForm = {
    channel_type: 'telegram',
    external_id: '',
    project_id: '',
    purpose: 'general',
    label: ''
  };

  // Form state for Telegram notification destination
  let telegramNotifForm = {
    level: 'PROJECT',
    identifier: '',
    chatId: '',
    botName: ''
  };

  // Discover Chat ID state
  let discoveringChatId = false;
  let discoverCountdown = 0;
  let discoverTimer: ReturnType<typeof setInterval> | null = null;
  let discoverUnsub: (() => void) | null = null;

  // Form state for "Config" tab
  let editApiKey = '';

  // Form state for "OAuth" tab
  let oauthForm = {
    accountId: '',
    accountName: '',
    clientId: '',
    clientSecret: ''
  };

  // Form state for Glovo credentials.
  // Glovo es POR PROYECTO (multi-tenant): el backend (credential-manager v2.2.0)
  // solo acepta nivel PROJECT con identifier=slug → el form arranca en PROJECT.
  let glovoForm = {
    level: 'PROJECT',
    identifier: '',
    clientId: '',
    clientSecret: '',
    chainId: '',
    webhookToken: ''
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
  $: isGlovoSelected = newForm.provider === 'GLOVO';
  // Providers por-proyecto (WhatsApp): el backend solo acepta nivel PROJECT → el form lo fuerza.
  $: isProjectOnly = PROJECT_ONLY_PROVIDERS.has(newForm.provider);
  $: selectedLevel = levels.find(l => l.id === (isGlovoSelected ? glovoForm.level : newForm.level));
  $: requiresIdentifier = selectedLevel?.requiresIdentifier ?? false;
  $: canSaveNew = isGlovoSelected
    ? (glovoForm.clientId.length > 0 && glovoForm.clientSecret.length > 0 && glovoForm.chainId.length > 0 &&
       (!requiresIdentifier || glovoForm.identifier.length > 0))
    : (newForm.provider && newForm.apiKey.length > 0 &&
       (!requiresIdentifier || newForm.identifier.length > 0));
  $: canSaveEdit = editApiKey.length > 0;

  // Telegram notification form validation
  $: telegramNotifLevel = levels.find(l => l.id === telegramNotifForm.level);
  $: telegramNotifRequiresId = telegramNotifLevel?.requiresIdentifier ?? false;
  $: canSaveTelegramNotif = telegramNotifForm.chatId.length > 0 && telegramNotifForm.botName.length > 0 &&
     (!telegramNotifRequiresId || telegramNotifForm.identifier.length > 0);

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initCredentialsSubscriptions();
    loadChannels();

    // Set default provider
    if (providers.length > 0 && !newForm.provider) {
      newForm.provider = providers[0].id;
    }
  });

  onDestroy(() => {
    cleanup?.();
    stopDiscovery();
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
    if (service === 'canales') {
      selectChannel(null);
    }
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

  // Selección de provider en el form "Nuevo". Para providers por-proyecto (WhatsApp)
  // fuerza nivel PROJECT, porque el backend rechaza cualquier otro nivel (invariante
  // credential-manager v2.1.0). El identificador (el slug del proyecto) lo escribe el
  // usuario: se materializa como META_WHATSAPP_API_KEY_PROJECT_<slug>, que es lo que lee el bot.
  function selectProvider(id: string) {
    newForm.provider = id;
    clearTestResult();
    if (PROJECT_ONLY_PROVIDERS.has(id)) {
      newForm.level = 'PROJECT';
    }
  }

  async function handleTestNew() {
    if (!newForm.apiKey || !newForm.provider) return;

    testing = true;
    error = null;

    await testCredential(newForm.provider, newForm.apiKey);
    testing = false;
  }

  async function handleSaveNew() {
    if (!canSaveNew || saving) return;

    // Glovo: guardar multi-campo sin test previo
    if (isGlovoSelected) {
      saving = true;
      error = null;
      try {
        const glovoLevel = levels.find(l => l.id === glovoForm.level);
        const glovoRequiresId = glovoLevel?.requiresIdentifier ?? false;
        await saveGlovoConfig(
          glovoForm.level,
          glovoRequiresId ? glovoForm.identifier : null,
          glovoForm.clientId,
          glovoForm.clientSecret,
          glovoForm.chainId,
          glovoForm.webhookToken || null
        );
        glovoForm = { level: 'PROJECT', identifier: '', clientId: '', clientSecret: '', chainId: '', webhookToken: '' };
        setActiveTab('lista');
      } catch (err) {
        error = err instanceof Error ? err.message : 'Error al guardar credenciales Glovo';
      } finally {
        saving = false;
      }
      return;
    }

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
    glovoForm = { level: 'PROJECT', identifier: '', clientId: '', clientSecret: '', chainId: '', webhookToken: '' };
    clearTestResult();
    error = null;
    setActiveTab('lista');
  }

  async function handleDeleteGlovo(level: string, identifier: string | null) {
    if (!confirm(`Eliminar credenciales Glovo ${level}${identifier ? ` (${identifier})` : ''}?`)) return;
    deleting = true;
    error = null;
    try {
      await deleteGlovoConfig(level, identifier);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar credenciales Glovo';
    } finally {
      deleting = false;
    }
  }

  // ==========================================================================
  // HANDLERS - TELEGRAM
  // ==========================================================================

  async function handleSaveTelegramBot() {
    if (!telegramForm.botName || !telegramForm.token || saving) return;

    saving = true;
    error = null;

    // Sanitize bot name: remove @, spaces, special chars
    const cleanBotName = telegramForm.botName
      .replace(/^@/, '')
      .replace(/\s+/g, '_')
      .replace(/[^a-zA-Z0-9_]/g, '');

    if (!cleanBotName) {
      error = 'Nombre de bot inválido';
      saving = false;
      return;
    }

    try {
      // Crear credencial con provider=TELEGRAM, level=CUSTOM, identifier=botName
      await createCredential(
        'TELEGRAM',
        'CUSTOM',
        cleanBotName,
        telegramForm.token
      );

      // Auto-register channel binding if there's an active project
      const project = $activeProject;
      if (project?.id) {
        try {
          await registerChannel(
            'telegram',
            cleanBotName,
            project.id,
            'facturas',
            `Bot ${cleanBotName}`
          );
        } catch (e) {
          // Channel might already exist — non-blocking
          console.warn('[Credentials] Channel auto-register:', e);
        }
      }

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
    telegramNotifForm = { level: 'PROJECT', identifier: '', chatId: '', botName: '' };
    clearTestResult();
    error = null;
    setActiveTab('lista');
  }

  async function handleSaveTelegramNotif() {
    if (!canSaveTelegramNotif || saving) return;
    saving = true;
    error = null;
    try {
      const reqId = telegramNotifRequiresId ? telegramNotifForm.identifier : null;
      await saveTelegramNotifConfig(
        telegramNotifForm.level,
        reqId,
        telegramNotifForm.chatId,
        telegramNotifForm.botName
      );
      telegramNotifForm = { level: 'PROJECT', identifier: '', chatId: '', botName: '' };
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar destino de notificación';
    } finally {
      saving = false;
    }
  }

  async function handleDeleteTelegramNotif(level: string, identifier: string | null) {
    if (!confirm(`Eliminar notificación Telegram ${level}${identifier ? ` (${identifier})` : ''}?`)) return;
    deleting = true;
    error = null;
    try {
      await deleteTelegramNotifConfig(level, identifier);
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar config Telegram';
    } finally {
      deleting = false;
    }
  }

  // ==========================================================================
  // HANDLERS - DISCOVER CHAT ID
  // ==========================================================================

  function stopDiscovery() {
    discoveringChatId = false;
    discoverCountdown = 0;
    if (discoverTimer) { clearInterval(discoverTimer); discoverTimer = null; }
    if (discoverUnsub) { discoverUnsub(); discoverUnsub = null; }
  }

  function handleDiscoverChatId() {
    if (discoveringChatId) { stopDiscovery(); return; }
    if (!telegramNotifForm.botName) return;

    const targetBot = telegramNotifForm.botName;
    discoveringChatId = true;
    discoverCountdown = 60;

    // Countdown timer
    discoverTimer = setInterval(() => {
      discoverCountdown--;
      if (discoverCountdown <= 0) stopDiscovery();
    }, 1000);

    // Listen for any message from the target bot
    discoverUnsub = subscribe('telegram.text.received', (_topic: string, payload: any) => {
      const data = payload?.data || payload;
      if (data?.botName !== targetBot) return;

      // Capture the chatId from whoever sent the message
      telegramNotifForm.chatId = String(data.chatId);
      stopDiscovery();
    });

    // Also listen for command events (like /start)
    const unsubCmd = subscribe('telegram.command.received', (_topic: string, payload: any) => {
      const data = payload?.data || payload;
      if (data?.botName !== targetBot) return;

      telegramNotifForm.chatId = String(data.chatId);
      stopDiscovery();
    });

    // Combine both unsubscribes
    const originalUnsub = discoverUnsub;
    discoverUnsub = () => { originalUnsub(); unsubCmd(); };
  }

  // ==========================================================================
  // HANDLERS - CANALES
  // ==========================================================================

  async function handleSaveChannel() {
    if (!channelForm.channel_type || !channelForm.external_id || !channelForm.project_id || saving) return;

    saving = true;
    error = null;

    try {
      await registerChannel(
        channelForm.channel_type,
        channelForm.external_id,
        channelForm.project_id,
        channelForm.purpose,
        channelForm.label || undefined
      );

      channelForm = { channel_type: 'telegram', external_id: '', project_id: '', purpose: 'general', label: '' };
      setActiveTab('lista');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al registrar canal';
    } finally {
      saving = false;
    }
  }

  function handleCancelChannel() {
    channelForm = { channel_type: 'telegram', external_id: '', project_id: '', purpose: 'general', label: '' };
    error = null;
    setActiveTab('lista');
  }

  function handleEditChannel(channel: any) {
    selectChannel(channel);
    setActiveTab('config');
    error = null;
  }

  async function handleDeleteChannel() {
    const ch = $selectedChannel;
    if (!ch || deleting) return;

    deleting = true;
    error = null;

    try {
      await removeChannel(ch.channel_type, ch.external_id);
      selectChannel(null);
      setActiveTab('lista');
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al eliminar canal';
    } finally {
      deleting = false;
    }
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
    <button
      class="service-tab"
      class:active={activeServiceValue === 'canales'}
      on:click={() => { handleServiceChange('canales'); loadChannels(); }}
    >
      📡 Canales
      {#if $channelCount > 0}
        <span class="service-badge">{$channelCount}</span>
      {/if}
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
      {:else if activeServiceValue === 'telegram'}
        {telegramBots.length} bots
      {:else if activeServiceValue === 'canales'}
        {$channelCount} canales
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

      <!-- CANALES LIST -->
      {:else if activeServiceValue === 'canales'}
        {#if $channels.length === 0}
          <div class="empty">
            <span class="empty-icon">📡</span>
            <span class="empty-title">Sin canales</span>
            <span class="empty-text">Registra tu primer canal externo</span>
            <button class="btn primary" on:click={() => handleTabChange('nuevo')}>
              ➕ Registrar Canal
            </button>
          </div>
        {:else}
          <div class="credentials-list">
            {#each Object.entries($channelsByType) as [type, channelList] (type)}
              <div class="group">
                <button class="group-header" on:click={() => toggleGroup(type)}>
                  <span class="group-icon">{expandedGroups[type] ? '▼' : '▶'}</span>
                  <span class="group-level">{getChannelTypeIcon(type)} {type}</span>
                  <span class="group-count">{channelList.length}</span>
                </button>
                {#if expandedGroups[type]}
                  <div class="group-items">
                    {#each channelList as ch (ch.channel_type + ':' + ch.external_id)}
                      <div
                        class="credential-item"
                        class:selected={$selectedChannel?.external_id === ch.external_id && $selectedChannel?.channel_type === ch.channel_type}
                      >
                        <button class="cred-main" on:click={() => selectChannel(ch)}>
                          <span class="cred-icon">{getPurposeIcon(ch.purpose)}</span>
                          <div class="cred-info">
                            <span class="cred-name">{ch.label || ch.external_id}</span>
                            <span class="cred-preview">{ch.project_id} · {ch.purpose}</span>
                          </div>
                        </button>
                        <button
                          class="cred-edit"
                          on:click|stopPropagation={() => handleEditChannel(ch)}
                          title="Editar"
                        >
                          ✏️
                        </button>
                      </div>
                    {/each}
                  </div>
                {/if}
              </div>
            {/each}
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
          <div class="info-box">
            <strong>Registrar Bot de Telegram</strong>
            <p>Un bot es la conexion entre el sistema y Telegram. Puede enviar notificaciones (cierres de caja, reportes) y recibir datos (fotos de facturas, comandos).</p>
            <p>Si no tienes un bot, crealo en Telegram: busca <strong>@BotFather</strong>, envia <code>/newbot</code> y copia el token que te da.</p>
          </div>

          <div class="field">
            <label class="label" for="bot-name">Nombre del Bot</label>
            <input
              id="bot-name"
              type="text"
              class="input"
              placeholder="facturas, ventas, alertas..."
              bind:value={telegramForm.botName}
            />
            <span class="field-hint">Identificador interno para distinguir este bot de otros (ej: facturas, cierres, pedidos). Sin espacios.</span>
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

        <!-- ============================================ -->
        <!-- TELEGRAM: Destino de Notificaciones         -->
        <!-- ============================================ -->
        <hr class="form-divider" />
        <div class="form">
          <h4 class="form-section-title">Destino de Notificaciones</h4>

          <div class="info-box">
            <strong>Donde se envian las notificaciones</strong>
            <p>Configura a que persona o grupo de Telegram se envian las notificaciones automaticas (cierres de caja, reportes de ventas, alertas). Cada proyecto puede tener su propio destinatario.</p>
            <details class="info-details">
              <summary>Como funciona el nivel</summary>
              <ul>
                <li><strong>GLOBAL</strong> — Destino por defecto para todos los proyectos que no tengan uno propio.</li>
                <li><strong>PROJECT</strong> — Destino especifico para un proyecto. El identificador es el nombre del proyecto (ej: <code>nonina</code>, <code>bar-pepe</code>). <em>Este es el mas comun.</em></li>
                <li><strong>CLIENT / CUSTOM</strong> — Para casos avanzados con multiples destinatarios.</li>
              </ul>
            </details>
          </div>

          <!-- Level -->
          <fieldset class="field">
            <legend class="label">Nivel</legend>
            <div class="levels-grid" role="group">
              {#each aiLevels as l (l.id)}
                <button
                  type="button"
                  class="level-btn"
                  class:active={telegramNotifForm.level === l.id}
                  on:click={() => { telegramNotifForm.level = l.id; telegramNotifForm.identifier = ''; }}
                >
                  <span>{l.icon}</span>
                  <span>{l.name}</span>
                </button>
              {/each}
            </div>
          </fieldset>

          <!-- Identifier -->
          {#if telegramNotifRequiresId}
            <div class="field">
              <label class="label" for="notif-identifier">Identificador</label>
              <input
                id="notif-identifier"
                type="text"
                class="input"
                placeholder={telegramNotifForm.level === 'PROJECT' ? 'nonina' : 'identificador'}
                bind:value={telegramNotifForm.identifier}
              />
              <span class="field-hint">Nombre exacto del proyecto tal como aparece en el sistema (ej: nonina, bar-pepe). Las notificaciones de cierre de caja de este proyecto se enviaran a este destino.</span>
            </div>
          {/if}

          <!-- Chat ID -->
          <div class="field">
            <label class="label" for="notif-chat-id">Chat ID</label>
            <div class="input-with-action">
              <input
                id="notif-chat-id"
                type="text"
                class="input"
                placeholder="1934798567"
                bind:value={telegramNotifForm.chatId}
              />
              {#if telegramBots.length > 0}
                <button
                  type="button"
                  class="btn secondary small"
                  on:click={handleDiscoverChatId}
                  disabled={discoveringChatId || !telegramNotifForm.botName}
                  title={!telegramNotifForm.botName ? 'Selecciona un bot primero' : 'Detectar Chat ID automaticamente'}
                >
                  {#if discoveringChatId}
                    Esperando... ({discoverCountdown}s)
                  {:else}
                    Detectar
                  {/if}
                </button>
              {/if}
            </div>
            {#if discoveringChatId}
              <div class="discover-status">
                Envia <strong>/start</strong> al bot <strong>@{telegramNotifForm.botName}</strong> desde la cuenta de Telegram del destinatario. El Chat ID se capturara automaticamente.
              </div>
            {:else}
              <span class="field-hint">ID numerico del usuario o grupo de Telegram que recibira las notificaciones. Usa "Detectar" o consultalo manualmente.</span>
              <details class="info-details">
                <summary>Como obtener el Chat ID manualmente</summary>
                <ol>
                  <li>El destinatario abre Telegram y busca el bot <strong>@{telegramNotifForm.botName || 'tu_bot'}</strong></li>
                  <li>Le envia <strong>/start</strong> (obligatorio, sin esto el bot no puede escribirle)</li>
                  <li>Busca <strong>@userinfobot</strong> en Telegram y le envia cualquier mensaje — te respondera con tu Chat ID</li>
                  <li>Copia el numero y pegalo aqui</li>
                </ol>
                <p><em>O pulsa "Detectar" para capturarlo automaticamente.</em></p>
              </details>
            {/if}
          </div>

          <!-- Bot Name -->
          <div class="field">
            <label class="label" for="notif-bot-name">Bot</label>
            {#if telegramBots.length > 0}
              <select
                id="notif-bot-name"
                class="input"
                bind:value={telegramNotifForm.botName}
              >
                <option value="">Seleccionar bot...</option>
                {#each telegramBots as bot (bot.key)}
                  <option value={bot.identifier}>{bot.identifier}</option>
                {/each}
              </select>
            {:else}
              <input
                id="notif-bot-name"
                type="text"
                class="input"
                placeholder="Noninacloset"
                bind:value={telegramNotifForm.botName}
              />
            {/if}
            <span class="field-hint">Bot que enviara las notificaciones. Debe estar registrado arriba con su token. Un mismo bot puede enviar a distintos destinatarios.</span>
          </div>

          <!-- Configs existentes -->
          {#if $telegramNotifConfigs.length > 0}
            <div class="field">
              <label class="label">Destinos configurados</label>
              {#each $telegramNotifConfigs as tc}
                <div class="notif-config-item">
                  <span class="notif-config-info">
                    <span class="cred-icon">📨</span>
                    <span>{tc.level}{tc.identifier ? ` (${tc.identifier})` : ''}</span>
                    <span class="cred-preview">{tc.chatId} → {tc.botName}</span>
                    {#if tc.configured}
                      <span title="Configurado">✅</span>
                    {:else}
                      <span title="Incompleto">⚠️</span>
                    {/if}
                  </span>
                  <button
                    class="btn danger small"
                    on:click={() => handleDeleteTelegramNotif(tc.level, tc.identifier)}
                    disabled={deleting}
                  >
                    🗑️
                  </button>
                </div>
              {/each}
            </div>
          {/if}

          {#if error}
            <div class="error-msg">{error}</div>
          {/if}

          <div class="actions">
            <button class="btn secondary" on:click={handleCancelTelegram} disabled={saving}>
              Cancelar
            </button>
            <button
              class="btn primary"
              on:click={handleSaveTelegramNotif}
              disabled={!canSaveTelegramNotif || saving}
            >
              {saving ? '⏳...' : '💾 Guardar Destino'}
            </button>
          </div>
        </div>

      <!-- CANALES NEW FORM -->
      {:else if activeServiceValue === 'canales'}
        <div class="form">
          <fieldset class="field">
            <legend class="label">Tipo de Canal</legend>
            <div class="providers-grid" role="group">
              {#each CHANNEL_TYPES as ct (ct.id)}
                <button
                  type="button"
                  class="provider-btn"
                  class:active={channelForm.channel_type === ct.id}
                  on:click={() => { channelForm.channel_type = ct.id; }}
                >
                  <span class="provider-icon">{ct.icon}</span>
                  <span class="provider-name">{ct.name}</span>
                </button>
              {/each}
            </div>
          </fieldset>

          <div class="field">
            <label class="label" for="ch-external-id">Identificador Externo</label>
            <input
              id="ch-external-id"
              type="text"
              class="input"
              placeholder="nonina_bot, facturas@empresa.com, +34600..."
              bind:value={channelForm.external_id}
            />
            <span class="field-hint">El ID que identifica este canal (botName, email, telefono)</span>
          </div>

          <div class="field">
            <label class="label" for="ch-project-id">Proyecto</label>
            <input
              id="ch-project-id"
              type="text"
              class="input"
              placeholder="noninapizza"
              bind:value={channelForm.project_id}
            />
          </div>

          <fieldset class="field">
            <legend class="label">Proposito</legend>
            <div class="levels-grid" role="group">
              {#each CHANNEL_PURPOSES as p (p.id)}
                <button
                  type="button"
                  class="level-btn"
                  class:active={channelForm.purpose === p.id}
                  on:click={() => { channelForm.purpose = p.id; }}
                >
                  <span>{p.icon}</span>
                  <span>{p.name}</span>
                </button>
              {/each}
            </div>
          </fieldset>

          <div class="field">
            <label class="label" for="ch-label">Etiqueta (opcional)</label>
            <input
              id="ch-label"
              type="text"
              class="input"
              placeholder="Bot facturas Nonina"
              bind:value={channelForm.label}
            />
          </div>

          {#if error}
            <div class="error-msg">{error}</div>
          {/if}

          <div class="actions">
            <button class="btn secondary" on:click={handleCancelChannel} disabled={saving}>
              Cancelar
            </button>
            <button
              class="btn primary"
              on:click={handleSaveChannel}
              disabled={!channelForm.external_id || !channelForm.project_id || saving}
            >
              {saving ? '⏳...' : '📡 Registrar Canal'}
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
                  on:click={() => selectProvider(p.id)}
                >
                  <span class="provider-icon">{p.icon}</span>
                  <span class="provider-name">{p.name}</span>
                </button>
              {/each}
            </div>
          </fieldset>

          {#if isGlovoSelected}
            <!-- ============================================ -->
            <!-- GLOVO: Formulario multi-campo -->
            <!-- ============================================ -->

            <!-- Level -->
            <fieldset class="field">
              <legend class="label">Nivel</legend>
              <div class="levels-grid" role="group">
                {#each aiLevels as l (l.id)}
                  <button
                    type="button"
                    class="level-btn"
                    class:active={glovoForm.level === l.id}
                    on:click={() => { glovoForm.level = l.id; glovoForm.identifier = ''; }}
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
                <label class="label" for="glovo-identifier">Identificador</label>
                <input
                  id="glovo-identifier"
                  type="text"
                  class="input"
                  placeholder={glovoForm.level === 'PROJECT' ? 'mi-restaurante' : 'identificador'}
                  bind:value={glovoForm.identifier}
                />
              </div>
            {/if}

            <!-- Client ID -->
            <div class="field">
              <label class="label" for="glovo-client-id">Client ID</label>
              <input
                id="glovo-client-id"
                type="text"
                class="input"
                placeholder="Client ID de Glovo Developer Portal"
                bind:value={glovoForm.clientId}
              />
            </div>

            <!-- Client Secret -->
            <div class="field">
              <label class="label" for="glovo-client-secret">Client Secret</label>
              <div class="password-wrapper">
                {#if showPassword}
                  <input
                    id="glovo-client-secret"
                    type="text"
                    class="input password-input"
                    placeholder="Client Secret de Glovo Developer Portal"
                    bind:value={glovoForm.clientSecret}
                  />
                {:else}
                  <input
                    id="glovo-client-secret"
                    type="password"
                    class="input password-input"
                    placeholder="Client Secret de Glovo Developer Portal"
                    bind:value={glovoForm.clientSecret}
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

            <!-- Chain ID -->
            <div class="field">
              <label class="label" for="glovo-chain-id">Chain ID</label>
              <input
                id="glovo-chain-id"
                type="text"
                class="input"
                placeholder="ID del restaurante en Glovo"
                bind:value={glovoForm.chainId}
              />
            </div>

            <!-- Webhook Token (opcional) -->
            <div class="field">
              <label class="label" for="glovo-webhook-token">Token de webhook <span class="opt">(opcional)</span></label>
              <input
                id="glovo-webhook-token"
                type={showPassword ? 'text' : 'password'}
                class="input"
                placeholder="Token estático del Vendor Portal (autentica el webhook de pedidos)"
                bind:value={glovoForm.webhookToken}
              />
            </div>

            <!-- Glovo configs existentes -->
            {#if $glovoConfigs.length > 0}
              <div class="field">
                <label class="label">Configuraciones existentes</label>
                {#each $glovoConfigs as gc}
                  <div class="glovo-config-item">
                    <span class="glovo-config-info">
                      <span class="cred-icon">🛵</span>
                      <span>{gc.level}{gc.identifier ? ` (${gc.identifier})` : ''}</span>
                      <span class="cred-preview">{gc.clientIdPreview}</span>
                      {#if gc.hasWebhookToken}
                        <span title="Token de webhook configurado">🪝</span>
                      {/if}
                      {#if gc.configured}
                        <span title="Configurado">✅</span>
                      {:else}
                        <span title="Incompleto">⚠️</span>
                      {/if}
                    </span>
                    <button
                      class="btn danger small"
                      on:click={() => handleDeleteGlovo(gc.level, gc.identifier)}
                      disabled={deleting}
                    >
                      🗑️
                    </button>
                  </div>
                {/each}
              </div>
            {/if}

            <!-- Error -->
            {#if error}
              <div class="error-msg">{error}</div>
            {/if}

            <!-- Actions -->
            <div class="actions">
              <button class="btn secondary" on:click={handleCancelNew} disabled={saving}>
                Cancelar
              </button>
              <button
                class="btn primary"
                on:click={handleSaveNew}
                disabled={!canSaveNew || saving}
              >
                {saving ? '⏳...' : '💾 Guardar Glovo'}
              </button>
            </div>

          {:else}
            <!-- ============================================ -->
            <!-- PROVIDERS NORMALES: Formulario 1 campo -->
            <!-- ============================================ -->

            <!-- Level -->
            <fieldset class="field">
              <legend class="label">Nivel</legend>
              {#if isProjectOnly}
                <div class="info-box">
                  <strong>🔵 Proyecto (obligatorio)</strong>
                  <p>Las credenciales de WhatsApp son por tienda: cada proyecto tiene su propio número, token y webhook. No pueden ser globales. El identificador es el <strong>slug del proyecto</strong> (ej: <code>nonina</code>).</p>
                </div>
              {:else}
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
              {/if}
            </fieldset>

            <!-- Identifier -->
            {#if requiresIdentifier}
              <div class="field">
                <label class="label" for="new-identifier">Identificador</label>
                <input
                  id="new-identifier"
                  type="text"
                  class="input"
                  placeholder={isProjectOnly ? 'nonina (slug del proyecto)' : newForm.level === 'PROJECT' ? 'proyecto-123' : newForm.level === 'CLIENT' ? 'cliente-abc' : 'custom-id'}
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
          {/if}
        </div>
      {/if}

    <!-- ================================================================== -->
    <!-- TAB: CONFIG -->
    <!-- ================================================================== -->
    {:else if activeTab === 'config'}
      <!-- CANALES CONFIG -->
      {#if activeServiceValue === 'canales'}
        {#if $selectedChannel}
          <div class="form">
            <div class="current-info">
              <div class="info-row">
                <span class="info-label">Tipo</span>
                <span class="info-value">
                  {getChannelTypeIcon($selectedChannel.channel_type)} {$selectedChannel.channel_type}
                </span>
              </div>
              <div class="info-row">
                <span class="info-label">ID Externo</span>
                <span class="info-value mono">{$selectedChannel.external_id}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Proyecto</span>
                <span class="info-value">{$selectedChannel.project_id}</span>
              </div>
              <div class="info-row">
                <span class="info-label">Proposito</span>
                <span class="info-value">
                  {getPurposeIcon($selectedChannel.purpose)} {$selectedChannel.purpose}
                </span>
              </div>
              {#if $selectedChannel.label}
                <div class="info-row">
                  <span class="info-label">Etiqueta</span>
                  <span class="info-value">{$selectedChannel.label}</span>
                </div>
              {/if}
            </div>

            {#if error}
              <div class="error-msg">{error}</div>
            {/if}

            <div class="actions">
              <button
                class="btn danger"
                on:click={handleDeleteChannel}
                disabled={deleting}
              >
                {deleting ? '⏳...' : '🗑️ Eliminar Canal'}
              </button>
              <button class="btn secondary" on:click={() => { selectChannel(null); setActiveTab('lista'); }}>
                Volver
              </button>
            </div>
          </div>
        {:else}
          <div class="empty">
            <span class="empty-icon">📡</span>
            <span class="empty-text">Selecciona un canal en Lista</span>
            <button class="btn secondary" on:click={() => handleTabChange('lista')}>
              Ir a Lista
            </button>
          </div>
        {/if}

      <!-- CREDENTIALS CONFIG -->
      {:else if selected}
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

  .service-badge {
    font-size: 0.65rem;
    background: var(--_primary, #4a90d9);
    color: var(--_bg, #1a1a2e);
    border-radius: 8px;
    padding: 0 5px;
    margin-left: 4px;
    font-weight: 600;
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

  /* Glovo config items */
  .glovo-config-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.6rem;
    background: var(--_bg-subtle, rgba(255,255,255,0.05));
    border-radius: var(--_radius);
    margin-bottom: 0.3rem;
    font-size: 0.85rem;
  }

  .glovo-config-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .btn.small {
    padding: 0.2rem 0.4rem;
    font-size: 0.75rem;
  }

  .form-divider {
    border: none;
    border-top: 1px solid var(--_border, rgba(255,255,255,0.1));
    margin: var(--_gap-lg, 1rem) 0;
  }

  .form-section-title {
    font-size: 0.85rem;
    color: var(--_text-secondary, rgba(255,255,255,0.6));
    margin: 0 0 0.75rem 0;
    font-weight: 500;
  }

  /* Info boxes */
  .info-box {
    background: var(--_bg-surface, rgba(255,255,255,0.03));
    border: 1px solid var(--_border, rgba(255,255,255,0.1));
    border-left: 3px solid var(--_primary, #6366f1);
    border-radius: var(--_radius, 6px);
    padding: 0.75rem;
    margin-bottom: 0.75rem;
    font-size: 0.75rem;
    line-height: 1.5;
    color: var(--_text-secondary, rgba(255,255,255,0.7));
  }

  .info-box strong {
    color: var(--_text-primary, #fff);
    display: block;
    margin-bottom: 0.25rem;
    font-size: 0.8rem;
  }

  .info-box p {
    margin: 0.25rem 0;
  }

  .info-box code {
    background: rgba(255,255,255,0.08);
    padding: 0.1rem 0.3rem;
    border-radius: 3px;
    font-size: 0.7rem;
  }

  .info-details {
    margin-top: 0.5rem;
    font-size: 0.7rem;
    color: var(--_text-muted, rgba(255,255,255,0.5));
  }

  .info-details summary {
    cursor: pointer;
    color: var(--_primary, #6366f1);
    font-size: 0.72rem;
  }

  .info-details ul,
  .info-details ol {
    margin: 0.35rem 0;
    padding-left: 1.2rem;
  }

  .info-details li {
    margin-bottom: 0.2rem;
  }

  /* Input with action button */
  .input-with-action {
    display: flex;
    gap: 0.375rem;
    align-items: center;
  }

  .input-with-action .input {
    flex: 1;
  }

  .input-with-action .btn {
    white-space: nowrap;
    flex-shrink: 0;
  }

  /* Discover Chat ID */
  .discover-status {
    margin-top: 0.35rem;
    padding: 0.5rem 0.65rem;
    background: rgba(99, 102, 241, 0.1);
    border: 1px solid rgba(99, 102, 241, 0.3);
    border-radius: var(--_radius, 6px);
    font-size: 0.72rem;
    color: var(--_text-secondary, rgba(255,255,255,0.7));
    animation: pulse-border 2s ease-in-out infinite;
  }

  @keyframes pulse-border {
    0%, 100% { border-color: rgba(99, 102, 241, 0.3); }
    50% { border-color: rgba(99, 102, 241, 0.7); }
  }

  .notif-config-item {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.4rem 0.6rem;
    background: var(--_bg-subtle, rgba(255,255,255,0.05));
    border-radius: var(--_radius);
    margin-bottom: 0.3rem;
    font-size: 0.85rem;
  }

  .notif-config-info {
    display: flex;
    align-items: center;
    gap: 0.5rem;
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
