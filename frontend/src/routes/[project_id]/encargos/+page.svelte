<script lang="ts">
  /**
   * Página Encargos — Web de encargos del cliente.
   *
   * Scoped por proyecto: /{project_id}/encargos
   * (patrón comandero)
   *
   * NOTA: URL param puede ser alias corto. Para datos usamos activeProjectId (UUID real).
   */
  import { page } from '$app/stores';
  import { sessionProjectId } from '$lib/stores/sessionProject';
  import { EncargosScreen } from '$lib/components/encargos';

  $: urlProjectId = $page.params.project_id;
  $: projectId = $sessionProjectId || urlProjectId;
</script>

<svelte:head>
  <title>Encargos</title>
</svelte:head>

<EncargosScreen {projectId} />
