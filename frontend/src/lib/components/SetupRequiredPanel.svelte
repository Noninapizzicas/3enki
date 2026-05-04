<script lang="ts">
  /**
   * SetupRequiredPanel — bloque canónico inline cuando falta contexto.
   *
   * Se renderiza cuando setupRequired !== null (ver contextStore.ts).
   * Coherente con frontend.contract v1.2.0:
   *   - Panel inline ≤33vh, NO modal bloqueante.
   *   - Aparece automáticamente al cargar frame sin contexto.
   *   - Desaparece al resolver (project + conversation establecidos).
   *
   * Acciones expuestas:
   *   - 'project' | 'both' falta proyecto → abrir panel de proyectos.
   *   - 'conversation' falta conversación → crear nueva conversación
   *     directamente en el proyecto activo.
   */

  import { setupRequired } from '$lib/stores/contextStore';
  import { openPanel } from '$lib/stores/ui';
  import { createConversation } from '$lib/stores/conversations';
  import { notifyError } from '$lib/stores/ui';

  $: missing = $setupRequired;

  $: title = missing === 'project' || missing === 'both'
    ? 'Necesitas un proyecto activo'
    : 'Necesitas una conversación abierta';

  $: subtitle = missing === 'project' || missing === 'both'
    ? 'Selecciona un proyecto existente o crea uno nuevo para empezar.'
    : 'Inicia una nueva conversación en este proyecto para empezar a chatear.';

  function openProjectsPanel() {
    openPanel('projects');
  }

  async function startNewConversation() {
    try {
      await createConversation('Nueva conversación');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : String(err);
      notifyError(`No se pudo crear la conversación: ${msg}`);
    }
  }
</script>

{#if missing !== null}
  <div class="setup-panel" role="region" aria-label="Configuración requerida">
    <div class="setup-content">
      <div class="setup-text">
        <h2 class="setup-title">{title}</h2>
        <p class="setup-subtitle">{subtitle}</p>
      </div>
      <div class="setup-actions">
        {#if missing === 'project' || missing === 'both'}
          <button class="setup-button primary" on:click={openProjectsPanel}>
            Configurar proyecto
          </button>
        {:else if missing === 'conversation'}
          <button class="setup-button primary" on:click={startNewConversation}>
            Iniciar conversación
          </button>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  .setup-panel {
    position: absolute;
    bottom: 0;
    left: 0;
    right: 0;
    max-height: 33vh;
    background: rgba(15, 15, 20, 0.96);
    backdrop-filter: blur(8px);
    border-top: 1px solid rgba(255, 255, 255, 0.08);
    box-shadow: 0 -4px 24px rgba(0, 0, 0, 0.4);
    z-index: 50;
    display: flex;
    align-items: center;
    justify-content: center;
    padding: 1.5rem 2rem;
    pointer-events: auto;
  }

  .setup-content {
    display: flex;
    flex-direction: column;
    gap: 1rem;
    width: 100%;
    max-width: 640px;
    align-items: center;
    text-align: center;
  }

  .setup-title {
    font-size: 1.05rem;
    font-weight: 600;
    color: #f5f5f5;
    margin: 0;
  }

  .setup-subtitle {
    font-size: 0.875rem;
    color: rgba(255, 255, 255, 0.65);
    margin: 0;
    line-height: 1.4;
  }

  .setup-actions {
    display: flex;
    gap: 0.75rem;
    justify-content: center;
    flex-wrap: wrap;
  }

  .setup-button {
    padding: 0.6rem 1.25rem;
    border-radius: 8px;
    font-size: 0.875rem;
    font-weight: 500;
    border: 1px solid rgba(255, 255, 255, 0.12);
    background: rgba(255, 255, 255, 0.04);
    color: #f5f5f5;
    cursor: pointer;
    transition: all 0.15s ease;
  }

  .setup-button:hover {
    background: rgba(255, 255, 255, 0.08);
    border-color: rgba(255, 255, 255, 0.2);
  }

  .setup-button.primary {
    background: rgba(99, 132, 255, 0.18);
    border-color: rgba(99, 132, 255, 0.4);
    color: #c8d4ff;
  }

  .setup-button.primary:hover {
    background: rgba(99, 132, 255, 0.28);
    border-color: rgba(99, 132, 255, 0.6);
  }
</style>
