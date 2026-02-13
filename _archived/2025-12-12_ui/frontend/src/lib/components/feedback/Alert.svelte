<script lang="ts">
  export let variant: 'success' | 'warning' | 'danger' | 'info' = 'info';
  export let title = '';
  export let dismissible = false;

  let visible = true;

  const icons = {
    success: '✓',
    warning: '⚠',
    danger: '✕',
    info: 'ℹ'
  };

  const colors = {
    success: 'bg-success/10 border-success/30 text-success',
    warning: 'bg-warning/10 border-warning/30 text-warning',
    danger: 'bg-danger/10 border-danger/30 text-danger',
    info: 'bg-info/10 border-info/30 text-info'
  };
</script>

{#if visible}
  <div
    class="flex items-start gap-3 p-4 rounded-lg border {colors[variant]}"
    role="alert"
  >
    <span class="text-lg">{icons[variant]}</span>
    <div class="flex-1">
      {#if title}
        <h4 class="font-medium mb-1">{title}</h4>
      {/if}
      <div class="text-sm opacity-90">
        <slot />
      </div>
    </div>
    {#if dismissible}
      <button
        class="text-current opacity-60 hover:opacity-100 transition-opacity"
        on:click={() => visible = false}
        aria-label="Cerrar"
      >
        ✕
      </button>
    {/if}
  </div>
{/if}
