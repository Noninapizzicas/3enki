<script lang="ts">
  /**
   * /comandero/[cuenta_id] — Redirect a /{project_id}/comandero/[cuenta_id]
   *
   * Ruta legacy. Redirige al comandero del proyecto activo.
   */
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getState } from '$lib/stores/persistence';

  $: cuenta_id = $page.params.cuenta_id;
  $: queryString = $page.url.search || '';

  onMount(() => {
    const state = getState();
    const projectId = state.workspace?.projectId;
    if (projectId) {
      goto(`/${projectId}/comandero/${cuenta_id}${queryString}`, { replaceState: true });
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
