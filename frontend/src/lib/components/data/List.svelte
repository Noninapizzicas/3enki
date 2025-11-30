<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  type ListItem = Record<string, unknown> & { id?: string | number };

  export let items: ListItem[] = [];
  export let selectable = false;
  export let selected: (string | number)[] = [];
  export let divided = true;
  export let hoverable = true;

  const dispatch = createEventDispatcher<{
    select: (string | number)[];
    click: ListItem;
  }>();

  function toggleSelect(item: ListItem) {
    const id = item.id;
    if (id === undefined) return;

    if (selected.includes(id)) {
      selected = selected.filter(s => s !== id);
    } else {
      selected = [...selected, id];
    }
    dispatch('select', selected);
  }

  function handleClick(item: ListItem) {
    if (selectable) {
      toggleSelect(item);
    }
    dispatch('click', item);
  }

  function isSelected(item: ListItem): boolean {
    return item.id !== undefined && selected.includes(item.id);
  }
</script>

<ul
  class="bg-bg-card border border-border rounded-lg overflow-hidden"
  class:divide-y={divided}
  class:divide-border={divided}
>
  {#each items as item, index (item.id ?? index)}
    <li
      class="px-4 py-3 transition-colors"
      class:hover:bg-bg-hover={hoverable}
      class:cursor-pointer={selectable || hoverable}
      class:bg-primary/10={isSelected(item)}
      role={selectable ? 'button' : undefined}
      tabindex={selectable ? 0 : undefined}
      on:click={() => handleClick(item)}
      on:keypress={(e) => e.key === 'Enter' && handleClick(item)}
    >
      <slot {item} {index} selected={isSelected(item)}>
        <!-- Default rendering -->
        <div class="flex items-center justify-between">
          {#if selectable}
            <input
              type="checkbox"
              checked={isSelected(item)}
              class="mr-3 rounded border-border bg-bg-input text-primary focus:ring-primary"
              on:click|stopPropagation
              on:change={() => toggleSelect(item)}
            />
          {/if}
          <span class="flex-1">{item.name ?? item.title ?? item.label ?? JSON.stringify(item)}</span>
          <slot name="actions" {item} {index} />
        </div>
      </slot>
    </li>
  {/each}
</ul>

{#if items.length === 0}
  <div class="text-center py-8 text-text-muted border border-border rounded-lg">
    <slot name="empty">
      No hay elementos para mostrar
    </slot>
  </div>
{/if}
