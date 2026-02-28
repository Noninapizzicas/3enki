<script lang="ts">
  /**
   * /facturas — Redirect a /{project_id}/facturas
   *
   * Ruta legacy. Redirige a las facturas del proyecto activo.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getState } from '$lib/stores/persistence';

  onMount(() => {
    const state = getState();
    const projectId = state.workspace?.projectId;
    if (projectId) {
      goto(`/${projectId}/facturas`, { replaceState: true });
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
