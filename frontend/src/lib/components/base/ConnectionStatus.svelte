<script lang="ts">
  /**
   * ConnectionStatus - Indicador visual de conexión MQTT
   *
   * Muestra un dot con color según estado:
   * - Verde: conectado
   * - Amarillo: conectando
   * - Rojo: error
   * - Gris: desconectado
   */

  import { status, error as mqttError } from '$lib/ui-core';
  import { fade } from 'svelte/transition';

  export let showLabel: boolean = false;
  export let size: 'sm' | 'md' | 'lg' = 'sm';

  const statusConfig = {
    connected: { color: '#22c55e', label: 'Conectado', pulse: false },
    connecting: { color: '#eab308', label: 'Conectando...', pulse: true },
    error: { color: '#ef4444', label: 'Error', pulse: false },
    disconnected: { color: '#6b7280', label: 'Desconectado', pulse: false }
  };

  $: config = statusConfig[$status] || statusConfig.disconnected;
  $: dotSize = size === 'sm' ? '8px' : size === 'md' ? '10px' : '12px';
</script>

<div
  class="connection-status"
  class:with-label={showLabel}
  title={$mqttError || config.label}
>
  <span
    class="dot"
    class:pulse={config.pulse}
    style="--dot-color: {config.color}; --dot-size: {dotSize}"
  ></span>

  {#if showLabel}
    <span class="label" transition:fade={{ duration: 150 }}>
      {config.label}
    </span>
  {/if}
</div>

<style>
  .connection-status {
    display: inline-flex;
    align-items: center;
    gap: 0.5rem;
  }

  .dot {
    width: var(--dot-size, 8px);
    height: var(--dot-size, 8px);
    border-radius: 50%;
    background-color: var(--dot-color, #6b7280);
    flex-shrink: 0;
  }

  .dot.pulse {
    animation: pulse 1.5s ease-in-out infinite;
  }

  @keyframes pulse {
    0%, 100% {
      opacity: 1;
      transform: scale(1);
    }
    50% {
      opacity: 0.5;
      transform: scale(1.2);
    }
  }

  .label {
    font-size: 0.75rem;
    color: var(--color-text-muted, #a3a3a3);
    white-space: nowrap;
  }

  .with-label:hover .label {
    color: var(--color-text, #e5e5e5);
  }
</style>
