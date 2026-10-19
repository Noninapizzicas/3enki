<script lang="ts">
  /**
   * Página POS de un proyecto prisma — /{project_id}/pos
   *
   * La superficie de venta universal: la forma EMERGE del ProductoUniversal (proyector),
   * el precio/carrito/cobro los cierra el backend prisma. URL param puede ser alias;
   * para datos usamos activeProjectId (UUID real).
   */
  import { page } from '$app/stores';
  import { activeProjectId } from '$lib/stores/projects';
  import { PosScreen } from '$lib/components/prisma-pos';

  $: urlProjectId = $page.params.project_id;
  $: projectId = $activeProjectId || urlProjectId;
</script>

<svelte:head>
  <title>POS</title>
</svelte:head>

{#if projectId}
  <PosScreen {projectId} />
{/if}
