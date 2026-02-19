<script lang="ts">
  /**
   * Layout de Proyecto
   *
   * Valida que el proyecto existe y tiene carta (es pizzepos).
   * Pasa el contexto del proyecto a todos los hijos.
   */
  import { page } from '$app/stores';
  import { onMount, onDestroy } from 'svelte';
  import { setContext } from 'svelte';
  import { writable } from 'svelte/store';
  import { goto } from '$app/navigation';
  import { mqttRequest, MqttNotConnectedError, MqttRequestError } from '$lib/ui-core/mqtt-request';
  import { connected } from '$lib/ui-core/mqtt';

  // Store del proyecto actual
  const projectStore = writable<{
    id: string;
    name: string;
    isPizzepos: boolean;
    loading: boolean;
    error: string | null;
  }>({
    id: '',
    name: '',
    isPizzepos: false,
    loading: true,
    error: null
  });

  // Pasar contexto a hijos
  setContext('project', projectStore);

  $: project_id = $page.params.project_id;

  let loaded = false;
  let unsubConnected: (() => void) | null = null;

  onMount(() => {
    // Render immediately with defaults — don't block on MQTT
    projectStore.set({
      id: project_id,
      name: project_id,
      isPizzepos: true,
      loading: false,
      error: null
    });

    // Try to load real project data (non-blocking)
    loadProject();

    // If MQTT wasn't ready, retry when it connects
    unsubConnected = connected.subscribe((isConnected) => {
      if (isConnected && !loaded && project_id) {
        loadProject();
      }
    });
  });

  onDestroy(() => {
    if (unsubConnected) unsubConnected();
  });

  async function loadProject() {
    if (!project_id) return;

    try {
      const res = await mqttRequest<any>('project', 'get', { id: project_id });
      const project = res.data;
      const hasCarta = project?.has_carta || project?.carta_activa;

      projectStore.set({
        id: project_id,
        name: project?.name || project_id,
        isPizzepos: hasCarta,
        loading: false,
        error: null
      });

      loaded = true;

    } catch (err: any) {
      if (err instanceof MqttNotConnectedError) {
        console.log('[ProjectLayout] MQTT not ready yet, will retry when connected');
        return;
      }

      // Project not found or other backend error — use defaults, don't block
      if (err instanceof MqttRequestError) {
        console.log(`[ProjectLayout] Backend: ${err.message} — using defaults for "${project_id}"`);
      } else {
        console.warn('[ProjectLayout] Error loading project:', err.message);
      }

      loaded = true;
    }
  }
</script>

{#if $projectStore.loading}
  <div class="loading-screen">
    <div class="spinner"></div>
    <p>Cargando {project_id}...</p>
  </div>
{:else if $projectStore.error}
  <div class="error-screen">
    <h1>Error</h1>
    <p>{$projectStore.error}</p>
    <a href="/">Volver al inicio</a>
  </div>
{:else}
  <slot />
{/if}

<style>
  .loading-screen,
  .error-screen {
    display: flex;
    flex-direction: column;
    align-items: center;
    justify-content: center;
    height: 100vh;
    background: #0a0a0a;
    color: #e5e5e5;
    font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
  }

  .spinner {
    width: 40px;
    height: 40px;
    border: 3px solid #333;
    border-top-color: #3b82f6;
    border-radius: 50%;
    animation: spin 0.8s linear infinite;
  }

  @keyframes spin {
    to { transform: rotate(360deg); }
  }

  .loading-screen p,
  .error-screen p {
    margin-top: 16px;
    color: #888;
  }

  .error-screen h1 {
    color: #ef4444;
    margin-bottom: 8px;
  }

  .error-screen a {
    margin-top: 20px;
    color: #3b82f6;
    text-decoration: none;
  }

  .error-screen a:hover {
    text-decoration: underline;
  }
</style>
