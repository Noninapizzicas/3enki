<script lang="ts">
  import { events, type EventEnvelope } from '$stores/mqtt';
  import Badge from '$components/ui/Badge.svelte';

  export let maxEvents = 50;
  export let filter = '';

  $: filteredEvents = $events
    .filter(e => !filter || e.type.includes(filter))
    .slice(-maxEvents)
    .reverse();

  function formatTime(timestamp: number): string {
    return new Date(timestamp).toLocaleTimeString();
  }

  function getEventColor(type: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
    if (type.includes('error') || type.includes('failed')) return 'danger';
    if (type.includes('warning')) return 'warning';
    if (type.includes('created') || type.includes('success')) return 'success';
    if (type.includes('updated') || type.includes('modified')) return 'info';
    return 'default';
  }
</script>

<div class="bg-bg-card border border-border rounded-lg overflow-hidden">
  <div class="px-4 py-3 border-b border-border flex items-center justify-between">
    <h3 class="font-medium">Event Stream</h3>
    <Badge variant="primary">{filteredEvents.length} eventos</Badge>
  </div>

  <div class="max-h-96 overflow-y-auto">
    {#if filteredEvents.length === 0}
      <div class="px-4 py-8 text-center text-text-muted">
        No hay eventos
      </div>
    {:else}
      <ul class="divide-y divide-border">
        {#each filteredEvents as event (event.id)}
          <li class="px-4 py-3 hover:bg-bg-hover transition-colors">
            <div class="flex items-start justify-between gap-4">
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2">
                  <Badge variant={getEventColor(event.type)} size="sm">
                    {event.type}
                  </Badge>
                  <span class="text-xs text-text-muted">
                    {event.source.module}
                  </span>
                </div>
                <p class="text-sm text-text-muted mt-1 truncate">
                  {JSON.stringify(event.data).slice(0, 100)}
                </p>
              </div>
              <time class="text-xs text-text-muted whitespace-nowrap">
                {formatTime(event.source.timestamp)}
              </time>
            </div>
          </li>
        {/each}
      </ul>
    {/if}
  </div>
</div>
