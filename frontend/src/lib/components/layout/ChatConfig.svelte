<script lang="ts">
  /**
   * ChatConfig - Barra de configuración del chat
   *
   * Zona: chat-config
   * Paneles: provider, prompts
   *
   * Features:
   * - Iconos desde metadata centralizada
   * - Carga lazy de componentes
   * - Contador de contexto (mensajes activos / máximo)
   */

  import { openPanel } from '$lib/ui-core';
  import { Button } from '$lib/components/base';
  import { getPanelsByZone } from '$lib/modules/panels';
  import { contextStats, hasActiveConversation } from '$lib/stores';

  // Obtener paneles de chat-config desde metadata
  $: configPanels = getPanelsByZone('chat-config');
  $: stats = $contextStats;
  $: contextPercentage = stats.maxContext > 0 ? (stats.active / stats.maxContext) * 100 : 0;
  $: isNearLimit = contextPercentage >= 80;
  $: isAtLimit = stats.active >= stats.maxContext;

  function handlePanelClick(panelId: string) {
    openPanel(panelId);
  }
</script>

<div class="chat-config">
  {#each configPanels as panel (panel.id)}
    <Button
      icon={panel.icon}
      size="sm"
      on:click={() => handlePanelClick(panel.id)}
      title={panel.title}
    />
  {/each}

  <!-- Spacer -->
  <div class="spacer"></div>

  <!-- Context counter -->
  {#if $hasActiveConversation && stats.total > 0}
    <div
      class="context-counter"
      class:warning={isNearLimit}
      class:limit={isAtLimit}
      title="Mensajes en contexto / Máximo ({stats.remaining} restantes)"
    >
      <span class="icon">📝</span>
      <span class="count">{stats.active}/{stats.maxContext}</span>
      <div class="progress-bar">
        <div class="progress" style="width: {Math.min(contextPercentage, 100)}%"></div>
      </div>
    </div>
  {/if}
</div>

<style>
  .chat-config {
    display: flex;
    align-items: center;
    gap: 0.25rem;
    padding: 0.5rem 1rem;
    background: var(--color-bar-bg, rgba(0, 0, 0, 0.2));
    border-bottom: 1px solid var(--color-border, rgba(255, 255, 255, 0.1));
  }

  .spacer {
    flex: 1;
  }

  /* Context counter */
  .context-counter {
    display: flex;
    align-items: center;
    gap: 0.375rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-surface, rgba(255, 255, 255, 0.05));
    border-radius: 0.375rem;
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    transition: all 0.2s ease;
  }

  .context-counter .icon {
    font-size: 0.875rem;
  }

  .context-counter .count {
    font-weight: 500;
    font-variant-numeric: tabular-nums;
    min-width: 2.5rem;
  }

  .context-counter .progress-bar {
    width: 40px;
    height: 4px;
    background: rgba(255, 255, 255, 0.1);
    border-radius: 2px;
    overflow: hidden;
  }

  .context-counter .progress {
    height: 100%;
    background: var(--color-success, #22c55e);
    transition: width 0.3s ease, background-color 0.3s ease;
    border-radius: 2px;
  }

  /* Warning state (80%+) */
  .context-counter.warning {
    color: var(--color-warning, #f59e0b);
  }

  .context-counter.warning .progress {
    background: var(--color-warning, #f59e0b);
  }

  /* At limit state */
  .context-counter.limit {
    color: var(--color-error, #ef4444);
    background: rgba(239, 68, 68, 0.1);
  }

  .context-counter.limit .progress {
    background: var(--color-error, #ef4444);
  }
</style>
