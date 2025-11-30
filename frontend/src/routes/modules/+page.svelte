<script lang="ts">
  import { Header } from '$components/layout';
  import { Card, Badge, Button } from '$components/ui';
  import { Table } from '$components/data';
  import { modules, modulesLoading, loadModules } from '$stores/modules';

  const columns = [
    { field: 'name', label: 'Nombre', sortable: true },
    { field: 'version', label: 'Versión', width: '100px' },
    { field: 'description', label: 'Descripción' },
    { field: 'status', label: 'Estado', type: 'badge' as const, width: '120px' }
  ];

  const actions = [
    { label: 'Ver', icon: '👁', handler: 'view', variant: 'primary' as const },
    { label: 'Config', icon: '⚙️', handler: 'config', variant: 'ghost' as const }
  ];

  function handleAction(e: CustomEvent<{ action: string; row: Record<string, unknown> }>) {
    const { action, row } = e.detail;
    if (action === 'view') {
      window.location.href = `/modules/${row.name}`;
    }
  }

  function handleRefresh() {
    loadModules();
  }
</script>

<svelte:head>
  <title>Módulos - Event-Core</title>
</svelte:head>

<Header title="Módulos" subtitle="Gestión de módulos cargados en el sistema" />

<div class="p-6 space-y-6">
  <!-- Actions Bar -->
  <div class="flex items-center justify-between">
    <div class="flex items-center gap-2">
      <Badge variant="primary">{$modules.length} módulos</Badge>
      <Badge variant="success">
        {$modules.filter(m => m.status === 'loaded').length} activos
      </Badge>
    </div>
    <Button variant="secondary" on:click={handleRefresh}>
      Actualizar
    </Button>
  </div>

  <!-- Modules Table -->
  <Table
    {columns}
    data={$modules}
    {actions}
    loading={$modulesLoading}
    idField="name"
    on:action={handleAction}
  />

  <!-- Module Cards (alternative view) -->
  <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
    {#each $modules as mod}
      <Card hover>
        <a href="/modules/{mod.name}" class="block">
          <div class="flex items-start gap-3">
            <span class="text-2xl">{mod.ui?.icon || '📦'}</span>
            <div class="flex-1 min-w-0">
              <h3 class="font-medium truncate">{mod.ui?.title || mod.name}</h3>
              <p class="text-sm text-text-muted truncate">{mod.description}</p>
              <div class="flex items-center gap-2 mt-2">
                <Badge variant={mod.status === 'loaded' ? 'success' : 'danger'} size="sm">
                  {mod.status}
                </Badge>
                <span class="text-xs text-text-muted">v{mod.version}</span>
              </div>
            </div>
          </div>
        </a>
      </Card>
    {/each}
  </div>
</div>
