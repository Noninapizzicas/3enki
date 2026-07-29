<script lang="ts">
  /**
   * Página [midominio] — template para nueva página POS
   * Scoped por proyecto: /{project_id}/midominio
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { activeProjectId } from '$lib/stores/projects';
  import MiScreen from '$lib/components/midominio/MiScreen.svelte';

  $: projectId = $activeProjectId || $page.params.project_id;

  function handleNavigate(path: string) {
    if (path.startsWith('/midominio')) {
      goto(`/${$page.params.project_id}${path}`);
    } else {
      goto(path);
    }
  }
</script>

<svelte:head>
  <title>Mi Dominio</title>
</svelte:head>

<MiScreen onNavigate={handleNavigate} {projectId} />
