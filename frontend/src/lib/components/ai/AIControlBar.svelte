<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import Button from '$components/ui/Button.svelte';
  import Select from '$components/ui/Select.svelte';
  import Badge from '$components/ui/Badge.svelte';

  type Model = {
    id: string;
    name: string;
    provider?: string;
  };

  export let models: Model[] = [];
  export let selectedModel: string = models[0]?.id ?? '';
  export let status: 'idle' | 'thinking' | 'streaming' | 'error' = 'idle';
  export let tokensUsed = 0;
  export let maxTokens = 4096;
  export let showTokens = true;
  export let showModelSelector = true;

  const dispatch = createEventDispatcher<{
    modelChange: string;
    stop: void;
    clear: void;
    settings: void;
  }>();

  const statusLabels = {
    idle: 'Listo',
    thinking: 'Pensando...',
    streaming: 'Generando...',
    error: 'Error'
  };

  const statusColors = {
    idle: 'success' as const,
    thinking: 'warning' as const,
    streaming: 'primary' as const,
    error: 'danger' as const
  };

  function handleModelChange(e: CustomEvent<string>) {
    selectedModel = e.detail;
    dispatch('modelChange', selectedModel);
  }
</script>

<div class="flex items-center justify-between gap-4 p-3 bg-bg-card border border-border rounded-lg">
  <div class="flex items-center gap-3">
    <!-- Status indicator -->
    <Badge variant={statusColors[status]}>
      {#if status === 'thinking' || status === 'streaming'}
        <span class="animate-pulse mr-1">●</span>
      {/if}
      {statusLabels[status]}
    </Badge>

    <!-- Model selector -->
    {#if showModelSelector && models.length > 0}
      <Select
        options={models.map(m => ({ value: m.id, label: m.name }))}
        value={selectedModel}
        on:change={handleModelChange}
        size="sm"
      />
    {/if}
  </div>

  <div class="flex items-center gap-3">
    <!-- Token usage -->
    {#if showTokens}
      <div class="text-sm text-text-muted">
        <span class="font-mono">{tokensUsed.toLocaleString()}</span>
        <span class="text-text-disabled"> / {maxTokens.toLocaleString()}</span>
      </div>
    {/if}

    <!-- Actions -->
    <div class="flex items-center gap-1">
      {#if status === 'thinking' || status === 'streaming'}
        <Button
          variant="danger"
          size="sm"
          on:click={() => dispatch('stop')}
        >
          ⏹ Detener
        </Button>
      {/if}

      <Button
        variant="ghost"
        size="sm"
        on:click={() => dispatch('clear')}
        title="Limpiar conversación"
      >
        🗑️
      </Button>

      <Button
        variant="ghost"
        size="sm"
        on:click={() => dispatch('settings')}
        title="Configuración"
      >
        ⚙️
      </Button>
    </div>
  </div>
</div>
