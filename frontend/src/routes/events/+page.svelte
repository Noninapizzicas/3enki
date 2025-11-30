<script lang="ts">
  import { Header } from '$components/layout';
  import { Card, Input, Button, Badge } from '$components/ui';
  import { events, mqttState } from '$stores/mqtt';

  let filter = '';
  let selectedEvent: typeof $events[0] | null = null;

  $: filteredEvents = filter
    ? $events.filter(e => e.type.includes(filter) || e.source.module.includes(filter))
    : $events;

  function selectEvent(event: typeof $events[0]) {
    selectedEvent = event;
  }

  function clearEvents() {
    // Note: This only clears the local store, not the actual events
    events.set([]);
  }

  function formatJson(data: unknown): string {
    return JSON.stringify(data, null, 2);
  }

  function getEventColor(type: string): 'success' | 'warning' | 'danger' | 'info' | 'default' {
    if (type.includes('error') || type.includes('failed')) return 'danger';
    if (type.includes('warning')) return 'warning';
    if (type.includes('created') || type.includes('success')) return 'success';
    if (type.includes('updated') || type.includes('modified')) return 'info';
    return 'default';
  }
</script>

<svelte:head>
  <title>Eventos - Event-Core</title>
</svelte:head>

<Header title="Eventos" subtitle="Monitor de eventos en tiempo real via MQTT" />

<div class="p-6">
  <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
    <!-- Event List -->
    <div class="lg:col-span-2 space-y-4">
      <!-- Filters -->
      <Card padding="sm">
        <div class="flex items-center gap-4">
          <div class="flex-1">
            <Input
              placeholder="Filtrar por tipo o módulo..."
              bind:value={filter}
              size="sm"
            />
          </div>
          <Badge variant={$mqttState.connected ? 'success' : 'danger'}>
            {$mqttState.connected ? 'Live' : 'Offline'}
          </Badge>
          <Button variant="ghost" size="sm" on:click={clearEvents}>
            Limpiar
          </Button>
        </div>
      </Card>

      <!-- Events -->
      <Card title="Stream de Eventos" padding="none">
        <div class="max-h-[600px] overflow-y-auto">
          {#if filteredEvents.length === 0}
            <div class="px-4 py-8 text-center text-text-muted">
              {filter ? 'No hay eventos que coincidan con el filtro' : 'Esperando eventos...'}
            </div>
          {:else}
            <ul class="divide-y divide-border">
              {#each filteredEvents.slice().reverse() as event (event.id)}
                <li>
                  <button
                    class="w-full px-4 py-3 text-left hover:bg-bg-hover transition-colors"
                    class:bg-bg-hover={selectedEvent?.id === event.id}
                    on:click={() => selectEvent(event)}
                  >
                    <div class="flex items-start justify-between gap-4">
                      <div class="flex-1 min-w-0">
                        <div class="flex items-center gap-2 flex-wrap">
                          <Badge variant={getEventColor(event.type)} size="sm">
                            {event.type}
                          </Badge>
                          <span class="text-xs text-text-muted">
                            {event.source.module}
                          </span>
                          {#if event.correlation_id}
                            <span class="text-xs text-text-disabled font-mono">
                              {event.correlation_id.slice(0, 8)}...
                            </span>
                          {/if}
                        </div>
                        <p class="text-sm text-text-muted mt-1 truncate">
                          {JSON.stringify(event.data).slice(0, 80)}...
                        </p>
                      </div>
                      <time class="text-xs text-text-muted whitespace-nowrap">
                        {new Date(event.source.timestamp).toLocaleTimeString()}
                      </time>
                    </div>
                  </button>
                </li>
              {/each}
            </ul>
          {/if}
        </div>
      </Card>
    </div>

    <!-- Event Detail -->
    <div class="space-y-4">
      <Card title="Detalle del Evento">
        {#if selectedEvent}
          <div class="space-y-4">
            <div>
              <span class="text-sm text-text-muted">ID</span>
              <p class="font-mono text-sm break-all">{selectedEvent.id}</p>
            </div>
            <div>
              <span class="text-sm text-text-muted">Tipo</span>
              <p>
                <Badge variant={getEventColor(selectedEvent.type)}>
                  {selectedEvent.type}
                </Badge>
              </p>
            </div>
            <div>
              <span class="text-sm text-text-muted">Origen</span>
              <p class="text-sm">
                {selectedEvent.source.core_id} / {selectedEvent.source.module}
              </p>
            </div>
            <div>
              <span class="text-sm text-text-muted">Timestamp</span>
              <p class="text-sm">
                {new Date(selectedEvent.source.timestamp).toLocaleString()}
              </p>
            </div>
            {#if selectedEvent.correlation_id}
              <div>
                <span class="text-sm text-text-muted">Correlation ID</span>
                <p class="font-mono text-sm break-all">{selectedEvent.correlation_id}</p>
              </div>
            {/if}
            <div>
              <span class="text-sm text-text-muted">Datos</span>
              <pre class="mt-1 p-3 bg-bg rounded-md text-xs overflow-x-auto">{formatJson(selectedEvent.data)}</pre>
            </div>
            {#if selectedEvent.metadata}
              <div>
                <span class="text-sm text-text-muted">Metadata</span>
                <pre class="mt-1 p-3 bg-bg rounded-md text-xs overflow-x-auto">{formatJson(selectedEvent.metadata)}</pre>
              </div>
            {/if}
          </div>
        {:else}
          <p class="text-text-muted text-sm">
            Selecciona un evento para ver sus detalles
          </p>
        {/if}
      </Card>

      <!-- Stats -->
      <Card title="Estadísticas">
        <div class="space-y-3">
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">Total eventos</span>
            <Badge variant="primary">{$events.length}</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">Filtrados</span>
            <Badge>{filteredEvents.length}</Badge>
          </div>
          <div class="flex items-center justify-between">
            <span class="text-sm text-text-muted">Conexión MQTT</span>
            <Badge variant={$mqttState.connected ? 'success' : 'danger'}>
              {$mqttState.connected ? 'Conectado' : 'Desconectado'}
            </Badge>
          </div>
        </div>
      </Card>
    </div>
  </div>
</div>
