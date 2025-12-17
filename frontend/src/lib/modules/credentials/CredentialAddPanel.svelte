<script lang="ts">
  /**
   * CredentialAddPanel - Formulario para agregar credencial
   *
   * Features:
   * - Seleccionar provider (DEEPSEEK, OPENAI, ANTHROPIC, OLLAMA)
   * - Seleccionar nivel (GLOBAL, PROJECT, CLIENT, CUSTOM)
   * - Input de identificador cuando es necesario
   * - Test de API key antes de guardar
   */

  import { onMount } from 'svelte';
  import { closePanel } from '$lib/ui-core';
  import {
    credentialsStore,
    saveCredential,
    testCredential,
    fetchCredentials
  } from '$lib/stores/credentials';
  import { browser } from '$app/environment';

  export let panelId: string;

  // Form state
  let form = {
    provider: 'DEEPSEEK',
    level: 'GLOBAL',
    identifier: '',
    apiKey: ''
  };

  // Operation state
  let saving = false;
  let testing = false;
  let error: string | null = null;
  let testResult: { valid: boolean; message: string } | null = null;
  let showPassword = false;

  // Projects list for PROJECT level
  let projects: Array<{ id: string; name: string }> = [];
  let loadingProjects = false;

  // Computed
  $: providers = $credentialsStore.providers;
  $: levels = $credentialsStore.levels;
  $: selectedLevel = levels.find(l => l.id === form.level);
  $: requiresIdentifier = selectedLevel?.requiresIdentifier ?? false;
  $: isProjectLevel = form.level === 'PROJECT';
  $: needsManualInput = requiresIdentifier && !isProjectLevel;
  $: canSave = form.apiKey.length > 0 && (!requiresIdentifier || form.identifier.length > 0);

  // Load projects when PROJECT level selected
  $: if (isProjectLevel && projects.length === 0 && !loadingProjects) {
    loadProjects();
  }

  // API base
  function getApiBase(): string {
    if (!browser) return '';
    return `http://${window.location.hostname}:3000/modules`;
  }

  // Load projects from project-manager
  async function loadProjects() {
    loadingProjects = true;
    try {
      const res = await fetch(`${getApiBase()}/project-manager/api/projects`);
      if (res.ok) {
        const data = await res.json();
        if (data.success && Array.isArray(data.projects)) {
          projects = data.projects;
        }
      }
    } catch (err) {
      console.error('Error loading projects:', err);
    } finally {
      loadingProjects = false;
    }
  }

  // Test the API key
  async function handleTest() {
    if (!form.apiKey || !form.provider) return;

    testing = true;
    error = null;
    testResult = null;

    testResult = await testCredential(form.provider, form.apiKey);
    testing = false;
  }

  // Save credential
  async function handleSave() {
    if (!canSave || saving) return;

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

    const result = await saveCredential(
      form.provider,
      form.level,
      requiresIdentifier ? form.identifier : null,
      form.apiKey
    );

    saving = false;

    if (result.success) {
      closePanel();
    } else {
      error = result.error || 'Error al guardar';
    }
  }

  // Cancel and close
  function handleCancel() {
    closePanel();
  }

  // Reset form
  function resetForm() {
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

  // Toggle password visibility
  function togglePassword() {
    showPassword = !showPassword;
  }

  // Load initial data
  onMount(() => {
    if (providers.length === 0) {
      fetchCredentials();
    }
  });
</script>

<div class="credential-add">
  <!-- Header -->
  <div class="header">
    <h3 class="title">Nueva Credencial</h3>
  </div>

  <!-- Provider Selection -->
  <div class="field">
    <label class="label">Proveedor</label>
    <div class="providers">
      {#each providers as p (p.id)}
        <button
          type="button"
          class="provider-btn"
          class:active={form.provider === p.id}
          on:click={() => { form.provider = p.id; testResult = null; }}
        >
          <span class="provider-icon">{p.icon}</span>
          <span class="provider-name">{p.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Level Selection -->
  <div class="field">
    <label class="label">Nivel</label>
    <div class="levels">
      {#each levels as l (l.id)}
        <button
          type="button"
          class="level-btn"
          class:active={form.level === l.id}
          on:click={() => { form.level = l.id; form.identifier = ''; }}
        >
          <span>{l.icon}</span>
          <span>{l.name}</span>
        </button>
      {/each}
    </div>
  </div>

  <!-- Project Selector (when level = PROJECT) -->
  {#if isProjectLevel}
    <div class="field">
      <label class="label">Proyecto</label>
      {#if loadingProjects}
        <div class="loading-field">Cargando proyectos...</div>
      {:else if projects.length > 0}
        <select
          class="select"
          bind:value={form.identifier}
        >
          <option value="">Seleccionar proyecto...</option>
          {#each projects as project (project.id)}
            <option value={project.id}>
              {project.name}
            </option>
          {/each}
        </select>
      {:else}
        <input
          type="text"
          class="input"
          placeholder="ID del proyecto"
          bind:value={form.identifier}
        />
        <span class="field-hint">No se encontraron proyectos</span>
      {/if}
    </div>
  {/if}

  <!-- Identifier (CLIENT, CUSTOM) -->
  {#if needsManualInput}
    <div class="field">
      <label class="label">Identificador</label>
      <input
        type="text"
        class="input"
        placeholder={form.level === 'CLIENT' ? 'cliente-xyz' : 'custom-id'}
        bind:value={form.identifier}
      />
    </div>
  {/if}

  <!-- API Key -->
  <div class="field">
    <label class="label">API Key</label>
    <div class="password-wrapper">
      {#if showPassword}
        <input
          type="text"
          class="input password-input"
          placeholder="sk-..."
          bind:value={form.apiKey}
          on:input={() => testResult = null}
        />
      {:else}
        <input
          type="password"
          class="input password-input"
          placeholder="sk-..."
          bind:value={form.apiKey}
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
      on:click={handleCancel}
      disabled={saving || testing}
    >
      Cancelar
    </button>
    <button
      type="button"
      class="btn test"
      on:click={handleTest}
      disabled={!form.apiKey || testing || saving}
    >
      {testing ? '🔍 Validando...' : '🧪 Test'}
    </button>
    <button
      type="button"
      class="btn save"
      on:click={handleSave}
      disabled={!canSave || saving || testing}
    >
      {saving ? '⏳ Guardando...' : '💾 Guardar'}
    </button>
  </div>

  <!-- Hint -->
  <p class="hint">Se valida la API key antes de guardar</p>
</div>

<style>
  .credential-add {
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

  /* Providers */
  .providers {
    display: grid;
    grid-template-columns: repeat(2, 1fr);
    gap: 0.5rem;
  }

  .provider-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 2px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .provider-btn:hover {
    border-color: var(--color-primary, #3b82f6);
  }

  .provider-btn.active {
    border-color: var(--color-primary, #3b82f6);
    background: rgba(59, 130, 246, 0.1);
  }

  .provider-icon {
    font-size: 1.5rem;
  }

  .provider-name {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  /* Levels */
  .levels {
    display: grid;
    grid-template-columns: repeat(4, 1fr);
    gap: 0.25rem;
  }

  .level-btn {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.125rem;
    padding: 0.5rem 0.25rem;
    font-size: 0.625rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 2px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    cursor: pointer;
    transition: all 0.15s;
    color: var(--color-text-muted, #a3a3a3);
  }

  .level-btn:hover {
    border-color: var(--color-primary, #3b82f6);
  }

  .level-btn.active {
    border-color: var(--color-primary, #3b82f6);
    background: rgba(59, 130, 246, 0.1);
    color: var(--color-text, #e5e5e5);
  }

  /* Select */
  .select {
    width: 100%;
    padding: 0.75rem;
    font-size: 0.875rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    color: var(--color-text, #e5e5e5);
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    cursor: pointer;
    transition: border-color 0.15s;
  }

  .select:focus {
    outline: none;
    border-color: var(--color-primary, #3b82f6);
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

  /* Loading field */
  .loading-field {
    padding: 0.75rem;
    font-size: 0.875rem;
    color: var(--color-text-muted, #a3a3a3);
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    text-align: center;
  }

  .field-hint {
    font-size: 0.75rem;
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
    background: var(--color-success, #22c55e);
    color: white;
    flex: 1.4;
  }

  .btn.save:hover:not(:disabled) {
    background: var(--color-success-hover, #16a34a);
  }

  /* Hint */
  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    text-align: center;
  }
</style>
