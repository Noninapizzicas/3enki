<script lang="ts">
  /**
   * SystemBar - Barra lateral sistema (SIMPLIFICADO)
   */

  import { Button } from '$lib/components/base';
  import { status } from '$lib/ui-core';

  // Iconos de sistema simples
  const items = [
    { icon: '⚙️', title: 'Config' },
    { icon: '🔔', title: 'Notificaciones' },
    { icon: '❓', title: 'Ayuda' }
  ];
</script>

<div class="system-bar">
  <!-- Indicador de conexión MQTT -->
  <Button
    icon={$status === 'connected' ? '🟢' : $status === 'connecting' ? '🟡' : '🔴'}
    size="sm"
    title={$status === 'connected' ? 'Conectado' : $status === 'connecting' ? 'Conectando...' : 'Desconectado'}
  />

  {#each items as item}
    <Button
      icon={item.icon}
      size="sm"
      title={item.title}
    />
  {/each}
</div>

<style>
  .system-bar {
    position: fixed;
    right: 0.5rem;
    top: 50%;
    transform: translateY(-50%);
    display: flex;
    flex-direction: column;
    gap: 0.25rem;
    padding: 0.375rem;
    background: var(--color-system-bar-bg, rgba(0, 0, 0, 0.6));
    border-radius: 0.5rem;
    backdrop-filter: blur(8px);
    z-index: 100;
    opacity: 0.7;
    transition: opacity 0.2s;
  }

  .system-bar:hover {
    opacity: 1;
  }
</style>
