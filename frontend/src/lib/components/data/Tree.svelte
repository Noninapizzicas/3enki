<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  type TreeNode = {
    id: string | number;
    label: string;
    icon?: string;
    children?: TreeNode[];
    expanded?: boolean;
    disabled?: boolean;
    data?: unknown;
  };

  export let nodes: TreeNode[] = [];
  export let selectable = false;
  export let selected: (string | number)[] = [];
  export let expandedIds: (string | number)[] = [];
  export let level = 0;

  const dispatch = createEventDispatcher<{
    select: (string | number)[];
    toggle: { id: string | number; expanded: boolean };
    click: TreeNode;
  }>();

  function toggleExpand(node: TreeNode) {
    if (expandedIds.includes(node.id)) {
      expandedIds = expandedIds.filter(id => id !== node.id);
    } else {
      expandedIds = [...expandedIds, node.id];
    }
    dispatch('toggle', { id: node.id, expanded: expandedIds.includes(node.id) });
  }

  function toggleSelect(node: TreeNode) {
    if (node.disabled) return;

    if (selected.includes(node.id)) {
      selected = selected.filter(id => id !== node.id);
    } else {
      selected = [...selected, node.id];
    }
    dispatch('select', selected);
  }

  function handleClick(node: TreeNode) {
    dispatch('click', node);
  }

  function isExpanded(node: TreeNode): boolean {
    return expandedIds.includes(node.id);
  }

  function isSelected(node: TreeNode): boolean {
    return selected.includes(node.id);
  }

  function hasChildren(node: TreeNode): boolean {
    return !!node.children && node.children.length > 0;
  }
</script>

<ul class="space-y-1" style="padding-left: {level * 16}px">
  {#each nodes as node (node.id)}
    <li>
      <div
        class="flex items-center gap-2 px-2 py-1.5 rounded-md transition-colors {isSelected(node) ? 'bg-primary bg-opacity-10' : ''}"
        class:hover:bg-bg-hover={!node.disabled}
        class:cursor-pointer={!node.disabled}
        class:opacity-50={node.disabled}
        role="treeitem"
        aria-expanded={hasChildren(node) ? isExpanded(node) : undefined}
        tabindex={node.disabled ? -1 : 0}
        on:click={() => handleClick(node)}
        on:keypress={(e) => e.key === 'Enter' && handleClick(node)}
      >
        <!-- Expand/Collapse button -->
        {#if hasChildren(node)}
          <button
            type="button"
            class="w-4 h-4 flex items-center justify-center text-text-muted hover:text-text transition-transform"
            class:rotate-90={isExpanded(node)}
            on:click|stopPropagation={() => toggleExpand(node)}
          >
            ▶
          </button>
        {:else}
          <span class="w-4"></span>
        {/if}

        <!-- Checkbox for selection -->
        {#if selectable}
          <input
            type="checkbox"
            checked={isSelected(node)}
            disabled={node.disabled}
            class="rounded border-border bg-bg-input text-primary focus:ring-primary"
            on:click|stopPropagation
            on:change={() => toggleSelect(node)}
          />
        {/if}

        <!-- Icon -->
        {#if node.icon}
          <span class="text-sm">{node.icon}</span>
        {:else if hasChildren(node)}
          <span class="text-sm">{isExpanded(node) ? '📂' : '📁'}</span>
        {:else}
          <span class="text-sm">📄</span>
        {/if}

        <!-- Label -->
        <span class="flex-1 text-sm truncate">{node.label}</span>
      </div>

      <!-- Children -->
      {#if hasChildren(node) && isExpanded(node)}
        <svelte:self
          nodes={node.children ?? []}
          {selectable}
          bind:selected
          bind:expandedIds
          level={level + 1}
          on:select
          on:toggle
          on:click
        />
      {/if}
    </li>
  {/each}
</ul>

{#if nodes.length === 0 && level === 0}
  <div class="text-center py-8 text-text-muted">
    No hay elementos para mostrar
  </div>
{/if}
