<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let type: 'text' | 'email' | 'password' | 'number' | 'search' | 'tel' | 'url' = 'text';
  export let value: string | number = '';
  export let placeholder = '';
  export let label = '';
  export let id = '';
  export let name = '';
  export let disabled = false;
  export let readonly = false;
  export let required = false;
  export let error = '';
  export let hint = '';
  export let size: 'sm' | 'md' | 'lg' = 'md';

  const dispatch = createEventDispatcher<{
    input: string | number;
    change: string | number;
    focus: FocusEvent;
    blur: FocusEvent;
  }>();

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-base',
    lg: 'px-4 py-3 text-lg'
  };

  function handleInput(e: Event) {
    const target = e.target as HTMLInputElement;
    value = type === 'number' ? Number(target.value) : target.value;
    dispatch('input', value);
  }

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    value = type === 'number' ? Number(target.value) : target.value;
    dispatch('change', value);
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

  <input
    {type}
    {id}
    {name}
    {value}
    {placeholder}
    {disabled}
    {readonly}
    {required}
    class="input-base w-full {sizeClasses[size]}"
    class:border-danger={error}
    class:focus:border-danger={error}
    class:focus:ring-danger={error}
    on:input={handleInput}
    on:change={handleChange}
    on:focus={(e) => dispatch('focus', e)}
    on:blur={(e) => dispatch('blur', e)}
  />

  {#if error}
    <p class="text-sm text-danger">{error}</p>
  {:else if hint}
    <p class="text-sm text-text-muted">{hint}</p>
  {/if}
</div>
