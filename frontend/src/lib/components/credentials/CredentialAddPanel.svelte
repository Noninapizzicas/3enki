<!--
  CredentialAddPanel.svelte
  =========================
  Panel para añadir nueva credencial.

  Abre via doble tap/doble click en CredentialButton.

  Funcionalidad:
  - Seleccionar proveedor (OPENAI, DEEPSEEK, ANTHROPIC, OLLAMA)
  - Seleccionar nivel (GLOBAL, PROJECT, CLIENT, CUSTOM)
  - Identificador (opcional según nivel)
  - API Key con test antes de guardar

  Skinnable via CSS Variables (desde tokens.json):
  --cred-add-bg, --cred-add-border, --cred-add-radius
  --cred-add-input-bg, --cred-add-btn-primary, --cred-add-btn-cancel

  Uso:
    <CredentialAddPanel
      bind:open={addOpen}
      {projectId}
      on:save={handleSave}
      on:cancel={handleCancel}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { FloatingPanel } from '$components/feedback';
  import { api } from '$lib/config';

  // ============================================================================
  // TYPES
  // ============================================================================

  interface Provider {
    id: string;
    name: string;
    icon: string;
  }

  interface Level {
    id: string;
    name: string;
    icon: string;
    requiresIdentifier: boolean;
  }

  interface TestResult {
    valid: boolean;
    message: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel abierto/cerrado */
  export let open = false;

  /** Proyecto actual para pre-seleccionar */
  export let projectId: string | null = null;

  /** Nombre del módulo para API */
  const MODULE_NAME = 'credential-manager';

  // ============================================================================
  // STATE
  // ============================================================================

  // Datos del backend
  let providers: Provider[] = [];
  let levels: Level[] = [];

  // Formulario
  let form = {
    provider: 'DEEPSEEK',
    level: 'GLOBAL',
    identifier: '',
    apiKey: ''
  };

  // Estado de operaciones
  let loading = false;
  let testing = false;
  let error: string | null = null;
  let testResult: TestResult | null = null;

  // Visibilidad de password
  let showPassword = false;

  // ============================================================================
  // COMPUTED
  // ============================================================================

  $: selectedLevel = levels.find(l => l.id === form.level);
  $: requiresIdentifier = selectedLevel?.requiresIdentifier ?? false;
  $: canSave = form.apiKey.length > 0 && (!requiresIdentifier || form.identifier.length > 0);

  // Pre-seleccionar PROJECT si hay projectId
  $: if (open && projectId && form.level === 'GLOBAL') {
    form.level = 'PROJECT';
    form.identifier = projectId;
  }

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    save: { provider: string; level: string; identifier: string | null; key: string };
    cancel: void;
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function loadProviders(): Promise<void> {
    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, '/ui/state'));
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();
      if (data.success) {
        providers = data.providers || [];
        levels = data.levels || [];

        // Default al primer provider si existe
        if (providers.length > 0 && !form.provider) {
          form.provider = providers[0].id;
        }
      }
    } catch (err) {
      console.error('CredentialAddPanel: Error loading providers', err);
    }
  }

  async function testCredential(): Promise<boolean> {
    if (!form.apiKey || !form.provider) return false;

    testing = true;
    testResult = null;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, '/ui/test'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          api_key: form.apiKey
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        testResult = {
          valid: data.valid,
          message: typeof data.message === 'string' ? data.message : 'Validación completada'
        };
        return data.valid;
      } else {
        testResult = {
          valid: false,
          message: typeof data.error === 'string' ? data.error : 'Error al validar'
        };
        return false;
      }
    } catch (err) {
      testResult = { valid: false, message: 'Error de conexión' };
      return false;
    } finally {
      testing = false;
    }
  }

  async function saveCredential(): Promise<void> {
    if (!canSave) return;

    // Test primero
    const isValid = await testCredential();
    if (!isValid) {
      error = testResult?.message || 'API key no válida';
      dispatch('error', { message: error });
      return;
    }

    loading = true;
    error = null;

    try {
      const res = await fetch(api.moduleApi(MODULE_NAME, '/credentials'), {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: form.provider,
          level: form.level,
          identifier: requiresIdentifier ? form.identifier : null,
          api_key: form.apiKey
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        dispatch('save', {
          provider: form.provider,
          level: form.level,
          identifier: form.identifier || null,
          key: data.key
        });
        resetForm();
        open = false;
      } else {
        error = data.message || data.error || 'Error al guardar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al guardar';
      dispatch('error', { message: error });
    } finally {
      loading = false;
    }
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function resetForm(): void {
    form = {
      provider: providers[0]?.id || 'DEEPSEEK',
      level: 'GLOBAL',
      identifier: '',
      apiKey: ''
    };
    testResult = null;
    error = null;
    showPassword = false;
  }

  function handleCancel(): void {
    resetForm();
    dispatch('cancel');
    open = false;
  }

  function togglePassword(): void {
    showPassword = !showPassword;
  }

  // ============================================================================
  // LIFECYCLE
  // ============================================================================

  onMount(() => {
    loadProviders();
  });

  // Reset form cuando se abre
  $: if (open) {
    testResult = null;
    error = null;
  }
</script>

<FloatingPanel bind:open>
  <div class="cred-add">
    <!-- Header -->
    <div class="cred-add__header">
      <h3 class="cred-add__title">Nueva Credencial</h3>
    </div>

    <!-- Provider Selection -->
    <div class="cred-add__field">
      <label class="cred-add__label">Proveedor</label>
      <div class="cred-add__providers">
        {#each providers as p}
          <button
            type="button"
            class="cred-add__provider"
            class:cred-add__provider--active={form.provider === p.id}
            on:click={() => form.provider = p.id}
          >
            <span class="cred-add__provider-icon">{p.icon}</span>
            <span class="cred-add__provider-name">{p.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Level Selection -->
    <div class="cred-add__field">
      <label class="cred-add__label">Nivel</label>
      <div class="cred-add__levels">
        {#each levels as l}
          <button
            type="button"
            class="cred-add__level"
            class:cred-add__level--active={form.level === l.id}
            on:click={() => form.level = l.id}
          >
            <span>{l.icon}</span>
            <span>{l.name}</span>
          </button>
        {/each}
      </div>
    </div>

    <!-- Identifier (conditional) -->
    {#if requiresIdentifier}
      <div class="cred-add__field">
        <label class="cred-add__label">Identificador</label>
        <input
          type="text"
          class="cred-add__input"
          placeholder="proyecto-1 o cliente-xyz"
          bind:value={form.identifier}
        />
      </div>
    {/if}

    <!-- API Key -->
    <div class="cred-add__field">
      <label class="cred-add__label">API Key</label>
      <div class="cred-add__password-wrapper">
        {#if showPassword}
          <input
            type="text"
            class="cred-add__input cred-add__input--password"
            placeholder="sk-..."
            bind:value={form.apiKey}
          />
        {:else}
          <input
            type="password"
            class="cred-add__input cred-add__input--password"
            placeholder="sk-..."
            bind:value={form.apiKey}
          />
        {/if}
        <button
          type="button"
          class="cred-add__toggle-password"
          on:click={togglePassword}
          aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
        >
          {showPassword ? '🙈' : '👁'}
        </button>
      </div>
    </div>

    <!-- Test Result -->
    {#if testResult}
      <div
        class="cred-add__test-result"
        class:cred-add__test-result--valid={testResult.valid}
        class:cred-add__test-result--invalid={!testResult.valid}
      >
        {testResult.valid ? '✅' : '❌'} {testResult.message}
      </div>
    {/if}

    <!-- Error -->
    {#if error}
      <div class="cred-add__error">{error}</div>
    {/if}

    <!-- Actions -->
    <div class="cred-add__actions">
      <button
        type="button"
        class="cred-add__btn cred-add__btn--cancel"
        on:click={handleCancel}
        disabled={loading || testing}
      >
        Cancelar
      </button>
      <button
        type="button"
        class="cred-add__btn cred-add__btn--save"
        on:click={saveCredential}
        disabled={!canSave || loading || testing}
      >
        {#if testing}
          🔍 Validando...
        {:else if loading}
          ⏳ Guardando...
        {:else}
          🧪 Test & Save
        {/if}
      </button>
    </div>

    <!-- Hint -->
    <p class="cred-add__hint">Se valida la API key antes de guardar en .env</p>
  </div>
</FloatingPanel>

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   */
  .cred-add {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--cred-add-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--cred-add-color, var(--color-text, #ffffff));
    --_color-muted: var(--cred-add-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--cred-add-border, var(--color-border, #374151));
    --_radius: var(--cred-add-radius, var(--radius-lg, 12px));
    --_input-bg: var(--cred-add-input-bg, var(--color-bg-input, #0d0f12));
    --_btn-primary: var(--cred-add-btn-primary, var(--color-success, #22c55e));
    --_btn-cancel: var(--cred-add-btn-cancel, var(--color-bg-hover, #252a33));
    --_transition: var(--cred-add-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
    min-width: 320px;
    max-width: 380px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  /* === HEADER === */
  .cred-add__header {
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .cred-add__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  /* === FIELD === */
  .cred-add__field {
    margin-bottom: 1rem;
  }

  .cred-add__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  /* === PROVIDERS === */
  .cred-add__providers {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .cred-add__provider {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem;
    background: var(--_input-bg);
    border: 2px solid var(--_border);
    border-radius: var(--_radius);
    cursor: pointer;
    transition: border-color var(--_transition), background var(--_transition);
  }

  .cred-add__provider:hover {
    border-color: var(--color-primary, #3b82f6);
  }

  .cred-add__provider--active {
    border-color: var(--color-primary, #3b82f6);
    background: hsl(217 91% 60% / 0.1);
  }

  .cred-add__provider-icon {
    font-size: 1.5rem;
  }

  .cred-add__provider-name {
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  /* === LEVELS === */
  .cred-add__levels {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
  }

  .cred-add__level {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 0.25rem;
    font-size: 0.625rem;
    background: var(--_input-bg);
    border: 2px solid var(--_border);
    border-radius: 8px;
    cursor: pointer;
    transition: border-color var(--_transition);
  }

  .cred-add__level:hover {
    border-color: var(--color-primary, #3b82f6);
  }

  .cred-add__level--active {
    border-color: var(--color-primary, #3b82f6);
    background: hsl(217 91% 60% / 0.1);
  }

  /* === INPUT === */
  .cred-add__input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .cred-add__input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .cred-add__input::placeholder {
    color: var(--_color-muted);
  }

  /* === PASSWORD WRAPPER === */
  .cred-add__password-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .cred-add__input--password {
    padding-right: 3rem;
  }

  .cred-add__toggle-password {
    position: absolute;
    right: 0.5rem;
    background: none;
    border: none;
    font-size: 1.25rem;
    cursor: pointer;
    padding: 0.25rem;
    opacity: 0.7;
    transition: opacity var(--_transition);
  }

  .cred-add__toggle-password:hover {
    opacity: 1;
  }

  /* === TEST RESULT === */
  .cred-add__test-result {
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
    text-align: center;
  }

  .cred-add__test-result--valid {
    background: hsl(142 71% 45% / 0.15);
    color: var(--color-success, #22c55e);
  }

  .cred-add__test-result--invalid {
    background: hsl(0 84% 60% / 0.15);
    color: var(--color-danger, #ef4444);
  }

  /* === ERROR === */
  .cred-add__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--color-danger, #ef4444);
    padding: 0.5rem 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-bottom: 0.75rem;
  }

  /* === ACTIONS === */
  .cred-add__actions {
    display: flex;
    gap: 0.5rem;
    margin-top: 1rem;
  }

  .cred-add__btn {
    flex: 1;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--_transition), transform var(--_transition);
  }

  .cred-add__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .cred-add__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cred-add__btn--cancel {
    background: var(--_btn-cancel);
    color: var(--_color-muted);
  }

  .cred-add__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #252a33);
  }

  .cred-add__btn--save {
    flex: 2;
    background: var(--_btn-primary);
    color: white;
  }

  .cred-add__btn--save:hover:not(:disabled) {
    background: var(--color-success-hover, #16a34a);
  }

  /* === HINT === */
  .cred-add__hint {
    margin: 0.75rem 0 0;
    font-size: 0.75rem;
    color: var(--_color-muted);
    text-align: center;
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .cred-add__provider,
    .cred-add__level,
    .cred-add__input,
    .cred-add__btn {
      transition: none;
    }
  }
</style>
