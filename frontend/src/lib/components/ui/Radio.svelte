<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  type Option = {
    value: string;
    label: string;
    disabled?: boolean;
  };

  export let options: Option[] = [];
  export let value: string = '';
  export let name: string;
  export let label = '';
  export let disabled = false;
  export let orientation: 'horizontal' | 'vertical' = 'vertical';

  const dispatch = createEventDispatcher<{
    change: string;
  }>();

  function handleChange(optionValue: string) {
    value = optionValue;
    dispatch('change', value);
  }
</script>

<fieldset class="space-y-2" {disabled}>
  {#if label}
    <legend class="text-sm font-medium text-text-muted mb-2">{label}</legend>
  {/if}

  <div
    class="flex gap-4"
    class:flex-col={orientation === 'vertical'}
    class:flex-row={orientation === 'horizontal'}
    class:flex-wrap={orientation === 'horizontal'}
  >
    {#each options as option}
      <label
        class="inline-flex items-center gap-2 cursor-pointer"
        class:opacity-50={option.disabled || disabled}
        class:cursor-not-allowed={option.disabled || disabled}
      >
        <input
          type="radio"
          {name}
          value={option.value}
          checked={value === option.value}
          disabled={option.disabled || disabled}
          class="w-4 h-4 border-border bg-bg-input text-primary focus:ring-primary focus:ring-offset-bg"
          on:change={() => handleChange(option.value)}
        />
        <span class="text-text">{option.label}</span>
      </label>
    {/each}
  </div>
</fieldset>
