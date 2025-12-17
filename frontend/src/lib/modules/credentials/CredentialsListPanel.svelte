<script lang="ts">
  /**
   * CredentialsListPanel - Lista de credenciales con CRUD
   *
   * Features:
   * - Lista de credenciales agrupadas por nivel
   * - Acciones: editar, eliminar
   * - Botón para agregar nueva credencial
   * - Indicadores visuales de estado
   */

  import { onMount } from 'svelte';
  import { openPanel, closePanel } from '$lib/ui-core';
  import {
    credentialsStore,
    globalCredentials,
    projectCredentials,
    clientCredentials,
    customCredentials,
    fetchCredentials,
    deleteCredential,
    setEditingCredential,
    type Credential
  } from '$lib/stores/credentials';

  export let panelId: string;

  // State
  let deleting: string | null = null;
  let deleteError: string | null = null;

  // Level icons and labels
  const levelInfo = {
    GLOBAL: { icon: '🌐', label: 'Global', description: 'Disponible para todos' },
    PROJECT: { icon: '📁', label: 'Proyecto', description: 'Específico del proyecto' },
    CLIENT: { icon: '👤', label: 'Cliente', description: 'Específico del cliente' },
    CUSTOM: { icon: '⚙️', label: 'Custom', description: 'Configuración personalizada' }
  };

  // Open add panel
  function handleAdd() {
    openPanel('credentials-add');
  }

  // Open edit panel
  function handleEdit(credential: Credential) {
    setEditingCredential(credential);
    openPanel('credentials-edit');
  }

  // Delete credential
  async function handleDelete(credential: Credential) {
    if (deleting) return;

    if (!confirm(`¿Eliminar credencial ${credential.providerName} (${credential.level})?`)) {
      return;
    }

    deleting = credential.key;
    deleteError = null;

    const result = await deleteCredential(credential.key);

    if (!result.success) {
      deleteError = result.error || 'Error al eliminar';
    }

    deleting = null;
  }

  // Refresh
  function handleRefresh() {
    fetchCredentials();
  }

  // Load on mount
  onMount(() => {
    if ($credentialsStore.credentials.length === 0) {
      fetchCredentials();
    }
  });
</script>

<div class="credentials-list">
  <!-- Header -->
  <div class="header">
    <div class="header-info">
      <span class="header-icon">🔐</span>
      <div class="header-text">
        <span class="header-title">Credenciales</span>
        <span class="header-subtitle">
          {$credentialsStore.stats.total} configuradas
        </span>
      </div>
    </div>
    <div class="header-actions">
      <button class="icon-btn" on:click={handleRefresh} title="Refrescar">
        🔄
      </button>
      <button class="add-btn" on:click={handleAdd}>
        ➕ Agregar
      </button>
    </div>
  </div>

  <!-- Loading -->
  {#if $credentialsStore.loading}
    <div class="loading">
      <span class="loading-icon">⏳</span>
      <span>Cargando credenciales...</span>
    </div>
  {:else if $credentialsStore.error}
    <!-- Error -->
    <div class="error">
      <span class="error-icon">❌</span>
      <span>{$credentialsStore.error}</span>
      <button class="retry-btn" on:click={handleRefresh}>Reintentar</button>
    </div>
  {:else if $credentialsStore.credentials.length === 0}
    <!-- Empty state -->
    <div class="empty">
      <span class="empty-icon">🔑</span>
      <span class="empty-title">Sin credenciales</span>
      <span class="empty-text">Agrega tu primera API key para comenzar</span>
      <button class="add-btn-large" on:click={handleAdd}>
        ➕ Agregar credencial
      </button>
    </div>
  {:else}
    <!-- Delete error -->
    {#if deleteError}
      <div class="delete-error">
        ❌ {deleteError}
      </div>
    {/if}

    <!-- Credentials list -->
    <div class="sections">
      <!-- GLOBAL -->
      {#if $globalCredentials.length > 0}
        <div class="section">
          <div class="section-header">
            <span class="section-icon">{levelInfo.GLOBAL.icon}</span>
            <span class="section-title">{levelInfo.GLOBAL.label}</span>
            <span class="section-count">{$globalCredentials.length}</span>
          </div>
          <div class="section-items">
            {#each $globalCredentials as cred (cred.key)}
              <div class="credential-item" class:deleting={deleting === cred.key}>
                <span class="cred-icon">{cred.providerIcon}</span>
                <div class="cred-info">
                  <span class="cred-name">{cred.providerName}</span>
                  <span class="cred-preview">{cred.preview}</span>
                </div>
                <div class="cred-actions">
                  <button
                    class="action-btn edit"
                    on:click={() => handleEdit(cred)}
                    title="Editar"
                    disabled={deleting === cred.key}
                  >
                    ✏️
                  </button>
                  <button
                    class="action-btn delete"
                    on:click={() => handleDelete(cred)}
                    title="Eliminar"
                    disabled={deleting === cred.key}
                  >
                    {deleting === cred.key ? '⏳' : '🗑️'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- PROJECT -->
      {#if $projectCredentials.length > 0}
        <div class="section">
          <div class="section-header">
            <span class="section-icon">{levelInfo.PROJECT.icon}</span>
            <span class="section-title">{levelInfo.PROJECT.label}</span>
            <span class="section-count">{$projectCredentials.length}</span>
          </div>
          <div class="section-items">
            {#each $projectCredentials as cred (cred.key)}
              <div class="credential-item" class:deleting={deleting === cred.key}>
                <span class="cred-icon">{cred.providerIcon}</span>
                <div class="cred-info">
                  <span class="cred-name">{cred.providerName}</span>
                  <span class="cred-identifier">📁 {cred.identifier}</span>
                  <span class="cred-preview">{cred.preview}</span>
                </div>
                <div class="cred-actions">
                  <button
                    class="action-btn edit"
                    on:click={() => handleEdit(cred)}
                    title="Editar"
                    disabled={deleting === cred.key}
                  >
                    ✏️
                  </button>
                  <button
                    class="action-btn delete"
                    on:click={() => handleDelete(cred)}
                    title="Eliminar"
                    disabled={deleting === cred.key}
                  >
                    {deleting === cred.key ? '⏳' : '🗑️'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- CLIENT -->
      {#if $clientCredentials.length > 0}
        <div class="section">
          <div class="section-header">
            <span class="section-icon">{levelInfo.CLIENT.icon}</span>
            <span class="section-title">{levelInfo.CLIENT.label}</span>
            <span class="section-count">{$clientCredentials.length}</span>
          </div>
          <div class="section-items">
            {#each $clientCredentials as cred (cred.key)}
              <div class="credential-item" class:deleting={deleting === cred.key}>
                <span class="cred-icon">{cred.providerIcon}</span>
                <div class="cred-info">
                  <span class="cred-name">{cred.providerName}</span>
                  <span class="cred-identifier">👤 {cred.identifier}</span>
                  <span class="cred-preview">{cred.preview}</span>
                </div>
                <div class="cred-actions">
                  <button
                    class="action-btn edit"
                    on:click={() => handleEdit(cred)}
                    title="Editar"
                    disabled={deleting === cred.key}
                  >
                    ✏️
                  </button>
                  <button
                    class="action-btn delete"
                    on:click={() => handleDelete(cred)}
                    title="Eliminar"
                    disabled={deleting === cred.key}
                  >
                    {deleting === cred.key ? '⏳' : '🗑️'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- CUSTOM -->
      {#if $customCredentials.length > 0}
        <div class="section">
          <div class="section-header">
            <span class="section-icon">{levelInfo.CUSTOM.icon}</span>
            <span class="section-title">{levelInfo.CUSTOM.label}</span>
            <span class="section-count">{$customCredentials.length}</span>
          </div>
          <div class="section-items">
            {#each $customCredentials as cred (cred.key)}
              <div class="credential-item" class:deleting={deleting === cred.key}>
                <span class="cred-icon">{cred.providerIcon}</span>
                <div class="cred-info">
                  <span class="cred-name">{cred.providerName}</span>
                  <span class="cred-identifier">⚙️ {cred.identifier}</span>
                  <span class="cred-preview">{cred.preview}</span>
                </div>
                <div class="cred-actions">
                  <button
                    class="action-btn edit"
                    on:click={() => handleEdit(cred)}
                    title="Editar"
                    disabled={deleting === cred.key}
                  >
                    ✏️
                  </button>
                  <button
                    class="action-btn delete"
                    on:click={() => handleDelete(cred)}
                    title="Eliminar"
                    disabled={deleting === cred.key}
                  >
                    {deleting === cred.key ? '⏳' : '🗑️'}
                  </button>
                </div>
              </div>
            {/each}
          </div>
        </div>
      {/if}
    </div>
  {/if}

  <!-- Footer hint -->
  <div class="footer">
    <p class="hint">
      🔒 Las credenciales se almacenan encriptadas en el servidor
    </p>
  </div>
</div>

<style>
  .credentials-list {
    display: flex;
    flex-direction: column;
    height: 100%;
    gap: 1rem;
  }

  /* Header */
  .header {
    display: flex;
    align-items: center;
    justify-content: space-between;
    padding: 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border-radius: 0.5rem;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .header-info {
    display: flex;
    align-items: center;
    gap: 0.75rem;
  }

  .header-icon {
    font-size: 1.5rem;
  }

  .header-text {
    display: flex;
    flex-direction: column;
  }

  .header-title {
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  .header-subtitle {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .header-actions {
    display: flex;
    gap: 0.5rem;
  }

  .icon-btn {
    padding: 0.5rem;
    background: transparent;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.375rem;
    cursor: pointer;
    font-size: 1rem;
    transition: all 0.15s;
  }

  .icon-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .add-btn {
    padding: 0.5rem 0.75rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.375rem;
    color: white;
    font-size: 0.875rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .add-btn:hover {
    background: var(--color-primary-hover, #2563eb);
  }

  /* Loading */
  .loading {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.5rem;
    padding: 2rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .loading-icon {
    font-size: 2rem;
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  /* Error */
  .error {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.5rem;
    padding: 1.5rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.5rem;
    color: var(--color-danger, #ef4444);
  }

  .error-icon {
    font-size: 1.5rem;
  }

  .retry-btn {
    margin-top: 0.5rem;
    padding: 0.5rem 1rem;
    background: transparent;
    border: 1px solid var(--color-danger, #ef4444);
    border-radius: 0.375rem;
    color: var(--color-danger, #ef4444);
    cursor: pointer;
    transition: all 0.15s;
  }

  .retry-btn:hover {
    background: rgba(239, 68, 68, 0.1);
  }

  /* Empty state */
  .empty {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    gap: 0.75rem;
    padding: 3rem 1rem;
    text-align: center;
  }

  .empty-icon {
    font-size: 3rem;
    opacity: 0.5;
  }

  .empty-title {
    font-size: 1.125rem;
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  .empty-text {
    font-size: 0.875rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .add-btn-large {
    margin-top: 1rem;
    padding: 0.75rem 1.5rem;
    background: var(--color-primary, #3b82f6);
    border: none;
    border-radius: 0.5rem;
    color: white;
    font-size: 1rem;
    font-weight: 500;
    cursor: pointer;
    transition: all 0.15s;
  }

  .add-btn-large:hover {
    background: var(--color-primary-hover, #2563eb);
  }

  /* Delete error */
  .delete-error {
    padding: 0.75rem;
    background: rgba(239, 68, 68, 0.1);
    border: 1px solid rgba(239, 68, 68, 0.3);
    border-radius: 0.375rem;
    color: var(--color-danger, #ef4444);
    font-size: 0.875rem;
    text-align: center;
  }

  /* Sections */
  .sections {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    flex: 1;
    overflow-y: auto;
  }

  .section {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
  }

  .section-header {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0;
  }

  .section-icon {
    font-size: 1rem;
  }

  .section-title {
    font-size: 0.75rem;
    font-weight: 600;
    color: var(--color-text-muted, #a3a3a3);
    text-transform: uppercase;
    letter-spacing: 0.05em;
  }

  .section-count {
    font-size: 0.625rem;
    padding: 0.125rem 0.375rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
    border-radius: 9999px;
    color: var(--color-text-muted, #a3a3a3);
  }

  .section-items {
    display: flex;
    flex-direction: column;
    gap: 0.375rem;
  }

  /* Credential item */
  .credential-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.5rem;
    transition: all 0.15s;
  }

  .credential-item:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.05));
    border-color: var(--color-border-hover, rgba(255, 255, 255, 0.2));
  }

  .credential-item.deleting {
    opacity: 0.5;
    pointer-events: none;
  }

  .cred-icon {
    font-size: 1.5rem;
  }

  .cred-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .cred-name {
    font-weight: 500;
    color: var(--color-text, #e5e5e5);
  }

  .cred-identifier {
    font-size: 0.75rem;
    color: var(--color-primary, #3b82f6);
  }

  .cred-preview {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    font-family: monospace;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .cred-actions {
    display: flex;
    gap: 0.25rem;
  }

  .action-btn {
    padding: 0.375rem;
    background: transparent;
    border: 1px solid transparent;
    border-radius: 0.25rem;
    cursor: pointer;
    font-size: 0.875rem;
    transition: all 0.15s;
    opacity: 0.6;
  }

  .credential-item:hover .action-btn {
    opacity: 1;
  }

  .action-btn:hover {
    background: var(--color-surface, rgba(255, 255, 255, 0.1));
  }

  .action-btn.edit:hover {
    border-color: var(--color-primary, #3b82f6);
  }

  .action-btn.delete:hover {
    border-color: var(--color-danger, #ef4444);
  }

  .action-btn:disabled {
    opacity: 0.3;
    cursor: not-allowed;
  }

  /* Footer */
  .footer {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .hint {
    margin: 0;
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    text-align: center;
  }
</style>
