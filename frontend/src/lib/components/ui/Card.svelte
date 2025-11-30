<script lang="ts">
  export let title = '';
  export let subtitle = '';
  export let padding: 'none' | 'sm' | 'md' | 'lg' = 'md';
  export let hover = false;

  const paddingClasses = {
    none: 'p-0',
    sm: 'p-2',
    md: 'p-4',
    lg: 'p-6'
  };
</script>

<div
  class="bg-bg-card border border-border rounded-lg {paddingClasses[padding]}"
  class:hover:bg-bg-hover={hover}
  class:transition-colors={hover}
  class:cursor-pointer={hover}
>
  {#if title || subtitle || $$slots.header}
    <div class="flex items-start justify-between mb-4">
      <div>
        {#if title}
          <h3 class="text-lg font-semibold text-text">{title}</h3>
        {/if}
        {#if subtitle}
          <p class="text-sm text-text-muted mt-1">{subtitle}</p>
        {/if}
      </div>
      {#if $$slots.header}
        <slot name="header" />
      {/if}
    </div>
  {/if}

  <slot />

  {#if $$slots.footer}
    <div class="mt-4 pt-4 border-t border-border">
      <slot name="footer" />
    </div>
  {/if}
</div>
