<script lang="ts">
  /**
   * Página Llevadoo — Plataforma de delivery
   *
   * Scoped por proyecto: /{project_id}/llevadoo
   *
   * Reutiliza CuentasScreen + ComanderoScreen del comandero,
   * filtrado a pedidos llevadoo_ solamente.
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { activeProjectId } from '$lib/stores/projects';
  import { LlevadooScreen } from '$lib/components/llevadoo';

  $: urlProjectId = $page.params.project_id;
  $: projectId = $activeProjectId || urlProjectId;

  function handleNavigate(path: string) {
    if (path.startsWith('/comandero')) {
      goto(`/${urlProjectId}${path}`);
    } else {
      goto(path);
    }
  }
</script>

<svelte:head>
  <title>Llevadoo - Delivery</title>
</svelte:head>

<LlevadooScreen {projectId} onNavigate={handleNavigate} />
