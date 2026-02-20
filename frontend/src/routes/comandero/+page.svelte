<script lang="ts">
  /**
   * Página Comandero — Pantalla de cuentas activas
   *
   * Standalone: sin LazyShell, sin AppShell, sin chat.
   * La puerta de entrada al flujo de trabajo operativo.
   * Obtiene project_id del store global (proyecto activo).
   */
  import { goto } from '$app/navigation';
  import { activeProjectId } from '$lib/stores/projects';
  import { CuentasScreen } from '$lib/components/comandero';

  $: projectId = $activeProjectId || '';

  function handleNavigate(path: string) {
    goto(path);
  }
</script>

<svelte:head>
  <title>Comandero</title>
</svelte:head>

<CuentasScreen {projectId} onNavigate={handleNavigate} />
