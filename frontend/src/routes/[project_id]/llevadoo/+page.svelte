<script lang="ts">
  /**
   * Página Llevadoo — Plataforma de delivery
   *
   * Scoped por proyecto: /{project_id}/llevadoo
   */
  import { page } from '$app/stores';
  import { activeProjectId } from '$lib/stores/projects';
  import { LlevadooScreen } from '$lib/components/llevadoo';

  $: urlProjectId = $page.params.project_id;
  $: projectId = $activeProjectId || urlProjectId;
</script>

<svelte:head>
  <title>Llevadoo - Delivery</title>
</svelte:head>

<LlevadooScreen {projectId} />
