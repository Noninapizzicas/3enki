<script lang="ts">
  import { mqttState, events } from '$stores';
  import Badge from '$components/ui/Badge.svelte';

  export let title = 'Event-Core';
  export let subtitle = '';

  $: recentEventsCount = $events.length;
</script>

<header class="sticky top-0 z-10 bg-bg/80 backdrop-blur-sm border-b border-border">
  <div class="flex items-center justify-between px-6 py-4">
    <div>
      <h1 class="text-xl font-semibold text-text">{title}</h1>
      {#if subtitle}
        <p class="text-sm text-text-muted mt-0.5">{subtitle}</p>
      {/if}
    </div>

    <div class="flex items-center gap-4">
      <!-- Event counter -->
      <div class="flex items-center gap-2 text-sm text-text-muted">
        <span>⚡</span>
        <span>{recentEventsCount} eventos</span>
      </div>

      <!-- Connection badge -->
      <Badge variant={$mqttState.connected ? 'success' : 'danger'}>
        {$mqttState.connected ? 'MQTT Online' : 'MQTT Offline'}
      </Badge>

      <!-- Core ID -->
      {#if $mqttState.coreId}
        <Badge variant="primary">
          {$mqttState.coreId}
        </Badge>
      {/if}
    </div>
  </div>
</header>
