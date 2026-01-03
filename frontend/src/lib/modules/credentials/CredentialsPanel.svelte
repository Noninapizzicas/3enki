<script lang="ts">
  /**
   * CredentialsPanel - Panel centralizado de credenciales con tabs por servicio
   *
   * Arquitectura:
   * - Tab "Providers": API keys de IA (OpenAI, Anthropic, etc.)
   * - Tab "Telegram": Gestión de bots por proyecto
   * - Tab "Cloud": Google Drive, S3, etc. (futuro)
   *
   * Datos via MQTT Request/Response
   */

  import { onMount, onDestroy } from 'svelte/store';
  import ProvidersTab from './tabs/ProvidersTab.svelte';
  import TelegramTab from './tabs/TelegramTab.svelte';
  import CloudTab from './tabs/CloudTab.svelte';

  export let _panelId: string;

  // ==========================================================================
  // STATE
  // ==========================================================================

  type ServiceType = 'providers' | 'telegram' | 'cloud';
  let activeService: ServiceType = 'providers';

  const services = [
    { id: 'providers' as ServiceType, name: 'Providers', icon: '🤖', description: 'API keys de IA' },
    { id: 'telegram' as ServiceType, name: 'Telegram', icon: '📱', description: 'Bots por proyecto' },
    { id: 'cloud' as ServiceType, name: 'Cloud', icon: '☁️', description: 'Almacenamiento' }
  ];

  // ==========================================================================
  // HANDLERS
  // ==========================================================================

  function selectService(service: ServiceType) {
    activeService = service;
  }
</script>

<div class="credentials-panel">
  <!-- Service Tabs -->
  <div class="service-tabs">
    {#each services as service (service.id)}
      <button
        class="service-tab"
        class:active={activeService === service.id}
        on:click={() => selectService(service.id)}
      >
        <span class="service-icon">{service.icon}</span>
        <span class="service-name">{service.name}</span>
      </button>
    {/each}
  </div>

  <!-- Content -->
  <div class="panel-content">
    {#if activeService === 'providers'}
      <ProvidersTab />
    {:else if activeService === 'telegram'}
      <TelegramTab />
    {:else if activeService === 'cloud'}
      <CloudTab />
    {/if}
  </div>
</div>

<style>
  /* ==========================================================================
     CSS Variables with fallbacks
     ========================================================================== */
  .credentials-panel {
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
     Service Tabs
     ========================================================================== */
  .service-tabs {
    display: flex;
    gap: 0.25rem;
    padding: 0.5rem;
    border-bottom: 1px solid var(--_border);
    background: var(--_bg-surface);
  }

  .service-tab {
    flex: 1;
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 0.75rem;
    background: transparent;
    border: 2px solid transparent;
    border-radius: var(--_radius);
    color: var(--_text-muted);
    cursor: pointer;
    transition: all 0.15s;
  }

  .service-tab:hover {
    background: var(--_bg-surface);
    color: var(--_text);
  }

  .service-tab.active {
    background: rgba(59, 130, 246, 0.1);
    border-color: var(--_primary);
    color: var(--_text);
  }

  .service-icon {
    font-size: 1.25rem;
  }

  .service-name {
    font-size: 0.75rem;
    font-weight: 500;
  }

  /* ==========================================================================
     Content
     ========================================================================== */
  .panel-content {
    flex: 1;
    overflow-y: auto;
  }
</style>
