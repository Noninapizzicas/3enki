<script lang="ts">
  /**
   * Página Comandero — Pantalla de pedido para una cuenta específica
   *
   * Scoped por proyecto: /{project_id}/comandero/{cuenta_id}
   * Standalone: sin LazyShell, sin AppShell, sin chat.
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { getContext } from 'svelte';
  import { ComanderoScreen } from '$lib/components/comandero';

  // Obtener contexto del proyecto
  const projectStore = getContext<any>('project');

  $: project_id = $page.params.project_id;
  $: cuenta_id = $page.params.cuenta_id;

  function handleNavigate(path: string) {
    // Las rutas internas vienen con formato /comandero/xxx
    // Hay que añadir el project_id al inicio
    if (path.startsWith('/comandero')) {
      goto(`/${project_id}${path}`);
    } else {
      goto(path);
    }
  }

  function handleOpenPanel(panel: string, data?: any) {
    console.log('[Comandero] Open panel:', panel, data);
  }
</script>

<svelte:head>
  <title>Comandero - {$projectStore?.name || project_id}</title>
</svelte:head>

<ComanderoScreen
  {cuenta_id}
  projectId={project_id}
  onNavigate={handleNavigate}
  onOpenPanel={handleOpenPanel}
/>
