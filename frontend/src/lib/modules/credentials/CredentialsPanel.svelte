<script lang="ts">
  /**
   * CredentialsPanel - Panel de estado de credenciales
   *
   * Features:
   * - Lista de providers con estado de API key
   * - Indicador visual de válido/inválido
   * - Información de último check
   */

  import { credentialStatus } from '$lib/stores';
  import { publish } from '$lib/ui-core';

  export let panelId: string;

  // Providers disponibles con sus iconos
  const providers = [
    { id: 'openai', name: 'OpenAI', icon: '🤖', description: 'GPT-4, GPT-3.5' },
    { id: 'anthropic', name: 'Anthropic', icon: '🧠', description: 'Claude 3, Claude 2' },
    { id: 'deepseek', name: 'DeepSeek', icon: '🔮', description: 'DeepSeek Coder' },
    { id: 'ollama', name: 'Ollama', icon: '🦙', description: 'Local models' }
  ];

  function isProviderValid(providerId: string): boolean {
    return $credentialStatus.providers.includes(providerId);
  }

  function handleValidate(providerId: string) {
    publish('credential/validate', { providerId });
  }

  function handleValidateAll() {
    publish('credential/validate', { all: true });
  }

  // Calcular estadísticas
  $: validCount = $credentialStatus.providers.length;
  $: totalCount = providers.length;
</script>

<div class="credentials-panel">
  <div class="summary">
    <div class="summary-icon" class:valid={$credentialStatus.valid}>
      {$credentialStatus.valid ? '✅' : '⚠️'}
    </div>
    <div class="summary-text">
      <span class="summary-title">
        {#if $credentialStatus.valid}
          Credenciales válidas
        {:else if validCount > 0}
          Algunas credenciales configuradas
        {:else}
          Sin credenciales configuradas
        {/if}
      </span>
      <span class="summary-subtitle">
        {validCount} de {totalCount} providers
      </span>
    </div>
    <button class="validate-all-btn" on:click={handleValidateAll}>
      🔄 Validar
    </button>
  </div>

  <div class="providers-list">
    {#each providers as provider (provider.id)}
      {@const isValid = isProviderValid(provider.id)}
      <div class="provider-item" class:valid={isValid}>
        <span class="provider-icon">{provider.icon}</span>
        <div class="provider-info">
          <span class="provider-name">{provider.name}</span>
          <span class="provider-desc">{provider.description}</span>
        </div>
        <div class="provider-status">
          {#if isValid}
            <span class="status-badge valid">✓ Válido</span>
          {:else}
            <span class="status-badge invalid">No configurado</span>
          {/if}
        </div>
      </div>
    {/each}
  </div>

  <div class="actions">
    <p class="hint">
      💡 Las API keys se configuran via variables de entorno en el backend.
    </p>
  </div>
</div>

<style>
  .credentials-panel {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    height: 100%;
  }

  .summary {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 1rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border-radius: 0.5rem;
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .summary-icon {
    font-size: 2rem;
    opacity: 0.5;
  }

  .summary-icon.valid {
    opacity: 1;
  }

  .summary-text {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .summary-title {
    font-weight: 600;
    color: var(--color-text, #e5e5e5);
  }

  .summary-subtitle {
    font-size: 0.875rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .validate-all-btn {
    padding: 0.5rem 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.2));
    border-radius: 0.375rem;
    color: var(--color-text, #e5e5e5);
    font-size: 0.875rem;
    cursor: pointer;
    transition: all 0.15s;
  }

  .validate-all-btn:hover {
    background: var(--color-hover, rgba(255, 255, 255, 0.1));
  }

  .providers-list {
    display: flex;
    flex-direction: column;
    gap: 0.5rem;
    flex: 1;
    overflow-y: auto;
  }

  .provider-item {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    padding: 0.75rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.03));
    border: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
    border-radius: 0.375rem;
    transition: all 0.15s;
  }

  .provider-item.valid {
    border-left: 3px solid var(--color-success, #22c55e);
  }

  .provider-icon {
    font-size: 1.5rem;
  }

  .provider-info {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
  }

  .provider-name {
    font-weight: 500;
    color: var(--color-text, #e5e5e5);
  }

  .provider-desc {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
  }

  .provider-status {
    display: flex;
    align-items: center;
  }

  .status-badge {
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    border-radius: 0.25rem;
  }

  .status-badge.valid {
    background: rgba(34, 197, 94, 0.2);
    color: var(--color-success, #22c55e);
  }

  .status-badge.invalid {
    background: rgba(255, 255, 255, 0.05);
    color: var(--color-text-muted, #a3a3a3);
  }

  .actions {
    margin-top: auto;
    padding-top: 1rem;
    border-top: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .hint {
    margin: 0;
    font-size: 0.8125rem;
    color: var(--color-text-muted, #a3a3a3);
    text-align: center;
  }
</style>
