<script lang="ts">
  /**
   * ModelProviderSelector - Selector de Provider/Modelo
   *
   * Consume directamente los endpoints del ai-gateway:
   * - GET /modules/ai-gateway/ui/state → Estado completo
   * - POST /modules/ai-gateway/ui/select → Seleccionar
   *
   * La UI solo PIDE y PINTA. Sin lógica de transformación.
   */
  import { onMount, createEventDispatcher } from 'svelte';
  import { SelectList } from '$components/ui';
  import type { SelectItem, SelectGroup } from '$components/ui/SelectList.svelte';

  // Estado del componente
  let loading = true;
  let error: string | null = null;

  // Datos del backend (ya vienen listos para pintar)
  let providers: any[] = [];
  let current: { provider: string; model: string | null; displayName: string; modelDisplayName: string | null } = {
    provider: 'auto',
    model: null,
    displayName: 'Automático',
    modelDisplayName: null
  };

  // Para SelectList
  let items: SelectItem[] = [];
  let groups: SelectGroup[] = [];
  let selectedValue: string = '';

  const dispatch = createEventDispatcher<{
    select: { provider: string; model: string };
    close: void;
  }>();

  // Cargar estado al montar
  onMount(async () => {
    await loadState();
  });

  async function loadState() {
    loading = true;
    error = null;

    try {
      const res = await fetch('/modules/ai-gateway/ui/state');
      const result = await res.json();

      if (result.status === 200) {
        providers = result.data.providers;
        current = result.data.current;

        // Transformar a formato SelectList
        transformToSelectList();
      } else {
        error = result.data?.message || 'Error al cargar providers';
      }
    } catch (e) {
      error = 'No se pudo conectar con ai-gateway';
    } finally {
      loading = false;
    }
  }

  function transformToSelectList() {
    items = [];
    groups = [];

    // Opción "Automático"
    items.push({
      id: 'auto:auto',
      label: 'Automático',
      icon: '⚡',
      description: 'Selecciona el mejor provider disponible',
      group: '_auto'
    });

    groups.push({
      id: '_auto',
      label: '⚡ Modo',
      collapsed: false
    });

    // Providers y modelos
    for (const provider of providers) {
      // Agregar grupo para el provider
      groups.push({
        id: provider.id,
        label: `${provider.icon} ${provider.displayName}`,
        collapsed: !provider.available
      });

      // Agregar modelos del provider
      for (const model of provider.models) {
        items.push({
          id: `${provider.id}:${model.id}`,
          label: model.name,
          icon: model.isDefault ? '⭐' : '',
          badge: model.isDefault ? 'default' : undefined,
          group: provider.id,
          disabled: !provider.available,
          description: !provider.available ? 'Sin API Key' : undefined
        });
      }
    }

    // Establecer valor seleccionado
    if (current.provider === 'auto') {
      selectedValue = 'auto:auto';
    } else if (current.model) {
      selectedValue = `${current.provider}:${current.model}`;
    }
  }

  async function handleSelect(e: CustomEvent<{ item: SelectItem }>) {
    const [providerId, modelId] = e.detail.item.id.split(':');

    // Llamar al backend para guardar selección
    try {
      const res = await fetch('/modules/ai-gateway/ui/select', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          provider: providerId === 'auto' ? 'auto' : providerId,
          model: modelId === 'auto' ? null : modelId
        })
      });

      const result = await res.json();

      if (result.status === 200) {
        current = result.data.current;
        dispatch('select', { provider: providerId, model: modelId });
      } else {
        error = result.data?.message || 'Error al seleccionar';
      }
    } catch (e) {
      error = 'No se pudo guardar la selección';
    }
  }
</script>

<div class="model-selector">
  <!-- Header -->
  <div class="model-selector__header">
    <h3 class="model-selector__title">🤖 Modelo IA</h3>
    <div class="model-selector__current">
      {current.displayName}
      {#if current.modelDisplayName}
        <span class="model-selector__model">/ {current.modelDisplayName}</span>
      {/if}
    </div>
  </div>

  <!-- Contenido -->
  {#if loading}
    <div class="model-selector__loading">
      <span class="model-selector__spinner">⏳</span>
      Cargando providers...
    </div>
  {:else if error}
    <div class="model-selector__error">
      <span>⚠️</span>
      {error}
      <button on:click={loadState}>Reintentar</button>
    </div>
  {:else}
    <SelectList
      {items}
      {groups}
      bind:value={selectedValue}
      searchable={true}
      accordion={true}
      placeholder="Buscar modelo..."
      on:select={handleSelect}
    />

    <!-- Info del provider seleccionado -->
    {#if current.provider !== 'auto'}
      {@const selectedProvider = providers.find(p => p.id === current.provider)}
      {#if selectedProvider}
        <div class="model-selector__info">
          <div class="model-selector__info-row">
            <span>💰 Costo:</span>
            <span>${selectedProvider.pricing.input}/1K in, ${selectedProvider.pricing.output}/1K out</span>
          </div>
          <div class="model-selector__info-row">
            <span>📊 Límites:</span>
            <span>{selectedProvider.limits.requestsPerMinute} req/min</span>
          </div>
          <div class="model-selector__info-row">
            <span>📈 Uso sesión:</span>
            <span>{selectedProvider.usage.requests} req, {selectedProvider.usage.tokens} tokens</span>
          </div>
        </div>
      {/if}
    {/if}
  {/if}
</div>

<style>
  .model-selector {
    display: flex;
    flex-direction: column;
    min-width: 280px;
    max-width: 400px;
  }

  .model-selector__header {
    padding: 0.75rem 1rem;
    border-bottom: 1px solid var(--color-border, #e5e7eb);
  }

  .model-selector__title {
    margin: 0;
    font-size: 1rem;
    font-weight: 600;
  }

  .model-selector__current {
    margin-top: 0.25rem;
    font-size: 0.875rem;
    color: var(--color-primary, #3b82f6);
  }

  .model-selector__model {
    opacity: 0.7;
  }

  .model-selector__loading,
  .model-selector__error {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 1rem;
    font-size: 0.875rem;
  }

  .model-selector__error {
    color: var(--color-danger, #ef4444);
    flex-wrap: wrap;
  }

  .model-selector__error button {
    margin-left: auto;
    padding: 0.25rem 0.5rem;
    font-size: 0.75rem;
    background: var(--color-bg-muted, #f3f4f6);
    border: none;
    border-radius: 4px;
    cursor: pointer;
  }

  .model-selector__spinner {
    animation: spin 1s linear infinite;
  }

  @keyframes spin {
    from { transform: rotate(0deg); }
    to { transform: rotate(360deg); }
  }

  .model-selector__info {
    padding: 0.75rem 1rem;
    border-top: 1px solid var(--color-border, #e5e7eb);
    background: var(--color-bg-muted, #f9fafb);
    font-size: 0.75rem;
  }

  .model-selector__info-row {
    display: flex;
    justify-content: space-between;
    padding: 0.25rem 0;
  }

  .model-selector__info-row span:first-child {
    opacity: 0.7;
  }
</style>
