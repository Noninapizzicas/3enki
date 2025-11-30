<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Card from '$components/ui/Card.svelte';

  type GridItem = Record<string, unknown> & { id?: string | number };

  export let items: GridItem[] = [];
  export let columns: 1 | 2 | 3 | 4 | 5 | 6 = 3;
  export let gap: 'sm' | 'md' | 'lg' = 'md';
  export let selectable = false;
  export let selected: (string | number)[] = [];

  const dispatch = createEventDispatcher<{
    select: (string | number)[];
    click: GridItem;
  }>();

  const columnClasses = {
    1: 'grid-cols-1',
    2: 'grid-cols-1 sm:grid-cols-2',
    3: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    4: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-4',
    5: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    6: 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-6'
  };

  const gapClasses = {
    sm: 'gap-2',
    md: 'gap-4',
    lg: 'gap-6'
  };

  function toggleSelect(item: GridItem) {
    const id = item.id;
    if (id === undefined) return;

    if (selected.includes(id)) {
      selected = selected.filter(s => s !== id);
    } else {
      selected = [...selected, id];
    }
    dispatch('select', selected);
  }

  function handleClick(item: GridItem) {
    if (selectable) {
      toggleSelect(item);
    }
    dispatch('click', item);
  }

  function isSelected(item: GridItem): boolean {
    return item.id !== undefined && selected.includes(item.id);
  }
</script>

<div class="grid {columnClasses[columns]} {gapClasses[gap]}">
  {#each items as item, index (item.id ?? index)}
    <div
      class="transition-all"
      class:ring-2={selectable && isSelected(item)}
      class:ring-primary={selectable && isSelected(item)}
      class:rounded-lg={selectable && isSelected(item)}
      role={selectable ? 'button' : undefined}
      tabindex={selectable ? 0 : undefined}
      on:click={() => handleClick(item)}
      on:keypress={(e) => e.key === 'Enter' && handleClick(item)}
    >
      <slot {item} {index} selected={isSelected(item)}>
        <!-- Default card rendering -->
        <Card hover={selectable}>
          <pre class="text-xs overflow-auto">{JSON.stringify(item, null, 2)}</pre>
        </Card>
      </slot>
    </div>
  {/each}
</div>

{#if items.length === 0}
  <div class="text-center py-8 text-text-muted">
    <slot name="empty">
      No hay elementos para mostrar
    </slot>
  </div>
{/if}
