<!--
  SelectorPanel.svelte
  ====================
  Componente unificado para selectores de módulos Event-Core.
  Consume /ui/state y normaliza datos para UI consistente.

  Módulos soportados:
  - ai-gateway: Selección de modelo/proveedor IA
  - credential-manager: Gestión de API keys
  - prompt-manager: Selección de prompts/slots
  - conversation-manager: Historial de conversaciones

  Uso:
    <SelectorPanel
      module="ai-gateway"
      panelMode="quick"
      bind:open={showPanel}
      bind:selectedValue={currentModel}
      on:select={handleSelect}
    />

  @version 2.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { onMount, onDestroy, createEventDispatcher } from 'svelte';
  import { fade, slide, scale } from 'svelte/transition';
  import { cubicOut, backOut } from 'svelte/easing';
  import config from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  type ModuleType = 'ai-gateway' | 'credential-manager' | 'prompt-manager' | 'conversation-manager';
  type PanelMode = 'quick' | 'create' | 'manage';
  type SelectionMode = 'single' | 'multiple';
  type Variant = 'default' | 'primary' | 'success' | 'warning' | 'danger' | 'info';

  interface GroupItem {
    id: string;
    label: string;
    sublabel?: string;
    icon?: string;
    badge?: string;
    badgeVariant?: Variant;
    selected: boolean;
    disabled?: boolean;
    metadata?: Record<string, unknown>;
  }

  interface Group {
    id: string;
    label: string;
    icon: string;
    count: number;
    expanded: boolean;
    variant: Variant;
    items: GroupItem[];
  }

  interface StatItem {
    label: string;
    value: string | number;
    icon: string;
  }

  interface NormalizedData {
    groups: Group[];
    selection: {
      mode: SelectionMode;
      value: string | string[] | null;
    };
    stats: StatItem[];
    raw: unknown;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Módulo a conectar */
  export let module: ModuleType;

  /** ID del proyecto (para filtrar datos) */
  export let projectId: string | null = null;

  /** Modo del panel */
  export let panelMode: PanelMode = 'quick';

  /** Estado de apertura (bindable) */
  export let open = false;

  /** Valor seleccionado (bindable) */
  export let selectedValue: string | string[] | null = null;

  /** Título personalizado del panel */
  export let title: string | null = null;

  /** Permitir crear nuevos items */
  export let allowCreate = true;

  /** Mostrar estadísticas */
  export let showStats = true;

  /** Clases CSS adicionales */
  let className = '';
  export { className as class };

  // ============================================================================
  // CONFIGURATION
  // ============================================================================

  const PANEL_SIZES: Record<PanelMode, string> = {
    quick: '35vh',
    create: '55vh',
    manage: '85vh'
  };

  const MODULE_CONFIG: Record<ModuleType, {
    endpoint: string;
    title: string;
    icon: string;
    mqttTopics: string[];
    emptyMessage: string;
    emptyIcon: string;
    createLabel: string;
  }> = {
    'ai-gateway': {
      endpoint: '/modules/ai-gateway/ui/state',
      title: 'Seleccionar Modelo',
      icon: '🤖',
      mqttTopics: ['ai.completion.completed'],
      emptyMessage: 'No hay modelos disponibles',
      emptyIcon: '🤖',
      createLabel: 'Configurar'
    },
    'credential-manager': {
      endpoint: '/modules/credential-manager/ui/state',
      title: 'Credenciales',
      icon: '🔑',
      mqttTopics: ['credential.saved', 'credential.updated', 'credential.deleted'],
      emptyMessage: 'No hay credenciales configuradas',
      emptyIcon: '🔐',
      createLabel: 'Nueva credencial'
    },
    'prompt-manager': {
      endpoint: '/modules/prompt-manager/ui/state',
      title: 'Prompts',
      icon: '📝',
      mqttTopics: ['prompt.created', 'prompt.updated', 'prompt.deleted'],
      emptyMessage: 'No hay prompts disponibles',
      emptyIcon: '📝',
      createLabel: 'Nuevo prompt'
    },
    'conversation-manager': {
      endpoint: '/modules/conversation-manager/ui/state',
      title: 'Conversaciones',
      icon: '💬',
      mqttTopics: ['conversation.created', 'conversation.updated', 'conversation.deleted', 'message.received'],
      emptyMessage: 'No hay conversaciones',
      emptyIcon: '💬',
      createLabel: 'Nueva conversación'
    }
  };

  const GESTURE_CONFIG = {
    tapDelay: 250,
    doubleTapMaxDelay: 300,
    longPressDuration: 500
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let loading = true;
  let error: string | null = null;
  let data: NormalizedData | null = null;

  // Gesture state
  let tapCount = 0;
  let isLongPress = false;
  let activeItemId: string | null = null;

  // Timer references (TypeScript proper types)
  let tapTimeout: ReturnType<typeof setTimeout> | null = null;
  let longPressTimeout: ReturnType<typeof setTimeout> | null = null;
  let debounceTimeout: ReturnType<typeof setTimeout> | null = null;

  // Panel ref for focus trap
  let panelElement: HTMLElement | null = null;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: moduleConfig = MODULE_CONFIG[module];
  $: panelTitle = title || moduleConfig?.title || 'Selector';
  $: panelHeight = PANEL_SIZES[panelMode];
  $: displayStats = showStats && panelMode !== 'create' && data?.stats && data.stats.length > 0;
  $: showCreateButton = allowCreate && panelMode !== 'quick';
  $: totalItems = data?.groups.reduce((acc, g) => acc + g.items.length, 0) || 0;
  $: isEmpty = totalItems === 0 && !loading;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    select: { itemId: string; item: GroupItem; metadata?: Record<string, unknown> };
    create: { groupId?: string };
    edit: { itemId: string; item: GroupItem };
    delete: { itemId: string };
    close: void;
  }>();

  // ============================================================================
  // TIMER MANAGEMENT (Critical Pattern from AISelector)
  // ============================================================================

  /**
   * Limpia todos los timers activos.
   * CRÍTICO: Llamar en touchend, touchcancel, y onDestroy
   */
  function clearTimers(): void {
    if (tapTimeout) {
      clearTimeout(tapTimeout);
      tapTimeout = null;
    }
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
      debounceTimeout = null;
    }
  }

  /**
   * Reset del estado de gestos
   */
  function resetGestureState(): void {
    clearTimers();
    tapCount = 0;
    isLongPress = false;
    activeItemId = null;
  }

  // ============================================================================
  // DATA ADAPTERS
  // ============================================================================

  /**
   * Transforma datos de ai-gateway/ui/state a estructura normalizada
   */
  function adaptAIGateway(raw: any): NormalizedData {
    const groups: Group[] = (raw.providers || []).map((p: any) => ({
      id: p.id,
      label: p.displayName,
      icon: p.icon,
      count: p.models?.length || 0,
      expanded: p.id === raw.current?.provider || p.available,
      variant: p.available ? 'default' : 'warning',
      items: (p.models || []).map((m: any) => ({
        id: `${p.id}:${m.id}`,
        label: m.name,
        sublabel: p.pricing ? `$${p.pricing.input}/1K tokens` : undefined,
        selected: m.isSelected,
        disabled: !p.available,
        metadata: { provider: p.id, model: m.id }
      }))
    }));

    const stats: StatItem[] = raw.usage?.session ? [
      { label: 'Requests', value: raw.usage.session.requests, icon: '📊' },
      { label: 'Tokens', value: raw.usage.session.tokens.toLocaleString(), icon: '🔤' },
      { label: 'Costo', value: `$${raw.usage.session.cost.toFixed(4)}`, icon: '💰' }
    ] : [];

    return {
      groups,
      selection: {
        mode: 'single',
        value: raw.current?.model ? `${raw.current.provider}:${raw.current.model}` : null
      },
      stats,
      raw
    };
  }

  /**
   * Transforma datos de credential-manager/ui/state
   */
  function adaptCredentialManager(raw: any): NormalizedData {
    const groups: Group[] = (raw.levels || []).map((level: any) => ({
      id: level.id,
      label: level.name,
      icon: level.icon,
      count: raw.stats?.byLevel?.[level.id] || 0,
      expanded: level.id === 'GLOBAL',
      variant: 'default',
      items: (raw.credentials?.[level.id] || []).map((c: any) => ({
        id: c.key,
        label: c.providerName,
        sublabel: c.preview,
        icon: c.providerIcon,
        badge: c.identifier || undefined,
        selected: false,
        metadata: { provider: c.provider, level: c.level, key: c.key }
      }))
    }));

    const stats: StatItem[] = [
      { label: 'Total', value: raw.stats?.total || 0, icon: '🔑' }
    ];

    return {
      groups,
      selection: { mode: 'single', value: null },
      stats,
      raw
    };
  }

  /**
   * Transforma datos de prompt-manager/ui/state
   */
  function adaptPromptManager(raw: any): NormalizedData {
    const groups: Group[] = (raw.slotTypes || []).map((slot: any) => ({
      id: slot.id,
      label: slot.name,
      icon: slot.icon,
      count: slot.count || 0,
      expanded: slot.count > 0,
      variant: 'default',
      items: (raw.promptsBySlot?.[slot.id] || []).map((p: any) => ({
        id: p.id,
        label: p.title || p.name,
        sublabel: p.description,
        badge: p.level === 'PROJECT' ? 'Proyecto' : undefined,
        badgeVariant: p.level === 'PROJECT' ? 'info' : undefined,
        selected: false,
        metadata: { slotType: slot.id, tags: p.tags, level: p.level }
      }))
    }));

    const stats: StatItem[] = [
      { label: 'Prompts', value: raw.stats?.total_prompts || 0, icon: '📝' },
      { label: 'Presets', value: raw.stats?.total_presets || 0, icon: '📦' }
    ];

    return {
      groups,
      selection: { mode: 'multiple', value: [] },
      stats,
      raw
    };
  }

  /**
   * Transforma datos de conversation-manager/ui/state
   */
  function adaptConversationManager(raw: any): NormalizedData {
    const sectionIcons: Record<string, string> = {
      today: '📅',
      yesterday: '📆',
      this_week: '🗓️',
      this_month: '📆',
      older: '📁'
    };

    const groups: Group[] = (raw.sections || []).map((section: any) => ({
      id: section.id,
      label: section.label,
      icon: sectionIcons[section.id] || '📁',
      count: section.conversations?.length || 0,
      expanded: section.id === 'today',
      variant: 'default',
      items: (section.conversations || []).map((c: any) => ({
        id: c.id,
        label: c.displayTitle || c.title,
        sublabel: c.subtitle,
        icon: c.icon,
        badge: c.isRecent ? 'Nuevo' : undefined,
        badgeVariant: 'success',
        selected: false,
        metadata: {
          messageCount: c.message_count,
          model: c.model,
          provider: c.provider
        }
      }))
    }));

    const stats: StatItem[] = raw.stats ? [
      { label: 'Total', value: raw.stats.total_conversations, icon: '💬' },
      { label: 'Mensajes', value: raw.stats.total_messages, icon: '📨' },
      { label: 'Hoy', value: raw.stats.active_today, icon: '🔥' }
    ] : [];

    return {
      groups,
      selection: { mode: 'single', value: null },
      stats,
      raw
    };
  }

  /**
   * Selecciona el adaptador según el módulo
   */
  function adaptData(rawData: any): NormalizedData {
    switch (module) {
      case 'ai-gateway':
        return adaptAIGateway(rawData);
      case 'credential-manager':
        return adaptCredentialManager(rawData);
      case 'prompt-manager':
        return adaptPromptManager(rawData);
      case 'conversation-manager':
        return adaptConversationManager(rawData);
      default:
        throw new Error(`Módulo no soportado: ${module}`);
    }
  }

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  async function loadUIState(): Promise<void> {
    if (!moduleConfig) return;

    loading = true;
    error = null;

    try {
      const url = new URL(`${config.apiUrl}${moduleConfig.endpoint}`);
      if (projectId) {
        url.searchParams.set('project_id', projectId);
      }

      const response = await fetch(url.toString());

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({}));
        throw new Error(errorData.error || `Error ${response.status}`);
      }

      const rawData = await response.json();
      data = adaptData(rawData);

      // Sincronizar selección con selectedValue prop
      if (selectedValue !== null) {
        syncSelectionFromProp();
      }

    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
      console.error(`[SelectorPanel] Error loading ${module}:`, err);
    } finally {
      loading = false;
    }
  }

  /**
   * Sincroniza el estado de selección desde la prop selectedValue
   */
  function syncSelectionFromProp(): void {
    if (!data) return;

    const selectedIds = Array.isArray(selectedValue) ? selectedValue : (selectedValue ? [selectedValue] : []);

    data.groups = data.groups.map(group => ({
      ...group,
      items: group.items.map(item => ({
        ...item,
        selected: selectedIds.includes(item.id)
      }))
    }));
  }

  /**
   * Recarga con debounce para evitar llamadas excesivas
   */
  function reloadDebounced(): void {
    if (debounceTimeout) {
      clearTimeout(debounceTimeout);
    }
    debounceTimeout = setTimeout(() => {
      loadUIState();
    }, 300);
  }

  // ============================================================================
  // SELECTION HANDLING
  // ============================================================================

  function updateItemSelection(itemId: string, selected: boolean): void {
    if (!data) return;

    data.groups = data.groups.map(group => ({
      ...group,
      items: group.items.map(item => {
        if (data!.selection.mode === 'single') {
          // En modo single, deseleccionar todos excepto el actual
          return {
            ...item,
            selected: item.id === itemId ? selected : false
          };
        } else {
          // En modo multiple, toggle individual
          return item.id === itemId ? { ...item, selected } : item;
        }
      })
    }));

    // Actualizar valor de selección
    if (data.selection.mode === 'single') {
      selectedValue = selected ? itemId : null;
    } else {
      const selectedItems = data.groups
        .flatMap(g => g.items)
        .filter(i => i.selected)
        .map(i => i.id);
      selectedValue = selectedItems;
    }
  }

  function handleItemSelect(item: GroupItem): void {
    if (item.disabled) return;

    const newSelected = data?.selection.mode === 'single' ? true : !item.selected;
    updateItemSelection(item.id, newSelected);

    dispatch('select', {
      itemId: item.id,
      item,
      metadata: item.metadata
    });
  }

  // ============================================================================
  // GESTURE HANDLERS
  // ============================================================================

  function handleTouchStart(item: GroupItem): void {
    if (item.disabled) return;

    activeItemId = item.id;
    isLongPress = false;

    // Iniciar timer de long press
    longPressTimeout = setTimeout(() => {
      isLongPress = true;
      handleLongPress(item);
    }, GESTURE_CONFIG.longPressDuration);
  }

  function handleTouchEnd(item: GroupItem): void {
    if (item.disabled || isLongPress) {
      resetGestureState();
      return;
    }

    clearTimers();
    tapCount++;

    if (tapCount === 1) {
      // Esperar posible double tap
      tapTimeout = setTimeout(() => {
        if (tapCount === 1) {
          handleSingleTap(item);
        }
        tapCount = 0;
      }, GESTURE_CONFIG.tapDelay);
    } else if (tapCount === 2) {
      // Double tap detectado
      clearTimers();
      tapCount = 0;
      handleDoubleTap(item);
    }
  }

  function handleTouchCancel(): void {
    resetGestureState();
  }

  function handleSingleTap(item: GroupItem): void {
    handleItemSelect(item);
  }

  function handleDoubleTap(item: GroupItem): void {
    dispatch('edit', { itemId: item.id, item });
  }

  function handleLongPress(item: GroupItem): void {
    // Haptic feedback si disponible
    if ('vibrate' in navigator) {
      navigator.vibrate(50);
    }

    dispatch('edit', { itemId: item.id, item });
  }

  // ============================================================================
  // GROUP HANDLERS
  // ============================================================================

  function toggleGroup(groupId: string): void {
    if (!data) return;

    data.groups = data.groups.map(g =>
      g.id === groupId ? { ...g, expanded: !g.expanded } : g
    );
  }

  // ============================================================================
  // PANEL ACTIONS
  // ============================================================================

  function handleClose(): void {
    resetGestureState();
    open = false;
    dispatch('close');
  }

  function handleCreate(groupId?: string): void {
    dispatch('create', { groupId });
  }

  function handleDelete(item: GroupItem, event: MouseEvent): void {
    event.stopPropagation();
    dispatch('delete', { itemId: item.id });
  }

  function handleBackdropClick(event: MouseEvent): void {
    if (event.target === event.currentTarget) {
      handleClose();
    }
  }

  // ============================================================================
  // KEYBOARD NAVIGATION
  // ============================================================================

  function handleKeydown(event: KeyboardEvent): void {
    if (!open) return;

    switch (event.key) {
      case 'Escape':
        handleClose();
        break;
    }
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onMount(() => {
    window.addEventListener('keydown', handleKeydown);
  });

  onDestroy(() => {
    clearTimers();
    window.removeEventListener('keydown', handleKeydown);
  });

  // Reactive: cargar datos cuando se abre el panel
  $: if (open && !data && !loading) {
    loadUIState();
  }

  // Reactive: recargar cuando cambia el proyecto
  $: if (projectId && open && data) {
    reloadDebounced();
  }
</script>

{#if open}
  <!-- svelte-ignore a11y_click_events_have_key_events a11y_no_static_element_interactions -->
  <div
    class="selector-backdrop"
    on:click={handleBackdropClick}
    transition:fade={{ duration: 150 }}
  >
    <div
      class="selector-panel {className}"
      style="--panel-height: {panelHeight}"
      bind:this={panelElement}
      role="dialog"
      aria-modal="true"
      aria-label={panelTitle}
      transition:slide={{ duration: 250, easing: backOut }}
    >
      <!-- Header -->
      <header class="panel-header">
        <div class="header-left">
          <span class="header-icon">{moduleConfig.icon}</span>
          <h2 class="header-title">{panelTitle}</h2>
        </div>
        <button
          class="header-close"
          on:click={handleClose}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </header>

      <!-- Stats Bar -->
      {#if displayStats && data?.stats}
        <div class="stats-bar" transition:fade={{ duration: 150 }}>
          {#each data.stats as stat}
            <div class="stat-item">
              <span class="stat-icon">{stat.icon}</span>
              <span class="stat-value">{stat.value}</span>
              <span class="stat-label">{stat.label}</span>
            </div>
          {/each}
        </div>
      {/if}

      <!-- Content -->
      <div class="panel-content">
        <!-- Loading State -->
        {#if loading}
          <div class="state-container">
            <div class="spinner" />
            <span class="state-text">Cargando...</span>
          </div>

        <!-- Error State -->
        {:else if error}
          <div class="state-container state-error">
            <span class="state-icon">⚠️</span>
            <p class="state-text">{error}</p>
            <button class="state-button" on:click={() => loadUIState()}>
              Reintentar
            </button>
          </div>

        <!-- Empty State -->
        {:else if isEmpty}
          <div class="state-container">
            <span class="state-icon large">{moduleConfig.emptyIcon}</span>
            <p class="state-text">{moduleConfig.emptyMessage}</p>
            {#if allowCreate}
              <button class="state-button primary" on:click={() => handleCreate()}>
                + {moduleConfig.createLabel}
              </button>
            {/if}
          </div>

        <!-- Groups & Items -->
        {:else if data}
          <div class="groups-container">
            {#each data.groups as group (group.id)}
              {#if group.count > 0}
                <div
                  class="group"
                  class:expanded={group.expanded}
                  class:variant-warning={group.variant === 'warning'}
                >
                  <!-- Group Header -->
                  <button
                    class="group-header"
                    on:click={() => toggleGroup(group.id)}
                    aria-expanded={group.expanded}
                  >
                    <span class="group-icon">{group.icon}</span>
                    <span class="group-label">{group.label}</span>
                    <span class="group-count">{group.count}</span>
                    <span class="group-chevron">{group.expanded ? '▼' : '▶'}</span>
                  </button>

                  <!-- Group Items -->
                  {#if group.expanded}
                    <div
                      class="group-items"
                      role="listbox"
                      aria-label="{group.label}"
                      transition:slide={{ duration: 200, easing: cubicOut }}
                    >
                      {#each group.items as item (item.id)}
                        <button
                          class="item"
                          class:selected={item.selected}
                          class:disabled={item.disabled}
                          class:active={activeItemId === item.id && !isLongPress}
                          role="option"
                          aria-selected={item.selected}
                          disabled={item.disabled}
                          on:touchstart={() => handleTouchStart(item)}
                          on:touchend={() => handleTouchEnd(item)}
                          on:touchcancel={handleTouchCancel}
                          on:click={() => handleSingleTap(item)}
                          on:dblclick={() => handleDoubleTap(item)}
                        >
                          {#if item.icon}
                            <span class="item-icon">{item.icon}</span>
                          {/if}

                          <div class="item-content">
                            <span class="item-label">{item.label}</span>
                            {#if item.sublabel}
                              <span class="item-sublabel">{item.sublabel}</span>
                            {/if}
                          </div>

                          <div class="item-end">
                            {#if item.badge}
                              <span
                                class="item-badge"
                                class:badge-success={item.badgeVariant === 'success'}
                                class:badge-warning={item.badgeVariant === 'warning'}
                                class:badge-danger={item.badgeVariant === 'danger'}
                                class:badge-info={item.badgeVariant === 'info'}
                              >
                                {item.badge}
                              </span>
                            {/if}

                            {#if item.selected}
                              <span class="item-check" transition:scale={{ duration: 150 }}>✓</span>
                            {/if}

                            {#if panelMode === 'manage' && !item.disabled}
                              <button
                                class="item-delete"
                                on:click={(e) => handleDelete(item, e)}
                                aria-label="Eliminar"
                              >
                                🗑️
                              </button>
                            {/if}
                          </div>
                        </button>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}
            {/each}
          </div>
        {/if}
      </div>

      <!-- Footer -->
      {#if showCreateButton && !isEmpty && !loading}
        <footer class="panel-footer">
          <button class="footer-button" on:click={() => handleCreate()}>
            + {moduleConfig.createLabel}
          </button>
        </footer>
      {/if}
    </div>
  </div>
{/if}

<style>
  /* ============================================================================
   * CSS VARIABLES
   * ============================================================================ */
  .selector-panel {
    --panel-bg: var(--color-bg-card, #1a1a2e);
    --panel-bg-alt: var(--color-bg-surface, #16162a);
    --panel-border: var(--color-border, #2d2d44);
    --panel-text: var(--color-text, #e0e0e0);
    --panel-text-muted: var(--color-text-muted, #888);
    --panel-primary: var(--color-primary, #6366f1);
    --panel-primary-light: rgba(99, 102, 241, 0.15);
    --panel-success: var(--color-success, #22c55e);
    --panel-warning: var(--color-warning, #f59e0b);
    --panel-danger: var(--color-danger, #ef4444);
    --panel-info: var(--color-info, #3b82f6);
    --panel-radius: 1rem;
  }

  /* ============================================================================
   * BACKDROP
   * ============================================================================ */
  .selector-backdrop {
    position: fixed;
    inset: 0;
    z-index: var(--z-modal, 50);
    display: flex;
    flex-direction: column;
    justify-content: flex-end;
    background: rgba(0, 0, 0, 0.5);
    backdrop-filter: blur(2px);
  }

  /* ============================================================================
   * PANEL
   * ============================================================================ */
  .selector-panel {
    display: flex;
    flex-direction: column;
    height: var(--panel-height, 40vh);
    max-height: 90vh;
    background: var(--panel-bg);
    border-radius: var(--panel-radius) var(--panel-radius) 0 0;
    overflow: hidden;
    box-shadow: 0 -4px 32px rgba(0, 0, 0, 0.3);
  }

  /* ============================================================================
   * HEADER
   * ============================================================================ */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 1rem 1rem 0.75rem;
    border-bottom: 1px solid var(--panel-border);
    flex-shrink: 0;
  }

  .header-left {
    display: flex;
    align-items: center;
    gap: 0.5rem;
  }

  .header-icon {
    font-size: 1.25rem;
  }

  .header-title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
    color: var(--panel-text);
  }

  .header-close {
    width: 2rem;
    height: 2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 50%;
    color: var(--panel-text-muted);
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .header-close:hover {
    background: var(--panel-border);
    color: var(--panel-text);
  }

  /* ============================================================================
   * STATS BAR
   * ============================================================================ */
  .stats-bar {
    display: flex;
    gap: 1rem;
    padding: 0.625rem 1rem;
    background: var(--panel-bg-alt);
    border-bottom: 1px solid var(--panel-border);
    overflow-x: auto;
    flex-shrink: 0;
  }

  .stat-item {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    white-space: nowrap;
  }

  .stat-icon {
    font-size: 0.875rem;
  }

  .stat-value {
    font-weight: 600;
    font-size: 0.875rem;
    color: var(--panel-text);
  }

  .stat-label {
    font-size: 0.75rem;
    color: var(--panel-text-muted);
  }

  /* ============================================================================
   * CONTENT
   * ============================================================================ */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    -webkit-overflow-scrolling: touch;
  }

  /* ============================================================================
   * STATE CONTAINERS
   * ============================================================================ */
  .state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2.5rem 1rem;
    gap: 0.875rem;
    text-align: center;
    color: var(--panel-text-muted);
  }

  .state-icon {
    font-size: 2rem;
    opacity: 0.7;
  }

  .state-icon.large {
    font-size: 3rem;
    opacity: 0.5;
  }

  .state-text {
    margin: 0;
    font-size: 0.875rem;
  }

  .state-error .state-text {
    color: var(--panel-danger);
  }

  .state-button {
    padding: 0.625rem 1.25rem;
    background: var(--panel-border);
    color: var(--panel-text);
    border: none;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    cursor: pointer;
    transition: background 0.15s;
  }

  .state-button:hover {
    background: var(--panel-text-muted);
  }

  .state-button.primary {
    background: var(--panel-primary);
    color: white;
  }

  .state-button.primary:hover {
    opacity: 0.9;
  }

  /* ============================================================================
   * SPINNER
   * ============================================================================ */
  .spinner {
    width: 2rem;
    height: 2rem;
    border: 2px solid var(--panel-border);
    border-top-color: var(--panel-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* ============================================================================
   * GROUPS
   * ============================================================================ */
  .groups-container {
    padding-bottom: 0.5rem;
  }

  .group {
    border-bottom: 1px solid var(--panel-border);
  }

  .group:last-child {
    border-bottom: none;
  }

  .group.variant-warning {
    background: rgba(245, 158, 11, 0.05);
  }

  .group-header {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1rem;
    background: transparent;
    border: none;
    color: var(--panel-text);
    cursor: pointer;
    gap: 0.625rem;
    text-align: left;
    transition: background 0.15s;
  }

  .group-header:hover {
    background: rgba(255, 255, 255, 0.03);
  }

  .group-icon {
    font-size: 1.125rem;
  }

  .group-label {
    flex: 1;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .group-count {
    font-size: 0.75rem;
    padding: 0.125rem 0.5rem;
    background: var(--panel-border);
    border-radius: 1rem;
    color: var(--panel-text-muted);
  }

  .group-chevron {
    font-size: 0.625rem;
    color: var(--panel-text-muted);
    transition: transform 0.2s;
  }

  /* ============================================================================
   * GROUP ITEMS
   * ============================================================================ */
  .group-items {
    background: rgba(0, 0, 0, 0.15);
  }

  /* ============================================================================
   * ITEMS
   * ============================================================================ */
  .item {
    display: flex;
    align-items: center;
    width: 100%;
    padding: 0.75rem 1rem 0.75rem 2.25rem;
    background: transparent;
    border: none;
    color: var(--panel-text);
    cursor: pointer;
    gap: 0.625rem;
    text-align: left;
    transition: background 0.15s;
    position: relative;
  }

  .item:hover:not(.disabled) {
    background: rgba(255, 255, 255, 0.03);
  }

  .item.selected {
    background: var(--panel-primary-light);
  }

  .item.active {
    background: rgba(99, 102, 241, 0.25);
  }

  .item.disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .item-icon {
    font-size: 1rem;
    flex-shrink: 0;
  }

  .item-content {
    flex: 1;
    min-width: 0;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .item-label {
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-sublabel {
    font-size: 0.75rem;
    color: var(--panel-text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .item-end {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    flex-shrink: 0;
  }

  /* ============================================================================
   * BADGES
   * ============================================================================ */
  .item-badge {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    border-radius: 0.25rem;
    background: var(--panel-border);
    color: var(--panel-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.025em;
  }

  .item-badge.badge-success {
    background: rgba(34, 197, 94, 0.2);
    color: var(--panel-success);
  }

  .item-badge.badge-warning {
    background: rgba(245, 158, 11, 0.2);
    color: var(--panel-warning);
  }

  .item-badge.badge-danger {
    background: rgba(239, 68, 68, 0.2);
    color: var(--panel-danger);
  }

  .item-badge.badge-info {
    background: rgba(59, 130, 246, 0.2);
    color: var(--panel-info);
  }

  /* ============================================================================
   * CHECK & DELETE
   * ============================================================================ */
  .item-check {
    color: var(--panel-primary);
    font-weight: bold;
    font-size: 0.875rem;
  }

  .item-delete {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.4;
    transition: opacity 0.15s;
    font-size: 0.875rem;
  }

  .item-delete:hover {
    opacity: 1;
  }

  /* ============================================================================
   * FOOTER
   * ============================================================================ */
  .panel-footer {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--panel-border);
    flex-shrink: 0;
  }

  .footer-button {
    width: 100%;
    padding: 0.75rem;
    background: var(--panel-primary);
    color: white;
    border: none;
    border-radius: 0.5rem;
    font-weight: 500;
    font-size: 0.875rem;
    cursor: pointer;
    transition: opacity 0.15s;
  }

  .footer-button:hover {
    opacity: 0.9;
  }

  .footer-button:active {
    transform: scale(0.99);
  }

  /* ============================================================================
   * RESPONSIVE
   * ============================================================================ */
  @media (max-width: 480px) {
    .panel-header {
      padding: 0.875rem 0.875rem 0.625rem;
    }

    .stats-bar {
      padding: 0.5rem 0.875rem;
    }

    .group-header {
      padding: 0.625rem 0.875rem;
    }

    .item {
      padding: 0.625rem 0.875rem 0.625rem 1.75rem;
    }
  }

  /* ============================================================================
   * TOUCH FEEDBACK
   * ============================================================================ */
  @media (hover: none) {
    .item:active:not(.disabled) {
      background: rgba(99, 102, 241, 0.2);
    }

    .group-header:active {
      background: rgba(255, 255, 255, 0.05);
    }
  }
</style>
