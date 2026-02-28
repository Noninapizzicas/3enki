<script lang="ts">
  /**
   * Página principal del proyecto
   * Redirige automáticamente a /chat
   */
  import { page } from '$app/stores';
  import { goto } from '$app/navigation';
  import { onMount } from 'svelte';

  $: project_id = $page.params.project_id;

  onMount(() => {
    // Redirigir a chat (página principal del proyecto)
    goto(`/${project_id}/chat`, { replaceState: true });
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
