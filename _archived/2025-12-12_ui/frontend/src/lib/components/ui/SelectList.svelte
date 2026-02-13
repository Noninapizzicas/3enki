<script context="module" lang="ts">
  export interface SelectItem {
    id: string;
    label: string;
    group?: string;
    icon?: string;
    badge?: string;
    disabled?: boolean;
    description?: string;
    meta?: unknown;
  }

  export interface SelectGroup {
    id: string;
    label: string;
    icon?: string;
    collapsed?: boolean;
  }
</script>

<script lang="ts">
  import { createEventDispatcher, tick } from 'svelte';
  import { slide } from 'svelte/transition';

  /**
   * SelectList - Lista de selección con grupos acordeón
   *
   * FILOSOFÍA (CONTEXT_UI.md):
   * - Padre controla TODO vía CSS variables
   * - Búsqueda colapsable (cerrada por defecto)
   * - Grupos acordeón (1 abierto a la vez)
   *
   * CSS VARIABLES:
   * --list-padding: padding del contenedor (default: 0)
   * --list-item-height: altura de items (default: 2.5rem)
   * --list-item-padding: padding de items (default: 0.5rem 0.75rem)
   * --list-group-bg: fondo del header de grupo (default: transparent)
   */

  export let items: SelectItem[] = [];
  export let groups: SelectGroup[] = [];
  export let value: string = '';
  export let searchable: boolean = true;
  export let accordion: boolean = true;
  export let placeholder: string = 'Buscar...';

  const dispatch = createEventDispatcher<{
    select: { item: SelectItem };
    search: { query: string };
  }>();

  let searchOpen = false;
  let searchQuery = '';
  let openGroupId: string | null = null;
  let searchInput: HTMLInputElement;

  // Filtrar items según búsqueda
  $: filteredItems = searchQuery
    ? items.filter(item =>
        item.label.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : items;

  // Agrupar items
  $: groupedItems = groups.length > 0
    ? groups.map(group => ({
        ...group,
        items: filteredItems.filter(item => item.group === group.id),
        count: items.filter(item => item.group === group.id).length
      }))
    : null;

  // Items sin grupo
  $: ungroupedItems = filteredItems.filter(
    item => !item.group || !groups.find(g => g.id === item.group)
  );

  async function toggleSearch() {
    searchOpen = !searchOpen;
    if (searchOpen) {
      await tick();
      searchInput?.focus();
    } else {
      searchQuery = '';
    }
  }

  function toggleGroup(groupId: string) {
    if (accordion) {
      openGroupId = openGroupId === groupId ? null : groupId;
    } else {
      openGroupId = openGroupId === groupId ? null : groupId;
    }
  }

  function selectItem(item: SelectItem) {
    if (item.disabled) return;
    value = item.id;
    dispatch('select', { item });
  }

  function handleSearch() {
    dispatch('search', { query: searchQuery });
  }
</script>

<div class="select-list">
  <!-- Búsqueda colapsable -->
  {#if searchable}
    <div class="select-list__search">
      {#if searchOpen}
        <div class="select-list__search-field" transition:slide={{ duration: 150 }}>
          <span class="select-list__search-icon">🔍</span>
          <input
            bind:this={searchInput}
            bind:value={searchQuery}
            on:input={handleSearch}
            type="text"
            {placeholder}
            class="select-list__search-input"
          />
          <button
            type="button"
            class="select-list__search-close"
            on:click={toggleSearch}
          >✕</button>
        </div>
      {:else}
        <button
          type="button"
          class="select-list__search-toggle"
          on:click={toggleSearch}
        >🔍</button>
      {/if}
    </div>
  {/if}

  <!-- Lista -->
  <div class="select-list__content">
    {#if searchQuery}
      <!-- Modo búsqueda: lista plana -->
      {#each filteredItems as item (item.id)}
        <button
          type="button"
          class="select-list__item"
          class:select-list__item--selected={value === item.id}
          class:select-list__item--disabled={item.disabled}
          on:click={() => selectItem(item)}
          disabled={item.disabled}
        >
          {#if item.icon}<span class="select-list__item-icon">{item.icon}</span>{/if}
          <span class="select-list__item-label">{item.label}</span>
          {#if item.badge}<span class="select-list__item-badge">{item.badge}</span>{/if}
        </button>
      {:else}
        <div class="select-list__empty">Sin resultados</div>
      {/each}
    {:else if groupedItems}
      <!-- Modo grupos acordeón -->
      {#each groupedItems as group (group.id)}
        {#if group.items.length > 0}
          <div class="select-list__group">
            <button
              type="button"
              class="select-list__group-header"
              class:select-list__group-header--open={openGroupId === group.id}
              on:click={() => toggleGroup(group.id)}
            >
              <span class="select-list__group-arrow">
                {openGroupId === group.id ? '▾' : '▸'}
              </span>
              {#if group.icon}<span>{group.icon}</span>{/if}
              <span class="select-list__group-label">{group.label}</span>
              <span class="select-list__group-count">({group.count})</span>
            </button>

            {#if openGroupId === group.id}
              <div class="select-list__group-items" transition:slide={{ duration: 150 }}>
                {#each group.items as item (item.id)}
                  <button
                    type="button"
                    class="select-list__item"
                    class:select-list__item--selected={value === item.id}
                    class:select-list__item--disabled={item.disabled}
                    on:click={() => selectItem(item)}
                    disabled={item.disabled}
                  >
                    <span class="select-list__item-radio">
                      {value === item.id ? '●' : '○'}
                    </span>
                    {#if item.icon}<span class="select-list__item-icon">{item.icon}</span>{/if}
                    <span class="select-list__item-label">{item.label}</span>
                    {#if item.badge}<span class="select-list__item-badge">{item.badge}</span>{/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      {/each}

      <!-- Items sin grupo -->
      {#each ungroupedItems as item (item.id)}
        <button
          type="button"
          class="select-list__item"
          class:select-list__item--selected={value === item.id}
          class:select-list__item--disabled={item.disabled}
          on:click={() => selectItem(item)}
          disabled={item.disabled}
        >
          <span class="select-list__item-radio">
            {value === item.id ? '●' : '○'}
          </span>
          {#if item.icon}<span class="select-list__item-icon">{item.icon}</span>{/if}
          <span class="select-list__item-label">{item.label}</span>
          {#if item.badge}<span class="select-list__item-badge">{item.badge}</span>{/if}
        </button>
      {/each}
    {:else}
      <!-- Sin grupos -->
      {#each filteredItems as item (item.id)}
        <button
          type="button"
          class="select-list__item"
          class:select-list__item--selected={value === item.id}
          class:select-list__item--disabled={item.disabled}
          on:click={() => selectItem(item)}
          disabled={item.disabled}
        >
          <span class="select-list__item-radio">
            {value === item.id ? '●' : '○'}
          </span>
          {#if item.icon}<span class="select-list__item-icon">{item.icon}</span>{/if}
          <span class="select-list__item-label">{item.label}</span>
          {#if item.badge}<span class="select-list__item-badge">{item.badge}</span>{/if}
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .select-list {
    --_padding: var(--list-padding, 0);
    --_item-height: var(--list-item-height, 2.5rem);
    --_item-padding: var(--list-item-padding, 0.5rem 0.75rem);
    --_group-bg: var(--list-group-bg, transparent);

    display: flex;
    flex-direction: column;
    padding: var(--_padding);
  }

  /* Búsqueda */
  .select-list__search {
    padding: 0.5rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .select-list__search-toggle {
    padding: 0.5rem;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.6;
    transition: opacity 0.15s;
  }

  .select-list__search-toggle:hover {
    opacity: 1;
  }

  .select-list__search-field {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.25rem 0.5rem;
    background: var(--color-bg-muted, #f3f4f6);
    border-radius: 6px;
  }

  .select-list__search-icon {
    opacity: 0.5;
    font-size: 0.875rem;
  }

  .select-list__search-input {
    flex: 1;
    border: none;
    background: transparent;
    font-size: 0.875rem;
    outline: none;
  }

  .select-list__search-close {
    padding: 0.25rem;
    background: transparent;
    border: none;
    cursor: pointer;
    opacity: 0.5;
    font-size: 0.75rem;
  }

  .select-list__search-close:hover {
    opacity: 1;
  }

  /* Contenido */
  .select-list__content {
    overflow-y: auto;
  }

  /* Grupos */
  .select-list__group {
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .select-list__group:last-child {
    border-bottom: none;
  }

  .select-list__group-header {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: var(--_item-padding);
    background: var(--_group-bg);
    border: none;
    cursor: pointer;
    font-weight: 500;
    font-size: 0.875rem;
    text-align: left;
    transition: background 0.15s;
  }

  .select-list__group-header:hover {
    background: var(--color-bg-hover, rgba(0,0,0,0.03));
  }

  .select-list__group-arrow {
    opacity: 0.5;
    font-size: 0.75rem;
  }

  .select-list__group-label {
    flex: 1;
  }

  .select-list__group-count {
    opacity: 0.5;
    font-size: 0.75rem;
  }

  .select-list__group-items {
    padding-left: 0.5rem;
  }

  /* Items */
  .select-list__item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--_item-height);
    padding: var(--_item-padding);
    background: transparent;
    border: none;
    cursor: pointer;
    font-size: 0.875rem;
    text-align: left;
    transition: background 0.15s;
  }

  .select-list__item:hover:not(:disabled) {
    background: var(--color-bg-hover, rgba(0,0,0,0.03));
  }

  .select-list__item--selected {
    background: var(--color-primary-light, rgba(59, 130, 246, 0.1));
  }

  .select-list__item--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .select-list__item-radio {
    color: var(--color-primary, #3b82f6);
    font-size: 0.75rem;
  }

  .select-list__item-icon {
    font-size: 1rem;
  }

  .select-list__item-label {
    flex: 1;
  }

  .select-list__item-badge {
    padding: 0.125rem 0.375rem;
    background: var(--color-bg-muted, #f3f4f6);
    border-radius: 4px;
    font-size: 0.7rem;
    opacity: 0.8;
  }

  .select-list__empty {
    padding: 1rem;
    text-align: center;
    color: var(--color-text-muted, #666);
    font-size: 0.875rem;
  }
</style>
