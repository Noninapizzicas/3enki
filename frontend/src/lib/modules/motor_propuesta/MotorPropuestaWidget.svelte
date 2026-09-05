<script lang="ts">
  /**
   * MotorPropuestaWidget — "¿Qué imprimo?".
   *
   * Motor puro: dado el conjunto de modelos, elige el siguiente a imprimir
   * por prioridad (desc) y antigüedad (asc). Sin store, sin mutación, sin
   * aprobación. Conduce el RPC motor_propuesta.proponer_siguiente.request y
   * pinta la propuesta o el estado vacío según la causa.
   *
   * Invariante reflejada: un modelo IMPRIMIENDO nunca se propone (el motor
   * lo garantiza; la UI solo muestra lo que el motor devuelve).
   */
  import { onMount } from 'svelte';
  import { mqttRequest, MqttRequestError } from '$lib/ui-core/mqtt-request';
  import { activeProject } from '$lib/stores/workspace';

  export let panelId: string = '';

  type Propuesta = {
    id: string;
    nombre: string;
    prioridad: number;
    material?: string;
    tiempo_estimado?: number;
    fecha_alta?: string;
  };

  type Causa = 'cola_vacia' | 'sin_candidatos' | 'ok';

  let propuesta: Propuesta | null = null;
  let causa: Causa | null = null;
  let loading = false;
  let error: string | null = null;

  $: project = $activeProject;

  onMount(() => proponer());

  async function proponer() {
    if (!project?.id) {
      error = 'Entra en un proyecto para proponer el siguiente a imprimir.';
      return;
    }
    loading = true;
    error = null;
    propuesta = null;
    causa = null;
    try {
      const res = await mqttRequest<{ propuesta: Propuesta | null; causa: Causa }>(
        'motor_propuesta', 'proponer_siguiente',
        { project_id: project.id },
        { timeout: 5000 }
      );
      propuesta = res.data?.propuesta ?? null;
      causa = res.data?.causa ?? 'ok';
    } catch (e: any) {
      if (e instanceof MqttRequestError && e.code === 'RESOURCE_NOT_FOUND') {
        causa = 'cola_vacia';
      } else {
        error = e?.message || 'No se pudo proponer el siguiente modelo.';
      }
    } finally {
      loading = false;
    }
  }
</script>

<div class="motor-propuesta" data-motor-propuesta-panel={panelId}>
  <div class="mp-cabecera">
    <span class="mp-titulo">🎯 Siguiente a imprimir</span>
    <button class="mp-boton" on:click={proponer} disabled={loading}>
      {loading ? 'Proponiendo…' : '¿Qué imprimo?'}
    </button>
  </div>

  {#if error}
    <p class="mp-error">{error}</p>
  {:else if loading}
    <p class="mp-vacio">Consultando el motor…</p>
  {:else if propuesta}
    <div class="mp-card">
      <div class="mp-nombre">{propuesta.nombre}</div>
      <div class="mp-meta">
        <span>Prioridad {propuesta.prioridad}</span>
        {#if propuesta.material}<span>· {propuesta.material}</span>{/if}
        {#if propuesta.tiempo_estimado}<span>· ~{propuesta.tiempo_estimado} min</span>{/if}
      </div>
    </div>
  {:else if causa === 'cola_vacia'}
    <p class="mp-vacio">No hay nada pendiente en la cola.</p>
  {:else if causa === 'sin_candidatos'}
    <p class="mp-vacio">Todo en curso o impreso — no hay candidatos.</p>
  {/if}
</div>

<style>
  .motor-propuesta {
    font-family: inherit;
    padding: 0.5rem 0;
  }
  .mp-cabecera {
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 0.75rem;
    margin-bottom: 0.75rem;
  }
  .mp-titulo {
    font-weight: 600;
  }
  .mp-boton {
    padding: 0.4rem 0.9rem;
    border: 1px solid #cbd5e1;
    border-radius: 6px;
    background: #f1f5f9;
    cursor: pointer;
  }
  .mp-boton:disabled {
    opacity: 0.6;
    cursor: default;
  }
  .mp-card {
    border: 1px solid #e2e8f0;
    border-radius: 8px;
    padding: 0.75rem 1rem;
    background: #f8fafc;
  }
  .mp-nombre {
    font-weight: 600;
    font-size: 1.05rem;
  }
  .mp-meta {
    margin-top: 0.25rem;
    color: #64748b;
    font-size: 0.85rem;
  }
  .mp-vacio {
    color: #64748b;
    font-style: italic;
  }
  .mp-error {
    color: #b91c1c;
  }
</style>
