<script lang="ts">
  /**
   * Redirect: /menu-generator → /[project_id]/menu-generator
   *
   * Ruta legacy. Redirige al menu-generator del proyecto activo.
   * Si no hay proyecto activo, vuelve al inicio.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { activeProject } from '$lib/stores/workspace';
  import { get } from 'svelte/store';

  onMount(() => {
    const project = get(activeProject);
    if (project?.id) {
      goto(`/${project.id}/menu-generator`, { replaceState: true });
    } else {
      goto('/', { replaceState: true });
    }
  });
</script>

<div class="redirect-screen">
  <p>Redirigiendo...</p>
</div>

<style>
  .redirect-screen {
    display: flex;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0a0a0a;
    color: #888;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }
</style>
