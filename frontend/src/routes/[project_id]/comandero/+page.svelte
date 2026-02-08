<script lang="ts">
  /**
   * Página Comandero — Pantalla de cuentas activas
   *
   * Scoped por proyecto: /{project_id}/comandero
   * Standalone: sin LazyShell, sin AppShell, sin chat.
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { getContext } from 'svelte';
  import { CuentasScreen } from '$lib/components/comandero';

  // Obtener contexto del proyecto
  const projectStore = getContext<any>('project');

  $: project_id = $page.params.project_id;

  function handleNavigate(path: string) {
    // Las rutas internas ya vienen con formato /comandero/xxx
    // Hay que añadir el project_id al inicio
    if (path.startsWith('/comandero')) {
      goto(`/${project_id}${path}`);
    } else {
      goto(path);
    }
  }
</script>

<svelte:head>
  <title>Comandero - {$projectStore?.name || project_id}</title>
</svelte:head>

<CuentasScreen onNavigate={handleNavigate} projectId={project_id} />
