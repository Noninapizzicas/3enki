<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  export let checked = false;
  export let label = '';
  export let id = '';
  export let name = '';
  export let disabled = false;
  export let indeterminate = false;

  const dispatch = createEventDispatcher<{
    change: boolean;
  }>();

  function handleChange(e: Event) {
    const target = e.target as HTMLInputElement;
    checked = target.checked;
    dispatch('change', checked);
  }
</script>

<label class="inline-flex items-center gap-2 cursor-pointer" class:opacity-50={disabled} class:cursor-not-allowed={disabled}>
  <input
    type="checkbox"
    {id}
    {name}
    {disabled}
    {indeterminate}
    bind:checked
    class="w-4 h-4 rounded border-border bg-bg-input text-primary focus:ring-primary focus:ring-offset-bg"
    on:change={handleChange}
  />
  {#if label}
    <span class="text-text">{label}</span>
  {/if}
</label>
