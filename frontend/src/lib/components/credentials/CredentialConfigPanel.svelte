<!--
  CredentialConfigPanel.svelte
  ============================
  Panel para configurar/editar credencial existente.

  Abre via long press / click derecho en CredentialButton.

  Funcionalidad:
  - Ver credencial seleccionada
  - Actualizar API Key
  - Probar conexión
  - Eliminar credencial

  Skinnable via CSS Variables (desde tokens.json):
  --cred-config-bg, --cred-config-border, --cred-config-radius
  --cred-config-danger

  Uso:
    <CredentialConfigPanel
      bind:open={configOpen}
      credential={selectedCredential}
      on:update={handleUpdate}
      on:delete={handleDelete}
    />

  @version 1.0.0
  @author Event Core Team
-->
<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { FloatingPanel } from '$components/feedback';

  // ============================================================================
  // TYPES
  // ============================================================================

  export interface Credential {
    key: string;
    provider: string;
    providerName: string;
    providerIcon: string;
    level: string;
    identifier: string | null;
    preview: string;
  }

  interface TestResult {
    valid: boolean;
    message: string;
    lastTested?: string;
  }

  // ============================================================================
  // PROPS
  // ============================================================================

  /** Panel abierto/cerrado */
  export let open = false;

  /** Credencial a configurar */
  export let credential: Credential | null = null;

  /** Base URL de la API */
  export let apiBase = '/api/modules/credential-manager';

  // ============================================================================
  // STATE
  // ============================================================================

  let newApiKey = '';
  let showPassword = false;
  let loading = false;
  let testing = false;
  let deleting = false;
  let error: string | null = null;
  let testResult: TestResult | null = null;
  let confirmDelete = false;

  // ============================================================================
  // EVENTS
  // ============================================================================

  const dispatch = createEventDispatcher<{
    update: { key: string; provider: string };
    delete: { key: string };
    error: { message: string };
  }>();

  // ============================================================================
  // API FUNCTIONS
  // ============================================================================

  async function testCredential(): Promise<void> {
    if (!credential) return;

    testing = true;
    testResult = null;
    error = null;

    try {
      // Test con la nueva API key si existe, sino con la actual
      const apiKeyToTest = newApiKey || null;

      const res = await fetch(`${apiBase}/ui/test`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: credential.provider,
          key: credential.key,
          api_key: apiKeyToTest
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      testResult = {
        valid: data.valid ?? data.success,
        message: typeof data.message === 'string' ? data.message : (data.valid ? 'Conexión exitosa' : 'Conexión fallida'),
        lastTested: new Date().toLocaleTimeString()
      };
    } catch (err) {
      testResult = {
        valid: false,
        message: 'Error de conexión al probar',
        lastTested: new Date().toLocaleTimeString()
      };
    } finally {
      testing = false;
    }
  }

  async function updateCredential(): Promise<void> {
    if (!credential || !newApiKey) return;

    loading = true;
    error = null;

    try {
      const res = await fetch(`${apiBase}/credentials/${encodeURIComponent(credential.key)}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          api_key: newApiKey
        })
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        dispatch('update', { key: credential.key, provider: credential.provider });
        resetState();
        open = false;
      } else {
        error = data.message || data.error || 'Error al actualizar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al actualizar';
      dispatch('error', { message: error });
    } finally {
      loading = false;
    }
  }

  async function deleteCredential(): Promise<void> {
    if (!credential) return;

    deleting = true;
    error = null;

    try {
      const res = await fetch(`${apiBase}/credentials/${encodeURIComponent(credential.key)}`, {
        method: 'DELETE'
      });

      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const data = await res.json();

      if (data.success) {
        dispatch('delete', { key: credential.key });
        resetState();
        open = false;
      } else {
        error = data.message || data.error || 'Error al eliminar';
        dispatch('error', { message: error });
      }
    } catch (err) {
      error = 'Error de conexión al eliminar';
      dispatch('error', { message: error });
    } finally {
      deleting = false;
      confirmDelete = false;
    }
  }

  // ============================================================================
  // HANDLERS
  // ============================================================================

  function resetState(): void {
    newApiKey = '';
    showPassword = false;
    testResult = null;
    error = null;
    confirmDelete = false;
  }

  function handleClose(): void {
    resetState();
    open = false;
  }

  function togglePassword(): void {
    showPassword = !showPassword;
  }

  function startDelete(): void {
    confirmDelete = true;
  }

  function cancelDelete(): void {
    confirmDelete = false;
  }

  // Reset cuando cambia la credencial o se abre
  $: if (open || credential) {
    resetState();
  }
</script>

<FloatingPanel bind:open>
  <div class="cred-config">
    {#if credential}
      <!-- Header -->
      <div class="cred-config__header">
        <div class="cred-config__header-info">
          <span class="cred-config__icon">{credential.providerIcon}</span>
          <div>
            <h3 class="cred-config__title">{credential.providerName}</h3>
            <span class="cred-config__subtitle">
              {credential.level}
              {#if credential.identifier}
                / {credential.identifier}
              {/if}
            </span>
          </div>
        </div>
        <button
          type="button"
          class="cred-config__close"
          on:click={handleClose}
          aria-label="Cerrar"
        >
          ✕
        </button>
      </div>

      <!-- Current Key Preview -->
      <div class="cred-config__current">
        <span class="cred-config__label">API Key actual</span>
        <code class="cred-config__preview">{credential.preview}</code>
      </div>

      <!-- New API Key -->
      <div class="cred-config__field">
        <label class="cred-config__label">
          Nueva API Key
          <span class="cred-config__label-hint">(dejar vacío para mantener)</span>
        </label>
        <div class="cred-config__password-wrapper">
          {#if showPassword}
            <input
              type="text"
              class="cred-config__input"
              placeholder="sk-..."
              bind:value={newApiKey}
            />
          {:else}
            <input
              type="password"
              class="cred-config__input"
              placeholder="sk-..."
              bind:value={newApiKey}
            />
          {/if}
          <button
            type="button"
            class="cred-config__toggle-password"
            on:click={togglePassword}
            aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
          >
            {showPassword ? '🙈' : '👁'}
          </button>
        </div>
      </div>

      <!-- Test Button -->
      <button
        type="button"
        class="cred-config__test-btn"
        on:click={testCredential}
        disabled={testing}
      >
        {testing ? '🔍 Probando...' : '🧪 Probar conexión'}
      </button>

      <!-- Test Result -->
      {#if testResult}
        <div
          class="cred-config__test-result"
          class:cred-config__test-result--valid={testResult.valid}
          class:cred-config__test-result--invalid={!testResult.valid}
        >
          <span>{testResult.valid ? '✅' : '❌'} {testResult.message}</span>
          {#if testResult.lastTested}
            <span class="cred-config__test-time">Último test: {testResult.lastTested}</span>
          {/if}
        </div>
      {/if}

      <!-- Error -->
      {#if error}
        <div class="cred-config__error">{error}</div>
      {/if}

      <!-- Divider -->
      <div class="cred-config__divider"></div>

      <!-- Actions -->
      {#if confirmDelete}
        <!-- Delete Confirmation -->
        <div class="cred-config__confirm-delete">
          <p class="cred-config__confirm-text">
            ⚠️ ¿Eliminar credencial <strong>{credential.key}</strong>?
          </p>
          <p class="cred-config__confirm-warning">
            Esta acción eliminará la API key del archivo .env
          </p>
          <div class="cred-config__confirm-actions">
            <button
              type="button"
              class="cred-config__btn cred-config__btn--cancel"
              on:click={cancelDelete}
              disabled={deleting}
            >
              Cancelar
            </button>
            <button
              type="button"
              class="cred-config__btn cred-config__btn--delete"
              on:click={deleteCredential}
              disabled={deleting}
            >
              {deleting ? '⏳ Eliminando...' : '🗑️ Confirmar'}
            </button>
          </div>
        </div>
      {:else}
        <!-- Normal Actions -->
        <div class="cred-config__actions">
          <button
            type="button"
            class="cred-config__btn cred-config__btn--danger"
            on:click={startDelete}
            disabled={loading || testing}
          >
            🗑️ Eliminar
          </button>
          <button
            type="button"
            class="cred-config__btn cred-config__btn--cancel"
            on:click={handleClose}
            disabled={loading || testing}
          >
            Cancelar
          </button>
          <button
            type="button"
            class="cred-config__btn cred-config__btn--save"
            on:click={updateCredential}
            disabled={!newApiKey || loading || testing}
          >
            {loading ? '⏳ Guardando...' : '💾 Guardar'}
          </button>
        </div>
      {/if}
    {:else}
      <!-- No credential selected -->
      <div class="cred-config__empty">
        <p>Selecciona una credencial para configurar</p>
        <button
          type="button"
          class="cred-config__btn cred-config__btn--cancel"
          on:click={handleClose}
        >
          Cerrar
        </button>
      </div>
    {/if}
  </div>
</FloatingPanel>

<style>
  /*
   * CSS Variables - Skinnable desde el padre
   * =========================================
   */
  .cred-config {
    /* === SKINNABLE VARIABLES === */
    --_bg: var(--cred-config-bg, var(--color-bg-card, #1a1d24));
    --_color: var(--cred-config-color, var(--color-text, #ffffff));
    --_color-muted: var(--cred-config-color-muted, var(--color-text-muted, #9ca3af));
    --_border: var(--cred-config-border, var(--color-border, #374151));
    --_radius: var(--cred-config-radius, var(--radius-lg, 12px));
    --_input-bg: var(--cred-config-input-bg, var(--color-bg-input, #0d0f12));
    --_danger: var(--cred-config-danger, var(--color-danger, #ef4444));
    --_success: var(--cred-config-success, var(--color-success, #22c55e));
    --_primary: var(--cred-config-primary, var(--color-primary, #3b82f6));
    --_transition: var(--cred-config-transition, var(--transition-fast, 150ms));

    /* === LAYOUT === */
    min-width: 320px;
    max-width: 380px;
    padding: 1rem;
    background: var(--_bg);
    color: var(--_color);
  }

  /* === HEADER === */
  .cred-config__header {
    display: flex;
    justify-content: space-between;
    align-items: flex-start;
    margin-bottom: 1rem;
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--_border);
  }

  .cred-config__header-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .cred-config__icon {
    font-size: 2rem;
  }

  .cred-config__title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
  }

  .cred-config__subtitle {
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  .cred-config__close {
    background: none;
    border: none;
    font-size: 1rem;
    color: var(--_color-muted);
    cursor: pointer;
    padding: 0.25rem;
    transition: color var(--_transition);
  }

  .cred-config__close:hover {
    color: var(--_color);
  }

  /* === CURRENT KEY === */
  .cred-config__current {
    background: var(--_input-bg);
    padding: 0.75rem;
    border-radius: 8px;
    margin-bottom: 1rem;
  }

  .cred-config__preview {
    display: block;
    font-family: monospace;
    font-size: 0.875rem;
    color: var(--_color-muted);
    margin-top: 0.25rem;
  }

  /* === FIELD === */
  .cred-config__field {
    margin-bottom: 1rem;
  }

  .cred-config__label {
    display: block;
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--_color-muted);
    margin-bottom: 0.5rem;
  }

  .cred-config__label-hint {
    font-weight: 400;
    font-size: 0.75rem;
    opacity: 0.7;
  }

  /* === INPUT === */
  .cred-config__input {
    width: 100%;
    padding: 0.75rem;
    padding-right: 3rem;
    font-size: 0.875rem;
    background: var(--_input-bg);
    color: var(--_color);
    border: 1px solid var(--_border);
    border-radius: 8px;
    transition: border-color var(--_transition);
  }

  .cred-config__input:focus {
    outline: none;
    border-color: var(--_primary);
  }

  .cred-config__input::placeholder {
    color: var(--_color-muted);
  }

  /* === PASSWORD WRAPPER === */
  .cred-config__password-wrapper {
    position: relative;
    display: flex;
    align-items: center;
  }

  .cred-config__toggle-password {
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

  .cred-config__toggle-password:hover {
    opacity: 1;
  }

  /* === TEST BUTTON === */
  .cred-config__test-btn {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    background: hsl(217 91% 60% / 0.15);
    color: var(--_primary);
    border: 1px solid var(--_primary);
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--_transition);
  }

  .cred-config__test-btn:hover:not(:disabled) {
    background: hsl(217 91% 60% / 0.25);
  }

  .cred-config__test-btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  /* === TEST RESULT === */
  .cred-config__test-result {
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-top: 0.75rem;
  }

  .cred-config__test-result--valid {
    background: hsl(142 71% 45% / 0.15);
    color: var(--_success);
  }

  .cred-config__test-result--invalid {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
  }

  .cred-config__test-time {
    font-size: 0.75rem;
    opacity: 0.7;
  }

  /* === ERROR === */
  .cred-config__error {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
    padding: 0.75rem;
    border-radius: 8px;
    font-size: 0.875rem;
    margin-top: 0.75rem;
  }

  /* === DIVIDER === */
  .cred-config__divider {
    height: 1px;
    background: var(--_border);
    margin: 1rem 0;
  }

  /* === ACTIONS === */
  .cred-config__actions {
    display: flex;
    gap: 0.5rem;
  }

  .cred-config__btn {
    padding: 0.75rem;
    font-size: 0.875rem;
    font-weight: 500;
    border: none;
    border-radius: 8px;
    cursor: pointer;
    transition: background var(--_transition), transform var(--_transition);
  }

  .cred-config__btn:active:not(:disabled) {
    transform: scale(0.98);
  }

  .cred-config__btn:disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .cred-config__btn--danger {
    background: hsl(0 84% 60% / 0.15);
    color: var(--_danger);
  }

  .cred-config__btn--danger:hover:not(:disabled) {
    background: hsl(0 84% 60% / 0.25);
  }

  .cred-config__btn--cancel {
    flex: 1;
    background: var(--color-bg-hover, #252a33);
    color: var(--_color-muted);
  }

  .cred-config__btn--cancel:hover:not(:disabled) {
    background: var(--color-bg-hover, #2a2f38);
  }

  .cred-config__btn--save {
    flex: 2;
    background: var(--_success);
    color: white;
  }

  .cred-config__btn--save:hover:not(:disabled) {
    background: var(--color-success-hover, #16a34a);
  }

  .cred-config__btn--delete {
    flex: 1;
    background: var(--_danger);
    color: white;
  }

  .cred-config__btn--delete:hover:not(:disabled) {
    background: var(--color-danger-hover, #dc2626);
  }

  /* === CONFIRM DELETE === */
  .cred-config__confirm-delete {
    text-align: center;
  }

  .cred-config__confirm-text {
    margin: 0 0 0.5rem;
    font-size: 0.875rem;
  }

  .cred-config__confirm-warning {
    margin: 0 0 1rem;
    font-size: 0.75rem;
    color: var(--_color-muted);
  }

  .cred-config__confirm-actions {
    display: flex;
    gap: 0.5rem;
    justify-content: center;
  }

  /* === EMPTY STATE === */
  .cred-config__empty {
    text-align: center;
    padding: 1rem;
    color: var(--_color-muted);
  }

  .cred-config__empty p {
    margin: 0 0 1rem;
  }

  /* === REDUCED MOTION === */
  @media (prefers-reduced-motion: reduce) {
    .cred-config__close,
    .cred-config__input,
    .cred-config__test-btn,
    .cred-config__btn {
      transition: none;
    }
  }
</style>
