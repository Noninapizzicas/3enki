<script lang="ts">
  /**
   * PromptsPanel - Sistema avanzado de prompts con Composer
   *
   * Arquitectura:
   * - 1 panel = 1 clic (sin navegación a otros paneles)
   * - Datos via MQTT (no REST /ui/state)
   * - CSS variables con fallbacks
   *
   * Tabs:
   * - Composer: Armar prompt final desde slots
   * - Librería: Ver/buscar todos los prompts
   * - Editor: Crear/editar prompt
   * - Presets: Guardar/aplicar combinaciones
   */

  import { onMount, onDestroy } from 'svelte';
  import {
    promptsStore,
    initPrompts,
    loadPrompts,
    createPrompt,
    updatePrompt,
    deletePrompt,
    getPromptVersions,
    loadPresets,
    createPreset,
    applyPreset,
    deletePreset,
    addToComposer,
    removeFromComposer,
    clearComposer,
    setComposerVariable,
    renderComposer,
    selectPrompt,
    setActiveTab,
    selectedPrompt,
    composerState,
    detectedVariables,
    isComposerEmpty,
    SLOT_TYPES,
    SLOT_ICONS,
    SLOT_NAMES,
    type Prompt,
    type SlotType,
    type ComposerSlot,
    type PromptVariable
  } from '$lib/stores/prompts';
  import { closePanel } from '$lib/stores/ui';

  export let panelId: string;

  // ==========================================================================
  // STATE
  // ==========================================================================

  let cleanup: (() => void) | null = null;

  // Form state for Editor
  let editorForm = {
    id: null as string | null,
    name: '',
    title: '',
    description: '',
    content: '',
    slot_type: 'system' as SlotType,
    tags: [] as string[],
    tagInput: ''
  };

  // Preset form
  let presetForm = {
    name: '',
    description: ''
  };

  // Preview
  let previewResult: {
    finalPrompt: string;
    estimatedTokens: number;
    parts: Array<{ slot_type: SlotType; prompt_name: string; content: string }>;
  } | null = null;

  // Versions
  let versions: Array<{ version: string; content: string; created_at: string }> = [];
  let showVersions = false;

  // UI state
  let saving = false;
  let deleting = false;
  let searchQuery = '';
  let filterSlot: SlotType | 'all' = 'all';
  let showPreview = false;
  let expandedSlots: Record<SlotType, boolean> = {
    system: true,
    context: true,
    prefix: false,
    suffix: false,
    format: false
  };

  // ==========================================================================
  // COMPUTED
  // ==========================================================================

  $: activeTab = $promptsStore.activeTab;
  $: prompts = $promptsStore.prompts;
  $: promptsBySlot = $promptsStore.promptsBySlot;
  $: slotTypes = $promptsStore.slotTypes;
  $: presets = $promptsStore.presets;
  $: loading = $promptsStore.loading;
  $: stats = $promptsStore.stats;
  $: selected = $selectedPrompt;
  $: composer = $composerState;
  $: variables = $detectedVariables;
  $: composerEmpty = $isComposerEmpty;

  // Filtered prompts for library
  $: filteredPrompts = prompts.filter(p => {
    if (filterSlot !== 'all' && p.slot_type !== filterSlot) return false;
    if (searchQuery) {
      const q = searchQuery.toLowerCase();
      return p.name.toLowerCase().includes(q) ||
             p.title.toLowerCase().includes(q) ||
             p.description?.toLowerCase().includes(q);
    }
    return true;
  });

  // ==========================================================================
  // LIFECYCLE
  // ==========================================================================

  onMount(() => {
    cleanup = initPrompts();
  });

  onDestroy(() => {
    cleanup?.();
  });

  // ==========================================================================
  // HANDLERS - TABS
  // ==========================================================================

  function handleTabChange(tab: typeof activeTab) {
    setActiveTab(tab);
    // Reset editor when switching away
    if (tab !== 'editor') {
      resetEditorForm();
    }
  }

  // ==========================================================================
  // HANDLERS - COMPOSER
  // ==========================================================================

  function handleAddToComposer(prompt: Prompt) {
    addToComposer(prompt);
  }

  function handleRemoveFromComposer(promptId: string) {
    removeFromComposer(promptId);
  }

  function handleClearComposer() {
    clearComposer();
    previewResult = null;
  }

  function handleVariableChange(name: string, value: string) {
    setComposerVariable(name, value);
  }

  async function handlePreview() {
    const result = await renderComposer();
    if (result) {
      previewResult = result;
      showPreview = true;
    }
  }

  function toggleSlot(slot: SlotType) {
    expandedSlots[slot] = !expandedSlots[slot];
  }

  // ==========================================================================
  // HANDLERS - LIBRARY
  // ==========================================================================

  function handleSelectPrompt(prompt: Prompt) {
    selectPrompt(prompt.id);
  }

  function handleEditPrompt(prompt: Prompt) {
    editorForm = {
      id: prompt.id,
      name: prompt.name,
      title: prompt.title,
      description: prompt.description || '',
      content: prompt.content,
      slot_type: prompt.slot_type,
      tags: prompt.tags || [],
      tagInput: ''
    };
    setActiveTab('editor');
  }

  async function handleViewVersions(promptId: string) {
    const result = await getPromptVersions(promptId);
    if (result) {
      versions = result.versions;
      showVersions = true;
    }
  }

  // ==========================================================================
  // HANDLERS - EDITOR
  // ==========================================================================

  function resetEditorForm() {
    editorForm = {
      id: null,
      name: '',
      title: '',
      description: '',
      content: '',
      slot_type: 'system',
      tags: [],
      tagInput: ''
    };
    versions = [];
    showVersions = false;
  }

  function handleNewPrompt() {
    resetEditorForm();
    setActiveTab('editor');
  }

  function addTag() {
    const tag = editorForm.tagInput.trim().toLowerCase().replace(/[^a-z0-9-]/g, '');
    if (tag && !editorForm.tags.includes(tag)) {
      editorForm.tags = [...editorForm.tags, tag];
    }
    editorForm.tagInput = '';
  }

  function removeTag(tag: string) {
    editorForm.tags = editorForm.tags.filter(t => t !== tag);
  }

  async function handleSavePrompt() {
    if (!editorForm.name || !editorForm.content || saving) return;

    saving = true;

    try {
      if (editorForm.id) {
        // Update
        await updatePrompt(editorForm.id, {
          title: editorForm.title,
          description: editorForm.description,
          content: editorForm.content,
          slot_type: editorForm.slot_type,
          tags: editorForm.tags
        });
      } else {
        // Create
        await createPrompt({
          name: editorForm.name,
          title: editorForm.title || editorForm.name,
          description: editorForm.description,
          content: editorForm.content,
          slot_type: editorForm.slot_type,
          tags: editorForm.tags
        });
      }

      resetEditorForm();
      setActiveTab('library');
    } finally {
      saving = false;
    }
  }

  async function handleDeletePrompt() {
    if (!editorForm.id || deleting) return;

    if (!confirm('¿Eliminar este prompt?')) return;

    deleting = true;
    try {
      await deletePrompt(editorForm.id);
      resetEditorForm();
      setActiveTab('library');
    } finally {
      deleting = false;
    }
  }

  function handleCancelEdit() {
    resetEditorForm();
    setActiveTab('library');
  }

  // ==========================================================================
  // HANDLERS - PRESETS
  // ==========================================================================

  async function handleSavePreset() {
    if (!presetForm.name || composerEmpty) return;

    await createPreset(presetForm.name, presetForm.description);
    presetForm = { name: '', description: '' };
  }

  async function handleApplyPreset(presetId: string) {
    await applyPreset(presetId);
    setActiveTab('composer');
  }

  async function handleDeletePreset(presetId: string) {
    if (!confirm('¿Eliminar este preset?')) return;
    await deletePreset(presetId);
  }

  // ==========================================================================
  // HELPERS
  // ==========================================================================

  function getSlotIcon(slot: SlotType): string {
    return SLOT_ICONS[slot] || '📝';
  }

  function getSlotName(slot: SlotType): string {
    return SLOT_NAMES[slot] || slot;
  }
</script>

<div class="prompts-panel">
  <!-- Header with tabs -->
  <div class="panel-header">
    <div class="tabs">
      <button
        class="tab"
        class:active={activeTab === 'composer'}
        on:click={() => handleTabChange('composer')}
      >
        🎯 Composer
      </button>
      <button
        class="tab"
        class:active={activeTab === 'library'}
        on:click={() => handleTabChange('library')}
      >
        📚 Librería
      </button>
      <button
        class="tab"
        class:active={activeTab === 'editor'}
        on:click={() => handleTabChange('editor')}
      >
        ✏️ Editor
      </button>
      <button
        class="tab"
        class:active={activeTab === 'presets'}
        on:click={() => handleTabChange('presets')}
      >
        🎛️ Presets
      </button>
    </div>
    <span class="stats">{stats.total} prompts</span>
  </div>

  <!-- Content -->
  <div class="panel-content">
    <!-- ================================================================== -->
    <!-- TAB: COMPOSER -->
    <!-- ================================================================== -->
    {#if activeTab === 'composer'}
      <div class="composer">
        {#if composerEmpty}
          <div class="empty">
            <span class="empty-icon">🎯</span>
            <span class="empty-title">Composer vacío</span>
            <span class="empty-text">Añade prompts desde la Librería para armar tu prompt final</span>
            <button class="btn primary" on:click={() => handleTabChange('library')}>
              📚 Ir a Librería
            </button>
          </div>
        {:else}
          <!-- Slots -->
          <div class="slots">
            {#each SLOT_TYPES as slotType}
              {@const slotPrompts = composer[slotType]}
              <div class="slot" class:empty={slotPrompts.length === 0}>
                <button class="slot-header" on:click={() => toggleSlot(slotType)}>
                  <span class="slot-icon">{getSlotIcon(slotType)}</span>
                  <span class="slot-name">{getSlotName(slotType)}</span>
                  <span class="slot-count">{slotPrompts.length}</span>
                  <span class="slot-toggle">{expandedSlots[slotType] ? '▼' : '▶'}</span>
                </button>

                {#if expandedSlots[slotType]}
                  <div class="slot-content">
                    {#if slotPrompts.length === 0}
                      <button
                        class="add-prompt-btn"
                        on:click={() => { filterSlot = slotType; handleTabChange('library'); }}
                      >
                        ＋ Añadir {getSlotName(slotType)}
                      </button>
                    {:else}
                      {#each slotPrompts as prompt (prompt.id)}
                        <div class="composer-prompt">
                          <div class="prompt-info">
                            <span class="prompt-name">{prompt.title || prompt.name}</span>
                            <span class="prompt-preview">{prompt.content.slice(0, 60)}...</span>
                          </div>
                          <button
                            class="remove-btn"
                            on:click={() => handleRemoveFromComposer(prompt.id)}
                            title="Quitar"
                          >
                            ❌
                          </button>
                        </div>
                      {/each}
                      <button
                        class="add-more-btn"
                        on:click={() => { filterSlot = slotType; handleTabChange('library'); }}
                      >
                        ＋
                      </button>
                    {/if}
                  </div>
                {/if}
              </div>
            {/each}
          </div>

          <!-- Variables -->
          {#if variables.length > 0}
            <div class="variables-section">
              <h4>Variables detectadas</h4>
              <div class="variables-grid">
                {#each variables as varName}
                  <div class="variable-field">
                    <label>{varName}</label>
                    <input
                      type="text"
                      placeholder="Valor..."
                      value={$promptsStore.composerVariables[varName] || ''}
                      on:input={(e) => handleVariableChange(varName, e.currentTarget.value)}
                    />
                  </div>
                {/each}
              </div>
            </div>
          {/if}

          <!-- Actions -->
          <div class="composer-actions">
            <button class="btn secondary" on:click={handleClearComposer}>
              🗑️ Limpiar
            </button>
            <button class="btn secondary" on:click={() => handleTabChange('presets')}>
              💾 Guardar Preset
            </button>
            <button class="btn primary" on:click={handlePreview}>
              👁️ Preview
            </button>
          </div>

          <!-- Preview Modal -->
          {#if showPreview && previewResult}
            <div class="preview-overlay" on:click={() => showPreview = false}>
              <div class="preview-modal" on:click|stopPropagation>
                <div class="preview-header">
                  <h3>Preview del Prompt Final</h3>
                  <span class="token-count">~{previewResult.estimatedTokens} tokens</span>
                  <button class="close-btn" on:click={() => showPreview = false}>✕</button>
                </div>
                <div class="preview-content">
                  <pre>{previewResult.finalPrompt}</pre>
                </div>
                <div class="preview-parts">
                  {#each previewResult.parts as part}
                    <div class="preview-part">
                      <span class="part-slot">{getSlotIcon(part.slot_type)} {part.prompt_name}</span>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          {/if}
        {/if}
      </div>

    <!-- ================================================================== -->
    <!-- TAB: LIBRARY -->
    <!-- ================================================================== -->
    {:else if activeTab === 'library'}
      <div class="library">
        <!-- Search & Filter -->
        <div class="library-header">
          <input
            type="text"
            class="search-input"
            placeholder="🔍 Buscar prompts..."
            bind:value={searchQuery}
          />
          <select class="filter-select" bind:value={filterSlot}>
            <option value="all">Todos</option>
            {#each SLOT_TYPES as slot}
              <option value={slot}>{getSlotIcon(slot)} {getSlotName(slot)}</option>
            {/each}
          </select>
          <button class="btn primary small" on:click={handleNewPrompt}>
            ＋ Nuevo
          </button>
        </div>

        <!-- Prompts List -->
        {#if loading}
          <div class="loading">
            <span class="loading-icon">⏳</span>
            <span>Cargando...</span>
          </div>
        {:else if filteredPrompts.length === 0}
          <div class="empty">
            <span class="empty-icon">📚</span>
            <span class="empty-title">Sin prompts</span>
            <span class="empty-text">
              {searchQuery ? 'No hay resultados para tu búsqueda' : 'Crea tu primer prompt'}
            </span>
            {#if !searchQuery}
              <button class="btn primary" on:click={handleNewPrompt}>
                ＋ Crear prompt
              </button>
            {/if}
          </div>
        {:else}
          <div class="prompts-list">
            {#each filteredPrompts as prompt (prompt.id)}
              <div class="prompt-card" class:selected={selected?.id === prompt.id}>
                <div class="prompt-main" on:click={() => handleSelectPrompt(prompt)}>
                  <div class="prompt-header-row">
                    <span class="prompt-slot">{prompt.slot_icon}</span>
                    <span class="prompt-title">{prompt.title || prompt.name}</span>
                    <span class="prompt-level">{prompt.level_icon}</span>
                  </div>
                  <div class="prompt-description">{prompt.description || 'Sin descripción'}</div>
                  <div class="prompt-meta">
                    <span class="prompt-version">v{prompt.current_version}</span>
                    {#each (prompt.tags || []).slice(0, 3) as tag}
                      <span class="prompt-tag">#{tag}</span>
                    {/each}
                  </div>
                </div>
                <div class="prompt-actions">
                  <button
                    class="action-btn"
                    on:click|stopPropagation={() => handleAddToComposer(prompt)}
                    title="Añadir al Composer"
                  >
                    ➕
                  </button>
                  <button
                    class="action-btn"
                    on:click|stopPropagation={() => handleEditPrompt(prompt)}
                    title="Editar"
                  >
                    ✏️
                  </button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>

    <!-- ================================================================== -->
    <!-- TAB: EDITOR -->
    <!-- ================================================================== -->
    {:else if activeTab === 'editor'}
      <div class="editor">
        <div class="form">
          <!-- Name (solo para nuevo) -->
          {#if !editorForm.id}
            <div class="field">
              <label class="label">Nombre* (kebab-case)</label>
              <input
                type="text"
                class="input"
                placeholder="mi-prompt-genial"
                bind:value={editorForm.name}
                pattern="^[a-z0-9-]+$"
              />
            </div>
          {/if}

          <!-- Title -->
          <div class="field">
            <label class="label">Título</label>
            <input
              type="text"
              class="input"
              placeholder="Mi Prompt Genial"
              bind:value={editorForm.title}
            />
          </div>

          <!-- Slot Type -->
          <div class="field">
            <label class="label">Tipo de Slot</label>
            <div class="slot-types-grid">
              {#each SLOT_TYPES as slot}
                <button
                  type="button"
                  class="slot-type-btn"
                  class:active={editorForm.slot_type === slot}
                  on:click={() => editorForm.slot_type = slot}
                >
                  <span>{getSlotIcon(slot)}</span>
                  <span>{getSlotName(slot)}</span>
                </button>
              {/each}
            </div>
          </div>

          <!-- Description -->
          <div class="field">
            <label class="label">Descripción</label>
            <input
              type="text"
              class="input"
              placeholder="¿Qué hace este prompt?"
              bind:value={editorForm.description}
            />
          </div>

          <!-- Content -->
          <div class="field">
            <label class="label">Contenido* (usa {"{{variable}}"} para variables)</label>
            <textarea
              class="textarea"
              rows="10"
              placeholder="Escribe tu prompt aquí...

Puedes usar variables como {{nombre}} o {{contexto}}"
              bind:value={editorForm.content}
            ></textarea>
          </div>

          <!-- Tags -->
          <div class="field">
            <label class="label">Tags</label>
            <div class="tags-input">
              <div class="tags-list">
                {#each editorForm.tags as tag}
                  <span class="tag">
                    #{tag}
                    <button class="tag-remove" on:click={() => removeTag(tag)}>×</button>
                  </span>
                {/each}
              </div>
              <input
                type="text"
                class="input tag-input"
                placeholder="Añadir tag..."
                bind:value={editorForm.tagInput}
                on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addTag())}
              />
            </div>
          </div>

          <!-- Versions (solo si editando) -->
          {#if editorForm.id}
            <button
              class="btn secondary small"
              on:click={() => editorForm.id && handleViewVersions(editorForm.id)}
            >
              📜 Ver versiones
            </button>

            {#if showVersions && versions.length > 0}
              <div class="versions-list">
                {#each versions as v}
                  <div class="version-item">
                    <span class="version-number">v{v.version}</span>
                    <span class="version-date">{new Date(v.created_at).toLocaleDateString()}</span>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}

          <!-- Actions -->
          <div class="actions">
            {#if editorForm.id}
              <button
                class="btn danger"
                on:click={handleDeletePrompt}
                disabled={deleting || saving}
              >
                {deleting ? '⏳' : '🗑️'}
              </button>
            {/if}
            <button class="btn secondary" on:click={handleCancelEdit} disabled={saving}>
              Cancelar
            </button>
            <button
              class="btn primary"
              on:click={handleSavePrompt}
              disabled={!editorForm.name || !editorForm.content || saving}
            >
              {saving ? '⏳ Guardando...' : '💾 Guardar'}
            </button>
          </div>
        </div>
      </div>

    <!-- ================================================================== -->
    <!-- TAB: PRESETS -->
    <!-- ================================================================== -->
    {:else if activeTab === 'presets'}
      <div class="presets">
        <!-- Save current composer as preset -->
        {#if !composerEmpty}
          <div class="save-preset-form">
            <h4>Guardar Composer actual como Preset</h4>
            <div class="field">
              <input
                type="text"
                class="input"
                placeholder="Nombre del preset"
                bind:value={presetForm.name}
              />
            </div>
            <div class="field">
              <input
                type="text"
                class="input"
                placeholder="Descripción (opcional)"
                bind:value={presetForm.description}
              />
            </div>
            <button
              class="btn primary"
              on:click={handleSavePreset}
              disabled={!presetForm.name}
            >
              💾 Guardar Preset
            </button>
          </div>
        {/if}

        <!-- Presets list -->
        <h4>Presets guardados</h4>
        {#if presets.length === 0}
          <div class="empty small">
            <span class="empty-icon">🎛️</span>
            <span class="empty-text">No hay presets guardados</span>
          </div>
        {:else}
          <div class="presets-list">
            {#each presets as preset (preset.id)}
              <div class="preset-card">
                <div class="preset-info">
                  <span class="preset-name">{preset.name}</span>
                  {#if preset.description}
                    <span class="preset-description">{preset.description}</span>
                  {/if}
                </div>
                <div class="preset-actions">
                  <button
                    class="btn primary small"
                    on:click={() => handleApplyPreset(preset.id)}
                  >
                    Aplicar
                  </button>
                  <button
                    class="btn danger small"
                    on:click={() => handleDeletePreset(preset.id)}
                  >
                    🗑️
                  </button>
                </div>
              </div>
            {/each}
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
  .prompts-panel {
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
     Header & Tabs
     ========================================================================== */
  .panel-header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.5rem;
    border-bottom: 1px solid var(--_border);
    flex-shrink: 0;
  }

  .tabs {
    display: flex;
    gap: 0.25rem;
    flex-wrap: wrap;
  }

  .tab {
    padding: 0.375rem 0.5rem;
    background: transparent;
    border: none;
    border-radius: var(--_radius);
    color: var(--_text-muted);
    font-size: 0.75rem;
    cursor: pointer;
    transition: all 0.15s;
    white-space: nowrap;
  }

  .tab:hover:not(:disabled) {
    background: var(--_bg-surface);
    color: var(--_text);
  }

  .tab.active {
    background: var(--_primary);
    color: white;
  }

  .stats {
    font-size: 0.75rem;
    color: var(--_text-muted);
  }

  /* ==========================================================================
     Content
     ========================================================================== */
  .panel-content {
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

  .empty.small {
    padding: 1rem;
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
    font-size: 2.5rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 1rem;
    font-weight: 600;
    color: var(--_text);
  }

  .empty-text {
    font-size: 0.875rem;
    color: var(--_text-muted);
  }

  /* ==========================================================================
     Composer
     ========================================================================== */
  .composer {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .slots {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .slot {
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    overflow: hidden;
  }

  .slot.empty {
    opacity: 0.6;
  }

  .slot-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    width: 100%;
    padding: 0.5rem 0.75rem;
    background: var(--_bg-surface);
    border: none;
    color: var(--_text);
    cursor: pointer;
    text-align: left;
  }

  .slot-icon {
    font-size: 1rem;
  }

  .slot-name {
    flex: 1;
    font-weight: 500;
    font-size: 0.875rem;
  }

  .slot-count {
    font-size: 0.75rem;
    padding: 0.125rem 0.375rem;
    background: var(--_primary);
    color: white;
    border-radius: 9999px;
  }

  .slot-toggle {
    font-size: 0.625rem;
    color: var(--_text-muted);
  }

  .slot-content {
    padding: 0.5rem;
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .add-prompt-btn, .add-more-btn {
    padding: 0.5rem;
    background: transparent;
    border: 1px dashed var(--_border);
    border-radius: var(--_radius);
    color: var(--_text-muted);
    cursor: pointer;
    font-size: 0.75rem;
    transition: all 0.15s;
  }

  .add-prompt-btn:hover, .add-more-btn:hover {
    border-color: var(--_primary);
    color: var(--_primary);
  }

  .add-more-btn {
    padding: 0.25rem;
    align-self: flex-start;
  }

  .composer-prompt {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem;
    background: var(--_bg-surface);
    border-radius: var(--_radius);
  }

  .composer-prompt .prompt-info {
    flex: 1;
    min-width: 0;
  }

  .composer-prompt .prompt-name {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_text);
  }

  .composer-prompt .prompt-preview {
    display: block;
    font-size: 0.75rem;
    color: var(--_text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .remove-btn {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    transition: opacity 0.15s;
  }

  .remove-btn:hover {
    opacity: 1;
  }

  /* Variables */
  .variables-section {
    padding: 0.75rem;
    background: var(--_bg-surface);
    border-radius: var(--_radius);
  }

  .variables-section h4 {
    margin: 0 0 0.5rem;
    font-size: 0.75rem;
    color: var(--_text-muted);
    text-transform: uppercase;
  }

  .variables-grid {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .variable-field {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
  }

  .variable-field label {
    font-size: 0.75rem;
    color: var(--_text-muted);
  }

  .variable-field input {
    padding: 0.375rem 0.5rem;
    font-size: 0.75rem;
    background: var(--_bg);
    border: 1px solid var(--_border);
    border-radius: 0.25rem;
    color: var(--_text);
  }

  .composer-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
  }

  /* Preview Modal */
  .preview-overlay {
    position: fixed;
    inset: 0;
    background: rgba(0, 0, 0, 0.7);
    display: flex;
    align-items: center;
    justify-content: center;
    z-index: 1000;
  }

  .preview-modal {
    width: 90%;
    max-width: 600px;
    max-height: 80vh;
    background: var(--_bg);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    display: flex;
    flex-direction: column;
  }

  .preview-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--_border);
  }

  .preview-header h3 {
    flex: 1;
    margin: 0;
    font-size: 1rem;
  }

  .token-count {
    font-size: 0.75rem;
    padding: 0.25rem 0.5rem;
    background: var(--_primary);
    color: white;
    border-radius: 9999px;
  }

  .close-btn {
    padding: 0.25rem 0.5rem;
    background: transparent;
    border: none;
    color: var(--_text-muted);
    cursor: pointer;
    font-size: 1rem;
  }

  .preview-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
  }

  .preview-content pre {
    margin: 0;
    white-space: pre-wrap;
    word-break: break-word;
    font-size: 0.875rem;
    font-family: monospace;
  }

  .preview-parts {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    border-top: 1px solid var(--_border);
  }

  .preview-part {
    font-size: 0.625rem;
    padding: 0.25rem 0.5rem;
    background: var(--_bg-surface);
    border-radius: 9999px;
  }

  /* ==========================================================================
     Library
     ========================================================================== */
  .library {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .library-header {
    display: flex;
    gap: 0.5rem;
    flex-wrap: wrap;
  }

  .search-input {
    flex: 1;
    min-width: 120px;
    padding: 0.5rem 0.75rem;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    color: var(--_text);
    font-size: 0.875rem;
  }

  .filter-select {
    padding: 0.5rem;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    color: var(--_text);
    font-size: 0.875rem;
  }

  .prompts-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .prompt-card {
    display: flex;
    align-items: stretch;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    overflow: hidden;
    transition: border-color 0.15s;
  }

  .prompt-card:hover {
    border-color: var(--_primary);
  }

  .prompt-card.selected {
    border-color: var(--_primary);
    background: rgba(59, 130, 246, 0.1);
  }

  .prompt-main {
    flex: 1;
    padding: 0.625rem 0.75rem;
    cursor: pointer;
    min-width: 0;
  }

  .prompt-header-row {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-bottom: 0.25rem;
  }

  .prompt-slot {
    font-size: 0.875rem;
  }

  .prompt-title {
    flex: 1;
    font-weight: 500;
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .prompt-level {
    font-size: 0.75rem;
  }

  .prompt-description {
    font-size: 0.75rem;
    color: var(--_text-muted);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .prompt-meta {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    margin-top: 0.375rem;
  }

  .prompt-version {
    font-size: 0.625rem;
    padding: 0.125rem 0.25rem;
    background: var(--_bg);
    border-radius: 0.25rem;
    color: var(--_text-muted);
  }

  .prompt-tag {
    font-size: 0.625rem;
    color: var(--_primary);
  }

  .prompt-actions {
    display: flex;
    flex-direction: column;
    border-left: 1px solid var(--_border);
  }

  .action-btn {
    flex: 1;
    padding: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    transition: all 0.15s;
  }

  .action-btn:hover {
    opacity: 1;
    background: var(--_bg-surface);
  }

  /* ==========================================================================
     Editor
     ========================================================================== */
  .editor {
    display: flex;
    flex-direction: column;
  }

  .form {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .field {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  .label {
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--_text-muted);
  }

  .input, .textarea {
    width: 100%;
    padding: 0.625rem 0.75rem;
    font-size: 0.875rem;
    background: var(--_bg-surface);
    color: var(--_text);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
    transition: border-color 0.15s;
  }

  .input:focus, .textarea:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .textarea {
    resize: vertical;
    min-height: 120px;
    font-family: monospace;
  }

  .slot-types-grid {
    display: grid;
    grid-template-columns: repeat(5, 1fr);
    gap: 0.25rem;
  }

  .slot-type-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 0.25rem;
    font-size: 0.625rem;
    background: var(--_bg-surface);
    border: 2px solid var(--_border);
    border-radius: var(--_radius);
    cursor: pointer;
    transition: all 0.15s;
    color: var(--_text-muted);
  }

  .slot-type-btn:hover {
    border-color: var(--_primary);
  }

  .slot-type-btn.active {
    border-color: var(--_primary);
    background: rgba(59, 130, 246, 0.1);
    color: var(--_text);
  }

  /* Tags */
  .tags-input {
    display: flex;
    flex-wrap: wrap;
    gap: 0.375rem;
    padding: 0.375rem;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
  }

  .tags-list {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
  }

  .tag {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.25rem 0.5rem;
    background: var(--_primary);
    color: white;
    border-radius: 9999px;
    font-size: 0.75rem;
  }

  .tag-remove {
    padding: 0;
    background: transparent;
    border: none;
    color: white;
    cursor: pointer;
    font-size: 0.875rem;
    line-height: 1;
  }

  .tag-input {
    flex: 1;
    min-width: 80px;
    border: none !important;
    background: transparent !important;
    padding: 0.25rem !important;
  }

  /* Versions */
  .versions-list {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.5rem;
    background: var(--_bg-surface);
    border-radius: var(--_radius);
    margin-top: 0.5rem;
  }

  .version-item {
    display: flex;
    justify-content: space-between;
    font-size: 0.75rem;
    padding: 0.25rem 0;
  }

  .version-number {
    font-weight: 500;
    color: var(--_primary);
  }

  .version-date {
    color: var(--_text-muted);
  }

  /* ==========================================================================
     Presets
     ========================================================================== */
  .presets {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  .presets h4 {
    margin: 0;
    font-size: 0.875rem;
    color: var(--_text-muted);
  }

  .save-preset-form {
    padding: 0.75rem;
    background: var(--_bg-surface);
    border-radius: var(--_radius);
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .presets-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .preset-card {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--_bg-surface);
    border: 1px solid var(--_border);
    border-radius: var(--_radius);
  }

  .preset-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .preset-name {
    font-weight: 500;
    font-size: 0.875rem;
  }

  .preset-description {
    font-size: 0.75rem;
    color: var(--_text-muted);
  }

  .preset-actions {
    display: flex;
    gap: 0.375rem;
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
    padding: 0.625rem 1rem;
    font-size: 0.875rem;
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

  .btn.small {
    padding: 0.375rem 0.625rem;
    font-size: 0.75rem;
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
  }

  .btn.danger:hover:not(:disabled) {
    filter: brightness(1.1);
  }
</style>
