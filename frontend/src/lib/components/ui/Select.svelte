<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  type Option = {
    value: string | number;
    label: string;
    disabled?: boolean;
  };

  export let options: Option[] = [];
  export let value: string | number = '';
  export let placeholder = 'Seleccionar...';
  export let label = '';
  export let id = '';
  export let name = '';
  export let disabled = false;
  export let required = false;
  export let error = '';
  export let size: 'sm' | 'md' | 'lg' = 'md';

  const dispatch = createEventDispatcher<{
    change: string | number;
  }>();

  const sizeClasses = {
    sm: 'px-2 py-1 text-sm',
    md: 'px-3 py-2 text-base',
    lg: 'px-4 py-3 text-lg'
  };

  function handleChange(e: Event) {
    const target = e.target as HTMLSelectElement;
    value = target.value;
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

  <select
    {id}
    {name}
    {disabled}
    {required}
    bind:value
    class="input-base w-full {sizeClasses[size]} cursor-pointer"
    class:border-danger={error}
    on:change={handleChange}
  >
    {#if placeholder}
      <option value="" disabled>{placeholder}</option>
    {/if}
    {#each options as option}
      <option value={option.value} disabled={option.disabled}>
        {option.label}
      </option>
    {/each}
  </select>

  {#if error}
    <p class="text-sm text-danger">{error}</p>
  {/if}
</div>
