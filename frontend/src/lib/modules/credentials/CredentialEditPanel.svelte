<script lang="ts">
  /**
   * CredentialEditPanel - Formulario para editar credencial existente
   *
   * Features:
   * - Muestra info de la credencial actual
   * - Permite actualizar solo el API key
   * - Test antes de guardar
   */

  import { closePanel } from '$lib/ui-core';
  import {
    editingCredential,
    updateCredential,
    testCredential,
    clearEditingCredential
  } from '$lib/stores/credentials';

  export let panelId: string;

  // Form state
  let newApiKey = '';

  // Operation state
  let saving = false;
  let testing = false;
  let error: string | null = null;
  let testResult: { valid: boolean; message: string } | null = null;
  let showPassword = false;

  // Computed
  $: credential = $editingCredential;
  $: canSave = newApiKey.length > 0;

  // Level info
  const levelInfo: Record<string, { icon: string; label: string }> = {
    GLOBAL: { icon: '🌐', label: 'Global' },
    PROJECT: { icon: '📁', label: 'Proyecto' },
    CLIENT: { icon: '👤', label: 'Cliente' },
    CUSTOM: { icon: '⚙️', label: 'Custom' }
  };

  // Test the API key
  async function handleTest() {
    if (!newApiKey || !credential) return;

    testing = true;
    error = null;
    testResult = null;

    testResult = await testCredential(credential.provider, newApiKey);
    testing = false;
  }

  // Save credential
  async function handleSave() {
    if (!canSave || !credential || saving) return;

    // Test first if not tested
    if (!testResult) {
      await handleTest();
      if (!testResult?.valid) {
        error = testResult?.message || 'API key no valida';
        return;
      }
    } else if (!testResult.valid) {
      error = 'API key no valida, corrige antes de guardar';
      return;
    }

    saving = true;
    error = null;

    const result = await updateCredential(credential.key, newApiKey);

    saving = false;

    if (result.success) {
      handleClose();
    } else {
      error = result.error || 'Error al actualizar';
    }
  }

  // Cancel and close
  function handleClose() {
    clearEditingCredential();
    newApiKey = '';
    testResult = null;
    error = null;
    showPassword = false;
    closePanel();
  }

  // Toggle password visibility
  function togglePassword() {
    showPassword = !showPassword;
  }
</script>

<div class="credential-edit">
  {#if credential}
    <!-- Header -->
    <div class="header">
      <h3 class="title">Editar Credencial</h3>
    </div>

    <!-- Current credential info -->
    <div class="current-info">
      <div class="info-row">
        <span class="info-label">Proveedor</span>
        <span class="info-value">
          <span class="info-icon">{credential.providerIcon}</span>
          {credential.providerName}
        </span>
      </div>
      <div class="info-row">
        <span class="info-label">Nivel</span>
        <span class="info-value">
          <span class="info-icon">{levelInfo[credential.level]?.icon || '🔑'}</span>
          {levelInfo[credential.level]?.label || credential.level}
        </span>
      </div>
      {#if credential.identifier}
        <div class="info-row">
          <span class="info-label">Identificador</span>
          <span class="info-value">{credential.identifier}</span>
        </div>
      {/if}
      <div class="info-row">
        <span class="info-label">Key actual</span>
        <span class="info-value mono">{credential.preview}</span>
      </div>
    </div>

    <!-- New API Key -->
    <div class="field">
      <label class="label">Nueva API Key</label>
      <div class="password-wrapper">
        {#if showPassword}
          <input
            type="text"
            class="input password-input"
            placeholder="sk-..."
            bind:value={newApiKey}
            on:input={() => testResult = null}
          />
        {:else}
          <input
            type="password"
            class="input password-input"
            placeholder="sk-..."
            bind:value={newApiKey}
            on:input={() => testResult = null}
          />
        {/if}
        <button
          type="button"
          class="toggle-password"
          on:click={togglePassword}
          aria-label={showPassword ? 'Ocultar' : 'Mostrar'}
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
      <div class="error">{error}</div>
    {/if}

    <!-- Actions -->
    <div class="actions">
      <button
        type="button"
        class="btn cancel"
        on:click={handleClose}
        disabled={saving || testing}
      >
        Cancelar
      </button>
      <button
        type="button"
        class="btn test"
        on:click={handleTest}
        disabled={!newApiKey || testing || saving}
      >
        {testing ? '🔍 Validando...' : '🧪 Test'}
      </button>
      <button
        type="button"
        class="btn save"
        on:click={handleSave}
        disabled={!canSave || saving || testing}
      >
        {saving ? '⏳ Guardando...' : '💾 Actualizar'}
      </button>
    </div>

    <!-- Hint -->
    <p class="hint">La API key anterior sera reemplazada</p>
  {:else}
    <!-- No credential selected -->
    <div class="empty">
      <span class="empty-icon">🔑</span>
      <span class="empty-text">No hay credencial seleccionada</span>
      <button class="btn cancel" on:click={handleClose}>Cerrar</button>
    </div>
  {/if}
</div>

<style>
  .credential-edit {
    display: flex;
    flex-direction: column;
    gap: 1rem;
  }

  /* Header */
  .header {
    padding-bottom: 0.75rem;
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .title {
    margin: 0;
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  /* Current info */
  .current-info {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    padding: 1rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
  }

  .info-row {
    display: flex;
    justify-content: space-between;
    align-items: center;
    gap: 1rem;
  }

  .info-label {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .info-value {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    font-size: 0.875rem;
    color: var(--color-text, #e5e5e5);
    font-weight: 500;
  }

  .info-value.mono {
    font-family: monospace;
    font-weight: 400;
  }

  .info-icon {
    font-size: 1rem;
  }

  /* Field */
  .field {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .label {
    font-size: 0.875rem;
    font-weight: 500;
    color: var(--color-text-muted, #a3a3a3);
  }

  /* Input */
  .input {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    transition: border-color 0.15s;
  }

  .input:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
  }

  .input::placeholder {
    color: var(--color-text-muted, #a3a3a3);
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

  /* Test result */
  .test-result {
    padding: 0.75rem;
    border-radius: 0.5rem;
    font-size: 0.875rem;
    text-align: center;
  }

  .test-result.valid {
    background: rgba(34, 197, 94, 0.15);
    color: var(--color-success, #22c55e);
  }

  .test-result.invalid {
    background: rgba(239, 68, 68, 0.15);
    color: var(--color-danger, #ef4444);
  }

  /* Error */
  .error {
    padding: 0.75rem;
    background: rgba(239, 68, 68, 0.15);
    color: var(--color-danger, #ef4444);
    border-radius: 0.5rem;
    font-size: 0.875rem;
    text-align: center;
  }

  /* Actions */
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

  .btn.cancel {
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    color: var(--color-text-muted, #a3a3a3);
    flex: 0.8;
  }

  .btn.cancel:hover:not(:disabled) {
    background: var(--color-hover, rgba(255, 255, 255, 0.15));
  }

  .btn.test {
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    color: var(--color-text, #e5e5e5);
    flex: 0.8;
  }

  .btn.test:hover:not(:disabled) {
    background: var(--color-hover, rgba(255, 255, 255, 0.15));
  }

  .btn.save {
    background: var(--color-primary, #3b82f6);
    color: white;
    flex: 1.4;
  }

  .btn.save:hover:not(:disabled) {
    background: var(--color-primary-hover, #2563eb);
  }

  /* Hint */
  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    text-align: center;
  }

  /* Empty state */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 1rem;
    padding: 2rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .empty-text {
    color: var(--color-text-muted, #a3a3a3);
  }
</style>
