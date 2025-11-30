<script lang="ts">
  import { toastList, dismissToast, type ToastType } from '$stores/toast';

  const icons: Record<ToastType, string> = {
    success: '✓',
    warning: '⚠',
    danger: '✕',
    info: 'ℹ'
  };

  const colors: Record<ToastType, string> = {
    success: 'bg-success bg-opacity-10 border-success text-success',
    warning: 'bg-warning bg-opacity-10 border-warning text-warning',
    danger: 'bg-danger bg-opacity-10 border-danger text-danger',
    info: 'bg-info bg-opacity-10 border-info text-info'
  };
</script>

<div class="fixed top-4 right-4 z-toast flex flex-col gap-2 max-w-sm">
  {#each $toastList as toast (toast.id)}
    <div
      class="flex items-start gap-3 p-4 rounded-lg border animate-toast-in {colors[toast.type]}"
      role="alert"
    >
      <span class="text-lg">{icons[toast.type]}</span>
      <p class="flex-1 text-sm">{toast.message}</p>
      {#if toast.dismissible}
        <button
          class="text-current opacity-60 hover:opacity-100 transition-opacity"
          on:click={() => dismissToast(toast.id)}
          aria-label="Cerrar"
        >
          ✕
        </button>
      {/if}
    </div>
  {/each}
</div>
