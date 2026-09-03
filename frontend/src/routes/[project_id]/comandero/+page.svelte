<script lang="ts">
  /**
   * Página Comandero — Pantalla de cuentas activas
   *
   * Scoped por proyecto: /{project_id}/comandero
   *
   * NOTA: URL param puede ser alias corto. Para datos usamos activeProjectId (UUID real).
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { sessionProjectId } from '$lib/stores/sessionProject';
  import { CuentasScreen } from '$lib/components/comandero';

  $: urlProjectId = $page.params.project_id;
  $: projectId = $sessionProjectId || urlProjectId;

  function handleNavigate(path: string) {
    if (path.startsWith('/comandero')) {
      goto(`/${urlProjectId}${path}`);
    } else {
      goto(path);
    }
  }
</script>

<svelte:head>
  <title>Comandero</title>
</svelte:head>

<CuentasScreen onNavigate={handleNavigate} {projectId} />
