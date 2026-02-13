<script lang="ts">
  import { onMount } from 'svelte';
  import { Header } from '$components/layout';
  import { Card, Button, Badge } from '$components/ui';
  import { Modal, Spinner, Alert } from '$components/feedback';
  import { toast } from '$stores/toast';
  import config from '$lib/config';

  // Types
  interface Blueprint {
    name: string;
    filename: string;
    metadata: {
      name: string;
      description: string;
      version: string;
      author: string;
      icon: string;
    };
    entity: {
      name: string;
      plural: string;
      titleField: string;
      descriptionField?: string;
    };
    fieldsCount: number;
    eventsCount: number;
    apisCount: number;
    ui?: {
      enabled: boolean;
      layout: string;
      features: string[];
    };
  }

  interface BlueprintDetail {
    name: string;
    filename: string;
    content: Record<string, unknown>;
    raw: string;
  }

  // State
  let blueprints: Blueprint[] = [];
  let loading = true;
  let error: string | null = null;

  // Modal state
  let detailModal = false;
  let selectedBlueprint: BlueprintDetail | null = null;
  let loadingDetail = false;

  // API
  const apiBase = config.apiUrl;

  async function fetchBlueprints() {
    loading = true;
    error = null;
    try {
      const res = await fetch(`${apiBase}/blueprints`);
      if (!res.ok) throw new Error('Error al cargar blueprints');
      const data = await res.json();
      blueprints = data.blueprints || [];
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error desconocido';
    } finally {
      loading = false;
    }
  }

  async function viewBlueprint(blueprint: Blueprint) {
    detailModal = true;
    loadingDetail = true;
    selectedBlueprint = null;

    try {
      const res = await fetch(`${apiBase}/blueprints/${blueprint.name}`);
      if (!res.ok) throw new Error('Error al cargar blueprint');
      selectedBlueprint = await res.json();
    } catch (err) {
      toast.error('Error cargando detalles del blueprint');
      detailModal = false;
    } finally {
      loadingDetail = false;
    }
  }

  function copyGenerateCommand(blueprintName: string) {
    const command = `npx plop from-blueprint`;
    navigator.clipboard.writeText(command);
    toast.success('Comando copiado al portapapeles');
  }

  function closeModal() {
    detailModal = false;
    selectedBlueprint = null;
  }

  onMount(() => {
    fetchBlueprints();
  });
</script>

<svelte:head>
  <title>Blueprints - Event-Core</title>
</svelte:head>

<Header title="Blueprints" subtitle="Plantillas para generar nuevos módulos" />

<div class="p-4 md:p-6 space-y-6">
  {#if loading}
    <Card class="flex items-center justify-center py-12">
      <Spinner size="lg" />
    </Card>
  {:else if error}
    <Alert variant="danger" title="Error">
      {error}
      <Button variant="secondary" size="sm" on:click={fetchBlueprints} class="mt-2">
        Reintentar
      </Button>
    </Alert>
  {:else}
    <!-- Info Card -->
    <Card>
      <div class="flex flex-col md:flex-row md:items-center gap-4">
        <div class="flex-1">
          <h3 class="font-medium mb-2">Generar módulo desde Blueprint</h3>
          <p class="text-sm text-text-muted mb-3">
            Los blueprints son plantillas YAML que definen la estructura de un módulo.
            Para generar un módulo, ejecuta el siguiente comando:
          </p>
          <code class="block bg-bg-input p-3 rounded-md text-sm font-mono">
            npx plop from-blueprint
          </code>
        </div>
        <Button variant="secondary" on:click={() => copyGenerateCommand('')}>
          Copiar comando
        </Button>
      </div>
    </Card>

    <!-- Blueprints Grid -->
    {#if blueprints.length === 0}
      <Card class="text-center py-12">
        <span class="text-4xl mb-4 block">📦</span>
        <p class="text-text-muted mb-4">No hay blueprints disponibles</p>
        <p class="text-sm text-text-muted">
          Crea un archivo .yaml en la carpeta /blueprints para empezar
        </p>
      </Card>
    {:else}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {#each blueprints as blueprint (blueprint.name)}
          <Card hover on:click={() => viewBlueprint(blueprint)}>
            <div class="flex items-start gap-3">
              <span class="text-3xl">{blueprint.metadata.icon || '📦'}</span>
              <div class="flex-1 min-w-0">
                <div class="flex items-center gap-2 mb-1">
                  <h3 class="font-medium truncate">{blueprint.metadata.name || blueprint.name}</h3>
                  <Badge variant="default" size="sm">v{blueprint.metadata.version}</Badge>
                </div>
                <p class="text-sm text-text-muted mb-3 line-clamp-2">
                  {blueprint.metadata.description || 'Sin descripción'}
                </p>

                <!-- Entity Info -->
                <div class="flex items-center gap-2 mb-2 text-xs">
                  <Badge variant="primary" size="sm">
                    {blueprint.entity?.name || 'entity'}
                  </Badge>
                  <span class="text-text-muted">→</span>
                  <Badge variant="default" size="sm">
                    {blueprint.entity?.plural || 'entities'}
                  </Badge>
                </div>

                <!-- Stats -->
                <div class="flex flex-wrap gap-3 text-xs text-text-muted">
                  <span title="Campos">
                    📝 {blueprint.fieldsCount} campos
                  </span>
                  <span title="Eventos">
                    ⚡ {blueprint.eventsCount} eventos
                  </span>
                  {#if blueprint.apisCount > 0}
                    <span title="APIs adicionales">
                      🔌 {blueprint.apisCount} APIs
                    </span>
                  {/if}
                </div>

                <!-- UI Features -->
                {#if blueprint.ui?.features?.length}
                  <div class="flex flex-wrap gap-1 mt-2">
                    {#each blueprint.ui.features.slice(0, 4) as feature}
                      <Badge variant="success" size="sm">{feature}</Badge>
                    {/each}
                    {#if blueprint.ui.features.length > 4}
                      <Badge variant="default" size="sm">+{blueprint.ui.features.length - 4}</Badge>
                    {/if}
                  </div>
                {/if}
              </div>
            </div>
          </Card>
        {/each}
      </div>
    {/if}
  {/if}
</div>

<!-- Blueprint Detail Modal -->
<Modal
  bind:open={detailModal}
  title={selectedBlueprint ? `Blueprint: ${selectedBlueprint.name}` : 'Cargando...'}
  size="lg"
  on:close={closeModal}
>
  {#if loadingDetail}
    <div class="flex justify-center py-12">
      <Spinner size="lg" />
    </div>
  {:else if selectedBlueprint}
    <div class="space-y-4">
      <!-- Metadata -->
      <div class="grid grid-cols-2 gap-4">
        <div>
          <span class="text-xs text-text-muted uppercase">Nombre</span>
          <p class="font-medium">{selectedBlueprint.content.name}</p>
        </div>
        <div>
          <span class="text-xs text-text-muted uppercase">Versión</span>
          <p>{selectedBlueprint.content.version}</p>
        </div>
        <div class="col-span-2">
          <span class="text-xs text-text-muted uppercase">Descripción</span>
          <p class="text-text-muted">{selectedBlueprint.content.description}</p>
        </div>
      </div>

      <!-- Entity -->
      {#if selectedBlueprint.content.entity}
        <div>
          <h4 class="text-sm font-medium mb-2">Entidad Principal</h4>
          <div class="bg-bg-hover p-3 rounded-lg text-sm">
            <code class="text-primary">{selectedBlueprint.content.entity.name}</code>
            <span class="text-text-muted"> → </span>
            <code class="text-success">{selectedBlueprint.content.entity.plural}</code>
          </div>
        </div>
      {/if}

      <!-- Fields -->
      {#if selectedBlueprint.content.fields?.length}
        <div>
          <h4 class="text-sm font-medium mb-2">Campos ({selectedBlueprint.content.fields.length})</h4>
          <div class="space-y-2 max-h-48 overflow-y-auto">
            {#each selectedBlueprint.content.fields as field}
              <div class="flex items-center justify-between bg-bg-hover p-2 rounded text-sm">
                <div class="flex items-center gap-2">
                  <code class="text-primary">{field.name}</code>
                  {#if field.required}
                    <Badge variant="danger" size="sm">required</Badge>
                  {/if}
                </div>
                <Badge variant="default" size="sm">{field.type}</Badge>
              </div>
            {/each}
          </div>
        </div>
      {/if}

      <!-- Events -->
      {#if selectedBlueprint.content.events?.publish?.length}
        <div>
          <h4 class="text-sm font-medium mb-2">Eventos Publicados</h4>
          <div class="flex flex-wrap gap-2">
            {#each selectedBlueprint.content.events.publish as event}
              <Badge variant="warning" size="sm">{event.name}</Badge>
            {/each}
          </div>
        </div>
      {/if}

      <!-- YAML Preview -->
      <div>
        <h4 class="text-sm font-medium mb-2">YAML</h4>
        <pre class="bg-bg-input p-3 rounded-lg text-xs overflow-x-auto max-h-64 overflow-y-auto">{selectedBlueprint.raw}</pre>
      </div>
    </div>
  {/if}

  <svelte:fragment slot="footer">
    {#if selectedBlueprint}
      <Button variant="secondary" on:click={() => copyGenerateCommand(selectedBlueprint?.name || '')}>
        Copiar comando
      </Button>
    {/if}
    <Button variant="ghost" on:click={closeModal}>
      Cerrar
    </Button>
  </svelte:fragment>
</Modal>

<style>
  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }
</style>
