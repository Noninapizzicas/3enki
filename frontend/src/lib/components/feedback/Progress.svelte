<script lang="ts">
  export let value = 0;
  export let max = 100;
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let variant: 'primary' | 'success' | 'warning' | 'danger' = 'primary';
  export let showLabel = false;
  export let label = '';
  export let animated = false;
  export let striped = false;

  $: percentage = Math.min(100, Math.max(0, (value / max) * 100));

  const sizeClasses = {
    sm: 'h-1',
    md: 'h-2',
    lg: 'h-4'
  };

  const variantClasses = {
    primary: 'bg-primary',
    success: 'bg-success',
    warning: 'bg-warning',
    danger: 'bg-danger'
  };
</script>

<div class="space-y-1">
  {#if showLabel || label}
    <div class="flex items-center justify-between text-sm">
      <span class="text-text-muted">{label}</span>
      {#if showLabel}
        <span class="text-text font-medium">{Math.round(percentage)}%</span>
      {/if}
    </div>
  {/if}

  <div
    class="w-full bg-bg-hover rounded-full overflow-hidden {sizeClasses[size]}"
    role="progressbar"
    aria-valuenow={value}
    aria-valuemin={0}
    aria-valuemax={max}
  >
    <div
      class="h-full rounded-full transition-all duration-300 {variantClasses[variant]}"
      class:animate-pulse={animated}
      class:bg-gradient-to-r={striped}
      class:from-transparent={striped}
      class:via-white/20={striped}
      class:to-transparent={striped}
      class:bg-[length:20px_100%]={striped}
      style="width: {percentage}%"
    />
  </div>
</div>
