<script lang="ts">
  import { createEventDispatcher, onMount } from 'svelte';
  import { events } from '$stores/mqtt';
  import Spinner from '$components/feedback/Spinner.svelte';
  import Badge from '$components/ui/Badge.svelte';

  type Column = {
    field: string;
    label: string;
    sortable?: boolean;
    width?: string;
    type?: 'text' | 'number' | 'date' | 'badge' | 'actions';
    render?: (value: unknown, row: Record<string, unknown>) => string;
  };

  type Action = {
    label: string;
    icon?: string;
    variant?: 'primary' | 'danger' | 'ghost';
    handler: string;
  };

  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type DataRow = Record<string, any>;

  export let columns: Column[] = [];
  export let data: DataRow[] = [];
  export let endpoint = '';
  export let mqttTopics: string[] = [];
  export let loading = false;
  export let sortField = '';
  export let sortDirection: 'asc' | 'desc' = 'asc';
  export let actions: Action[] = [];
  export let selectable = false;
  export let selected: string[] = [];
  export let idField = 'id';

  const dispatch = createEventDispatcher<{
    action: { action: string; row: Record<string, unknown> };
    select: string[];
    sort: { field: string; direction: 'asc' | 'desc' };
  }>();

  // Fetch data from endpoint
  onMount(async () => {
    if (endpoint) {
      await fetchData();
    }
  });

  async function fetchData() {
    loading = true;
    try {
      const res = await fetch(endpoint);
      if (res.ok) {
        const json = await res.json();
        data = Array.isArray(json) ? json : json.data || [];
      }
    } catch (err) {
      console.error('Failed to fetch table data:', err);
    } finally {
      loading = false;
    }
  }

  // Real-time updates via MQTT
  $: if (mqttTopics.length > 0 && $events.length > 0) {
    const lastEvent = $events[$events.length - 1];
    const matchesTopic = mqttTopics.some(t =>
      lastEvent.type.includes(t) || t.includes(lastEvent.type)
    );

    if (matchesTopic) {
      handleRealtimeUpdate(lastEvent);
    }
  }

  function handleRealtimeUpdate(event: { type: string; data: unknown }) {
    const eventData = event.data as Record<string, unknown>;

    if (event.type.includes('created') || event.type.includes('added')) {
      data = [...data, eventData];
    } else if (event.type.includes('updated') || event.type.includes('modified')) {
      data = data.map(row =>
        row[idField] === eventData[idField] ? { ...row, ...eventData } : row
      );
    } else if (event.type.includes('deleted') || event.type.includes('removed')) {
      data = data.filter(row => row[idField] !== eventData[idField]);
    }
  }

  // Sorting
  function handleSort(field: string) {
    if (!columns.find(c => c.field === field)?.sortable) return;

    if (sortField === field) {
      sortDirection = sortDirection === 'asc' ? 'desc' : 'asc';
    } else {
      sortField = field;
      sortDirection = 'asc';
    }

    dispatch('sort', { field: sortField, direction: sortDirection });

    // Local sort
    data = [...data].sort((a, b) => {
      const aVal = a[field];
      const bVal = b[field];

      if (aVal == null) return 1;
      if (bVal == null) return -1;

      const comparison = String(aVal).localeCompare(String(bVal), undefined, { numeric: true });
      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }

  // Selection
  function toggleSelect(id: string) {
    if (selected.includes(id)) {
      selected = selected.filter(s => s !== id);
    } else {
      selected = [...selected, id];
    }
    dispatch('select', selected);
  }

  function toggleSelectAll() {
    if (selected.length === data.length) {
      selected = [];
    } else {
      selected = data.map(row => String(row[idField]));
    }
    dispatch('select', selected);
  }

  // Actions
  function handleAction(action: string, row: Record<string, unknown>) {
    dispatch('action', { action, row });
  }

  // Format value
  function formatValue(value: unknown, column: Column): string {
    if (value == null) return '-';

    if (column.render) {
      return column.render(value, {});
    }

    switch (column.type) {
      case 'date':
        return new Date(value as string).toLocaleDateString();
      case 'number':
        return Number(value).toLocaleString();
      default:
        return String(value);
    }
  }
</script>

<div class="overflow-x-auto rounded-lg border border-border">
  <table class="w-full">
    <thead class="bg-white bg-opacity-5">
      <tr>
        {#if selectable}
          <th class="w-12 px-4 py-3">
            <input
              type="checkbox"
              checked={selected.length === data.length && data.length > 0}
              indeterminate={selected.length > 0 && selected.length < data.length}
              on:change={toggleSelectAll}
              class="rounded border-border bg-bg-input text-primary focus:ring-primary"
            />
          </th>
        {/if}
        {#each columns as column}
          <th
            class="px-4 py-3 text-left text-sm font-medium text-text-muted"
            class:cursor-pointer={column.sortable}
            class:hover:text-text={column.sortable}
            style={column.width ? `width: ${column.width}` : ''}
            on:click={() => column.sortable && handleSort(column.field)}
          >
            <div class="flex items-center gap-2">
              {column.label}
              {#if column.sortable && sortField === column.field}
                <span class="text-primary">
                  {sortDirection === 'asc' ? '↑' : '↓'}
                </span>
              {/if}
            </div>
          </th>
        {/each}
        {#if actions.length > 0}
          <th class="px-4 py-3 text-right text-sm font-medium text-text-muted">
            Acciones
          </th>
        {/if}
      </tr>
    </thead>
    <tbody>
      {#if loading}
        <tr>
          <td
            colspan={columns.length + (selectable ? 1 : 0) + (actions.length ? 1 : 0)}
            class="px-4 py-8 text-center"
          >
            <div class="flex items-center justify-center gap-2">
              <Spinner size="sm" />
              <span class="text-text-muted">Cargando...</span>
            </div>
          </td>
        </tr>
      {:else if data.length === 0}
        <tr>
          <td
            colspan={columns.length + (selectable ? 1 : 0) + (actions.length ? 1 : 0)}
            class="px-4 py-8 text-center text-text-muted"
          >
            No hay datos disponibles
          </td>
        </tr>
      {:else}
        {#each data as row, index (row[idField] || index)}
          <tr class="border-t border-border hover:bg-bg-hover transition-colors">
            {#if selectable}
              <td class="px-4 py-3">
                <input
                  type="checkbox"
                  checked={selected.includes(String(row[idField]))}
                  on:change={() => toggleSelect(String(row[idField]))}
                  class="rounded border-border bg-bg-input text-primary focus:ring-primary"
                />
              </td>
            {/if}
            {#each columns as column}
              <td class="px-4 py-3 text-sm">
                {#if column.type === 'badge'}
                  <Badge variant="default">{formatValue(row[column.field], column)}</Badge>
                {:else}
                  {formatValue(row[column.field], column)}
                {/if}
              </td>
            {/each}
            {#if actions.length > 0}
              <td class="px-4 py-3 text-right">
                <div class="flex items-center justify-end gap-2">
                  {#each actions as action}
                    <button
                      class="px-2 py-1 text-sm rounded transition-colors {
                        action.variant === 'danger' ? 'text-danger hover:bg-danger hover:bg-opacity-10' :
                        action.variant === 'ghost' ? 'text-text-muted hover:bg-bg-hover' :
                        'text-primary hover:bg-primary hover:bg-opacity-10'
                      }"
                      on:click={() => handleAction(action.handler, row)}
                    >
                      {#if action.icon}
                        <span>{action.icon}</span>
                      {/if}
                      {action.label}
                    </button>
                  {/each}
                </div>
              </td>
            {/if}
          </tr>
        {/each}
      {/if}
    </tbody>
  </table>
</div>
