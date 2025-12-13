<script lang="ts">
  /**
   * ToastContainer - Contenedor de notificaciones toast
   *
   * Se suscribe al store de notificaciones y muestra
   * los toasts en la esquina inferior derecha.
   */

  import { notifications, removeNotification } from '$lib/stores';
  import Toast from './Toast.svelte';

  function handleDismiss(event: CustomEvent<string>) {
    removeNotification(event.detail);
  }
</script>

<div class="toast-container" aria-live="polite">
  {#each $notifications as notification (notification.id)}
    <Toast
      id={notification.id}
      type={notification.type}
      message={notification.message}
      on:dismiss={handleDismiss}
    />
  {/each}
</div>

<style>
  .toast-container {
    position: fixed;
    bottom: 1rem;
    right: 1rem;
    display: flex;
    flex-direction: column-reverse;
    gap: 0.5rem;
    z-index: 100;
    pointer-events: none;
  }

  .toast-container > :global(*) {
    pointer-events: auto;
  }
</style>
