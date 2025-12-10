<!--
  TextEditorConfigPanel.svelte
  ============================
  Panel de configuración del editor de texto.

  Funcionalidades:
  - Configurar tab size
  - Auto-guardar ON/OFF
  - Validar JSON
  - Formatear código

  Skinnable via CSS Variables:
  --editor-config-bg, --editor-config-color

  Uso:
    <TextEditorConfigPanel
      bind:open
      {file}
      {content}
      on:format={handleFormat}
      on:validate={handleValidate}
      on:settingsChange={handleSettingsChange}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  export interface EditorSettings {
    tabSize: number;
    autoSave: boolean;
    autoSaveInterval: number;
    wordWrap: boolean;
    showLineNumbers: boolean;
  }

  export interface FileInfo {
    name: string;
    path: string;
    extension: string;
    size?: number;
    modified?: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel open state */
  export let open = false;

  /** Current file info */
  export let file: FileInfo | null = null;

  /** Current content (for validation) */
  export let content = '';

  /** Project ID */
  export let projectId: string | null = null;

  /** Editor settings */
  export let settings: EditorSettings = {
    tabSize: 2,
    autoSave: true,
    autoSaveInterval: 30000,
    wordWrap: true,
    showLineNumbers: true
  };

  // ============================================================================
  // STATE
  // ============================================================================

  let validationResult: { valid: boolean; error?: string } | null = null;
  let validating = false;
  let formatting = false;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    format: { content: string };
    validate: { valid: boolean; error?: string };
    settingsChange: { settings: EditorSettings };
    close: void;
  }>();

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: isJson = file?.extension === 'json';
  $: canFormat = isJson;
  $: canValidate = isJson;

  // ============================================================================
  // METHODS
  // ============================================================================

  /** Validate JSON content */
  async function handleValidate(): Promise<void> {
    if (!canValidate || validating) return;

    validating = true;
    validationResult = null;

    try {
      // Try local validation first
      JSON.parse(content);
      validationResult = { valid: true };

      // Optionally call backend for deeper validation
      if (projectId && file) {
        const res = await fetch(api.moduleApi('text-editor', '/editor/validate'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            content,
            file_type: file.extension
          })
        });

        if (res.ok) {
          const data = await res.json();
          validationResult = data;
        }
      }

      dispatch('validate', validationResult);
    } catch (e) {
      validationResult = {
        valid: false,
        error: e instanceof Error ? e.message : 'JSON inválido'
      };
      dispatch('validate', validationResult);
    } finally {
      validating = false;
    }
  }

  /** Format JSON content */
  async function handleFormat(): Promise<void> {
    if (!canFormat || formatting) return;

    formatting = true;

    try {
      let formattedContent: string;

      // Try local formatting
      if (isJson) {
        const parsed = JSON.parse(content);
        formattedContent = JSON.stringify(parsed, null, settings.tabSize);
      } else {
        // For other formats, use backend
        const res = await fetch(api.moduleApi('text-editor', '/editor/format'), {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            project_id: projectId,
            content,
            file_type: file?.extension,
            tab_size: settings.tabSize
          })
        });

        if (!res.ok) throw new Error('Error al formatear');

        const data = await res.json();
        formattedContent = data.content;
      }

      dispatch('format', { content: formattedContent });

    } catch (e) {
      // Show validation error
      validationResult = {
        valid: false,
        error: e instanceof Error ? e.message : 'Error al formatear'
      };
    } finally {
      formatting = false;
    }
  }

  function handleSettingChange(): void {
    dispatch('settingsChange', { settings });
  }

  function handleClose(): void {
    dispatch('close');
    open = false;
  }
</script>

<FloatingPanel bind:open title="⚙️ Editor">
  <div class="config-panel">

    <!-- Current file info -->
    {#if file}
      <div class="config-panel__file">
        <span class="config-panel__file-icon">📄</span>
        <div class="config-panel__file-info">
          <span class="config-panel__file-name">{file.name}</span>
          <span class="config-panel__file-path">{file.path}</span>
        </div>
      </div>
    {/if}

    <!-- Quick actions -->
    {#if canValidate || canFormat}
      <div class="config-panel__actions-row">
        {#if canValidate}
          <button
            type="button"
            class="config-panel__action"
            on:click={handleValidate}
            disabled={validating}
          >
            {#if validating}
              <span class="spinner-small" />
            {:else}
              🧪
            {/if}
            Validar JSON
          </button>
        {/if}

        {#if canFormat}
          <button
            type="button"
            class="config-panel__action"
            on:click={handleFormat}
            disabled={formatting}
          >
            {#if formatting}
              <span class="spinner-small" />
            {:else}
              ✨
            {/if}
            Formatear
          </button>
        {/if}
      </div>

      <!-- Validation result -->
      {#if validationResult}
        <div
          class="config-panel__validation"
          class:config-panel__validation--success={validationResult.valid}
          class:config-panel__validation--error={!validationResult.valid}
        >
          {#if validationResult.valid}
            ✅ JSON válido
          {:else}
            ❌ {validationResult.error}
          {/if}
        </div>
      {/if}
    {/if}

    <!-- Settings -->
    <div class="config-panel__section">
      <h4 class="config-panel__section-title">Configuración</h4>

      <!-- Tab size -->
      <div class="config-panel__setting">
        <label class="config-panel__label" for="tab-size">
          Tab Size
        </label>
        <select
          id="tab-size"
          class="config-panel__select"
          bind:value={settings.tabSize}
          on:change={handleSettingChange}
        >
          <option value={2}>2 espacios</option>
          <option value={4}>4 espacios</option>
          <option value={8}>8 espacios</option>
        </select>
      </div>

      <!-- Word wrap -->
      <div class="config-panel__setting">
        <label class="config-panel__checkbox-label">
          <input
            type="checkbox"
            bind:checked={settings.wordWrap}
            on:change={handleSettingChange}
          />
          <span>Ajuste de línea</span>
        </label>
      </div>

      <!-- Show line numbers -->
      <div class="config-panel__setting">
        <label class="config-panel__checkbox-label">
          <input
            type="checkbox"
            bind:checked={settings.showLineNumbers}
            on:change={handleSettingChange}
          />
          <span>Mostrar números de línea</span>
        </label>
      </div>

      <!-- Auto-save -->
      <div class="config-panel__setting">
        <label class="config-panel__checkbox-label">
          <input
            type="checkbox"
            bind:checked={settings.autoSave}
            on:change={handleSettingChange}
          />
          <span>Auto-guardar</span>
        </label>
        {#if settings.autoSave}
          <select
            class="config-panel__select config-panel__select--small"
            bind:value={settings.autoSaveInterval}
            on:change={handleSettingChange}
          >
            <option value={15000}>cada 15s</option>
            <option value={30000}>cada 30s</option>
            <option value={60000}>cada 1min</option>
          </select>
        {/if}
      </div>
    </div>

    <!-- Close button -->
    <div class="config-panel__footer">
      <button
        type="button"
        class="config-panel__btn"
        on:click={handleClose}
      >
        Cerrar
      </button>
    </div>
  </div>
</FloatingPanel>

<style>
  .config-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    padding: 1rem;
    min-width: 300px;
    max-width: 360px;
  }

  /* File info */
  .config-panel__file {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-bg-elevated, #232830);
    border-radius: var(--radius-md, 8px);
  }

  .config-panel__file-icon {
    font-size: 1.5rem;
  }

  .config-panel__file-info {
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
    flex: 1;
  }

  .config-panel__file-name {
    font-weight: 600;
    color: var(--color-text, #ffffff);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .config-panel__file-path {
    font-size: 0.75rem;
    color: var(--color-text-muted, #9ca3af);
    font-family: var(--font-mono, monospace);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  /* Actions row */
  .config-panel__actions-row {
    display: flex;
    gap: 0.5rem;
  }

  .config-panel__action {
    flex: 1;
    display: flex;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 0.625rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.8125rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .config-panel__action:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f3a);
    border-color: hsl(217 91% 60% / 0.3);
  }

  .config-panel__action:disabled {
    opacity: 0.6;
    cursor: not-allowed;
  }

  /* Validation result */
  .config-panel__validation {
    padding: 0.625rem 0.875rem;
    border-radius: var(--radius-md, 8px);
    font-size: 0.8125rem;
  }

  .config-panel__validation--success {
    background: hsl(142 71% 45% / 0.1);
    color: hsl(142 71% 45%);
  }

  .config-panel__validation--error {
    background: hsl(0 70% 50% / 0.1);
    color: hsl(0 70% 65%);
  }

  /* Section */
  .config-panel__section {
    display: flex;
    flex-direction: column;
    gap: 0.75rem;
  }

  .config-panel__section-title {
    margin: 0;
    font-size: 0.75rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.5px;
    color: var(--color-text-muted, #9ca3af);
  }

  /* Setting */
  .config-panel__setting {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .config-panel__label {
    flex: 1;
    font-size: 0.875rem;
    color: var(--color-text, #ffffff);
  }

  .config-panel__select {
    padding: 0.375rem 0.625rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-sm, 6px);
    font-size: 0.8125rem;
  }

  .config-panel__select--small {
    margin-left: auto;
  }

  .config-panel__checkbox-label {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    font-size: 0.875rem;
    color: var(--color-text, #ffffff);
    cursor: pointer;
  }

  .config-panel__checkbox-label input {
    width: 1rem;
    height: 1rem;
    accent-color: hsl(217 91% 60%);
  }

  /* Footer */
  .config-panel__footer {
    display: flex;
    justify-content: flex-end;
    margin-top: 0.5rem;
  }

  .config-panel__btn {
    padding: 0.5rem 1rem;
    background: var(--color-bg-elevated, #232830);
    color: var(--color-text, #ffffff);
    border: 1px solid var(--color-border, #2e3440);
    border-radius: var(--radius-md, 8px);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 150ms ease;
  }

  .config-panel__btn:hover {
    background: var(--color-bg-hover, #2a2f3a);
  }

  /* Spinner */
  .spinner-small {
    display: inline-block;
    width: 0.875rem;
    height: 0.875rem;
    border: 2px solid var(--color-border, #2e3440);
    border-top-color: hsl(217 91% 60%);
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
