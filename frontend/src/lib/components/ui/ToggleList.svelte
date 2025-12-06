<script lang="ts">
  import { createEventDispatcher } from 'svelte';

  /**
   * ToggleList - Lista de selección múltiple con grupos visuales
   *
   * FILOSOFÍA (CONTEXT_UI.md):
   * - Padre controla TODO vía CSS variables
   * - Grupos como separadores visuales (no colapsables)
   * - Multi-selección con checkboxes
   *
   * CSS VARIABLES:
   * --list-padding: padding del contenedor (default: 0)
   * --list-item-height: altura de items (default: 2.5rem)
   * --list-item-padding: padding de items (default: 0.5rem 0.75rem)
   * --list-group-gap: espacio antes del grupo (default: 0.75rem)
   */

  interface ToggleItem {
    id: string;
    label: string;
    group?: string;
    icon?: string;
    description?: string;
    disabled?: boolean;
  }

  interface ToggleGroup {
    id: string;
    label: string;
  }

  export let items: ToggleItem[] = [];
  export let groups: ToggleGroup[] = [];
  export let values: string[] = [];
  export let showSelectAll: boolean = false;
  export let max: number | undefined = undefined;
  export let disabled: boolean = false;

  const dispatch = createEventDispatcher<{
    change: { values: string[] };
    toggle: { item: ToggleItem; active: boolean };
  }>();

  // Agrupar items
  $: groupedItems = groups.length > 0
    ? groups.map(group => ({
        ...group,
        items: items.filter(item => item.group === group.id)
      }))
    : null;

  // Items sin grupo
  $: ungroupedItems = items.filter(
    item => !item.group || !groups.find(g => g.id === item.group)
  );

  // Estado de selección
  $: allSelected = items.every(item => values.includes(item.id));
  $: noneSelected = values.length === 0;
  $: atMax = max !== undefined && values.length >= max;

  function isActive(itemId: string): boolean {
    return values.includes(itemId);
  }

  function canToggle(item: ToggleItem): boolean {
    if (disabled || item.disabled) return false;
    if (isActive(item.id)) return true; // Siempre puede desactivar
    if (atMax) return false; // No puede activar si está al máximo
    return true;
  }

  function toggleItem(item: ToggleItem) {
    if (!canToggle(item)) return;

    const active = isActive(item.id);
    let newValues: string[];

    if (active) {
      newValues = values.filter(id => id !== item.id);
    } else {
      newValues = [...values, item.id];
    }

    values = newValues;
    dispatch('toggle', { item, active: !active });
    dispatch('change', { values: newValues });
  }

  function selectAll() {
    if (disabled) return;
    const enabledItems = items.filter(i => !i.disabled);
    const newValues = max
      ? enabledItems.slice(0, max).map(i => i.id)
      : enabledItems.map(i => i.id);
    values = newValues;
    dispatch('change', { values: newValues });
  }

  function selectNone() {
    if (disabled) return;
    values = [];
    dispatch('change', { values: [] });
  }
</script>

<div class="toggle-list" class:toggle-list--disabled={disabled}>
  <!-- Select All / None -->
  {#if showSelectAll}
    <div class="toggle-list__controls">
      <button
        type="button"
        class="toggle-list__control"
        class:toggle-list__control--active={allSelected}
        on:click={selectAll}
        disabled={disabled}
      >Todos</button>
      <span class="toggle-list__control-sep">|</span>
      <button
        type="button"
        class="toggle-list__control"
        class:toggle-list__control--active={noneSelected}
        on:click={selectNone}
        disabled={disabled}
      >Ninguno</button>
      {#if max}
        <span class="toggle-list__control-count">({values.length}/{max})</span>
      {/if}
    </div>
  {/if}

  <!-- Lista -->
  <div class="toggle-list__content">
    {#if groupedItems}
      <!-- Con grupos -->
      {#each groupedItems as group, groupIndex (group.id)}
        {#if group.items.length > 0}
          <div class="toggle-list__group" class:toggle-list__group--first={groupIndex === 0}>
            <div class="toggle-list__group-header">{group.label}</div>
            {#each group.items as item (item.id)}
              <button
                type="button"
                class="toggle-list__item"
                class:toggle-list__item--active={isActive(item.id)}
                class:toggle-list__item--disabled={item.disabled || (atMax && !isActive(item.id))}
                on:click={() => toggleItem(item)}
                disabled={!canToggle(item)}
              >
                <span class="toggle-list__item-check">
                  {isActive(item.id) ? '☑' : '☐'}
                </span>
                {#if item.icon}<span class="toggle-list__item-icon">{item.icon}</span>{/if}
                <div class="toggle-list__item-content">
                  <span class="toggle-list__item-label">{item.label}</span>
                  {#if item.description}
                    <span class="toggle-list__item-desc">{item.description}</span>
                  {/if}
                </div>
              </button>
            {/each}
          </div>
        {/if}
      {/each}

      <!-- Items sin grupo -->
      {#if ungroupedItems.length > 0}
        <div class="toggle-list__group">
          {#each ungroupedItems as item (item.id)}
            <button
              type="button"
              class="toggle-list__item"
              class:toggle-list__item--active={isActive(item.id)}
              class:toggle-list__item--disabled={item.disabled || (atMax && !isActive(item.id))}
              on:click={() => toggleItem(item)}
              disabled={!canToggle(item)}
            >
              <span class="toggle-list__item-check">
                {isActive(item.id) ? '☑' : '☐'}
              </span>
              {#if item.icon}<span class="toggle-list__item-icon">{item.icon}</span>{/if}
              <div class="toggle-list__item-content">
                <span class="toggle-list__item-label">{item.label}</span>
                {#if item.description}
                  <span class="toggle-list__item-desc">{item.description}</span>
                {/if}
              </div>
            </button>
          {/each}
        </div>
      {/if}
    {:else}
      <!-- Sin grupos -->
      {#each items as item (item.id)}
        <button
          type="button"
          class="toggle-list__item"
          class:toggle-list__item--active={isActive(item.id)}
          class:toggle-list__item--disabled={item.disabled || (atMax && !isActive(item.id))}
          on:click={() => toggleItem(item)}
          disabled={!canToggle(item)}
        >
          <span class="toggle-list__item-check">
            {isActive(item.id) ? '☑' : '☐'}
          </span>
          {#if item.icon}<span class="toggle-list__item-icon">{item.icon}</span>{/if}
          <div class="toggle-list__item-content">
            <span class="toggle-list__item-label">{item.label}</span>
            {#if item.description}
              <span class="toggle-list__item-desc">{item.description}</span>
            {/if}
          </div>
        </button>
      {/each}
    {/if}
  </div>
</div>

<style>
  .toggle-list {
    --_padding: var(--list-padding, 0);
    --_item-height: var(--list-item-height, 2.5rem);
    --_item-padding: var(--list-item-padding, 0.5rem 0.75rem);
    --_group-gap: var(--list-group-gap, 0.75rem);

    display: flex;
    flex-direction: column;
    padding: var(--_padding);
  }

  .toggle-list--disabled {
    opacity: 0.6;
    pointer-events: none;
  }

  /* Controles */
  .toggle-list__controls {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.5rem 0.75rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
    font-size: 0.75rem;
  }

  .toggle-list__control {
    background: none;
    border: none;
    padding: 0;
    color: var(--color-primary, #3b82f6);
    cursor: pointer;
    font-size: inherit;
  }

  .toggle-list__control:hover {
    text-decoration: underline;
  }

  .toggle-list__control--active {
    font-weight: 600;
  }

  .toggle-list__control-sep {
    color: var(--color-border, #e5e7eb);
  }

  .toggle-list__control-count {
    margin-left: auto;
    color: var(--color-text-muted, #666);
  }

  /* Contenido */
  .toggle-list__content {
    overflow-y: auto;
  }

  /* Grupos */
  .toggle-list__group {
    padding-top: var(--_group-gap);
  }

  .toggle-list__group--first {
    padding-top: 0;
  }

  .toggle-list__group-header {
    padding: 0.25rem 0.75rem;
    font-size: 0.7rem;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 0.05em;
    color: var(--color-text-muted, #666);
  }

  /* Items */
  .toggle-list__item {
    width: 100%;
    display: flex;
    align-items: center;
    gap: 0.5rem;
    min-height: var(--_item-height);
    padding: var(--_item-padding);
    background: transparent;
    border: none;
    cursor: pointer;
    text-align: left;
    transition: background 0.15s;
  }

  .toggle-list__item:hover:not(:disabled) {
    background: var(--color-bg-hover, rgba(0,0,0,0.03));
  }

  .toggle-list__item--active {
    background: var(--color-primary-light, rgba(59, 130, 246, 0.08));
  }

  .toggle-list__item--active:hover:not(:disabled) {
    background: var(--color-primary-light, rgba(59, 130, 246, 0.12));
  }

  .toggle-list__item--disabled {
    opacity: 0.5;
    cursor: not-allowed;
  }

  .toggle-list__item-check {
    color: var(--color-primary, #3b82f6);
    font-size: 1rem;
    line-height: 1;
  }

  .toggle-list__item-icon {
    font-size: 1rem;
  }

  .toggle-list__item-content {
    flex: 1;
    display: flex;
    flex-direction: column;
    gap: 0.125rem;
    min-width: 0;
  }

  .toggle-list__item-label {
    font-size: 0.875rem;
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }

  .toggle-list__item-desc {
    font-size: 0.7rem;
    color: var(--color-text-muted, #666);
    white-space: nowrap;
    overflow: hidden;
    text-overflow: ellipsis;
  }
</style>
