<script lang="ts">
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { Header } from '$components/layout';
  import { Card, Badge, Button } from '$components/ui';
  import { Table } from '$components/data';
  import { Spinner, Alert } from '$components/feedback';
  import { loadModule, callModuleApi, type ModuleInfo } from '$stores/modules';
  import { filterEvents } from '$stores/mqtt';
  import { toast } from '$stores/toast';

  let module: ModuleInfo | null = null;
  let loading = true;
  let error = '';
  let apiData: Record<string, unknown>[] = [];

  $: moduleName = $page.params.module ?? '';
  $: moduleEvents = filterEvents(moduleName || '.*');

  onMount(async () => {
    if (moduleName) {
      await loadModuleData();
    }
  });

  async function loadModuleData() {
    if (!moduleName) {
      error = 'Nombre de módulo no especificado';
      return;
    }

    loading = true;
    error = '';

    try {
      module = await loadModule(moduleName);

      if (!module) {
        error = `Módulo "${moduleName}" no encontrado`;
        return;
      }

      // Load API data if module has list endpoint
      const listApi = module.provides?.apis?.find(a => a.method === 'GET' && a.path.includes('list'));
      if (listApi) {
        try {
          apiData = await callModuleApi(moduleName, listApi.path);
        } catch {
          console.warn('Could not load module API data');
        }
      }
    } catch (err) {
      error = err instanceof Error ? err.message : 'Error al cargar el módulo';
    } finally {
      loading = false;
    }
  }

  async function handleApiCall(api: { method: string; path: string; name: string }) {
    if (!moduleName) return;
    try {
      const result = await callModuleApi(moduleName, api.path, { method: api.method });
      toast.success(`API ${api.name} ejecutada correctamente`);
      console.log('API Result:', result);
    } catch (err) {
      toast.error(`Error al ejecutar ${api.name}`);
    }
  }
</script>

<svelte:head>
  <title>{module?.ui?.title || moduleName} - Event-Core</title>
</svelte:head>

{#if loading}
  <div class="flex items-center justify-center min-h-screen">
    <Spinner size="lg" />
  </div>
{:else if error}
  <Header title="Error" />
  <div class="p-6">
    <Alert variant="danger" title="Error">
      {error}
    </Alert>
    <div class="mt-4">
      <Button href="/modules">Volver a Módulos</Button>
    </div>
  </div>
{:else if module}
  <Header
    title={module.ui?.title || module.name}
    subtitle={module.description}
  />

  <div class="p-6 space-y-6">
    <!-- Module Info -->
    <div class="grid grid-cols-1 lg:grid-cols-3 gap-6">
      <Card title="Información" class="lg:col-span-2">
        <div class="grid grid-cols-2 gap-4">
          <div>
            <span class="text-sm text-text-muted">Nombre</span>
            <p class="font-mono">{module.name}</p>
          </div>
          <div>
            <span class="text-sm text-text-muted">Versión</span>
            <p>{module.version}</p>
          </div>
          <div>
            <span class="text-sm text-text-muted">Estado</span>
            <Badge variant={module.status === 'loaded' ? 'success' : 'danger'}>
              {module.status}
            </Badge>
          </div>
          <div>
            <span class="text-sm text-text-muted">UI Habilitada</span>
            <p>{module.ui?.enabled ? 'Sí' : 'No'}</p>
          </div>
        </div>
      </Card>

      <!-- Events Published -->
      <Card title="Eventos">
        {#if module.provides?.events?.length}
          <ul class="space-y-2">
            {#each module.provides.events as event}
              <li class="flex items-center gap-2">
                <span class="text-primary">⚡</span>
                <code class="text-sm">{event}</code>
              </li>
            {/each}
          </ul>
        {:else}
          <p class="text-text-muted text-sm">Sin eventos publicados</p>
        {/if}
      </Card>
    </div>

    <!-- APIs -->
    {#if module.provides?.apis?.length}
      <Card title="APIs Disponibles">
        <div class="overflow-x-auto">
          <table class="w-full">
            <thead class="bg-white/5">
              <tr>
                <th class="px-4 py-2 text-left text-sm font-medium text-text-muted">Método</th>
                <th class="px-4 py-2 text-left text-sm font-medium text-text-muted">Path</th>
                <th class="px-4 py-2 text-left text-sm font-medium text-text-muted">Nombre</th>
                <th class="px-4 py-2 text-right text-sm font-medium text-text-muted">Acción</th>
              </tr>
            </thead>
            <tbody>
              {#each module.provides.apis as api}
                <tr class="border-t border-border">
                  <td class="px-4 py-2">
                    <Badge
                      variant={api.method === 'GET' ? 'success' : api.method === 'POST' ? 'primary' : api.method === 'DELETE' ? 'danger' : 'warning'}
                      size="sm"
                    >
                      {api.method}
                    </Badge>
                  </td>
                  <td class="px-4 py-2 font-mono text-sm">{api.path}</td>
                  <td class="px-4 py-2 text-sm">{api.name}</td>
                  <td class="px-4 py-2 text-right">
                    {#if api.method === 'GET'}
                      <Button size="sm" variant="ghost" on:click={() => handleApiCall(api)}>
                        Ejecutar
                      </Button>
                    {/if}
                  </td>
                </tr>
              {/each}
            </tbody>
          </table>
        </div>
      </Card>
    {/if}

    <!-- Module Data (if available) -->
    {#if apiData.length > 0}
      <Card title="Datos del Módulo">
        <Table
          columns={Object.keys(apiData[0]).map(key => ({ field: key, label: key, sortable: true }))}
          data={apiData}
          mqttTopics={module.provides?.events || []}
        />
      </Card>
    {/if}

    <!-- Recent Events for this module -->
    <Card title="Eventos Recientes">
      {#if $moduleEvents.length > 0}
        <ul class="divide-y divide-border max-h-64 overflow-y-auto">
          {#each $moduleEvents.slice(-10).reverse() as event}
            <li class="py-2">
              <div class="flex items-center justify-between">
                <Badge variant="default" size="sm">{event.type}</Badge>
                <time class="text-xs text-text-muted">
                  {new Date(event.source.timestamp).toLocaleTimeString()}
                </time>
              </div>
            </li>
          {/each}
        </ul>
      {:else}
        <p class="text-text-muted text-sm">Sin eventos recientes</p>
      {/if}
    </Card>
  </div>
{/if}
