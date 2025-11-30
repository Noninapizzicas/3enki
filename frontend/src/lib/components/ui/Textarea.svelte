<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let value = '';
  export let placeholder = '';
  export let label = '';
  export let id = '';
  export let name = '';
  export let disabled = false;
  export let readonly = false;
  export let required = false;
  export let error = '';
  export let hint = '';
  export let rows = 4;
  export let maxlength: number | undefined = undefined;
  export let resize: 'none' | 'vertical' | 'horizontal' | 'both' = 'vertical';

  const dispatch = createEventDispatcher<{
    input: string;
    change: string;
    focus: FocusEvent;
    blur: FocusEvent;
  }>();

  const resizeClasses = {
    none: 'resize-none',
    vertical: 'resize-y',
    horizontal: 'resize-x',
    both: 'resize'
  };

  function handleInput(e: Event) {
    const target = e.target as HTMLTextAreaElement;
    value = target.value;
    dispatch('input', value);
  }
</script>

<div class="flex flex-col gap-1">
  {#if label}
    <label for={id} class="text-sm font-medium text-text-muted">
      {label}
      {#if required}
        <span class="text-danger">*</span>
      {/if}
    </label>
  {/if}

  <textarea
    {id}
    {name}
    {placeholder}
    {disabled}
    {readonly}
    {required}
    {rows}
    {maxlength}
    bind:value
    class="input-base w-full {resizeClasses[resize]}"
    class:border-danger={error}
    on:input={handleInput}
    on:change={() => dispatch('change', value)}
    on:focus={(e) => dispatch('focus', e)}
    on:blur={(e) => dispatch('blur', e)}
  />

  <div class="flex items-center justify-between">
    {#if error}
      <p class="text-sm text-danger">{error}</p>
    {:else if hint}
      <p class="text-sm text-text-muted">{hint}</p>
    {:else}
      <span />
    {/if}

    {#if maxlength}
      <span class="text-xs text-text-muted">
        {value.length}/{maxlength}
      </span>
    {/if}
  </div>
</div>
