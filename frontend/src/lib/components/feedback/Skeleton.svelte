<script lang="ts">
  export let variant: 'text' | 'circular' | 'rectangular' | 'rounded' = 'text';
  export let width: string = '100%';
  export let height: string = '';
  export let lines = 1;
  export let animated = true;

  const defaultHeights = {
    text: '1rem',
    circular: '40px',
    rectangular: '100px',
    rounded: '100px'
  };

  $: computedHeight = height || defaultHeights[variant];
</script>

{#if variant === 'text' && lines > 1}
  <div class="space-y-2" style="width: {width}">
    {#each Array(lines) as _, i}
      <div
        class="bg-bg-hover"
        class:animate-pulse={animated}
        class:rounded={variant === 'text'}
        style="height: {computedHeight}; width: {i === lines - 1 ? '80%' : '100%'}"
      />
    {/each}
  </div>
{:else}
  <div
    class="bg-bg-hover"
    class:animate-pulse={animated}
    class:rounded-full={variant === 'circular'}
    class:rounded-lg={variant === 'rounded'}
    class:rounded={variant === 'text'}
    style="width: {variant === 'circular' ? computedHeight : width}; height: {computedHeight}"
  />
{/if}
