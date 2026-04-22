<script lang="ts">
  /**
   * /{project_id}/chat — Chat principal del proyecto
   * Ruta project-scoped. El project_id viene de la URL y lo sincroniza el layout padre.
   */
  import { LazyShell } from '$lib/components/layout';
</script>

<svelte:head>
  <title>Chat</title>
</svelte:head>

<LazyShell />
