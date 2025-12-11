<!--
  AIConfigPanel.svelte
  ====================
  Panel de configuración LLM para ai-gateway.
  Consume GET/POST /modules/ai-gateway/ui/config

  Uso:
    <AIConfigPanel
      bind:open={showConfig}
      on:save={handleConfigSave}
      on:close={handleClose}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { onMount, createEventDispatcher } from 'svelte';
  import { fade } from 'svelte/transition';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  interface ConfigParam {
    value: number | string | boolean;
    type: 'range' | 'textarea' | 'toggle';
    min?: number;
    max?: number;
    step?: number;
    maxLength?: number;
    label: string;
    description: string;
    icon: string;
    placeholder?: string;
  }

  interface Preset {
    id: string;
    name: string;
    icon: string;
    temperature?: number;
    topP?: number;
    systemPrompt?: string;
  }

  interface ConfigSchema {
    config: Record<string, ConfigParam>;
    presets: Preset[];
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Estado de apertura (bindable) */
  export let open = false;

  // ============================================================================
  // STATE
  // ============================================================================

  let loading = false;  // Empieza en false, se pone true al cargar
  let saving = false;
  let error: string | null = null;
  let schema: ConfigSchema | null = null;

  // Valores locales de configuración
  let localConfig: Record<string, number | string | boolean> = {
    temperature: 0.7,
    maxTokens: 2048,
    topP: 1.0,
    frequencyPenalty: 0,
    presencePenalty: 0,
    systemPrompt: '',
    stream: true
  };

  let activePreset: string | null = 'balanced';

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    save: { config: typeof localConfig };
    close: void;
  }>();

  // ============================================================================
  // DATA LOADING
  // ============================================================================

  async function loadConfig(): Promise<void> {
    loading = true;
    error = null;

    try {
      const response = await fetch(api.moduleApi('ai-gateway', '/ui/config'));

      if (!response.ok) {
        throw new Error(`Error ${response.status}`);
      }

      const data: ConfigSchema = await response.json();
      schema = data;

      // Sincronizar valores locales con los del servidor
      if (data.config) {
        for (const [key, param] of Object.entries(data.config)) {
          if (param.value !== undefined) {
            localConfig[key] = param.value;
          }
        }
      }

    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
      console.error('[AIConfigPanel] Error loading config:', err);
    } finally {
      loading = false;
    }
  }

  async function saveConfig(): Promise<void> {
    saving = true;
    error = null;

    try {
      const response = await fetch(api.moduleApi('ai-gateway', '/ui/config'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(localConfig)
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({}));
        throw new Error(data.message || `Error ${response.status}`);
      }

      dispatch('save', { config: { ...localConfig } });
      handleClose();

    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al guardar';
      console.error('[AIConfigPanel] Error saving config:', err);
    } finally {
      saving = false;
    }
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function handleClose(): void {
    open = false;
    dispatch('close');
  }

  function applyPreset(preset: Preset): void {
    activePreset = preset.id;

    if (preset.temperature !== undefined) {
      localConfig.temperature = preset.temperature;
    }
    if (preset.topP !== undefined) {
      localConfig.topP = preset.topP;
    }
    if (preset.systemPrompt !== undefined) {
      localConfig.systemPrompt = preset.systemPrompt;
    }
  }

  function resetToDefaults(): void {
    localConfig = {
      temperature: 0.7,
      maxTokens: 2048,
      topP: 1.0,
      frequencyPenalty: 0,
      presencePenalty: 0,
      systemPrompt: '',
      stream: true
    };
    activePreset = 'balanced';
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  $: if (open && !schema && !loading) {
    loadConfig();
  }

  // Default presets if not loaded from server
  $: presets = schema?.presets || [
    { id: 'precise', name: 'Preciso', icon: '🎯', temperature: 0.3, topP: 0.9 },
    { id: 'balanced', name: 'Balanceado', icon: '⚖️', temperature: 0.7, topP: 1.0 },
    { id: 'creative', name: 'Creativo', icon: '🎨', temperature: 1.2, topP: 0.95 },
    { id: 'code', name: 'Código', icon: '💻', temperature: 0.2, topP: 0.9, systemPrompt: 'Eres un experto programador. Responde con código limpio y comentado.' }
  ];
</script>

<FloatingPanel bind:open on:close={handleClose}>
  <div class="config-panel">
    <!-- Header -->
    <header class="panel-header">
      <span class="panel-icon">⚙️</span>
      <h3 class="panel-title">Configuración LLM</h3>
      <button class="close-btn" on:click={handleClose} aria-label="Cerrar">×</button>
    </header>

    <!-- Content -->
    <div class="panel-content">
      {#if loading}
        <div class="state-container">
          <div class="spinner" />
          <span>Cargando configuración...</span>
        </div>

      {:else if error}
        <div class="state-container error">
          <span class="state-icon">⚠️</span>
          <p class="state-message">{error}</p>
          <button class="action-btn" on:click={() => loadConfig()}>
            Reintentar
          </button>
        </div>

      {:else}
        <!-- Presets -->
        <div class="section">
          <label class="section-label">Presets</label>
          <div class="presets">
            {#each presets as preset}
              <button
                class="preset-btn"
                class:active={activePreset === preset.id}
                on:click={() => applyPreset(preset)}
                title={preset.name}
              >
                <span class="preset-icon">{preset.icon}</span>
                <span class="preset-name">{preset.name}</span>
              </button>
            {/each}
          </div>
        </div>

        <!-- Temperature -->
        <div class="config-row">
          <label class="row-label">
            <span>🌡️ Temperatura</span>
            <span class="row-value">{Number(localConfig.temperature).toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="2"
            step="0.1"
            bind:value={localConfig.temperature}
            on:input={() => activePreset = null}
          />
          <span class="row-hint">0 = preciso, 2 = creativo</span>
        </div>

        <!-- Max Tokens -->
        <div class="config-row">
          <label class="row-label">
            <span>📏 Máx. Tokens</span>
            <span class="row-value">{localConfig.maxTokens}</span>
          </label>
          <input
            type="range"
            min="256"
            max="8192"
            step="256"
            bind:value={localConfig.maxTokens}
          />
          <span class="row-hint">Longitud máxima de respuesta</span>
        </div>

        <!-- Top P -->
        <div class="config-row">
          <label class="row-label">
            <span>🎯 Top P</span>
            <span class="row-value">{Number(localConfig.topP).toFixed(2)}</span>
          </label>
          <input
            type="range"
            min="0"
            max="1"
            step="0.05"
            bind:value={localConfig.topP}
            on:input={() => activePreset = null}
          />
          <span class="row-hint">Diversidad de respuestas</span>
        </div>

        <!-- Frequency Penalty -->
        <div class="config-row">
          <label class="row-label">
            <span>🔄 Penalización Frecuencia</span>
            <span class="row-value">{Number(localConfig.frequencyPenalty).toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="-2"
            max="2"
            step="0.1"
            bind:value={localConfig.frequencyPenalty}
          />
          <span class="row-hint">Reduce repetición de palabras</span>
        </div>

        <!-- Presence Penalty -->
        <div class="config-row">
          <label class="row-label">
            <span>💡 Penalización Presencia</span>
            <span class="row-value">{Number(localConfig.presencePenalty).toFixed(1)}</span>
          </label>
          <input
            type="range"
            min="-2"
            max="2"
            step="0.1"
            bind:value={localConfig.presencePenalty}
          />
          <span class="row-hint">Fomenta temas nuevos</span>
        </div>

        <!-- Streaming Toggle -->
        <div class="config-row toggle-row">
          <label class="row-label">
            <span>⚡ Streaming</span>
          </label>
          <button
            class="toggle-btn"
            class:on={localConfig.stream}
            on:click={() => localConfig.stream = !localConfig.stream}
          >
            {localConfig.stream ? 'ON' : 'OFF'}
          </button>
        </div>

        <!-- System Prompt -->
        <div class="config-row">
          <label class="row-label">
            <span>📝 System Prompt</span>
          </label>
          <textarea
            bind:value={localConfig.systemPrompt}
            placeholder="Instrucciones iniciales para el modelo..."
            rows="3"
            maxlength="4000"
          ></textarea>
          <span class="row-hint">{String(localConfig.systemPrompt).length}/4000 caracteres</span>
        </div>
      {/if}
    </div>

    <!-- Footer -->
    {#if !loading}
      <footer class="panel-footer">
        <button class="action-btn secondary" on:click={resetToDefaults}>
          Restablecer
        </button>
        <button
          class="action-btn primary"
          on:click={saveConfig}
          disabled={saving}
        >
          {saving ? 'Guardando...' : '💾 Guardar'}
        </button>
      </footer>
    {/if}
  </div>
</FloatingPanel>

<style>
  .config-panel {
    --panel-bg: var(--color-bg-card, #1a1a2e);
    --panel-border: var(--color-border, #2d2d44);
    --panel-text: var(--color-text, #e0e0e0);
    --panel-text-muted: var(--color-text-muted, #888);
    --panel-primary: var(--color-primary, #6366f1);
    --panel-success: var(--color-success, #22c55e);

    display: flex;
    flex-direction: column;
    width: 340px;
    max-height: 80vh;
    background: var(--panel-bg);
    border-radius: 12px;
    overflow: hidden;
    color: var(--panel-text);
  }

  /* Header */
  .panel-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1rem;
    border-bottom: 1px solid var(--panel-border);
    flex-shrink: 0;
  }

  .panel-icon {
    font-size: 1.25rem;
  }

  .panel-title {
    flex: 1;
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .close-btn {
    width: 28px;
    height: 28px;
    display: flex;
    align-items: center;
    justify-content: center;
    background: transparent;
    border: none;
    border-radius: 6px;
    color: var(--panel-text-muted);
    font-size: 1.25rem;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .close-btn:hover {
    background: rgba(255, 255, 255, 0.1);
    color: var(--panel-text);
  }

  /* Content */
  .panel-content {
    flex: 1;
    overflow-y: auto;
    padding: 1rem;
    -webkit-overflow-scrolling: touch;
  }

  /* State Container */
  .state-container {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    padding: 2rem;
    gap: 0.75rem;
    text-align: center;
    color: var(--panel-text-muted);
  }

  .state-icon {
    font-size: 2rem;
  }

  .state-message {
    margin: 0;
    font-size: 0.875rem;
  }

  .state-container.error .state-message {
    color: #ef4444;
  }

  .spinner {
    width: 1.5rem;
    height: 1.5rem;
    border: 2px solid var(--panel-border);
    border-top-color: var(--panel-primary);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  /* Section */
  .section {
    margin-bottom: 1rem;
  }

  .section-label {
    display: block;
    font-size: 0.75rem;
    font-weight: 500;
    color: var(--panel-text-muted);
    text-transform: uppercase;
    letter-spacing: 0.05em;
    margin-bottom: 0.5rem;
  }

  /* Presets */
  .presets {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.5rem;
  }

  .preset-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.625rem 0.5rem;
    background: rgba(255, 255, 255, 0.05);
    border: 2px solid transparent;
    border-radius: 8px;
    color: var(--panel-text);
    cursor: pointer;
    transition: background 0.15s, border-color 0.15s;
  }

  .preset-btn:hover {
    background: rgba(255, 255, 255, 0.1);
  }

  .preset-btn.active {
    border-color: var(--panel-primary);
    background: rgba(99, 102, 241, 0.15);
  }

  .preset-icon {
    font-size: 1.25rem;
  }

  .preset-name {
    font-size: 0.625rem;
    font-weight: 500;
    white-space: nowrap;
  }

  /* Config Row */
  .config-row {
    margin-bottom: 1rem;
  }

  .row-label {
    display: flex;
    justify-content: space-between;
    align-items: center;
    margin-bottom: 0.375rem;
    font-size: 0.8125rem;
  }

  .row-value {
    font-weight: 600;
    color: var(--panel-primary);
    font-size: 0.875rem;
  }

  .row-hint {
    display: block;
    font-size: 0.6875rem;
    color: var(--panel-text-muted);
    margin-top: 0.25rem;
  }

  /* Range Input */
  input[type="range"] {
    width: 100%;
    height: 6px;
    border-radius: 3px;
    background: var(--panel-border);
    appearance: none;
    cursor: pointer;
  }

  input[type="range"]::-webkit-slider-thumb {
    appearance: none;
    width: 18px;
    height: 18px;
    border-radius: 50%;
    background: var(--panel-primary);
    cursor: pointer;
    transition: transform 0.15s;
  }

  input[type="range"]::-webkit-slider-thumb:hover {
    transform: scale(1.1);
  }

  input[type="range"]::-moz-range-thumb {
    width: 18px;
    height: 18px;
    border: none;
    border-radius: 50%;
    background: var(--panel-primary);
    cursor: pointer;
  }

  /* Toggle Row */
  .toggle-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
  }

  .toggle-btn {
    padding: 0.375rem 0.875rem;
    background: var(--panel-border);
    border: none;
    border-radius: 1rem;
    color: var(--panel-text-muted);
    font-size: 0.75rem;
    font-weight: 600;
    cursor: pointer;
    transition: background 0.15s, color 0.15s;
  }

  .toggle-btn.on {
    background: var(--panel-success);
    color: white;
  }

  /* Textarea */
  textarea {
    width: 100%;
    padding: 0.625rem;
    background: rgba(0, 0, 0, 0.2);
    border: 1px solid var(--panel-border);
    border-radius: 8px;
    color: var(--panel-text);
    font-family: inherit;
    font-size: 0.8125rem;
    resize: none;
    transition: border-color 0.15s;
  }

  textarea:focus {
    outline: none;
    border-color: var(--panel-primary);
  }

  textarea::placeholder {
    color: var(--panel-text-muted);
  }

  /* Footer */
  .panel-footer {
    display: flex;
    gap: 0.75rem;
    padding: 0.875rem 1rem;
    border-top: 1px solid var(--panel-border);
    flex-shrink: 0;
  }

  /* Action Button */
  .action-btn {
    flex: 1;
    padding: 0.625rem 1rem;
    background: var(--panel-border);
    color: var(--panel-text);
    border: none;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: background 0.15s, opacity 0.15s;
  }

  .action-btn:hover:not(:disabled) {
    background: rgba(255, 255, 255, 0.15);
  }

  .action-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .action-btn.primary {
    background: var(--panel-primary);
    color: white;
  }

  .action-btn.primary:hover:not(:disabled) {
    opacity: 0.9;
  }

  .action-btn.secondary {
    background: transparent;
    border: 1px solid var(--panel-border);
  }

  /* Responsive */
  @media (max-width: 400px) {
    .config-panel {
      width: 100%;
      max-width: 340px;
    }

    .presets {
      grid-template-columns: repeat(2, 1fr);
    }
  }
</style>
