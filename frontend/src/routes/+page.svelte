<script lang="ts">
  /**
   * Página principal — Redirige al chat del proyecto activo
   *
   * Si hay proyecto guardado en localStorage, redirige a /{project_id}/chat.
   * Si no hay proyecto, muestra LazyShell para que el usuario seleccione uno.
   */
  import { onMount } from 'svelte';
  import { goto } from '$app/navigation';
  import { getState } from '$lib/stores/persistence';
  import { LazyShell } from '$lib/components/layout';

  let shouldShowShell = false;

  onMount(() => {
    const state = getState();
    const projectId = state.workspace?.projectId;

    if (projectId) {
      goto(`/${projectId}/chat`, { replaceState: true });
    } else {
      // No hay proyecto guardado — mostrar UI para que seleccione uno
      shouldShowShell = true;
    }
  });
</script>

{#if shouldShowShell}
  <LazyShell />
{:else}
  <div class="redirect-screen">
    <div class="spinner"></div>
    <p>Cargando...</p>
  </div>
{/if}

<style>
  .redirect-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0a0a0a;
    color: #888;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #333;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
    margin-bottom: 16px;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }
</style>
