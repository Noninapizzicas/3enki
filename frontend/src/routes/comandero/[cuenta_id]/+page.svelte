<script lang="ts">
  /**
   * Página Comandero — Pantalla de pedido para una cuenta específica
   *
   * Standalone: sin LazyShell, sin AppShell, sin chat.
   * Ruta: /comandero/[cuenta_id]
   * Obtiene project_id del store global (proyecto activo).
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { activeProjectId } from '$lib/stores/projects';
  import { ComanderoScreen } from '$lib/components/comandero';

  $: cuenta_id = $page.params.cuenta_id;
  $: projectId = $activeProjectId || '';

  function handleNavigate(path: string) {
    goto(path);
  }

  function handleOpenPanel(panel: string, data?: any) {
    console.log('[Comandero] Open panel:', panel, data);
  }
</script>

<svelte:head>
  <title>Comandero</title>
</svelte:head>

<ComanderoScreen
  {cuenta_id}
  {projectId}
  onNavigate={handleNavigate}
  onOpenPanel={handleOpenPanel}
/>
