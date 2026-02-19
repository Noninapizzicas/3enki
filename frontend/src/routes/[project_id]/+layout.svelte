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
  import { mqttRequest, MqttNotConnectedError } from '$lib/ui-core/mqtt-request';
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
    loadProject();

    // Si MQTT no estaba listo y loadProject falló, reintentar cuando conecte
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

    projectStore.set({
      id: project_id,
      name: project_id,
      isPizzepos: false,
      loading: true,
      error: null
    });

    try {
      // Verificar si el proyecto existe y tiene carta
      const res = await mqttRequest<any>('project', 'get', { id: project_id });

      if (res.status === 404) {
        projectStore.update(p => ({
          ...p,
          loading: false,
          error: 'Proyecto no encontrado'
        }));
        loaded = true;
        return;
      }

      const project = res.data;

      // Verificar si tiene carta (es pizzepos)
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
      // Si es error de MQTT no conectado, no loguear como error — se reintentará
      if (err instanceof MqttNotConnectedError) {
        console.log('[ProjectLayout] MQTT not ready yet, will retry when connected');
        return;
      }

      console.error('[ProjectLayout] Error loading project:', err);
      // Si falla por otra razón, asumir que es válido (para desarrollo)
      projectStore.set({
        id: project_id,
        name: project_id,
        isPizzepos: true, // Asumir pizzepos en desarrollo
        loading: false,
        error: null
      });
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
