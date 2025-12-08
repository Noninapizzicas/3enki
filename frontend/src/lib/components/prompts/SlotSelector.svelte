<script lang="ts">
  /**
   * SlotSelector - Gestión de Prompts por Slot
   *
   * Gestos:
   * - Tap: Ver prompts por slot (30% panel)
   * - Doble tap: Añadir nuevo prompt (50% modal)
   * - Long press: Gestionar presets (80% modal)
   *
   * Conecta con: /api/modules/prompt-manager/ui/state (UI-ready endpoint)
   */
  import { createEventDispatcher, onMount } from 'svelte';
  import { FloatingPanel } from '$components/feedback';

  // Props
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let apiBase: string = '/api/modules/prompt-manager';

  // Config tiempos
  const TAP_DELAY = 300;
  const LONG_PRESS_TIME = 500;

  // Estado
  let panelOpen = false;
  let panelMode: 'list' | 'add' | 'presets' | 'edit' = 'list';
  let loading = false;
  let error: string | null = null;

  // Datos UI-ready desde backend
  let slotTypes: Array<{ id: string; name: string; icon: string; count: number }> = [];
  let promptsBySlot: Record<string, Array<{
    id: string;
    name: string;
    title: string;
    description: string;
    tags: string[];
    level: string;
    levelIcon: string;
  }>> = {};
  let presets: Array<{ id: string; name: string; description: string }> = [];
  let stats = { total_prompts: 0, total_presets: 0, by_slot: {} as Record<string, number> };

  // Slot activo para filtrar
  let activeSlotFilter: string | null = null;

  // Selección múltiple para crear preset
  let selectedPrompts: Record<string, string[]> = {
    system: [],
    context: [],
    prefix: [],
    suffix: [],
    format: []
  };

  // Contador
  $: totalPrompts = stats.total_prompts;
  $: totalSlots = slotTypes.length;

  // Formulario añadir prompt
  let newPrompt = {
    name: '',
    title: '',
    description: '',
    slot_type: 'system',
    content: '',
    tags: ''
  };

  // Formulario añadir preset
  let newPreset = {
    name: '',
    description: ''
  };

  // Timers
  let tapTimeout: number | null = null;
  let longPressTimeout: number | null = null;
  let tapCount = 0;
  let isLongPress = false;

  const dispatch = createEventDispatcher<{
    select: { slot: string; promptIds: string[] };
    presetSelect: { presetId: string };
    save: { prompt: typeof newPrompt };
    error: { message: string };
  }>();

  // ==========================================
  // API Functions
  // ==========================================

  async function loadUIState() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/ui/state`);
      const data = await res.json();

      if (data.success) {
        slotTypes = data.slotTypes || [];
        promptsBySlot = data.promptsBySlot || {};
        presets = data.presets || [];
        stats = data.stats || { total_prompts: 0, total_presets: 0, by_slot: {} };
      } else {
        error = data.message || data.error || 'Error al cargar';
      }
    } catch (err) {
      error = 'No se pudo conectar con el servidor';
      console.error('SlotSelector: Error loading UI state', err);
    } finally {
      loading = false;
    }
  }

  async function apiSavePrompt() {
    if (!newPrompt.name || !newPrompt.content) {
      error = 'Nombre y contenido son requeridos';
      return;
    }

    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/prompts`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPrompt.name,
          title: newPrompt.title || newPrompt.name,
          description: newPrompt.description,
          slot_type: newPrompt.slot_type,
          content: newPrompt.content,
          tags: newPrompt.tags ? newPrompt.tags.split(',').map(t => t.trim()) : []
        })
      });

      const data = await res.json();
      console.log('Save response:', data); // Debug

      if (data.success) {
        await loadUIState();
        dispatch('save', { prompt: newPrompt });
        panelMode = 'list';
        resetPromptForm();
      } else {
        // Backend devuelve { error: 'CODE', message: 'texto' }
        error = data.message || data.error || 'Error al guardar';
      }
    } catch (err) {
      error = 'Error de conexión al guardar';
      console.error('SlotSelector: Error saving prompt', err);
    } finally {
      loading = false;
    }
  }

  async function apiDeletePrompt(id: string) {
    loading = true;
    try {
      const res = await fetch(`${apiBase}/prompts/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        await loadUIState();
      } else {
        error = data.message || data.error || 'Error al eliminar';
      }
    } catch (err) {
      error = 'Error de conexión al eliminar';
    } finally {
      loading = false;
    }
  }

  async function apiSavePreset() {
    if (!newPreset.name) {
      error = 'Nombre del preset es requerido';
      return;
    }

    // Verificar que hay al menos un prompt seleccionado
    const hasSelection = Object.values(selectedPrompts).some(arr => arr.length > 0);
    if (!hasSelection) {
      error = 'Selecciona al menos un prompt';
      return;
    }

    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/presets`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: newPreset.name,
          description: newPreset.description,
          slots: selectedPrompts
        })
      });

      const data = await res.json();

      if (data.success) {
        await loadUIState();
        panelMode = 'list';
        resetPresetForm();
      } else {
        error = data.message || data.error || 'Error al guardar preset';
      }
    } catch (err) {
      error = 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  async function apiDeletePreset(id: string) {
    loading = true;
    try {
      const res = await fetch(`${apiBase}/presets/${id}`, { method: 'DELETE' });
      const data = await res.json();

      if (data.success) {
        await loadUIState();
      } else {
        error = data.message || data.error || 'Error al eliminar preset';
      }
    } catch (err) {
      error = 'Error de conexión';
    } finally {
      loading = false;
    }
  }

  async function applyPreset(presetId: string) {
    try {
      const res = await fetch(`${apiBase}/presets/${presetId}`);
      const data = await res.json();

      if (data.success && data.preset.slots) {
        selectedPrompts = { ...selectedPrompts, ...data.preset.slots };
        dispatch('presetSelect', { presetId });
      }
    } catch (err) {
      error = 'Error al aplicar preset';
    }
  }

  // ==========================================
  // Helpers
  // ==========================================

  function resetPromptForm() {
    newPrompt = {
      name: '',
      title: '',
      description: '',
      slot_type: 'system',
      content: '',
      tags: ''
    };
  }

  function resetPresetForm() {
    newPreset = { name: '', description: '' };
    selectedPrompts = {
      system: [],
      context: [],
      prefix: [],
      suffix: [],
      format: []
    };
  }

  function togglePromptSelection(slotType: string, promptId: string) {
    const current = selectedPrompts[slotType] || [];
    if (current.includes(promptId)) {
      selectedPrompts[slotType] = current.filter(id => id !== promptId);
    } else {
      selectedPrompts[slotType] = [...current, promptId];
    }
    selectedPrompts = { ...selectedPrompts }; // Trigger reactivity
  }

  function isPromptSelected(slotType: string, promptId: string): boolean {
    return (selectedPrompts[slotType] || []).includes(promptId);
  }

  // ==========================================
  // Gestos
  // ==========================================

  function handleTouchStart() {
    isLongPress = false;
    longPressTimeout = window.setTimeout(() => {
      isLongPress = true;
      handleLongPress();
    }, LONG_PRESS_TIME);
  }

  function handleTouchEnd() {
    if (longPressTimeout) {
      clearTimeout(longPressTimeout);
      longPressTimeout = null;
    }

    if (isLongPress) return;

    tapCount++;
    if (tapCount === 1) {
      tapTimeout = window.setTimeout(() => {
        if (tapCount === 1) {
          handleTap();
        } else if (tapCount >= 2) {
          handleDoubleTap();
        }
        tapCount = 0;
      }, TAP_DELAY);
    }
  }

  function handleTap() {
    panelMode = 'list';
    panelOpen = true;
    loadUIState();
  }

  function handleDoubleTap() {
    panelMode = 'add';
    panelOpen = true;
    loadUIState();
  }

  function handleLongPress() {
    panelMode = 'presets';
    panelOpen = true;
    loadUIState();
  }

  function closePanel() {
    panelOpen = false;
    error = null;
    activeSlotFilter = null;
  }

  // ==========================================
  // Lifecycle
  // ==========================================

  onMount(() => {
    loadUIState();
  });

  // ==========================================
  // Tamaños
  // ==========================================

  const sizes = {
    sm: { button: 'w-8 h-8', icon: 'text-sm', badge: 'text-[10px] min-w-[14px] h-[14px]' },
    md: { button: 'w-10 h-10', icon: 'text-base', badge: 'text-[11px] min-w-[16px] h-[16px]' },
    lg: { button: 'w-12 h-12', icon: 'text-lg', badge: 'text-xs min-w-[18px] h-[18px]' }
  };

  $: sizeClasses = sizes[size];
</script>

<!-- Botón principal -->
<button
  class="slot-selector-btn {sizeClasses.button}"
  on:touchstart|preventDefault={handleTouchStart}
  on:touchend|preventDefault={handleTouchEnd}
  on:mousedown={handleTouchStart}
  on:mouseup={handleTouchEnd}
  on:mouseleave={() => longPressTimeout && clearTimeout(longPressTimeout)}
  title="Tap: Ver | 2x Tap: Añadir | Mantener: Presets"
>
  <span class={sizeClasses.icon}>📝</span>
  {#if totalPrompts > 0}
    <span class="badge {sizeClasses.badge}">{totalPrompts}</span>
  {/if}
</button>

<!-- Panel flotante -->
<FloatingPanel bind:open={panelOpen} on:close={closePanel}>
  <div class="slot-panel" class:panel-large={panelMode === 'presets'}>
    <!-- Header -->
    <div class="panel-header">
      {#if panelMode === 'list'}
        <h3>📝 Prompts por Slot</h3>
        <button class="refresh-btn" on:click={loadUIState} disabled={loading}>
          {loading ? '⏳' : '🔄'}
        </button>
      {:else if panelMode === 'add'}
        <h3>➕ Nuevo Prompt</h3>
      {:else if panelMode === 'presets'}
        <h3>📦 Gestionar Presets</h3>
      {/if}
    </div>

    {#if loading && panelMode === 'list'}
      <div class="loading">Cargando...</div>
    {:else if panelMode === 'list'}
      <!-- Filtro por slot type -->
      <div class="slot-filters">
        <button
          class="slot-filter"
          class:active={activeSlotFilter === null}
          on:click={() => activeSlotFilter = null}
        >
          Todos ({totalPrompts})
        </button>
        {#each slotTypes as slot}
          <button
            class="slot-filter"
            class:active={activeSlotFilter === slot.id}
            on:click={() => activeSlotFilter = slot.id}
          >
            {slot.icon} {slot.name} ({slot.count})
          </button>
        {/each}
      </div>

      <!-- Lista de prompts -->
      <div class="prompts-list">
        {#each slotTypes as slot}
          {#if !activeSlotFilter || activeSlotFilter === slot.id}
            {#if (promptsBySlot[slot.id] || []).length > 0}
              <div class="slot-group">
                <div class="slot-group-header">
                  <span>{slot.icon} {slot.name}</span>
                  <span class="count">{(promptsBySlot[slot.id] || []).length}</span>
                </div>
                {#each promptsBySlot[slot.id] || [] as prompt}
                  <div class="prompt-item">
                    <div class="prompt-info">
                      <span class="prompt-name">{prompt.name}</span>
                      <span class="prompt-level">{prompt.levelIcon}</span>
                    </div>
                    {#if prompt.description}
                      <div class="prompt-desc">{prompt.description}</div>
                    {/if}
                    <button
                      class="delete-btn"
                      on:click|stopPropagation={() => apiDeletePrompt(prompt.id)}
                      title="Eliminar"
                    >🗑️</button>
                  </div>
                {/each}
              </div>
            {/if}
          {/if}
        {/each}

        {#if totalPrompts === 0}
          <div class="empty-state">
            No hay prompts.<br>
            <button on:click={() => panelMode = 'add'}>➕ Crear primero</button>
          </div>
        {/if}
      </div>

      <!-- Presets rápidos -->
      {#if presets.length > 0}
        <div class="presets-quick">
          <span class="presets-label">📦 Presets:</span>
          {#each presets as preset}
            <button class="preset-chip" on:click={() => applyPreset(preset.id)}>
              {preset.name}
            </button>
          {/each}
        </div>
      {/if}

    {:else if panelMode === 'add'}
      <!-- Formulario nuevo prompt -->
      <div class="form-group">
        <label>Nombre *</label>
        <input type="text" bind:value={newPrompt.name} placeholder="mi-prompt" />
      </div>

      <div class="form-group">
        <label>Título</label>
        <input type="text" bind:value={newPrompt.title} placeholder="Mi Prompt" />
      </div>

      <div class="form-group">
        <label>Slot Type</label>
        <select bind:value={newPrompt.slot_type}>
          {#each slotTypes as slot}
            <option value={slot.id}>{slot.icon} {slot.name}</option>
          {/each}
        </select>
      </div>

      <div class="form-group">
        <label>Contenido *</label>
        <textarea
          bind:value={newPrompt.content}
          placeholder="Eres un asistente que..."
          rows="4"
        ></textarea>
      </div>

      <div class="form-group">
        <label>Descripción</label>
        <input type="text" bind:value={newPrompt.description} placeholder="Descripción breve" />
      </div>

      <div class="form-group">
        <label>Tags (separados por coma)</label>
        <input type="text" bind:value={newPrompt.tags} placeholder="ai, assistant, code" />
      </div>

      {#if error}
        <div class="panel-error">{error}</div>
      {/if}

      <div class="form-actions">
        <button class="cancel-btn" on:click={() => { panelMode = 'list'; error = null; }}>Cancelar</button>
        <button class="save-btn" on:click={apiSavePrompt} disabled={loading || !newPrompt.name || !newPrompt.content}>
          {loading ? '⏳ Guardando...' : '💾 Guardar'}
        </button>
      </div>

    {:else if panelMode === 'presets'}
      <!-- Gestión de presets -->
      <div class="presets-section">
        <h4>Crear Nuevo Preset</h4>
        <p class="hint">Selecciona prompts para cada slot:</p>

        {#each slotTypes as slot}
          <div class="slot-selection">
            <div class="slot-selection-header">
              {slot.icon} {slot.name}
            </div>
            <div class="slot-selection-items">
              {#each promptsBySlot[slot.id] || [] as prompt}
                <label class="checkbox-item">
                  <input
                    type="checkbox"
                    checked={isPromptSelected(slot.id, prompt.id)}
                    on:change={() => togglePromptSelection(slot.id, prompt.id)}
                  />
                  <span>{prompt.name}</span>
                </label>
              {/each}
              {#if (promptsBySlot[slot.id] || []).length === 0}
                <span class="no-prompts">Sin prompts</span>
              {/if}
            </div>
          </div>
        {/each}

        <div class="form-group">
          <label>Nombre del Preset *</label>
          <input type="text" bind:value={newPreset.name} placeholder="mi-preset" />
        </div>

        <div class="form-group">
          <label>Descripción</label>
          <input type="text" bind:value={newPreset.description} placeholder="Descripción breve" />
        </div>

        {#if error}
          <div class="panel-error">{error}</div>
        {/if}

        <div class="form-actions">
          <button class="cancel-btn" on:click={() => { panelMode = 'list'; error = null; resetPresetForm(); }}>Cancelar</button>
          <button class="save-btn" on:click={apiSavePreset} disabled={loading || !newPreset.name}>
            {loading ? '⏳ Guardando...' : '💾 Guardar Preset'}
          </button>
        </div>

        <!-- Lista de presets existentes -->
        {#if presets.length > 0}
          <div class="existing-presets">
            <h4>Presets Existentes</h4>
            {#each presets as preset}
              <div class="preset-item">
                <div class="preset-info">
                  <span class="preset-name">{preset.name}</span>
                  {#if preset.description}
                    <span class="preset-desc">{preset.description}</span>
                  {/if}
                </div>
                <div class="preset-actions">
                  <button class="apply-btn" on:click={() => applyPreset(preset.id)}>Aplicar</button>
                  <button class="delete-btn" on:click={() => apiDeletePreset(preset.id)}>🗑️</button>
                </div>
              </div>
            {/each}
          </div>
        {/if}
      </div>
    {/if}
  </div>
</FloatingPanel>

<style>
  .slot-selector-btn {
    position: relative;
    display: flex;
    align-items: center;
    justify-content: center;
    background: var(--color-bg-secondary, #f3f4f6);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 8px;
    cursor: pointer;
    transition: all 0.2s;
    user-select: none;
    -webkit-tap-highlight-color: transparent;
  }

  .slot-selector-btn:hover {
    background: var(--color-bg-tertiary, #e5e7eb);
  }

  .slot-selector-btn:active {
    transform: scale(0.95);
  }

  .badge {
    position: absolute;
    top: -4px;
    right: -4px;
    background: var(--color-primary, #3b82f6);
    color: white;
    border-radius: 9999px;
    padding: 0 4px;
    font-weight: 600;
    display: flex;
    align-items: center;
    justify-content: center;
  }

  /* Panel */
  .slot-panel {
    min-width: 300px;
    max-width: 400px;
    max-height: 70vh;
    overflow-y: auto;
  }

  .slot-panel.panel-large {
    min-width: 350px;
    max-width: 450px;
    max-height: 80vh;
  }

  .panel-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    margin-bottom: 0.75rem;
  }

  .panel-header h3 {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .refresh-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 1rem;
    padding: 0.25rem;
  }

  .loading {
    text-align: center;
    padding: 2rem;
    color: var(--color-text-secondary, #6b7280);
  }

  /* Filtros slot */
  .slot-filters {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-bottom: 1rem;
  }

  .slot-filter {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: var(--color-bg-secondary, #f3f4f6);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 4px;
    cursor: pointer;
  }

  .slot-filter.active {
    background: var(--color-primary, #3b82f6);
    color: white;
    border-color: var(--color-primary, #3b82f6);
  }

  /* Lista prompts */
  .prompts-list {
    max-height: 300px;
    overflow-y: auto;
  }

  .slot-group {
    margin-bottom: 1rem;
  }

  .slot-group-header {
    display: flex;
    justify-content: space-between;
    align-items: center;
    font-weight: 600;
    font-size: 0.85rem;
    padding: 0.5rem;
    background: var(--color-bg-secondary, #f3f4f6);
    border-radius: 4px;
    margin-bottom: 0.5rem;
  }

  .slot-group-header .count {
    background: var(--color-primary, #3b82f6);
    color: white;
    padding: 0.1rem 0.4rem;
    border-radius: 9999px;
    font-size: 0.7rem;
  }

  .prompt-item {
    position: relative;
    padding: 0.5rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .prompt-info {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .prompt-name {
    font-weight: 500;
    font-size: 0.85rem;
  }

  .prompt-level {
    font-size: 0.9rem;
  }

  .prompt-desc {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #6b7280);
    margin-top: 0.25rem;
  }

  .prompt-item .delete-btn {
    position: absolute;
    top: 0.25rem;
    right: 0.25rem;
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    opacity: 0.5;
    padding: 0.25rem;
  }

  .prompt-item:hover .delete-btn {
    opacity: 1;
  }

  /* Empty state */
  .empty-state {
    text-align: center;
    padding: 2rem;
    color: var(--color-text-secondary, #6b7280);
  }

  .empty-state button {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
  }

  /* Presets quick */
  .presets-quick {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    align-items: center;
    padding-top: 0.75rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
    margin-top: 0.75rem;
  }

  .presets-label {
    font-size: 0.8rem;
    color: var(--color-text-secondary, #6b7280);
  }

  .preset-chip {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: var(--color-bg-tertiary, #e5e7eb);
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .preset-chip:hover {
    background: var(--color-primary, #3b82f6);
    color: white;
  }

  /* Form */
  .form-group {
    margin-bottom: 0.75rem;
  }

  .form-group label {
    display: block;
    font-size: 0.8rem;
    font-weight: 500;
    margin-bottom: 0.25rem;
  }

  .form-group input,
  .form-group select,
  .form-group textarea {
    width: 100%;
    padding: 0.5rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    font-size: 0.85rem;
    box-sizing: border-box;
  }

  .form-group textarea {
    resize: vertical;
    min-height: 80px;
  }

  .form-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: flex-end;
    margin-top: 1rem;
  }

  .cancel-btn {
    padding: 0.5rem 1rem;
    background: var(--color-bg-secondary, #f3f4f6);
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .save-btn {
    padding: 0.5rem 1rem;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 6px;
    cursor: pointer;
    font-size: 0.85rem;
  }

  .save-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .panel-error {
    background: #fee2e2;
    color: #dc2626;
    padding: 0.5rem;
    border-radius: 6px;
    font-size: 0.8rem;
    margin-bottom: 0.75rem;
  }

  /* Presets section */
  .presets-section h4 {
    margin: 0 0 0.5rem 0;
    font-size: 0.9rem;
  }

  .hint {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #6b7280);
    margin: 0 0 0.75rem 0;
  }

  .slot-selection {
    margin-bottom: 0.75rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    overflow: hidden;
  }

  .slot-selection-header {
    background: var(--color-bg-secondary, #f3f4f6);
    padding: 0.5rem;
    font-weight: 500;
    font-size: 0.85rem;
  }

  .slot-selection-items {
    padding: 0.5rem;
    max-height: 100px;
    overflow-y: auto;
  }

  .checkbox-item {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.8rem;
    padding: 0.25rem 0;
    cursor: pointer;
  }

  .no-prompts {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #6b7280);
    font-style: italic;
  }

  .existing-presets {
    margin-top: 1.5rem;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
  }

  .preset-item {
    display: flex;
    justify-content: space-between;
    align-items: center;
    padding: 0.5rem;
    border: 1px solid var(--color-border, #e5e7eb);
    border-radius: 6px;
    margin-bottom: 0.5rem;
  }

  .preset-info {
    flex: 1;
  }

  .preset-name {
    font-weight: 500;
    font-size: 0.85rem;
  }

  .preset-desc {
    font-size: 0.75rem;
    color: var(--color-text-secondary, #6b7280);
  }

  .preset-actions {
    display: flex;
    gap: 0.5rem;
  }

  .apply-btn {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: var(--color-primary, #3b82f6);
    color: white;
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .preset-actions .delete-btn {
    background: none;
    border: none;
    cursor: pointer;
    font-size: 0.8rem;
    opacity: 0.7;
  }

  .preset-actions .delete-btn:hover {
    opacity: 1;
  }
</style>
