<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  // Props basados en auto-ui/components/core/button.json
  export let variant: 'primary' | 'secondary' | 'success' | 'warning' | 'danger' | 'ghost' | 'outline' = 'primary';
  export let size: 'sm' | 'md' | 'lg' = 'md';
  export let disabled = false;
  export let loading = false;
  export let type: 'button' | 'submit' | 'reset' = 'button';
  export let href: string | undefined = undefined;
  export let holdEnabled = false;
  export let holdDuration = 2000;
  export let title: string | undefined = undefined;
  let ariaLabel: string | undefined = undefined;
  export { ariaLabel as 'aria-label' };
  let className = '';
  export { className as class };

  const dispatch = createEventDispatcher<{
    click: MouseEvent;
    hold: void;
  }>();

  // Hold interaction state
  let holdProgress = 0;
  let holdTimer: ReturnType<typeof setInterval> | null = null;

  function startHold() {
    if (!holdEnabled || disabled || loading) return;
    const start = Date.now();
    holdTimer = setInterval(() => {
      holdProgress = Math.min(100, ((Date.now() - start) / holdDuration) * 100);
      if (holdProgress >= 100) {
        endHold();
        dispatch('hold');
      }
    }, 50);
  }

  function endHold() {
    if (holdTimer) {
      clearInterval(holdTimer);
      holdTimer = null;
    }
    holdProgress = 0;
  }

  function handleClick(e: MouseEvent) {
    if (!disabled && !loading) {
      dispatch('click', e);
    }
  }

  // Variant classes
  const variantClasses = {
    primary: 'bg-primary hover:bg-primary-hover text-white border-primary',
    secondary: 'bg-bg-card hover:bg-bg-hover text-text border-border',
    success: 'bg-success hover:bg-success-hover text-white border-success',
    warning: 'bg-warning hover:bg-warning-hover text-bg border-warning',
    danger: 'bg-danger hover:bg-danger-hover text-white border-danger',
    ghost: 'bg-transparent hover:bg-bg-hover text-primary border-transparent',
    outline: 'bg-transparent hover:bg-primary hover:bg-opacity-10 text-primary border-primary'
  };

  // Size classes
  const sizeClasses = {
    sm: 'px-2 py-1 text-sm gap-1',
    md: 'px-4 py-2 text-base gap-2',
    lg: 'px-6 py-3 text-lg gap-2'
  };

  $: classes = [
    'btn border',
    variantClasses[variant],
    sizeClasses[size],
    disabled && 'opacity-50 cursor-not-allowed',
    loading && 'cursor-wait',
    className
  ].filter(Boolean).join(' ');
</script>

{#if href && !disabled}
  <a
    {href}
    class={classes}
    {title}
    aria-label={ariaLabel}
    on:mousedown={startHold}
    on:mouseup={endHold}
    on:mouseleave={endHold}
  >
    {#if loading}
      <span class="animate-spin">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </span>
    {/if}
    <slot />
    {#if holdProgress > 0}
      <div
        class="absolute inset-0 bg-white bg-opacity-20 rounded-md transition-all"
        style="width: {holdProgress}%"
      ></div>
    {/if}
  </a>
{:else}
  <button
    {type}
    {disabled}
    class={classes}
    class:relative={holdEnabled}
    class:overflow-hidden={holdEnabled}
    {title}
    aria-label={ariaLabel}
    on:click={handleClick}
    on:mousedown={startHold}
    on:mouseup={endHold}
    on:mouseleave={endHold}
  >
    {#if loading}
      <span class="animate-spin">
        <svg class="w-4 h-4" fill="none" viewBox="0 0 24 24">
          <circle class="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" stroke-width="4"></circle>
          <path class="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
        </svg>
      </span>
    {/if}
    <slot />
    {#if holdProgress > 0}
      <div
        class="absolute inset-0 bg-white bg-opacity-20 rounded-md"
        style="width: {holdProgress}%"
      ></div>
    {/if}
  </button>
{/if}
